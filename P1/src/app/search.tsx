import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
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

// ─── Constantes ───────────────────────────────────────────────────────────────

const API_BASE_URL = 'https://p1-q8lf.onrender.com';
const BACKEND_URL = `${API_BASE_URL}/api/v1/identificacion/identificar`;

/**
 * Timeout en ms para la petición al backend de IA.
 * Si la red es lenta o el servidor está dormido (Render free tier),
 * se trata como modo offline en lugar de bloquear al usuario.
 */
const AI_TIMEOUT_MS = 12000;

const INAT_API_TOKEN =
  'eyJhbGciOiJIUzUxMiJ9.eyJ1c2VyX2lkIjoxMDM4MDQ0MSwiZXhwIjoxNzc3OTQ0NTA0fQ.LvEgwu3r45R3gYm47baFq6VgrjG-khjLuFNhAZeKNYCW0NPZseScDP6Sq1qRz1JjZZCgne07y3CrwALJBDMpjw';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface IdentificacionResponse {
  especie_principal: { etiqueta: string; confianza: number };
  requiere_revision_humana: boolean;
  gemma_respuesta?: string;
}

/**
 * Snapshot completo del momento de captura.
 * `aiResult` es null cuando se está en modo offline (sin conexión o backend caído).
 */
interface CaptureSnapshot {
  photoPath: string;
  location: Location.LocationObject | null;
  capturedAt: string;
  /** Resultado de la IA. NULL → modo offline, la identificación queda pendiente */
  aiResult: IdentificacionResponse | null;
  /** true = se obtuvo respuesta de la IA; false = se capturó sin red */
  isOnline: boolean;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SearchScreen() {
  const router = useRouter();

  // ── Cámara ──
  const [permission, requestPermission] = useCameraPermissions();
  const hasCameraPermission = permission?.granted;
  const camera = useRef<CameraView>(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState<boolean>(false);

  // ── GPS ──
  const [locationPermission, setLocationPermission] = useState<boolean>(false);

  // ── Snapshot ──
  const [captureSnapshot, setCaptureSnapshot] = useState<CaptureSnapshot | null>(null);

  // ── Nota manual de especie (modo offline) ──
  const [speciesNote, setSpeciesNote] = useState<string>('');

  // ── Estados de acción ──
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // ─── Efectos ──────────────────────────────────────────────────────────────

  useEffect(() => {
    initDatabase();
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');
    })();
  }, []);

  // ─── Tap gesture (autofocus nativo) ──────────────────────────────────────

  const tapGesture = Gesture.Tap().onEnd((_event) => {});

  // ─── Captura: foto + GPS + IA (si hay red) ───────────────────────────────

