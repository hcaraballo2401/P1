import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';

import {
  initDatabase,
  saveObservation,
  markAsSynced,
  markSyncError,
} from '../utils/database';
import { uploadToINaturalist, INaturalistUploadError } from '../utils/inaturalistUpload';
import type { NewObservationInput, LocalObservation } from '../types/observation';

// ─── Constantes de configuración ─────────────────────────────────────────────

/**
 * Backend de identificación (FastAPI).
 * Desplegado en Render.
 */
const API_BASE_URL = 'https://p1-q8lf.onrender.com';
const BACKEND_URL = `${API_BASE_URL}/api/v1/identificacion/identificar`;
const HEALTH_URL = `${API_BASE_URL}/health`;

/**
 * Token de la API de iNaturalist del usuario autenticado.
 * TODO: Mover a pantalla de Configuración para que el usuario lo ingrese.
 * Obtener en: https://www.inaturalist.org/users/api_token
 */
const INAT_API_TOKEN =
  'eyJhbGciOiJIUzUxMiJ9.eyJ1c2VyX2lkIjoxMDM4MDQ0MSwiZXhwIjoxNzc3OTQ0NTA0fQ.LvEgwu3r45R3gYm47baFq6VgrjG-khjLuFNhAZeKNYCW0NPZseScDP6Sq1qRz1JjZZCgne07y3CrwALJBDMpjw';

// ─── Interfaces TypeScript ─────────────────────────────────────────────────────

interface IdentificacionResponse {
  especie_principal: { etiqueta: string; confianza: number };
  requiere_revision_humana: boolean;
  gemma_respuesta?: string;
}

/** Datos recolectados al momento de tomar la foto (GPS + resultado IA) */
interface CaptureSnapshot {
  photoPath: string;
  result: IdentificacionResponse;
  /** Ubicación GPS capturada concurrentemente. Null si GPS no disponible */
  location: Location.LocationObject | null;
  /** Timestamp ISO8601 exacto del momento de captura */
  capturedAt: string;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SearchScreen() {
  const router = useRouter();

  // ── Cámara ──
  const [permission, requestPermission] = useCameraPermissions();
  const hasCameraPermission = permission?.granted;
  const requestCameraPermission = async () => {
    const res = await requestPermission();
    return res?.granted;
  };

  const camera = useRef<CameraView>(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState<boolean>(false);

  // ── GPS ──
  const [locationPermission, setLocationPermission] = useState<boolean>(false);

  // ── API Health ──
  const [isTestingApi, setIsTestingApi] = useState<boolean>(false);

  // ── Resultados de Identificación + snapshot de captura ──
  const [captureSnapshot, setCaptureSnapshot] = useState<CaptureSnapshot | null>(null);

  // ── Estado de guardado / subida ──
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // ─── Efectos ──────────────────────────────────────────────────────────────

  useEffect(() => {
    // Inicializar base de datos SQLite al montar la pantalla
    initDatabase();

    // Solicitar permiso de ubicación
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');
    })();
  }, []);

  // ─── Cámara: foco por tap ─────────────────────────────────────────────────

  const tapGesture = Gesture.Tap().onEnd((_event) => {
    // CameraView maneja autofocus nativo
  });

  // ─── API Health Check ─────────────────────────────────────────────────────

  const testBackendHealth = async (): Promise<void> => {
    try {
      setIsTestingApi(true);
      const response = await fetch(HEALTH_URL, { method: 'GET' });
      const text = await response.text();
      if (!response.ok) {
        Alert.alert('API no respondió OK', `HTTP ${response.status}\n${text.slice(0, 400)}`);
        return;
      }
      Alert.alert('Conexión al backend OK', text.slice(0, 500));
    } catch (error) {
      const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      Alert.alert(
        'No se alcanzó el backend',
        `${msg}\n\nAsegúrate de tener conexión a Internet y que el backend en Render esté activo.`,
      );
    } finally {
      setIsTestingApi(false);
    }
  };

  // ─── Cámara: tomar foto e identificar ─────────────────────────────────────

