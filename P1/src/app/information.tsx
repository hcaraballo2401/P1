import { useEffect, useRef, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Animated,
  Dimensions,
  ScrollView,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  COLORS,
  INAT_PLACE_ID,
  INAT_API_BASE,
  REQUEST_HEADERS,
  SpeciesDisplay,
  mapSpeciesResult,
  fetchWikiDescription,
  SpeciesCountResult,
} from '../utils/inaturalist';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes UI
// ─────────────────────────────────────────────────────────────────────────────

interface SkeletonBarProps {
  widthPercent: number;
  height: number;
  marginTop: number;
  borderRadius: number;
  shimmerAnim: Animated.Value;
}

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
  { widthPercent: 50, height: 14, marginTop: 16, borderRadius: 4 },
  { widthPercent: 70, height: 32, marginTop: 8, borderRadius: 8 },
  { widthPercent: 55, height: 18, marginTop: 8, borderRadius: 4 },
  { widthPercent: 95, height: 200, marginTop: 20, borderRadius: 12 },
  { widthPercent: 80, height: 22, marginTop: 20, borderRadius: 8 },
  { widthPercent: 95, height: 40, marginTop: 12, borderRadius: 8 },
  { widthPercent: 95, height: 40, marginTop: 8, borderRadius: 8 },
  { widthPercent: 95, height: 40, marginTop: 8, borderRadius: 8 },
  { widthPercent: 95, height: 80, marginTop: 16, borderRadius: 10 },
  { widthPercent: 95, height: 120, marginTop: 12, borderRadius: 10 },
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

interface StatusBadgeProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  bgColor: string;
  textColor: string;
  iconColor?: string;
  bold?: boolean;
}

function StatusBadge({ icon, label, bgColor, textColor, iconColor, bold }: StatusBadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Ionicons
        name={icon}
        size={14}
        color={iconColor ?? textColor}
        style={{ marginRight: 6 }}
      />
      <Text
        style={[
          styles.badgeText,
          { color: textColor },
          bold && { fontWeight: '700' },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pantalla de Detalles (information.tsx)
// ─────────────────────────────────────────────────────────────────────────────

export default function SpeciesDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { taxonId, count } = params;

  const [isLoading, setIsLoading] = useState(true);
  const [species, setSpecies] = useState<SpeciesDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const startShimmer = useCallback(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      }),
    ).start();
  }, [shimmerAnim]);

  const fetchSpeciesDetail = useCallback(async () => {
    if (!taxonId) {
      setError('No se proporcionó un ID de especie.');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Usamos el endpoint species_counts filtrado por taxon_id para obtener el conteo en la región
      // o usamos /v2/taxa/${taxonId} si count ya vino por params y solo queremos la especie.
      // Como queremos replicar exactamente la info anterior, lo más seguro es usar taxa/ID.
      
      const res = await fetch(`${INAT_API_BASE}/taxa/${taxonId}?fields=all`, {
        headers: REQUEST_HEADERS,
      });

      if (!res.ok) {
        throw new Error(`Error al obtener detalles: ${res.status}`);
      }

      const json = await res.json();

      if (!json.results || json.results.length === 0) {
        throw new Error('No se encontraron detalles para esta especie.');
      }

      const taxon = json.results[0];
      const parsedCount = count ? parseInt(count as string, 10) : 0;
      
      const speciesDisplay = mapSpeciesResult(taxon, parsedCount);

      // Cargar Wikipedia summary
      const summary = await fetchWikiDescription(speciesDisplay.scientificName);
      if (summary) {
        speciesDisplay.taxonSummary = summary;
      }

      setSpecies(speciesDisplay);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido al cargar datos.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [taxonId, count]);

  useEffect(() => {
    startShimmer();
    fetchSpeciesDetail();
  }, [startShimmer, fetchSpeciesDetail]);

  // ── Render: Cargando ──
  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <SkeletonScreen shimmerAnim={shimmerAnim} />
        </ScrollView>
      </View>
    );
  }

  // ── Render: Error ──
  if (error || !species) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.errorText}>{error ?? 'No se pudo cargar la especie'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchSpeciesDetail}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: Contenido Real ──
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{species.commonName}</Text>
        <View style={{ width: 40 }} /> 
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <Text style={styles.labelTag}>NOMBRES DE LA ESPECIE</Text>
          <Text style={styles.commonName} numberOfLines={2}>
            {species.commonName}
          </Text>
          <Text style={styles.scientificName} numberOfLines={1}>
            {species.scientificName}
          </Text>
        </View>

        <View style={styles.photoSection}>
          {species.photoUrl ? (
            <View style={styles.photoFrame}>
              <Image
                source={{ uri: species.photoUrl }}
                style={styles.speciesPhoto}
                resizeMode="cover"
              />
            </View>
          ) : (
            <View style={[styles.photoFrame, styles.photoPlaceholder]}>
              <Ionicons name="leaf-outline" size={64} color={COLORS.textMuted} />
            </View>
          )}
        </View>

        <View style={styles.badgesSection}>
          <StatusBadge
            icon="location-outline"
            label="Especies en Bolívar, calidad Investigación"
            bgColor={COLORS.primaryMuted}
            textColor={COLORS.primary}
          />

          {species.isInvasive && (
            <StatusBadge
              icon="warning-outline"
              label="INVASORA / INTRODUCIDA"
              bgColor={COLORS.warningMuted}
              textColor={COLORS.warning}
              bold
            />
          )}

          {species.conservationLabel && (
            <StatusBadge
              icon="alert-circle-outline"
              label={`Estado: ${species.conservationLabel}`}
              bgColor={COLORS.dangerMuted}
              textColor={COLORS.danger}
            />
          )}

          {species.isNative && (
            <StatusBadge
              icon="checkmark-circle-outline"
              label="Status 'NATIVA'"
              bgColor={COLORS.successMuted}
              textColor={COLORS.success}
            />
          )}

          {!species.isInvasive && !species.isNative && !species.conservationLabel && (
            <StatusBadge
              icon="information-circle-outline"
              label="Estado de establecimiento no disponible"
              bgColor={COLORS.surfaceAlt}
              textColor={COLORS.textSecondary}
            />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Detalles Adicionales</Text>
          <DetailRow
            label="Observaciones en esta zona:"
            value={species.count.toLocaleString('es-CO')}
          />
          <DetailRow label="Rango:" value={species.rank} />
        </View>

        <View style={styles.card}>
          {species.taxonSummary ? (
            <Text style={styles.taxonSummary}>{species.taxonSummary}</Text>
          ) : (
            <Text style={styles.taxonSummary}>
              Resumen taxonómico no disponible en la API para esta especie.
            </Text>
          )}

          <View style={styles.divider} />

          {species.kingdom && (
            <DetailRow label="Reino:" value={species.kingdom} />
          )}
          {species.rank && (
            <DetailRow label="Rango taxonómico:" value={species.rank} />
          )}
        </View>
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
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16, // Top padding without SafeAreaView, relying on default status bar avoiding 
    paddingBottom: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  navTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },

  // ── Header Section ──
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  labelTag: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  commonName: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 6,
  },
  scientificName: {
    fontSize: 16,
    fontStyle: 'italic',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // ── Photo Section ──
  photoSection: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  photoFrame: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.primary,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceAlt,
  },
  speciesPhoto: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Badges Section ──
  badgesSection: {
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 13,
    flexShrink: 1,
  },

  // ── Cards Section ──
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flexShrink: 1,
    marginRight: 8,
  },
  detailValue: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  taxonSummary: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },

  // ── Center State ──
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
