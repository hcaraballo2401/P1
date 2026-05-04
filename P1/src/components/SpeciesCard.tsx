import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SpeciesDisplay } from '../utils/inaturalist';

interface SpeciesCardProps {
  item: SpeciesDisplay;
  onPress?: () => void;
}

export default function SpeciesCard({ item, onPress }: SpeciesCardProps) {
  const router = useRouter();

  const handlePressInfo = () => {
    if (onPress) {
      onPress();
      return;
    }
    // Navegación por defecto a detalles
    router.push({
      pathname: '/information',
      params: { taxonId: item.id.toString(), count: item.count.toString() },
    });
  };

  return (
    <TouchableOpacity
      style={styles.cardContainer}
      activeOpacity={0.8}
      onPress={handlePressInfo}
    >
      {item.photoUrl ? (
        <Image
          source={{ uri: item.photoUrl }}
          style={styles.cardImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.cardImage, styles.photoPlaceholder]}>
          <Ionicons name="leaf-outline" size={48} color={COLORS.textMuted} />
        </View>
      )}

      <View style={styles.cardOverlay}>
        <View style={styles.cardInfo}>
          <Text style={styles.commonName} numberOfLines={1}>
            {item.commonName}
          </Text>
          <Text style={styles.scientificName} numberOfLines={1}>
            {item.scientificName}
          </Text>
        </View>

        {/* Botón flotante '+' en la esquina inferior derecha */}
        <View style={styles.addButton}>
          <Ionicons name="add" size={24} color="#fff" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: '46%',
    height: 220,
    margin: 6,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
  },
  cardOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.2)', // Ligero oscurecimiento general
    padding: 12,
  },
  cardInfo: {
    backgroundColor: 'rgba(10, 10, 10, 0.75)',
    padding: 8,
    borderRadius: 12,
    marginBottom: 8,
  },
  commonName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  scientificName: {
    fontSize: 12,
    fontStyle: 'italic',
    color: COLORS.textSecondary,
  },
  addButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.accent,
    borderTopLeftRadius: 20,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
