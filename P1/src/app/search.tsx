import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Audio } from 'expo-av';

// ─── Constantes de configuración ─────────────────────────────────────────────

/**
 * Backend de identificación (FastAPI).
 * - Emulador Android:                     http://10.0.2.2:8000
 * - Teléfono por USB (adb reverse):        http://127.0.0.1:8000
 * - Teléfono por WiFi (misma red que PC):  http://<IP_LAN_PC>:8000
 */
const API_BASE_URL = 'http://192.168.1.7:8000';
const BACKEND_URL = `${API_BASE_URL}/api/v1/identificacion/identificar`;
const TRANSCRIPCION_URL = `${API_BASE_URL}/api/v1/identificacion/transcribir`;
const HEALTH_URL = `${API_BASE_URL}/health`;

/** Duración mínima de grabación en milisegundos (3 segundos). */
const AUDIO_MIN_DURATION_MS = 3_000;

/** Duración máxima de grabación en milisegundos (5 segundos). */
const AUDIO_MAX_DURATION_MS = 5_000;

/**
 * Configuración de grabación optimizada para Whisper large-v3.
 *
 * ¿Por qué estos parámetros?
 *   - sampleRate: 16 000 Hz — Whisper fue entrenado a 16 kHz; frecuencias
 *     superiores solo aumentan el tamaño del archivo sin mejorar la transcripción.
 *   - numberOfChannels: 1 (mono) — Whisper no usa información estéreo y
 *     mono reduce el tamaño del archivo a la mitad.
 *   - bitRate: 256 000 — Suficiente para audio de habla sin artefactos;
 *     más alto no mejora el ASR en audios cortos.
 *   - ios OutputFormat: LINEARPCM — Produce WAV PCM sin compresión, el
 *     formato nativo que Whisper prefiere.
 *   - android OutputFormat: DEFAULT — Expo-av genera WAV en Android cuando
 *     el OutputFormat es DEFAULT junto con AudioEncoder.DEFAULT.
 */
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16_000,
    numberOfChannels: 1,
    bitRate: 128_000,
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16_000,
    numberOfChannels: 1,
    bitRate: 256_000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/wav',
    bitsPerSecond: 256_000,
  },
};

// ─── Interfaces TypeScript ─────────────────────────────────────────────────────

interface IdentificacionResponse {
  especie_principal: { etiqueta: string; confianza: number };
  requiere_revision_humana: boolean;
}

interface TranscripcionResponse {
  texto: string;
  requiere_revision_humana: boolean;
  modelo_usado: string;
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

