import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Animated,
  StatusBar,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import HeaderBuscador from '../components/HeaderBuscador';

import {
  COLORS,
  INAT_PLACE_ID,
  INAT_API_BASE,
  REQUEST_HEADERS,
  SpeciesDisplay,
  mapSpeciesResult,
  SpeciesCountResult,
} from '../utils/inaturalist';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos e Interfaces
// ─────────────────────────────────────────────────────────────────────────────

interface SkeletonBarProps {
  widthPercent: number;
  height: number;
  marginTop: number;
  borderRadius: number;
  shimmerAnim: Animated.Value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonBar({ widthPercent, height, marginTop, borderRadius, shimmerAnim }: SkeletonBarProps) {
  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.7, 0.3],
  });

  return (
    <Animated.View
      style={[
        styles.skeletonBar,
        { width: `${widthPercent}%`, height, marginTop, borderRadius, opacity },
      ]}
    />
  );
}

const SKELETON_LAYOUT: Omit<SkeletonBarProps, 'shimmerAnim'>[] = [
  { widthPercent: 95, height: 280, marginTop: 16, borderRadius: 16 },
  { widthPercent: 95, height: 280, marginTop: 16, borderRadius: 16 },
  { widthPercent: 95, height: 280, marginTop: 16, borderRadius: 16 },
];

function SkeletonScreen({ shimmerAnim }: { shimmerAnim: Animated.Value }) {
  return (
    <View style={styles.contentArea}>
      {SKELETON_LAYOUT.map((bar, i) => (
        <SkeletonBar key={i} {...bar} shimmerAnim={shimmerAnim} />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pantalla Principal
// ─────────────────────────────────────────────────────────────────────────────


export default function SpeciesListScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [speciesList, setSpeciesList] = useState<SpeciesDisplay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  /**
   * filteredList — derivado de speciesList filtrado por la consulta del buscador.
   * Busca en: nombre común, nombre científico y reino (todo en minúsculas).
   * useMemo evita recalcular en cada render cuando la query no cambia.
   */
  const filteredList = useMemo<SpeciesDisplay[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return speciesList;
    return speciesList.filter((s) => {
      const inCommon     = s.commonName.toLowerCase().includes(q);
      const inScientific = s.scientificName.toLowerCase().includes(q);
      const inKingdom    = (s.kingdom ?? '').toLowerCase().includes(q);
      return inCommon || inScientific || inKingdom;
    });
  }, [speciesList, searchQuery]);

  const startShimmer = useCallback(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      }),
    ).start();
  }, [shimmerAnim]);

  const fetchSpecies = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        place_id: String(INAT_PLACE_ID),
        quality_grade: 'research',
        per_page: '100',
        order_by: 'count',
        fields: 'all',
      });

      const response = await fetch(
        `${INAT_API_BASE}/observations/species_counts?${params.toString()}`,
        { headers: REQUEST_HEADERS },
      );

      if (!response.ok) {
        throw new Error(`iNaturalist API error: ${response.status}`);
      }

      const json = (await response.json()) as { results: SpeciesCountResult[] };

      if (!json.results || json.results.length === 0) {
        throw new Error('No se encontraron especies para esta zona.');
      }

      const list = json.results.map((item) => mapSpeciesResult(item));
      setSpeciesList(list);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido al cargar datos.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    startShimmer();
    fetchSpecies();
  }, [startShimmer, fetchSpecies]);

  const handlePressInfo = (item: SpeciesDisplay) => {
    // Navigate to information.tsx passing the taxonId
    router.push({
      pathname: '/information',
      params: { taxonId: item.id.toString(), count: item.count.toString() },
    });
  };

  const renderItem = ({ item }: { item: SpeciesDisplay }) => (
    <View style={styles.cardContainer}>
      {item.photoUrl ? (
        <Image
          source={{ uri: item.photoUrl }}
          style={styles.cardImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.cardImage, styles.photoPlaceholder]}>
          <Ionicons name="leaf-outline" size={64} color={COLORS.textMuted} />
        </View>
      )}

      {/* Gradiente o capa oscura sobre la imagen para asegurar legibilidad */}
      <View style={styles.cardOverlay}>
        <View style={styles.cardInfo}>
          <Text style={styles.commonName} numberOfLines={2}>
            {item.commonName}
          </Text>
          <Text style={styles.scientificName} numberOfLines={1}>
            {item.scientificName}
          </Text>
          <View style={styles.kingdomBadge}>
            <Text style={styles.kingdomText}>{item.kingdom ?? 'N/A'}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.infoButton}
          onPress={() => handlePressInfo(item)}
          activeOpacity={0.8}
        >
          <Ionicons name="information-circle" size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
          <Text style={styles.infoButtonText}>Consultar más información</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Render: Cargando ──
  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <HeaderBuscador onSearch={setSearchQuery} />
        <SkeletonScreen shimmerAnim={shimmerAnim} />
      </View>
    );
  }

  // ── Render: Error ──
  if (error || speciesList.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <HeaderBuscador onSearch={setSearchQuery} />
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.errorText}>{error ?? 'Sin datos'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchSpecies}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: Lista ──
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <HeaderBuscador onSearch={setSearchQuery} />

      {/* Feedback cuando la búsqueda no arroja resultados */}
      {filteredList.length === 0 && searchQuery.trim().length > 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="search-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.errorText}>
            Sin resultados para «{searchQuery.trim()}»
          </Text>
          <Text style={styles.errorSubText}>
            Intenta con el nombre común, científico o reino.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          windowSize={5}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  // (header estático eliminado — reemplazado por <HeaderBuscador />)
  listContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 20,
  },
  cardContainer: {
    width: '100%',
    height: 380, // Tarjetas grandes como en la imagen de referencia
    borderRadius: 16,
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Oscurecer toda la imagen un poco
    padding: 16,
  },
  cardInfo: {
    marginBottom: 16,
    backgroundColor: 'rgba(10, 10, 10, 0.75)', // Fondo semitransparente para el texto
    padding: 12,
    borderRadius: 12,
  },
  commonName: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  scientificName: {
    fontSize: 16,
    fontStyle: 'italic',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  kingdomBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  kingdomText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    textTransform: 'uppercase',
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 20, 20, 0.9)',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  infoButtonText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Centro de estados (error / vacío) ──
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 32,
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorSubText: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  retryText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Skeleton ──
  contentArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skeletonBar: {
    backgroundColor: COLORS.skeletonHighlight,
    alignSelf: 'center',
  },
});
