/**
 * HeaderBuscador.tsx
 *
 * Componente de cabecera dinámico para BioLife.
 * Alterna entre:
 *  - Estado "Header" → logo + iconos de búsqueda y menú.
 *  - Estado "Buscador" → TextInput con lupa, botón de micrófono y botón de cierre.
 *
 * Reconocimiento de voz: expo-speech-recognition (reemplazo oficial de @react-native-voice/voice)
 *
 * Permisos requeridos:
 *  - Android → RECORD_AUDIO (declarado en app.json)
 *  - iOS     → NSMicrophoneUsageDescription + NSSpeechRecognitionUsageDescription
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

// ─────────────────────────────────────────────────────────────────────────────
// Paleta de colores (verde BioLife)
// ─────────────────────────────────────────────────────────────────────────────

const GREEN = {
  /** Fondo del header */
  surface: '#E8F5E9',
  /** Color principal de iconos y texto */
  dark: '#1B5E20',
  /** Borde sutil inferior del header */
  border: '#C8E6C9',
  /** Fondo del input de búsqueda */
  inputBg: '#FFFFFF',
  /** Borde del input */
  inputBorder: '#A5D6A7',
  /** Fondo del botón de micrófono */
  micBg: '#2E7D32',
  /** Color del micrófono activo (grabando) */
  micActive: '#E53935',
  /** Placeholder del TextInput */
  placeholder: '#81C784',
};

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces / Props
// ─────────────────────────────────────────────────────────────────────────────

interface HeaderBuscadorProps {
  /** Callback que recibe el texto cada vez que cambia (para filtrar listas, etc.) */
  onSearch: (query: string) => void;
  /** Callback opcional al abrir el menú hamburguesa */
  onMenuPress?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HeaderBuscador
 *
 * Renderiza la cabecera de la app BioLife con transición animada entre el
 * modo "header estándar" y el modo "barra de búsqueda rápida".
 */
export default function HeaderBuscador({ onSearch, onMenuPress }: HeaderBuscadorProps): React.JSX.Element {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  /** Valor animado para la transición header ↔ buscador (0 = header, 1 = buscador) */
  const anim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Errores del motor de voz que son informativos, no críticos.
   * Se ignoran para no molestar al usuario con avisos innecesarios.
   * "no-speech" ocurre cuando el motor se activa pero no detecta voz audible.
   */
  const IGNORED_VOICE_ERRORS = ['no-speech', 'aborted', 'network'];

  /** Limpia el banner de error y su temporizador asociado */
  const dismissError = useCallback(() => {
    setVoiceError(null);
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
  }, []);

  /** Auto-cerrar el banner de error después de 3 segundos */
  useEffect(() => {
    if (voiceError) {
      errorTimerRef.current = setTimeout(dismissError, 3000);
    }
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, [voiceError, dismissError]);

  // ── Listeners de voz (expo-speech-recognition) ──────────────────────────────

  /**
   * Se dispara al recibir resultados parciales o finales del reconocimiento.
   * Actualiza el TextInput y notifica al padre vía onSearch.
   */
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    if (transcript) {
      setSearchText(transcript);
      onSearch(transcript);
    }
  });

  /**
   * Se dispara cuando el reconocimiento finaliza (el usuario dejó de hablar).
   */
  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  /**
   * Failsafe: captura errores del motor de voz sin romper la UI.
   * Filtra errores benignos (no-speech, aborted) y solo muestra los relevantes.
   */
  useSpeechRecognitionEvent('error', (event) => {
    const errorCode = event.error ?? '';
    setIsListening(false);

    // Ignorar errores no-críticos que son parte del flujo normal
    if (IGNORED_VOICE_ERRORS.includes(errorCode)) {
      return;
    }

    setVoiceError(errorCode || 'Error de reconocimiento de voz');
  });

