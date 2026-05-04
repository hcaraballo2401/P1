import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  StatusBar,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import HeaderBuscador from '../components/HeaderBuscador';
import WeatherWidget from '../components/WeatherWidget';
import SpeciesCard from '../components/SpeciesCard';

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
  widthPercent: number | string;
  height: number;
  marginTop: number;
  borderRadius: number;
  shimmerAnim: Animated.Value;
  margin?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonBar({ widthPercent, height, marginTop, borderRadius, margin, shimmerAnim }: SkeletonBarProps) {
  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.7, 0.3],
  });

  return (
    <Animated.View
      style={[
        styles.skeletonBar,
        { width: (typeof widthPercent === 'string' ? widthPercent : `${widthPercent}%`) as any, height, marginTop, borderRadius, margin, opacity },
      ]}
    />
  );
}

const SKELETON_LAYOUT: Omit<SkeletonBarProps, 'shimmerAnim'>[] = [
  { widthPercent: '46%', height: 220, marginTop: 10, margin: 6, borderRadius: 16 },
  { widthPercent: '46%', height: 220, marginTop: 10, margin: 6, borderRadius: 16 },
  { widthPercent: '46%', height: 220, marginTop: 10, margin: 6, borderRadius: 16 },
  { widthPercent: '46%', height: 220, marginTop: 10, margin: 6, borderRadius: 16 },
];

function SkeletonScreen({ shimmerAnim }: { shimmerAnim: Animated.Value }) {
  return (
    <View style={styles.contentArea}>
      <View style={styles.gridContainer}>
        {SKELETON_LAYOUT.map((bar, i) => (
          <SkeletonBar key={i} {...bar} shimmerAnim={shimmerAnim} />
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pantalla Principal (Home)
// ─────────────────────────────────────────────────────────────────────────────

export default function SpeciesListScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [speciesList, setSpeciesList] = useState<SpeciesDisplay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const shimmerAnim = useRef(new Animated.Value(0)).current;

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

  // Tomamos solo las primeras 4 especies para mostrar en el grid del Home
  const topSpecies = filteredList.slice(0, 4);

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

  const renderTopMenu = () => (
    <View style={styles.topMenu}>
      <TouchableOpacity style={[styles.menuTab, styles.menuTabActive]}>
        <Text style={[styles.menuTabText, styles.menuTabTextActive]}>Todo</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.menuTab} onPress={() => router.push('/explore' as any)}>
        <Text style={styles.menuTabText}>Explorar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.menuTab} onPress={() => router.push('/regions' as any)}>
        <Text style={styles.menuTabText}>Regiones</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Render: Cargando ──
  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <HeaderBuscador onSearch={setSearchQuery} />
        {renderTopMenu()}
        <WeatherWidget />
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
        {renderTopMenu()}
        <WeatherWidget />
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

  // ── Render: Home Content ──
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <HeaderBuscador onSearch={setSearchQuery} />
      {renderTopMenu()}

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {!searchQuery && <WeatherWidget />}

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
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Avistamientos</Text>
              <TouchableOpacity onPress={() => router.push('/explore' as any)}>
                <Ionicons name="arrow-forward" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.gridContainer}>
              {topSpecies.map((item) => (
                <SpeciesCard key={item.id} item={item} />
              ))}
            </View>
          </View>
        )}
        
        {/* Espacio extra abajo */}
        <View style={{ height: 40 }} />
      </ScrollView>
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
  topMenu: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 16,
  },
  menuTab: {
    paddingVertical: 8,
  },
  menuTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  menuTabText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  menuTabTextActive: {
    color: COLORS.textPrimary,
  },
  sectionContainer: {
    paddingHorizontal: 10,
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 6,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  
  // ── Centro de estados (error / vacío) ──
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 32,
    marginTop: 40,
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
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  skeletonBar: {
    backgroundColor: COLORS.skeletonHighlight,
  },
});
