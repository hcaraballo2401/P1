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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes y configuración
// ─────────────────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * place_id: 12748 = Departamento de Bolívar, Colombia en iNaturalist.
 * Verificado via /v1/places/autocomplete?q=Bolivar (admin_level=10, display='Bolívar, CO')
 */
const INAT_PLACE_ID = 12748;
const INAT_API_BASE = 'https://api.inaturalist.org/v2';

/**
 * User-Agent obligatorio según el protocolo de iNaturalist.
 * Identifica el proyecto y un correo de contacto.
 */
const REQUEST_HEADERS = {
  'User-Agent': 'BioLife-App/1.0 (contact@biolife.dev)',
  Accept: 'application/json',
};

/** Paleta de colores del sistema de diseño BioLife */
const COLORS = {
  background: '#0A0A0A',
  surface: '#141414',
  surfaceAlt: '#1C1C1C',
  border: '#2A2A2A',
  primary: '#C8A42E',
  primaryMuted: 'rgba(200,164,46,0.15)',
  danger: '#E05252',
  dangerMuted: 'rgba(224,82,82,0.15)',
  warning: '#D4883A',
  warningMuted: 'rgba(212,136,58,0.15)',
  success: '#4CAF6E',
  successMuted: 'rgba(76,175,110,0.15)',
  textPrimary: '#F0EAD6',
  textSecondary: '#9A8F78',
  textMuted: '#5A5040',
  skeletonBase: '#1A1A1A',
  skeletonHighlight: '#2A2A2A',
};

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de datos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape mínimo que necesitamos del endpoint species_counts de iNaturalist v2.
 * Campos opcionales porque no todas las especies tienen todos los datos.
 */
interface ConservationStatus {
  status: string;       // 'CR', 'EN', 'VU', 'NT', 'LC', etc.
  status_name?: string; // Nombre legible si viene en la respuesta
}

interface TaxonResult {
  id: number;
  name: string;                        // Nombre científico
  preferred_common_name?: string;      // Nombre común
  rank: string;                        // 'species', 'genus', etc.
  iconic_taxon_name?: string;          // 'Animalia', 'Plantae', etc.
  default_photo?: { medium_url: string };
  conservation_status?: ConservationStatus;
  establishment_means?: any;           // Puede ser string u objeto en iNaturalist v2

  // Campos taxonómicos de clasificación
  ancestry?: string;
  ancestor_ids?: number[];

  // Resumen descriptivo (no siempre presente)
  wikipedia_summary?: string;

  // Taxonomía expandida (puede venir si se piden campos extra)
  order?: string;
  family?: string;
  kingdom?: string;
}

interface SpeciesCountResult {
  count: number;
  taxon: TaxonResult;
}

