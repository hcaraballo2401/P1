import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../utils/inaturalist';

export default function RegionsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Header simple para volver */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Regiones (Guayana)</Text>
      </View>

      <View style={styles.content}>
        <Ionicons name="map-outline" size={80} color={COLORS.primary} />
        <Text style={styles.title}>Mapa de Calor</Text>
        <Text style={styles.subtitle}>
          Aquí implementaremos el mapa de iNaturalist filtrado por la zona de Guayana.
        </Text>

        <View style={styles.placeholderMap}>
          <Text style={styles.placeholderText}>[ Próximamente: Mapa de Calor ]</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 20,
    backgroundColor: COLORS.surface,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 24,
  },
  placeholderMap: {
    width: '100%',
    height: 300,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 20,
    marginTop: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  placeholderText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
});