  /**
   * Intenta llamar al backend de IA con un timeout controlado.
   * Si no hay red o supera el timeout, retorna null (modo offline).
   *
   * @param photoUri - URI local de la foto a identificar
   * @returns Respuesta de la IA o null si no hay conexión
   */
  const attemptAiIdentification = async (
    photoUri: string
  ): Promise<IdentificacionResponse | null> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    try {
      const formData = new FormData();
      const uri = photoUri.startsWith('file://') ? photoUri : `file://${photoUri}`;
      formData.append('archivo', { uri, type: 'image/jpeg', name: 'photo.jpg' } as unknown as Blob);

      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) return null;
      return await response.json() as IdentificacionResponse;
    } catch {
      // Sin red, timeout o backend caído → modo offline
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  /**
   * Captura foto + GPS en paralelo, luego intenta identificación por IA.
   * Si la IA no responde dentro del timeout, continúa en modo offline.
   * El avistamiento siempre se puede guardar en SQLite independientemente.
   */
  const takePhoto = async (): Promise<void> => {
    if (!camera.current) return;

    try {
      setIsTakingPhoto(true);
      const capturedAt = new Date().toISOString();

      // 1. Foto + GPS en paralelo (sin red)
      const [photo, location] = await Promise.all([
        camera.current.takePictureAsync(),
        locationPermission
          ? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (!photo) throw new Error('No se capturó la foto');

      // 2. Intentar IA (con timeout — no bloquea si no hay red)
      const aiResult = await attemptAiIdentification(photo.uri);

      setSpeciesNote('');
      setCaptureSnapshot({
        photoPath: photo.uri,
        location: location as Location.LocationObject | null,
        capturedAt,
        aiResult,
        isOnline: aiResult !== null,
      });
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      Alert.alert('Error al capturar', message);
    } finally {
      setIsTakingPhoto(false);
    }
  };

  // ─── Builder de datos Darwin Core ────────────────────────────────────────

  /**
   * Construye NewObservationInput con todos los datos disponibles.
   * Compatible con Darwin Core y con los campos requeridos por uploadToINaturalist.
   *
   * Campos clave para subida posterior:
   * - image_path   → ruta local de la foto (se sube como multipart)
   * - latitude/longitude → coordenadas GPS para iNaturalist
   * - observed_at  → timestamp ISO8601 (Darwin Core: eventDate)
   * - species_guess / scientific_name → identificación de especie
   * - confidence / ai_raw_response → trazabilidad del proceso de IA
   */
  const buildObservationData = (
    snapshot: CaptureSnapshot,
    userNote: string
  ): NewObservationInput => {
    const { photoPath, aiResult, location, capturedAt } = snapshot;

    // Extraer nombre científico de Gemma si está disponible
    let scientificName: string | null = null;
    if (aiResult?.gemma_respuesta) {
      const match = aiResult.gemma_respuesta.match(/Nombre cient[íi]fico:\s*([^\n]+)/i);
      scientificName = match?.[1]?.trim() ?? null;
    }

    // species_guess: prioridad → IA > nota del usuario > null
    const speciesGuess = aiResult?.especie_principal.etiqueta ?? (userNote.trim() || null);

    return {
      image_path: photoPath.startsWith('file://') ? photoPath : `file://${photoPath}`,
      latitude: location?.coords.latitude ?? null,
      longitude: location?.coords.longitude ?? null,
      accuracy: location?.coords.accuracy ?? null,
      observed_at: capturedAt,
      species_guess: speciesGuess,
      scientific_name: scientificName,
      confidence: aiResult?.especie_principal.confianza ?? null,
      // ai_raw_response guardado para trazabilidad y re-procesamiento futuro
      ai_raw_response: aiResult ? JSON.stringify(aiResult) : null,
    };
  };

  // ─── Guardar en SQLite (offline-safe) ────────────────────────────────────

  /**
   * Guarda el avistamiento en SQLite con sync_status = PENDING.
   * Funciona sin conexión. El registro queda en cola para subida posterior.
   */
  const handleSaveObservation = async (): Promise<void> => {
    if (!captureSnapshot) return;

    try {
      setIsSaving(true);
      const observationData = buildObservationData(captureSnapshot, speciesNote);
      const localId = saveObservation(observationData);

      Alert.alert(
        '✅ Avistamiento guardado',
        `Guardado localmente (ID: ${localId}).\nSe subirá a iNaturalist cuando haya conexión estable.`,
        [{ text: 'OK', onPress: () => setCaptureSnapshot(null) }]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Error al guardar', message);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Guardar + Subir a iNaturalist (solo online) ─────────────────────────

  /**
   * Guarda en SQLite Y sube inmediatamente a iNaturalist.
   * Solo disponible cuando hay resultado de IA (isOnline = true).
   *
   * Flujo:
   * 1. INSERT SQLite (PENDING) — garantía de no perder datos
   * 2. POST /observations → iNaturalist
   * 3. POST /observation_photos → adjunta la foto
   * 4. UPDATE SQLite → SYNCED con id remoto
   * 5. Si falla en cualquier paso → UPDATE SQLite → ERROR con diagnóstico
   */
  const handleUploadObservation = async (): Promise<void> => {
    if (!captureSnapshot) return;

    let localId: number | null = null;

    try {
      setIsUploading(true);
      const observationData = buildObservationData(captureSnapshot, speciesNote);

      // 1. Guardar local primero
      localId = saveObservation(observationData);

      // 2. Construir objeto completo para el servicio de upload
      const savedObs: LocalObservation = {
        ...observationData,
        id: localId,
        sync_status: 0,
        inaturalist_id: null,
        sync_error: null,
      };

      // 3. Subir a iNaturalist (observación + foto)
      const inatId = await uploadToINaturalist(savedObs, INAT_API_TOKEN);

      // 4. Marcar como sincronizado
      markAsSynced(localId, inatId);

      Alert.alert(
        '🌿 Avistamiento subido',
        `¡Subido a iNaturalist!\nID remoto: ${inatId}\nGuardado local: ${localId}`,
        [{ text: 'OK', onPress: () => setCaptureSnapshot(null) }]
      );
    } catch (error) {
      if (error instanceof INaturalistUploadError) {
        const errorMsg = `[${error.step ?? 'desconocido'}] ${error.message}`;
        if (localId !== null) markSyncError(localId, errorMsg);

        const stepLabel: Record<string, string> = {
          create_observation: 'Crear observación',
          upload_photo: 'Subir foto',
          validation: 'Validación',
        };
        const stepName = error.step ? (stepLabel[error.step] ?? error.step) : 'Desconocido';

        Alert.alert(
          `⚠️ Error en: ${stepName}`,
          `${error.message}${error.detail ? `\n\nDetalle: ${error.detail}` : ''}${
            localId !== null
              ? `\n\nDatos guardados localmente (ID: ${localId}). Puedes subir de nuevo más tarde.`
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

  // ─── Guard: permisos ──────────────────────────────────────────────────────

  if (!hasCameraPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Se requieren permisos de cámara</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            const res = await requestPermission();
            if (!res?.granted) {
              Alert.alert(
                'Permisos insuficientes',
                'Ve a Configuración del dispositivo para activar la cámara.'
              );
            }
          }}
        >
          <Text style={styles.buttonText}>Otorgar Permisos</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Overlay de resultado (online u offline) ──────────────────────────────

  const renderResult = () => {
    if (!captureSnapshot) return null;

    const { photoPath, location, aiResult, isOnline } = captureSnapshot;
    const anyLoading = isSaving || isUploading;

    // Tabla de metadatos
    const gpsText = location
      ? `${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`
      : 'No disponible';

    const baseRows = [
      { label: '📍 GPS', value: gpsText },
      {
        label: '🎯 Precisión',
        value: location?.coords.accuracy ? `±${location.coords.accuracy.toFixed(0)} m` : '—',
      },
    ];

    // Filas adicionales solo en modo online
    const aiRows = aiResult
      ? [
          { label: '🤖 Especie (IA)', value: aiResult.especie_principal.etiqueta },
          {
            label: '📊 Confianza',
            value: `${(aiResult.especie_principal.confianza * 100).toFixed(1)}%`,
          },
          ...(aiResult.gemma_respuesta
            ? aiResult.gemma_respuesta
                .split('\n')
                .filter((l) => l.trim().length > 0)
                .map((l) => {
                  const parts = l.split(':');
                  return parts.length >= 2
                    ? { label: parts[0].trim(), value: parts.slice(1).join(':').trim() }
                    : { label: 'IA', value: l.trim() };
                })
            : []),
        ]
      : [];

    const tableRows = [...baseRows, ...aiRows];

    // Nombre para "Ver más info" en iNaturalist (solo online)
    const handleMoreInfo = () => {
      if (!aiResult) return;
      let nameToSearch = '';
      if (aiResult.especie_principal.confianza > 0.7) {
        const parts = aiResult.especie_principal.etiqueta.split(',');
        nameToSearch = parts[parts.length - 1].trim();
      } else if (aiResult.gemma_respuesta) {
        const match = aiResult.gemma_respuesta.match(/Nombre cient[íi]fico:\s*([^\n]+)/i);
        nameToSearch = match?.[1]?.trim() ?? aiResult.especie_principal.etiqueta;
      }
      if (nameToSearch) {
        router.push({ pathname: '/information', params: { scientificName: nameToSearch } });
      }
    };

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.resultOverlay}
      >
        <ScrollView
          contentContainerStyle={styles.resultScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.resultCard}>
            {/* Foto */}
            <Image
              source={{ uri: photoPath.startsWith('file://') ? photoPath : `file://${photoPath}` }}
              style={styles.resultImage}
              resizeMode="cover"
            />

            {/* Badge de modo */}
            <View style={styles.modeBadge}>
              <Ionicons
                name={isOnline ? 'cloud-done-outline' : 'cloud-offline-outline'}
                size={14}
                color={isOnline ? '#4F6F52' : '#D4883A'}
              />
              <Text style={[styles.modeBadgeText, { color: isOnline ? '#4F6F52' : '#D4883A' }]}>
                {isOnline ? 'Identificación IA disponible' : 'Modo offline · Pendiente de sincronización'}
              </Text>
            </View>

            {/* Tabla de metadatos */}
            <View style={styles.tableContainer}>
              {tableRows.map((item, index) => (
                <View
                  key={index}
                  style={[styles.tableRow, index % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd]}
                >
                  <Text style={styles.tableLabel}>{item.label}</Text>
                  <Text style={styles.tableValue}>{item.value}</Text>
                </View>
              ))}
            </View>

            {/* Nota manual (siempre disponible, útil en offline) */}
            <View style={styles.noteContainer}>
              <Text style={styles.noteLabel}>
                {isOnline ? '✏️ Nota adicional' : '🔍 ¿Qué observaste?'}{' '}
                <Text style={styles.noteOptional}>(opcional)</Text>
              </Text>
              <TextInput
                style={styles.noteInput}
                value={speciesNote}
                onChangeText={setSpeciesNote}
                placeholder={
                  isOnline
                    ? 'Comportamiento, contexto...'
                    : 'Ej. Tucán, Quetzal, Colibrí...'
                }
                placeholderTextColor="#9DB99E"
                maxLength={120}
                returnKeyType="done"
                accessibilityLabel="Nota del avistamiento"
              />
            </View>

            {/* Botones fila 1: Ver más (solo online) */}
            {isOnline && (
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={styles.actionButtonFull}
                  onPress={handleMoreInfo}
                  accessibilityLabel="Ver más información de la especie"
                >
                  <Ionicons name="information-circle-outline" size={16} color="#fff" style={styles.btnIcon} />
                  <Text style={styles.actionButtonText}>Ver más info</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Botones fila 2: Guardar | Subir */}
            <View style={styles.actionButtonsRow}>
              {/* Guardar → solo SQLite */}
              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton, anyLoading && styles.buttonDisabled]}
                onPress={handleSaveObservation}
                disabled={anyLoading}
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

              {/* Subir a iNaturalist → solo en modo online */}
              {isOnline && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.uploadButton, anyLoading && styles.buttonDisabled]}
                  onPress={handleUploadObservation}
                  disabled={anyLoading}
                  accessibilityLabel="Guardar y subir a iNaturalist"
                >
                  {isUploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={16} color="#fff" style={styles.btnIcon} />
                      <Text style={styles.actionButtonText}>Subir</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Botón cerrar */}
        <TouchableOpacity
          style={styles.closeResultButton}
          onPress={() => setCaptureSnapshot(null)}
          accessibilityLabel="Cerrar resultado"
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <GestureDetector gesture={tapGesture}>
          <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" autofocus="on" />
        </GestureDetector>

        {/* ── Indicador de estado ── */}
        <View style={styles.topBar}>
          <View style={styles.statusIndicator}>
            <Ionicons name="leaf-outline" size={14} color="#90C97B" />
            <Text style={styles.statusText}>BioLife · Identificación automática</Text>
          </View>
        </View>

        {/* ── Hint de enfoque ── */}
        <View style={styles.overlayTextContainer}>
          <Text style={styles.overlayText}>Toca para enfocar</Text>
        </View>

        {/* ── Botón de captura ── */}
        <View style={styles.captureContainer}>
          <TouchableOpacity
            style={[styles.captureButton, isTakingPhoto && styles.captureButtonDisabled]}
            onPress={takePhoto}
            disabled={isTakingPhoto}
            accessibilityLabel="Tomar foto del avistamiento"
          >
            {isTakingPhoto ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View style={styles.captureButtonInner} />
            )}
          </TouchableOpacity>
        </View>

        {/* ── Overlay de resultado ── */}
        {renderResult()}
      </View>
    </GestureHandlerRootView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontSize: 16, marginBottom: 16, textAlign: 'center', paddingHorizontal: 20 },
  button: { backgroundColor: '#1E90FF', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },

  topBar: { position: 'absolute', top: 48, left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  statusIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(144,201,123,0.4)',
  },
  statusText: { color: '#90C97B', fontSize: 13, fontWeight: '600' },

  overlayTextContainer: {
    position: 'absolute', top: 110,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
  },
  overlayText: { color: '#fff', fontSize: 14, fontWeight: '500' },

  captureContainer: {
    position: 'absolute', bottom: 50, width: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  captureButton: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: 'transparent', borderWidth: 4, borderColor: '#ffffff',
    justifyContent: 'center', alignItems: 'center',
  },
  captureButtonDisabled: { borderColor: '#aaaaaa', opacity: 0.6 },
  captureButtonInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#ffffff' },

  // ── Overlay resultado ──
  resultOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 10 },
  resultScrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingTop: 70, paddingBottom: 30 },
  resultCard: { width: '100%', backgroundColor: '#EAF2E3', borderRadius: 32, overflow: 'hidden' },
  resultImage: { width: '100%', height: 220 },

  modeBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, marginBottom: 4 },
  modeBadgeText: { fontSize: 13, fontWeight: '600' },

  tableContainer: { paddingHorizontal: 20, paddingVertical: 8, maxHeight: 200 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },
  tableRowEven: { backgroundColor: 'transparent' },
  tableRowOdd: { backgroundColor: 'rgba(255,255,255,0.5)' },
  tableLabel: { fontSize: 13, fontWeight: '600', color: '#3A4D39' },
  tableValue: { fontSize: 13, color: '#4F6F52', fontWeight: '400', flex: 1, textAlign: 'right' },

  noteContainer: { paddingHorizontal: 20, paddingBottom: 10 },
  noteLabel: { fontSize: 13, fontWeight: '600', color: '#3A4D39', marginBottom: 8 },
  noteOptional: { fontWeight: '400', color: '#7A9B7A' },
  noteInput: {
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, color: '#2C3E2D', borderWidth: 1, borderColor: '#C8DBC9',
  },

  actionButtonsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  actionButtonFull: {
    flex: 1, backgroundColor: '#4F6F52', paddingVertical: 13, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
  },
  actionButton: { flex: 1, paddingVertical: 13, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  saveButton: { backgroundColor: '#5B8C5A' },
  uploadButton: { backgroundColor: '#3A4D39' },
  actionButtonText: { color: '#ffffff', fontSize: 13, fontWeight: 'bold', textAlign: 'center' },
  btnIcon: { marginRight: 5 },

  closeResultButton: {
    position: 'absolute', top: 50, right: 20,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
});