interface SpeciesDisplay {
  id: number;
  commonName: string;
  scientificName: string;
  rank: string;
  count: number;
  photoUrl?: string;
  isInvasive: boolean;
  conservationStatus?: string;
  conservationLabel?: string;
  isNative: boolean;
  order?: string;
  family?: string;
  kingdom?: string;
  taxonSummary?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mapea los códigos UICN a etiquetas en español.
 * Ref: https://www.iucnredlist.org/resources/categories-and-criteria
 */
function getConservationLabel(code: string): string {
  const map: Record<string, string> = {
    CR: 'En Peligro Crítico (CR)',
    EN: 'En Peligro (EN)',
    VU: 'Vulnerable (VU)',
    NT: 'Casi Amenazada (NT)',
    LC: 'Preocupación Menor (LC)',
    DD: 'Datos Insuficientes (DD)',
    EX: 'Extinta (EX)',
    EW: 'Extinta en Vida Silvestre (EW)',
  };
  return map[code.toUpperCase()] ?? code;
}

/**
 * Transforma el resultado raw de la API al modelo que usa la UI.
 * Centraliza la lógica de transformación para facilitar mantenimiento.
 */
function mapSpeciesResult(result: SpeciesCountResult): SpeciesDisplay {
  const { count, taxon } = result;
  // iNaturalist v2: establishment_means puede ser un string o un objeto con prop 'establishment_means'
  let establishment = '';
  if (typeof taxon.establishment_means === 'string') {
    establishment = taxon.establishment_means.toLowerCase();
  } else if (taxon.establishment_means && typeof taxon.establishment_means.establishment_means === 'string') {
    establishment = taxon.establishment_means.establishment_means.toLowerCase();
  }

  const conservCode = taxon.conservation_status?.status?.toUpperCase();

  return {
    id: taxon.id,
    commonName:
      taxon.preferred_common_name ?? taxon.name,
    scientificName: taxon.name,
    rank: taxon.rank,
    count,
    photoUrl: taxon.default_photo?.medium_url,
    isInvasive: establishment === 'introduced',
    conservationStatus: conservCode,
    conservationLabel: conservCode
      ? getConservationLabel(conservCode)
      : undefined,
    isNative: establishment === 'native',
    kingdom: taxon.iconic_taxon_name ?? taxon.kingdom,
    taxonSummary: taxon.wikipedia_summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes de la UI
// ─────────────────────────────────────────────────────────────────────────────

/** Props para SkeletonBar */
interface SkeletonBarProps {
  widthPercent: number;
  height: number;
  marginTop: number;
  borderRadius: number;
  shimmerAnim: Animated.Value;
}

/**
 * Barra individual con efecto shimmer (pulso de opacidad).
 * Usa useNativeDriver para no bloquear el JS thread.
 */
function SkeletonBar({
  widthPercent,
  height,
  marginTop,
  borderRadius,
  shimmerAnim,
}: SkeletonBarProps) {
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

/** Skeleton completo de la pantalla */
function SkeletonScreen({ shimmerAnim }: { shimmerAnim: Animated.Value }) {
  return (
    <View style={styles.contentArea}>
      {SKELETON_LAYOUT.map((bar, i) => (
        <SkeletonBar key={i} {...bar} shimmerAnim={shimmerAnim} />
      ))}
    </View>
  );
}

// ─────────────────── Badge de estado ───────────────────

interface StatusBadgeProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  bgColor: string;
  textColor: string;
  iconColor?: string;
  bold?: boolean;
}

function StatusBadge({
  icon,
  label,
  bgColor,
  textColor,
  iconColor,
  bold,
}: StatusBadgeProps) {
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

// ─────────────────── Tarjeta de detalles ───────────────────

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
// Pantalla principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DailyArtScreen — Pantalla principal de BioLife.
 *
 * Flujo:
 * 1. Carga la primera especie de Bolívar con calidad 'research' desde iNaturalist v2.
 * 2. Mientras carga, muestra skeleton con efecto shimmer.
 * 3. Al completarse, renderiza el layout de la especie organizado por secciones.
 *
 * Rate limiting: Respeta máximo 1 solicitud/segundo de iNaturalist.
 * Caché: Los datos se almacenan en estado para evitar re-fetching innecesario.
 */
export default function DailyArtScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [species, setSpecies] = useState<SpeciesDisplay | null>(null);
  const [otherSpecies, setOtherSpecies] = useState<SpeciesDisplay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  /** Inicia animación shimmer en loop */
  const startShimmer = useCallback(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      }),
    ).start();
  }, [shimmerAnim]);

  /** Obtiene resumen de Wikipedia para la especie dada */
  const fetchWikiDescription = async (scientificName: string) => {
    try {
      const wikiUrl = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        scientificName
      )}`;
      const wikiRes = await fetch(wikiUrl);
      if (wikiRes.ok) {
        const wikiJson = await wikiRes.json();
        return wikiJson.extract as string;
      }
    } catch (e) {
      console.warn('Wikipedia fetch failed:', e);
    }
    return null;
  };

  /** Acción al seleccionar una especie del carrusel */
  const handleSelectSpecies = async (selected: SpeciesDisplay) => {
    // 1. Scroll al inicio para ver los nuevos datos
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });

    // 2. Establecer especie como principal (datos iNat ya cargados)
    setSpecies(selected);

    // 3. Cargar descripción de Wikipedia si no la tiene
    if (!selected.taxonSummary) {
      const summary = await fetchWikiDescription(selected.scientificName);
      if (summary) {
        setSpecies((prev) => (prev ? { ...prev, taxonSummary: summary } : prev));
      }
    }
  };

  /**
   * Obtiene la primera especie de investigación de Bolívar.
   *
   * Endpoint: GET /v2/observations/species_counts
   * Params:
   *   - place_id: 8852 (Bolívar, Colombia)
   *   - quality_grade: research (solo observaciones verificadas)
   *   - per_page: 1 (una especie para la pantalla principal)
   *   - fields: campos mínimos necesarios para la UI
   */
  const fetchSpecies = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        place_id: String(INAT_PLACE_ID),
        quality_grade: 'research',
        per_page: '100', // Obtenemos un set amplio para garantizar variedad de reinos (Aves, Plantas, Insectos, etc.)
        order_by: 'count',
        /**
         * iNaturalist v2: el selector de campos con notación de punto (taxon.name)
         * devuelve 422. El único valor válido para obtener el objeto taxon completo
         * es 'all'. Verificado contra la API el 2026-04-21.
         */
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

      // Paso 1: Procesar la especie principal (Daily Art)
      const mainTaxon = json.results[0];
      const initialSpecies = mapSpeciesResult(mainTaxon);

      // Paso 2: Seleccionar 5 especies adicionales de reinos/grupos distintos
      const additional: SpeciesDisplay[] = [];
      const seenGroups = new Set([initialSpecies.kingdom]);

      for (let i = 1; i < json.results.length; i++) {
        const item = json.results[i];
        const mapped = mapSpeciesResult(item);
        if (mapped.kingdom && !seenGroups.has(mapped.kingdom)) {
          additional.push(mapped);
          seenGroups.add(mapped.kingdom);
        }
        if (additional.length === 5) break;
      }

      // Si no hay suficiente variedad, rellenamos con las siguientes más comunes
      if (additional.length < 5) {
        for (let i = 1; i < json.results.length; i++) {
          const item = json.results[i];
          const mapped = mapSpeciesResult(item);
          const alreadyIn = additional.some((s) => s.id === mapped.id);
          if (!alreadyIn) {
            additional.push(mapped);
          }
          if (additional.length === 5) break;
        }
      }

      setOtherSpecies(additional);

      // Paso 3: Consulta en Cascada (Wikipedia para resumen en español de la principal)
      const summary = await fetchWikiDescription(initialSpecies.scientificName);
      if (summary) {
        initialSpecies.taxonSummary = summary;
      }

      setSpecies(initialSpecies);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido al cargar datos.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    startShimmer();
    fetchSpecies();
  }, [startShimmer, fetchSpecies]);

  // ── Render: Cargando ──
  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
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

  // ── Render: Contenido real ──
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Sección 1: Encabezado de nombre ── */}
        <View style={styles.headerSection}>
          <Text style={styles.labelTag}>NOMBRES DE LA ESPECIE</Text>
          <Text style={styles.commonName} numberOfLines={2}>
            {species.commonName}
          </Text>
          <Text style={styles.scientificName} numberOfLines={1}>
            {species.scientificName}
          </Text>
        </View>

        {/* ── Sección 2: Fotografía de la especie ── */}
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

        {/* ── Sección 3: Badges de estado ── */}
        <View style={styles.badgesSection}>
          {/* Contexto de la búsqueda */}
          <StatusBadge
            icon="location-outline"
            label="Especies en Bolívar, calidad Investigación"
            bgColor={COLORS.primaryMuted}
            textColor={COLORS.primary}
          />

          {/* Alerta: Invasora */}
          {species.isInvasive && (
            <StatusBadge
              icon="warning-outline"
              label="INVASORA / INTRODUCIDA"
              bgColor={COLORS.warningMuted}
              textColor={COLORS.warning}
              bold
            />
          )}

          {/* Estado de amenaza UICN */}
          {species.conservationLabel && (
            <StatusBadge
              icon="alert-circle-outline"
              label={`Estado: ${species.conservationLabel}`}
              bgColor={COLORS.dangerMuted}
              textColor={COLORS.danger}
            />
          )}

          {/* Nativa */}
          {species.isNative && (
            <StatusBadge
              icon="checkmark-circle-outline"
              label="Status 'NATIVA'"
              bgColor={COLORS.successMuted}
              textColor={COLORS.success}
            />
          )}

          {/* Ni invasora ni marcada → estado genérico */}
          {!species.isInvasive && !species.isNative && !species.conservationLabel && (
            <StatusBadge
              icon="information-circle-outline"
              label="Estado de establecimiento no disponible"
              bgColor={COLORS.surfaceAlt}
              textColor={COLORS.textSecondary}
            />
          )}
        </View>

        {/* ── Sección 4: Detalles adicionales ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Detalles Adicionales</Text>
          <DetailRow
            label="Observaciones en esta zona:"
            value={species.count.toLocaleString('es-CO')}
          />
          <DetailRow label="Rango:" value={species.rank} />
        </View>

        {/* ── Sección 5: Resumen taxonómico ── */}
        <View style={styles.card}>
          {species.taxonSummary && (
            <Text style={styles.taxonSummary} numberOfLines={4}>
              {species.taxonSummary}
            </Text>
          )}
          {!species.taxonSummary && (
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

        {/* ── Sección 6: Carrusel de especies adicionales ── */}
        <View style={styles.carouselSection}>
          <View style={styles.carouselHeader}>
            <Text style={styles.carouselTitle}>Explora más especies</Text>
            <View style={styles.carouselSubtitleContainer}>
              <Ionicons name="shuffle-outline" size={12} color={COLORS.primary} />
              <Text style={styles.carouselSubtitle}>GRUPOS VARIADOS DE BOLÍVAR</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
          >
            {otherSpecies.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.smallCard,
                  species.id === item.id && styles.smallCardSelected,
                ]}
                onPress={() => handleSelectSpecies(item)}
              >
                <View style={styles.smallPhotoFrame}>
                  {item.photoUrl ? (
                    <Image source={{ uri: item.photoUrl }} style={styles.smallPhoto} />
                  ) : (
                    <Ionicons name="leaf" size={24} color={COLORS.textMuted} />
                  )}
                </View>
                <View style={styles.smallCardInfo}>
                  <Text style={styles.smallCardName} numberOfLines={1}>
                    {item.commonName}
                  </Text>
                  <View style={styles.kingdomBadge}>
                    <Text style={styles.kingdomText}>{item.kingdom ?? 'N/A'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
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

  // ── Sección 1: Encabezado ──
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

  // ── Sección 2: Fotografía ──
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

  // ── Sección 3: Badges ──
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

  // ── Sección 4 y 5: Tarjetas ──
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

  // ── Skeleton ──
  contentArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skeletonBar: {
    backgroundColor: COLORS.skeletonHighlight,
    alignSelf: 'center',
  },

  // ── Carrusel ──
  carouselSection: {
    marginTop: 24,
    paddingBottom: 20,
  },
  carouselHeader: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  carouselTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  carouselSubtitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  carouselSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.primary,
    letterSpacing: 1,
  },
  carouselContent: {
    paddingLeft: 20,
    paddingRight: 10,
    gap: 12,
  },
  smallCard: {
    width: 140,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    alignItems: 'center',
  },
  smallCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 2,
  },
  smallPhotoFrame: {
    width: 120,
    height: 90,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceAlt,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  smallPhoto: {
    width: '100%',
    height: '100%',
  },
  smallCardInfo: {
    width: '100%',
    alignItems: 'flex-start',
  },
  smallCardName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  kingdomBadge: {
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  kingdomText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.primary,
    textTransform: 'uppercase',
  },
});