  // ── Micrófono ──
  const [hasMicPermission, setHasMicPermission] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isSendingAudio, setIsSendingAudio] = useState<boolean>(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── API Health ──
  const [isTestingApi, setIsTestingApi] = useState<boolean>(false);

  // ── Animación del botón de micrófono (pulso durante grabación) ──
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ─── Efectos ──────────────────────────────────────────────────────────────

  useEffect(() => {
    // Ya no solicitamos permiso automáticamente en el montaje para evitar colisión con el de audio.
    // useCameraPermission() ya expone el estado inicial en hasCameraPermission.
  }, []);

  useEffect(() => {
    (async () => {
      // Solo comprobamos el permiso al montar, no lo solicitamos aún para evitar doble popup.
      const { granted } = await Audio.getPermissionsAsync();
      setHasMicPermission(granted);
      if (granted) {
        // Configurar el modo de audio: grabación activa, sin duck de otros audios.
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }
    })();
  }, []);

  // Animación de pulso mientras graba
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  // ─── Limpieza de timers al desmontar ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
    };
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
        `${msg}\n\nAsegúrate: uvicorn en 0.0.0.0:8000, adb reverse tcp:8000 tcp:8000.`,
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

  // ─── Audio: grabar y transcribir ──────────────────────────────────────────

  /**
   * Detiene la grabación activa, envía el WAV al backend y muestra el resultado.
   * También se llama automáticamente al alcanzar AUDIO_MAX_DURATION_MS (5s).
   *
   * @param recording - Instancia de Audio.Recording activa.
   * @param duration  - Duración real grabada en milisegundos.
   */
  const stopAndSendAudio = useCallback(
    async (recording: Audio.Recording, duration: number): Promise<void> => {
      // Limpiar timers antes de cualquier await para evitar doble ejecución
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }

      recordingRef.current = null;
      setIsRecording(false);
      setRecordingSeconds(0);

      // Guard: rechazar si la duración es menor a 3 segundos
      if (duration < AUDIO_MIN_DURATION_MS) {
        await recording.stopAndUnloadAsync();
        Alert.alert(
          'Audio muy corto',
          `Graba al menos ${AUDIO_MIN_DURATION_MS / 1000} segundos.\nDuración grabada: ${(duration / 1000).toFixed(1)}s`,
        );
        return;
      }

      try {
        setIsSendingAudio(true);

        // Detener y obtener la URI del archivo WAV
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();

        if (!uri) {
          throw new Error('No se pudo obtener la ruta del archivo de audio grabado.');
        }

        // Preparar multipart/form-data con el archivo de audio
        const extension = uri.split('.').pop() || 'wav';
        const mimetype = extension === 'm4a' ? 'audio/mp4' : 'audio/wav';

        const formData = new FormData();
        formData.append('archivo', {
          uri,
          type: mimetype,
          name: `grabacion.${extension}`,
        } as unknown as Blob);

        const response = await fetch(TRANSCRIPCION_URL, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const detail = errorBody?.detail ?? `HTTP ${response.status} ${response.statusText}`;
          throw new Error(detail);
        }

        const result: TranscripcionResponse = await response.json();

        if (result.requiere_revision_humana || !result.texto) {
          Alert.alert(
            '🔍 Requiere Revisión',
            'No se pudo transcribir el audio con claridad. Por favor, intenta de nuevo en un ambiente más silencioso.',
          );
        } else {
          Alert.alert(
            '🎙 Transcripción',
            result.texto,
            [{ text: 'OK', style: 'default' }],
          );
        }
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        Alert.alert('Error de transcripción', message);
      } finally {
        setIsSendingAudio(false);
      }
    },
    [],
  );

  /**
   * Inicia la grabación de audio con los parámetros óptimos para Whisper.
   * El auto-stop a los 5 segundos garantiza que el backend siempre reciba
   * audio dentro del rango permitido.
   */
  const startRecording = async (): Promise<void> => {
    if (!hasMicPermission) {
      const { granted } = await Audio.requestPermissionsAsync();
      setHasMicPermission(granted);
      if (!granted) {
        Alert.alert(
          'Permiso de micrófono',
          'Se necesita acceso al micrófono para grabar audio. Actívalo en Configuración.',
        );
        return;
      }
    }

    if (isRecording) return;

    try {
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      await recording.startAsync();

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingSeconds(0);

      const startTime = Date.now();

      // Contador visual: actualiza cada segundo
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 1_000);

      // Auto-stop a los 5 segundos máximos
      autoStopTimerRef.current = setTimeout(() => {
        const duration = Date.now() - startTime;
        void stopAndSendAudio(recording, duration);
      }, AUDIO_MAX_DURATION_MS);
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      Alert.alert('Error al iniciar grabación', message);
      setIsRecording(false);
    }
  };

  /**
   * Detiene manualmente la grabación cuando el usuario suelta el botón.
   * Si la duración es < 3s, stopAndSendAudio mostrará el Alert de duración mínima.
   */
  const stopRecording = async (): Promise<void> => {
    const recording = recordingRef.current;
    if (!recording || !isRecording) return;

    // Calcular duración antes de limpiar el estado
    const status = await recording.getStatusAsync();
    const duration = status.durationMillis ?? 0;

    await stopAndSendAudio(recording, duration);
  };

  // ─── Guards de pantalla ───────────────────────────────────────────────────

  if (!hasCameraPermission || !hasMicPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Se requieren permisos para continuar:</Text>
        <Text style={[styles.text, { fontSize: 14, marginBottom: 24 }]}>
          Cámara: {hasCameraPermission ? '✅ Concedido' : '❌ Pendiente'}
          {'\n'}
          Micrófono: {hasMicPermission ? '✅ Concedido' : '❌ Pendiente'}
        </Text>
        <TouchableOpacity style={styles.button} onPress={async () => {
          let camStatus = hasCameraPermission;
          if (!camStatus) {
            camStatus = await requestCameraPermission();
          }
          
          let micStatus = hasMicPermission;
          if (!micStatus) {
            const response = await Audio.requestPermissionsAsync();
            micStatus = response.granted;
            setHasMicPermission(micStatus);
          }

          if (!camStatus || !micStatus) {
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

  const isAnyActionInProgress = isTakingPhoto || isRecording || isSendingAudio;

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

        {/* ── Indicador de grabación ── */}
        {isRecording && (
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingBadgeText}>
              {recordingSeconds}s / {AUDIO_MAX_DURATION_MS / 1000}s
            </Text>
          </View>
        )}

        {/* ── Barra de botones de captura ── */}
        <View style={styles.captureContainer}>

          {/* Botón de micrófono */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[
                styles.micButton,
                isRecording && styles.micButtonRecording,
                isSendingAudio && styles.buttonDisabled,
                isTakingPhoto && styles.buttonDisabled,
              ]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
              disabled={isTakingPhoto || isSendingAudio}
              accessibilityLabel={
                isRecording ? 'Detener grabación de audio' : 'Grabar audio para transcripción'
              }
            >
              {isSendingAudio ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.micIcon}>{isRecording ? '⏹' : '🎙'}</Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Botón de cámara */}
          <TouchableOpacity
            style={[
              styles.captureButton,
              (isAnyActionInProgress) && styles.captureButtonDisabled,
            ]}
            onPress={takePhoto}
            disabled={isAnyActionInProgress}
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

  // ── Recording badge ──
  recordingBadge: {
    position: 'absolute',
    top: 155,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.85)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  recordingBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Capture bar (cámara + micrófono) ──
  captureContainer: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },

  // ── Botón de micrófono ──
  micButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonRecording: {
    backgroundColor: 'rgba(220, 38, 38, 0.85)',
    borderColor: '#ff6b6b',
  },
  micIcon: {
    fontSize: 24,
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
