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
import * as FileSystem from 'expo-file-system';
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
  const [isTakingBurst, setIsTakingBurst] = useState<boolean>(false);

  // ── Zoom de Cámara ──
  const [zoom, setZoom] = useState<number>(0);
  const startZoom = useRef<number>(0);

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

  // ─── Cámara: foco por tap y zoom ──────────────────────────────────────────

  const tapGesture = Gesture.Tap().onEnd((event) => {
    // CameraView auto-focus can handle focus out-of-the-box in many cases.
  });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      startZoom.current = zoom;
    })
    .onUpdate((event) => {
      let newZoom = startZoom.current + (event.scale - 1) * 0.05; // Ajuste suave
      setZoom(Math.min(Math.max(newZoom, 0), 1));
    });

  const cameraGestures = Gesture.Simultaneous(tapGesture, pinchGesture);

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

  // ─── Cámara: ráfaga (burst) y nitidez ───────────────────────────────────

  /**
   * Realiza una ráfaga (3 fotos consecutivas).
   * Despues, analiza localmente el tamaño del archivo jpeg de cada una.
   * HEURÍSTICA: En la compresión JPEG, las imágenes borrosas tienen menos detalle (menos alta frecuencia)
   * y se comprimen mucho más (menor tamaño). Las imágenes nítidas pesan más.
   * Esto sirve como un proxy ligero y sin dependencias nativas para medir enfoque/nitidez en JS.
   * Se descartan las que estén por debajo de un umbral o se elige simplemente la más pesada.
   */
  const takeBurstAndIdentify = async (): Promise<void> => {
    if (!camera.current) return;
    try {
      setIsTakingBurst(true);
      const burstCount = 3;
      const photos: { uri: string; size: number }[] = [];

      // Tomar ráfaga rápida
      for (let i = 0; i < burstCount; i++) {
        // En expo-camera, si pedimos base64 es un proceso lento. Usamos calidad ~0.8 y solo URI.
        const photo = await camera.current.takePictureAsync({ quality: 0.8 });
        if (photo?.uri) {
          const fileInfo = await FileSystem.getInfoAsync(photo.uri);
          if (fileInfo.exists && fileInfo.size) {
            photos.push({ uri: photo.uri, size: fileInfo.size });
          }
        }
      }

      if (photos.length === 0) throw new Error("No se pudo capturar la ráfaga");

      // Evaluar la "nitidez" a través del tamaño del archivo.
      // 1. Descartar extremadamente pequeñas (completamente borrosas/negras).
      // 2. Ordenar descendentemente por tamaño para elegir la "más nítida".
      const sortedBySharpness = photos.sort((a, b) => b.size - a.size);
      const bestPhoto = sortedBySharpness[0];

      // Proceder a enviar la MEJOR FOTO al backend
      const formData = new FormData();
      const uri = bestPhoto.uri.startsWith('file://') ? bestPhoto.uri : `file://${bestPhoto.uri}`;
      formData.append('archivo', { uri, type: 'image/jpeg', name: 'photo_burst.jpg' } as unknown as Blob);
      
      const response = await fetch(BACKEND_URL, { method: 'POST', body: formData });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const detail = errorBody?.detail ?? `${response.status} ${response.statusText}`;
        throw new Error(`Error en Backend: ${detail}`);
      }

      const result: IdentificacionResponse = await response.json();
      setIdentificationResult({
        photoPath: bestPhoto.uri,
        result,
      });

    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      Alert.alert('Error en ráfaga', message);
    } finally {
      setIsTakingBurst(false);
    }
  };

  // ─── Cámara: tomar foto individual ────────────────────────────────────────

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
      const extractScientificName = (text: string) => {
        const regex = /\b[A-Z][a-z]+(?: [a-z]+){1,2}\b/g;
        const matches = text.match(regex);
        return matches?.[matches.length - 1]?.trim() ?? '';
      };

      const tryParseFromLabel = (label: string) => {
        const candidates = label.split(',').map((part) => part.trim()).filter(Boolean);
        for (let i = candidates.length - 1; i >= 0; i -= 1) {
          const candidate = candidates[i];
          if (/^[A-Z][a-z]+(?: [a-z]+){1,2}$/.test(candidate)) {
            return candidate;
          }
        }
        return extractScientificName(label);
      };

      let nameToSearch = '';
      const gemmaMatch = gemmaText.match(/Nombre cient[íi]fico:\s*([^\n]+)/i);
      if (gemmaMatch && gemmaMatch[1]) {
        nameToSearch = gemmaMatch[1].trim();
      } else if (result.especie_principal.confianza > 0.70) {
        const candidate = tryParseFromLabel(result.especie_principal.etiqueta);
        nameToSearch = candidate || result.especie_principal.etiqueta.trim();
      } else {
        const candidate = tryParseFromLabel(result.especie_principal.etiqueta);
        nameToSearch = candidate || gemmaText.replace(/Nombre cient[íi]fico:/i, '').trim();
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
        <GestureDetector gesture={cameraGestures}>
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="back"
            autofocus="on"
            zoom={zoom}
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
          
          {/* Botón Normal */}
          <TouchableOpacity
            style={[
              styles.captureButton,
              (isTakingPhoto || isTakingBurst) && styles.captureButtonDisabled,
            ]}
            onPress={takePhoto}
            disabled={isTakingPhoto || isTakingBurst}
            accessibilityLabel="Tomar foto e identificar animal"
          >
            {isTakingPhoto ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View style={styles.captureButtonInner} />
            )}
          </TouchableOpacity>

          {/* Botón de Ráfaga Inteligente */}
          <TouchableOpacity
            style={[
              styles.burstButton,
              (isTakingPhoto || isTakingBurst) && styles.captureButtonDisabled,
            ]}
            onPress={takeBurstAndIdentify}
            disabled={isTakingPhoto || isTakingBurst}
            accessibilityLabel="Tomar ráfaga de fotos e identificar"
          >
            {isTakingBurst ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.burstButtonText}>Ráfaga</Text>
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

  burstButton: {
    position: 'absolute',
    right: 40,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF8C00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  burstButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
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