  /**
   * Captura una foto y simultáneamente obtiene la ubicación GPS.
   * Ambas operaciones corren en paralelo via Promise.all() para minimizar
   * el tiempo de espera del usuario y asegurar que el timestamp y
   * las coordenadas correspondan al mismo instante de observación.
   *
   * Luego envía la foto al backend para su identificación por IA.
   */
  const takePhoto = async (): Promise<void> => {
    if (!camera.current) return;

    try {
      setIsTakingPhoto(true);

      // Marca de tiempo exacta del momento de captura (Darwin Core: eventDate)
      const capturedAt = new Date().toISOString();

      // Captura foto + GPS en paralelo
      const [photo, location] = await Promise.all([
        camera.current.takePictureAsync(),
        locationPermission
          ? Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (!photo) throw new Error('No se capturó la foto');

      const formData = new FormData();
      const uri = photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`;
      formData.append('archivo', { uri, type: 'image/jpeg', name: 'photo.jpg' } as unknown as Blob);
      const response = await fetch(BACKEND_URL, { method: 'POST', body: formData });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const detail = errorBody?.detail ?? `${response.status} ${response.statusText}`;
        throw new Error(`Error en Backend: ${detail}`);
      }

      const result: IdentificacionResponse = await response.json();

      setCaptureSnapshot({
        photoPath: photo.uri,
        result,
        location: location as Location.LocationObject | null,
        capturedAt,
      });

    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      Alert.alert('No se pudo identificar el animal', message);
    } finally {
      setIsTakingPhoto(false);
    }
  };

  // ─── Helpers: construir datos del avistamiento ────────────────────────────

  /**
   * Construye el objeto NewObservationInput con todos los datos disponibles
   * del snapshot de captura actual.
   *
   * @param snapshot - Datos del momento de captura (foto, GPS, respuesta IA)
   * @returns Objeto listo para insertar en SQLite
   */
  const buildObservationData = (snapshot: CaptureSnapshot): NewObservationInput => {
    const { photoPath, result, location, capturedAt } = snapshot;
    const gemmaText = result.gemma_respuesta ?? '';

    // Extraer nombre científico de la respuesta de Gemma
    const scientificMatch = gemmaText.match(/Nombre cient[íi]fico:\s*([^\n]+)/i);
    const scientificName = scientificMatch?.[1]?.trim() ?? null;

    return {
      image_path: photoPath.startsWith('file://') ? photoPath : `file://${photoPath}`,
      latitude: location?.coords.latitude ?? null,
      longitude: location?.coords.longitude ?? null,
      accuracy: location?.coords.accuracy ?? null,
      observed_at: capturedAt,
      species_guess: result.especie_principal.etiqueta,
      scientific_name: scientificName,
      confidence: result.especie_principal.confianza,
      ai_raw_response: JSON.stringify(result),
    };
  };

  // ─── Handlers de acción: Guardar y Subir ─────────────────────────────────

  /**
   * Guarda el avistamiento en SQLite local (sync_status = PENDING).
   * NO sube a iNaturalist. Útil para guardar sin conexión.
   */
  const handleSaveObservation = async (): Promise<void> => {
    if (!captureSnapshot) return;

    try {
      setIsSaving(true);
      const observationData = buildObservationData(captureSnapshot);
      const localId = saveObservation(observationData);

      Alert.alert(
        '✅ Avistamiento guardado',
        `Guardado localmente (ID: ${localId}).\nSe puede subir a iNaturalist más adelante.`,
        [{ text: 'OK', onPress: () => setCaptureSnapshot(null) }]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Error al guardar', `No se pudo guardar el avistamiento:\n${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Guarda el avistamiento en SQLite Y lo sube inmediatamente a iNaturalist.
   *
   * Flujo:
   * 1. INSERT en SQLite (sync_status = PENDING)
   * 2. POST a iNaturalist API (observación + foto)
   * 3. Si éxito → UPDATE sync_status = SYNCED con el id remoto
   * 4. Si falla → UPDATE sync_status = ERROR con el mensaje de error
   *
   * El registro siempre queda en SQLite independientemente del resultado online.
   */
  const handleUploadObservation = async (): Promise<void> => {
    if (!captureSnapshot) return;

    // localId declarado fuera del try para poder usarlo en catch (markSyncError)
    let localId: number | null = null;

    try {
      setIsUploading(true);
      const observationData = buildObservationData(captureSnapshot);

      // 1. Guardar primero en local (garantía de no perder datos)
      localId = saveObservation(observationData);

      // 2. Construir objeto completo con id para las funciones de sync
      const savedObs: LocalObservation = {
        ...observationData,
        id: localId,
        sync_status: 0,
        inaturalist_id: null,
        sync_error: null,
      };

      // 3. Subir a iNaturalist
      const inatId = await uploadToINaturalist(savedObs, INAT_API_TOKEN);

      // 4. Marcar como sincronizado en SQLite
      markAsSynced(localId, inatId);

      Alert.alert(
        '🌿 Avistamiento subido',
        `¡Subido exitosamente a iNaturalist!\nID de observación: ${inatId}\nTambién guardado localmente (ID: ${localId}).`,
        [{ text: 'OK', onPress: () => setCaptureSnapshot(null) }]
      );

    } catch (error) {
      if (error instanceof INaturalistUploadError) {
        // Registrar el error de sync en SQLite con el paso donde falló
        const errorMsg = `[${error.step ?? 'desconocido'}] ${error.message}`;
        if (localId !== null) {
          markSyncError(localId, errorMsg);
        }
        const stepLabel: Record<string, string> = {
          create_observation: 'Crear observación',
          upload_photo: 'Subir foto',
          validation: 'Validación',
        };
        const stepName = error.step ? stepLabel[error.step] ?? error.step : 'Desconocido';
        Alert.alert(
          `⚠️ Error en: ${stepName}`,
          `${error.message}${
            error.detail ? `\n\nDetalle: ${error.detail}` : ''
          }${
            localId !== null
              ? `\n\nAvistamiento guardado localmente (ID: ${localId}). Puedes intentar subir de nuevo más tarde.`
              : ''
          }`
        );
      } else {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Error inesperado', message);
      }
    } finally {
      setIsUploading(false);
    }
  };

  // ─── Guards de pantalla ───────────────────────────────────────────────────

  if (!hasCameraPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Se requieren permisos para continuar:</Text>
        <Text style={[styles.text, { fontSize: 14, marginBottom: 24 }]}>
          Cámara: {permission?.granted ? '✅ Concedido' : '❌ Pendiente'}
        </Text>
        <TouchableOpacity style={styles.button} onPress={async () => {
          let camStatus = permission?.granted;
          if (!camStatus) {
            camStatus = await requestCameraPermission();
          }

          if (!camStatus) {
            Alert.alert(
              'Permisos insuficientes',
              'Aún faltan permisos. Si los has denegado anteriormente, ve a la Configuración de tu dispositivo para activarlos manualmente.'
            );
          }
        }}>
          <Text style={styles.buttonText}>Otorgar Permisos</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Renderizado de Resultados ────────────────────────────────────────────
  const renderResults = () => {
    if (!captureSnapshot) return null;

    const { photoPath, result, location } = captureSnapshot;
    const confidencePercent = (result.especie_principal.confianza * 100).toFixed(1);

    // Parsear la respuesta de Gemma para la tabla
    const gemmaText = result.gemma_respuesta ?? '';
    const gemmaLines = gemmaText.split('\n').filter(l => l.trim().length > 0);
    const gemmaData = gemmaLines.map(l => {
      const parts = l.split(':');
      if (parts.length >= 2) {
        return { label: parts[0].trim(), value: parts.slice(1).join(':').trim() };
      }
      return { label: 'Dato IA', value: l.trim() };
    });

    const tableData = [
      { label: 'Modelo Local', value: result.especie_principal.etiqueta },
      { label: 'Confianza', value: `${confidencePercent}%` },
      {
        label: 'GPS',
        value: location
          ? `${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`
          : 'No disponible',
      },
      ...gemmaData,
    ];

    const handleMoreInfo = () => {
      let nameToSearch = '';

      if (result.especie_principal.confianza > 0.70) {
        const parts = result.especie_principal.etiqueta.split(',');
        nameToSearch = parts[parts.length - 1].trim();
      } else {
        const match = gemmaText.match(/Nombre cient[íi]fico:\s*([^\n]+)/i);
        if (match && match[1]) {
          nameToSearch = match[1].trim();
        } else {
          nameToSearch = gemmaText.replace(/Nombre cient[íi]fico:/i, '').trim();
        }
      }

      if (!nameToSearch) {
        Alert.alert('Aviso', 'No se detectó un nombre válido para buscar información.');
        return;
      }

      router.push({
        pathname: '/information',
        params: { scientificName: nameToSearch },
      });
    };

    const anyActionLoading = isSaving || isUploading;

    return (
      <View style={styles.resultOverlay}>
        <View style={styles.resultCard}>
          <Image
            source={{ uri: photoPath.startsWith('file://') ? photoPath : `file://${photoPath}` }}
            style={styles.resultImage}
            resizeMode="cover"
          />

          <Text style={styles.reviewWarningText}>
            ⚠️ Requiere revisión de un experto
          </Text>

          <View style={styles.tableContainer}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {tableData.map((item, index) => (
                <View key={index} style={[styles.tableRow, index % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd]}>
                  <Text style={styles.tableLabel}>{item.label}</Text>
                  <Text style={styles.tableValue}>{item.value}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* ── Fila 1: Ver más ── */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.actionButtonFull}
              onPress={handleMoreInfo}
            >
              <Ionicons name="information-circle-outline" size={16} color="#fff" style={styles.btnIcon} />
              <Text style={styles.actionButtonText}>Ver más</Text>
            </TouchableOpacity>
          </View>

          {/* ── Fila 2: Guardar | Subir avistamiento ── */}
          <View style={styles.actionButtonsRow}>
            {/* Botón Guardar → solo SQLite local */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.saveButton,
                anyActionLoading && styles.buttonDisabled,
              ]}
              onPress={handleSaveObservation}
              disabled={anyActionLoading}
              accessibilityLabel="Guardar avistamiento localmente"
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={16} color="#fff" style={styles.btnIcon} />
                  <Text style={styles.actionButtonText}>Guardar</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Botón Subir avistamiento → SQLite + iNaturalist */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.uploadButton,
                anyActionLoading && styles.buttonDisabled,
              ]}
              onPress={handleUploadObservation}
              disabled={anyActionLoading}
              accessibilityLabel="Guardar y subir avistamiento a iNaturalist"
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={16} color="#fff" style={styles.btnIcon} />
                  <Text style={styles.actionButtonText}>Subir avistamiento</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.closeResultButton}
          onPress={() => setCaptureSnapshot(null)}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <GestureDetector gesture={tapGesture}>
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="back"
            autofocus="on"
          />
        </GestureDetector>

        {/* ── Barra superior: Probar API ── */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.apiTestButton, isTestingApi && styles.buttonDisabled]}
            onPress={testBackendHealth}
            disabled={isTestingApi}
            accessibilityLabel="Probar conexión al backend"
          >
            <Text style={styles.apiTestButtonText}>
              {isTestingApi ? 'Comprobando…' : 'Probar API'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Overlay: Toca para enfocar ── */}
        <View style={styles.overlayTextContainer}>
          <Text style={styles.overlayText}>Toca para enfocar</Text>
        </View>

        {/* ── Barra de botones de captura ── */}
        <View style={styles.captureContainer}>
          <TouchableOpacity
            style={[
              styles.captureButton,
              isTakingPhoto && styles.captureButtonDisabled,
            ]}
            onPress={takePhoto}
            disabled={isTakingPhoto}
            accessibilityLabel="Tomar foto e identificar animal"
          >
            {isTakingPhoto ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View style={styles.captureButtonInner} />
            )}
          </TouchableOpacity>
        </View>

        {/* ── Overlay de Resultados ── */}
        {renderResults()}
      </View>
    </GestureHandlerRootView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: '#1E90FF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // ── Top Bar ──
  topBar: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  apiTestButton: {
    backgroundColor: 'rgba(30, 144, 255, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  apiTestButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Overlay hint ──
  overlayTextContainer: {
    position: 'absolute',
    top: 110,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  overlayText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Capture bar (cámara) ──
  captureContainer: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },

  // ── Botón de cámara (shutter) ──
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'transparent',
    borderWidth: 4,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonDisabled: {
    borderColor: '#aaaaaa',
    opacity: 0.6,
  },
  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#ffffff',
  },

  // ── Result Overlay ──
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 10,
  },
  resultCard: {
    width: '100%',
    backgroundColor: '#EAF2E3',
    borderRadius: 32,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  resultImage: {
    width: '100%',
    height: 260,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  tableContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    maxHeight: 180,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 4,
  },
  tableRowEven: {
    backgroundColor: 'transparent',
  },
  tableRowOdd: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  tableLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3A4D39',
  },
  tableValue: {
    fontSize: 13,
    color: '#4F6F52',
    fontWeight: '400',
    flex: 1,
    textAlign: 'right',
  },
  reviewWarningText: {
    color: '#D4883A',
    textAlign: 'center',
    fontWeight: 'bold',
    marginTop: 14,
    fontSize: 14,
  },

  // ── Action Buttons ──
  actionButtonsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  /** Botón que ocupa todo el ancho de la fila (Ver más) */
  actionButtonFull: {
    flex: 1,
    backgroundColor: '#4F6F52',
    paddingVertical: 13,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  /** Botón que comparte fila con otro (Guardar / Subir) */
  actionButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  saveButton: {
    backgroundColor: '#5B8C5A',
  },
  uploadButton: {
    backgroundColor: '#3A4D39',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  btnIcon: {
    marginRight: 5,
  },
  closeResultButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
