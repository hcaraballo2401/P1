/**
 * HeaderBuscador.tsx
 *
 * Componente de cabecera dinámico para BioLife.
 * Alterna entre:
 *  - Estado "Header" → logo + iconos de búsqueda y menú.
 *  - Estado "Buscador" → TextInput con lupa y botón de cierre.
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
import { useRouter } from 'expo-router';

// ─────────────────────────────────────────────────────────────────────────────
// Paleta de colores (verde BioLife)
// ─────────────────────────────────────────────────────────────────────────────

import { COLORS } from '../utils/inaturalist';

const GREEN = {
  surface: COLORS.background,
  dark: COLORS.accent,
  border: COLORS.border,
  inputBg: COLORS.surface,
  inputBorder: COLORS.primary,
  micBg: COLORS.accent,
  micActive: COLORS.danger,
  placeholder: COLORS.textMuted,
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
  const router = useRouter();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

  /** Valor animado para la transición header ↔ buscador (0 = header, 1 = buscador) */
  const anim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

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
    setSearchText('');
    onSearch('');

    Animated.timing(anim, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(() => setIsSearchOpen(false));
  }, [anim, onSearch]);

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
            onPress={() => router.push('/search' as any)}
            accessibilityLabel="Escanear especie"
            accessibilityRole="button"
          >
            <Ionicons name="camera" size={24} color={GREEN.dark} />
          </TouchableOpacity>

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
      </Animated.View>
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