  // ── Animación de transición ─────────────────────────────────────────────────

  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
    Animated.timing(anim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => inputRef.current?.focus());
  }, [anim]);

  const closeSearch = useCallback(() => {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
    }
    setIsListening(false);
    setSearchText('');
    setVoiceError(null);
    onSearch('');

    Animated.timing(anim, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(() => setIsSearchOpen(false));
  }, [anim, isListening, onSearch]);

  // ── Lógica de voz ───────────────────────────────────────────────────────────

  /**
   * Inicia o detiene el reconocimiento de voz en español (es-ES).
   * Solicita permisos automáticamente la primera vez.
   */
  const handleVoiceStart = useCallback(async () => {
    try {
      if (isListening) {
        ExpoSpeechRecognitionModule.stop();
        setIsListening(false);
        return;
      }

      // Solicitar permisos de micrófono y reconocimiento de voz
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        setVoiceError('Permiso de micrófono denegado. Actívalo en Configuración.');
        return;
      }

      setVoiceError(null);
      setIsListening(true);

      ExpoSpeechRecognitionModule.start({
        lang: 'es-ES',
        interimResults: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al iniciar el micrófono';
      setVoiceError(message);
      setIsListening(false);
    }
  }, [isListening]);

  // ── Handlers del TextInput ─────────────────────────────────────────────────

  const handleTextChange = useCallback((text: string) => {
    setSearchText(text);
    onSearch(text);
  }, [onSearch]);

  // ── Interpolaciones de animación ────────────────────────────────────────────

  const headerOpacity = anim.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0] });
  const searchOpacity = anim.interpolate({ inputRange: [0.4, 1], outputRange: [0, 1] });
  const headerTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const searchTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.wrapper}>

      {/* ── Estado inicial: Header estándar ── */}
      <Animated.View
        pointerEvents={isSearchOpen ? 'none' : 'auto'}
        style={[
          styles.header,
          {
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslate }],
          },
        ]}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoIconWrapper}>
            <Ionicons name="leaf" size={20} color={GREEN.dark} />
          </View>
          <Text style={styles.logoText}>BioLife</Text>
        </View>

        {/* Iconos de acción */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={openSearch}
            accessibilityLabel="Abrir búsqueda"
            accessibilityRole="button"
          >
            <Ionicons name="search" size={22} color={GREEN.dark} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, styles.menuButton]}
            onPress={onMenuPress}
            accessibilityLabel="Abrir menú"
            accessibilityRole="button"
          >
            <Ionicons name="menu" size={24} color={GREEN.dark} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── Estado activo: Barra de búsqueda ── */}
      <Animated.View
        pointerEvents={isSearchOpen ? 'auto' : 'none'}
        style={[
          styles.searchBar,
          {
            opacity: searchOpacity,
            transform: [{ translateY: searchTranslate }],
          },
        ]}
      >
        {/* Botón cerrar (X) */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={closeSearch}
          accessibilityLabel="Cerrar buscador"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={22} color={GREEN.dark} />
        </TouchableOpacity>

        {/* Input con lupa interna */}
        <View style={styles.inputWrapper}>
          <Ionicons
            name="search"
            size={18}
            color={GREEN.placeholder}
            style={styles.inputIcon}
          />
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={searchText}
            onChangeText={handleTextChange}
            placeholder="Buscar"
            placeholderTextColor={GREEN.placeholder}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Campo de búsqueda"
          />
        </View>

        {/* Botón de micrófono circular */}
        <TouchableOpacity
          style={[styles.micButton, isListening && styles.micButtonActive]}
          onPress={handleVoiceStart}
          accessibilityLabel={isListening ? 'Detener grabación de voz' : 'Iniciar búsqueda por voz'}
          accessibilityRole="button"
        >
          <Ionicons
            name={isListening ? 'radio-button-on' : 'mic'}
            size={20}
            color="#FFFFFF"
          />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Indicador de error de voz (tappable para cerrar, auto-cierre en 3s) ── */}
      {voiceError !== null && isSearchOpen && (
        <TouchableOpacity
          style={styles.voiceErrorBanner}
          onPress={dismissError}
          activeOpacity={0.7}
          accessibilityLabel="Cerrar aviso de error"
        >
          <Ionicons name="warning-outline" size={14} color={GREEN.dark} />
          <Text style={styles.voiceErrorText} numberOfLines={2}>
            {voiceError}
          </Text>
          <Ionicons name="close-circle" size={16} color="#5D4037" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: GREEN.surface,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 54,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: GREEN.border,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
    minHeight: Platform.OS === 'android' ? 96 : 110,
  },

  // ── Header estándar ──────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoIconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#C8E6C9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '800',
    color: GREEN.dark,
    letterSpacing: 0.5,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  menuButton: {
    marginLeft: 2,
  },

  // ── Barra de búsqueda ────────────────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 10,
  },
  closeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GREEN.inputBg,
    borderWidth: 1.5,
    borderColor: GREEN.inputBorder,
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 44,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: GREEN.dark,
    paddingVertical: 0,
    fontWeight: '500',
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GREEN.micBg,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  micButtonActive: {
    backgroundColor: GREEN.micActive,
  },

  // ── Banner de error de voz ───────────────────────────────────────────────────
  voiceErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFFDE7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDD835',
    marginHorizontal: 4,
  },
  voiceErrorText: {
    flex: 1,
    fontSize: 11,
    color: '#5D4037',
    lineHeight: 16,
  },
});
