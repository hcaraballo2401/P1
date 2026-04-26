import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
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
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SearchScreen() {
  // ── Cámara ──
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const backDevice = useCameraDevice('back');
  const frontDevice = useCameraDevice('front');
  const device = backDevice || frontDevice;

  const camera = useRef<Camera>(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState<boolean>(false);

  // ── API Health ──
  const [isTestingApi, setIsTestingApi] = useState<boolean>(false);

  // ─── Efectos ──────────────────────────────────────────────────────────────
  
  useEffect(() => {
    // Solo comprobamos el permiso al montar
  }, []);

  // ─── Cámara: foco por tap ─────────────────────────────────────────────────

  const tapGesture = Gesture.Tap().onEnd((event) => {
    if (camera.current && device?.supportsFocus) {
      camera.current.focus({ x: event.x, y: event.y }).catch(() => { });
    }
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
   * con python-multipart en FastAPI.
   */
  const takePhoto = async (): Promise<void> => {
    if (!camera.current) return;

    try {
      setIsTakingPhoto(true);

      const photo = await camera.current.takePhoto({ enableShutterSound: true });

      const formData = new FormData();
      const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      formData.append('archivo', { uri, type: 'image/jpeg', name: 'photo.jpg' } as unknown as Blob);

      const response = await fetch(BACKEND_URL, { method: 'POST', body: formData });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const detail = errorBody?.detail ?? `${response.status} ${response.statusText}`;
        throw new Error(detail);
      }

      const result: IdentificacionResponse = await response.json();
      const confidencePercent = (result.especie_principal.confianza * 100).toFixed(1);

      Alert.alert(
        `Animal identificado: ${result.especie_principal.etiqueta}`,
        `Confianza: ${confidencePercent}%${result.requiere_revision_humana ? '\nRequiere revisión humana.' : ''}`,
      );
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
          Cámara: {hasCameraPermission ? '✅ Concedido' : '❌ Pendiente'}
        </Text>
        <TouchableOpacity style={styles.button} onPress={async () => {
          let camStatus: boolean = hasCameraPermission;
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

  if (device == null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No se encontró un dispositivo de cámara</Text>
      </View>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <GestureDetector gesture={tapGesture}>
          <Camera
            ref={camera}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            photo={true}
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
});
