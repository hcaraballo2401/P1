import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';

/**
 * Backend de identificación (FastAPI).
 *
 * - Emulador Android: http://10.0.2.2:8000
 * - Teléfono por USB (adb reverse tcp:8000 tcp:8000): http://127.0.0.1:8000
 * - Teléfono por WiFi (misma red que la PC): http://<IP_LAN_PC>:8000
 */
const API_BASE_URL = 'http://192.168.1.5:8000';
const BACKEND_URL = `${API_BASE_URL}/api/v1/identificacion/identificar`;
const HEALTH_URL = `${API_BASE_URL}/health`;

export default function SearchScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const camera = useRef<Camera>(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);

  const testBackendHealth = async () => {
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
      const msg =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      Alert.alert(
        'No se alcanzó el backend',
        `${msg}\n\nAsegúrate: uvicorn en 0.0.0.0:8000, adb reverse tcp:8000 tcp:8000, y API_BASE_URL correcto.`,
      );
    } finally {
      setIsTestingApi(false);
    }
  };

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const tapGesture = Gesture.Tap().onEnd((event) => {
    if (camera.current && device?.supportsFocus) {
      camera.current.focus({ x: event.x, y: event.y }).catch((e) => {
        console.warn('Focus no soportado o error:', e);
      });
    }
  });

  /**
   * Captura una foto y la envía al backend para su identificación.
   * Usa multipart/form-data para que el servidor pueda procesar el archivo
   * con una librería estándar (ej. python-multipart en FastAPI).
   */
  const takePhoto = async () => {
    if (!camera.current) return;

    try {
      setIsTakingPhoto(true);

      // 1. Capturar la foto con la cámara nativa.
      const photo = await camera.current.takePhoto({
        enableShutterSound: true,
      });

      // 2. Preparar el FormData para el envío multipart.
      const formData = new FormData();
      const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      formData.append('archivo', {
        uri,
        type: 'image/jpeg',
        name: 'photo.jpg',
      } as any);

      // 3. Enviar la petición POST al backend de identificación.
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        body: formData,
        // No establecer 'Content-Type' manualmente; fetch lo genera con el boundary correcto.
      });

      if (!response.ok) {
        // El servidor respondió con un código de error (4xx / 5xx).
        const errorBody = await response.json().catch(() => null);
        const detail = errorBody?.detail ?? `${response.status} ${response.statusText}`;
        throw new Error(detail);
      }

      // 4. Parsear la respuesta JSON con la estructura del backend.
      const result: {
        especie_principal: { etiqueta: string; confianza: number };
        requiere_revision_humana: boolean;
      } = await response.json();

      const confidencePercent = (result.especie_principal.confianza * 100).toFixed(1);
      Alert.alert(
        `Animal identificado: ${result.especie_principal.etiqueta}`,
        `Confianza: ${confidencePercent}%${
          result.requiere_revision_humana ? '\nRequiere revisión humana.' : ''
        }`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      Alert.alert('No se pudo identificar el animal', message);
    } finally {
      setIsTakingPhoto(false);
    }
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Se requieren permisos de cámara para continuar</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Otorgar Permiso</Text>
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

        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.apiTestButton, isTestingApi && styles.apiTestButtonDisabled]}
            onPress={testBackendHealth}
            disabled={isTestingApi}
            accessibilityLabel="Probar conexión al backend"
          >
            <Text style={styles.apiTestButtonText}>
              {isTestingApi ? 'Comprobando…' : 'Probar API'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.overlayTextContainer}>
          <Text style={styles.overlayText}>Toca para enfocar</Text>
        </View>

        {/* Botón flotante para tomar la foto */}
        <View style={styles.captureContainer}>
          <TouchableOpacity
            style={[styles.captureButton, isTakingPhoto && styles.captureButtonDisabled]}
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
  apiTestButtonDisabled: {
    opacity: 0.6,
  },
  apiTestButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
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
  captureContainer: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    alignItems: 'center',
  },
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
  },
  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#ffffff',
  }
});
