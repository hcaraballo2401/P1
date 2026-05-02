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
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';

// ─── Constantes de configuración ─────────────────────────────────────────────

/**
 * Backend de identificación (FastAPI).
 * Desplegado en Render.
 */
const API_BASE_URL = 'https://p1-q8lf.onrender.com';
const BACKEND_URL = `${API_BASE_URL}/api/v1/identificacion/identificar`;
const HEALTH_URL = `${API_BASE_URL}/health`;

// ─── Interfaces TypeScript ─────────────────────────────────────────────────────

interface IdentificacionResponse {
  especie_principal: { etiqueta: string; confianza: number };
  requiere_revision_humana: boolean;
  gemma_respuesta?: string;
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

  // ── API Health ──
  const [isTestingApi, setIsTestingApi] = useState<boolean>(false);

  // ── Resultados de Identificación ──
  const [identificationResult, setIdentificationResult] = useState<{
    photoPath: string;
    result: IdentificacionResponse;
  } | null>(null);

  // ─── Efectos ──────────────────────────────────────────────────────────────
  
  useEffect(() => {
    // Solo comprobamos el permiso al montar
  }, []);

  // ─── Cámara: foco por tap ─────────────────────────────────────────────────

  const tapGesture = Gesture.Tap().onEnd((event) => {
    // CameraView auto-focus can handle focus out-of-the-box in many cases.
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
   * Captura una foto y la envía al backend para su identificación.
   * Usa multipart/form-data para que el servidor procese el archivo
   * con python-multipart en FastAPI. El backend maneja internamente
   * la consulta a modelos secundarios.
   */
  const takePhoto = async (): Promise<void> => {
    if (!camera.current) return;

    try {
      setIsTakingPhoto(true);

      const photo = await camera.current.takePictureAsync();

      if (!photo) throw new Error("No se capturó la foto");

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
      
      setIdentificationResult({
        photoPath: photo.uri,
        result,
      });

    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      Alert.alert('No se pudo identificar el animal', message);
    } finally {
      setIsTakingPhoto(false);
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
    if (!identificationResult) return null;

    const { photoPath, result } = identificationResult;
    const confidencePercent = (result.especie_principal.confianza * 100).toFixed(1);
    
    // Parsear la respuesta de Gemma para la tabla
    const gemmaText = result.gemma_respuesta || "";
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
      ...gemmaData
    ];

    const handleMoreInfo = () => {
      let nameToSearch = "";
      
      // Si el modelo local tiene alta confianza (>70%), preferimos su etiqueta
      if (result.especie_principal.confianza > 0.70) {
        // ResNet suele devolver una lista separada por comas (ej: "capuchin, ringtail, Cebus capucinus")
        // El nombre científico suele estar al final de la cadena.
        const parts = result.especie_principal.etiqueta.split(',');
        nameToSearch = parts[parts.length - 1].trim();
      } else {
        // Extraemos el nombre científico de la respuesta de Gemma
        const match = gemmaText.match(/Nombre cient[íi]fico:\s*([^\n]+)/i);
        if (match && match[1]) {
          nameToSearch = match[1].trim();
        } else {
          // Fallback si la IA no siguió el formato exacto
          nameToSearch = gemmaText.replace(/Nombre cient[íi]fico:/i, '').trim();
        }
      }

      if (!nameToSearch) {
        Alert.alert('Aviso', 'No se detectó un nombre válido para buscar información.');
        return;
      }

      // No ocultamos el overlay para que al regresar de 'information.tsx' siga visible
      router.push({
        pathname: '/information',
        params: { scientificName: nameToSearch }
      });
    };

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
          
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity style={styles.actionButton} onPress={handleMoreInfo}>
              <Text style={styles.actionButtonText}>Ver más</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, styles.uploadButton]} 
              onPress={() => Alert.alert('Aviso', 'Subir avistamiento estará disponible próximamente.')}
            >
              <Text style={styles.actionButtonText}>Subir avistamiento</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.closeResultButton} 
          onPress={() => setIdentificationResult(null)}
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
          {/* Botón de cámara */}
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
    backgroundColor: '#EAF2E3', // Color verdoso claro similar a la imagen
    borderRadius: 32,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  resultImage: {
    width: '100%',
    height: 300,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  tableContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxHeight: 200,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#3A4D39',
  },
  tableValue: {
    fontSize: 14,
    color: '#4F6F52',
    fontWeight: '400',
    flex: 1,
    textAlign: 'right',
  },
  reviewWarningText: {
    color: '#D4883A', // Tono de advertencia
    textAlign: 'center',
    fontWeight: 'bold',
    marginTop: 16,
    fontSize: 14,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#4F6F52',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButton: {
    backgroundColor: '#3A4D39', // Tono más oscuro para diferenciar
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
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
