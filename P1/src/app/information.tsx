import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';

import type { FichaEspecieResponse } from '../types/api';
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

const API_BASE_URL = 'https://p1-q8lf.onrender.com';
const FICHA_ESPECIE_URL = `${API_BASE_URL}/api/v1/identificacion/ficha-especie`;

/** Longitud máxima del resumen tipo Wikipedia antes del botón «Ver más». */
const MINI_RESUMEN_MAX_CHARS = 280;

/** Tiempo máximo de espera al solicitar la ficha ampliada (la IA puede tardar). */
const FICHA_IA_TIMEOUT_MS = 55000;

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
  const [iaDetailText, setIaDetailText] = useState<string | null>(null);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaError, setIaError] = useState<string | null>(null);
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

  const buildFallbackSummary = useCallback((s: SpeciesDisplay) => {
    const lines: string[] = [];

    lines.push(
      `${s.commonName || s.scientificName} (${s.scientificName}) es un taxón de rango ${s.rank}.`
    );

    const taxParts: string[] = [];
    if (s.kingdom) taxParts.push(`Reino: ${s.kingdom}`);
    if (s.order) taxParts.push(`Orden: ${s.order}`);
    if (s.family) taxParts.push(`Familia: ${s.family}`);
    if (taxParts.length) lines.push(taxParts.join(' · ') + '.');

    if (s.conservationLabel) {
      lines.push(`Estado de conservación reportado: ${s.conservationLabel}.`);
    }

    if (s.isNative) {
      lines.push('En iNaturalist figura con estatus de establecimiento: nativa.');
    } else if (s.isInvasive) {
      lines.push('En iNaturalist figura con estatus de establecimiento: introducida/invasora.');
    }

    lines.push(
      'Nota: no se encontró un resumen de Wikipedia disponible para esta especie en este momento. ' +
        'Puedes tocar “Ver más con IA” para obtener una ficha ampliada con contexto regional.'
    );

    return lines.join('\n');
  }, []);

  const fetchSpeciesDetail = useCallback(async () => {
    const searchName = params.scientificName as string;
    if (!taxonId && !searchName) {
      setError('No se proporcionó un ID de especie ni nombre científico.');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setIaDetailText(null);
      setIaError(null);

      let finalTaxonId = taxonId as string;

      // Si nos pasaron un nombre, resolvemos su ID primero
      if (!finalTaxonId && searchName) {
        const normalize = (value: string) =>
          value
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const normalizedSearch = normalize(searchName);
        const searchRes = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchName)}`);
        if (!searchRes.ok) throw new Error('Error buscando la especie por nombre.');
        const searchJson = await searchRes.json();
        if (!searchJson.results || searchJson.results.length === 0) {
          throw new Error(`No se encontró en iNaturalist la especie: ${searchName}`);
        }

        const exactMatch = searchJson.results.find((r: any) => {
          return (
            normalize(r.name || '') === normalizedSearch ||
            normalize(r.preferred_common_name || '') === normalizedSearch ||
            normalize(r.display_name || '') === normalizedSearch
          );
        });

        const bestMatch = exactMatch || searchJson.results[0];
        finalTaxonId = bestMatch.id.toString();
      }

      // 1. Obtener detalles completos del taxón usando v1/taxa/{id} que incluye establishment_means y summary
      const res = await fetch(`https://api.inaturalist.org/v1/taxa/${finalTaxonId}`);
      if (!res.ok) {
        throw new Error(`Error al obtener detalles: ${res.status}`);
      }
      const json = await res.json();
      if (!json.results || json.results.length === 0) {
        throw new Error('No se encontraron detalles para esta especie.');
      }
      const taxon = json.results[0];

      // 2. Resolver el conteo de observaciones locales
      let parsedCount = count ? parseInt(count as string, 10) : 0;
      if (!count) {
        try {
          // Buscamos cuántas observaciones hay en la región (INAT_PLACE_ID) para este taxón
          const countRes = await fetch(`https://api.inaturalist.org/v1/observations/species_counts?place_id=${INAT_PLACE_ID}&taxon_id=${finalTaxonId}`);
          if (countRes.ok) {
            const countJson = await countRes.json();
            if (countJson.results && countJson.results.length > 0) {
              parsedCount = countJson.results[0].count;
            }
          }
        } catch (e) {
          console.warn('No se pudo obtener el conteo de observaciones local', e);
        }
      }

      const speciesDisplay = mapSpeciesResult(taxon, parsedCount);

      // Cargar Wikipedia summary
      const summary = await fetchWikiDescription(speciesDisplay.scientificName);
      if (summary) {
        speciesDisplay.taxonSummary = summary;
      }

      // Fallback: asegurar que haya algún texto siempre
      if (!speciesDisplay.taxonSummary || !speciesDisplay.taxonSummary.trim()) {
        speciesDisplay.taxonSummary = buildFallbackSummary(speciesDisplay);
      }

      setSpecies(speciesDisplay);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido al cargar datos.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [taxonId, count, params.scientificName, buildFallbackSummary]);

  useEffect(() => {
    startShimmer();
    fetchSpeciesDetail();
  }, [startShimmer, fetchSpeciesDetail]);

  const fetchFichaIa = useCallback(async () => {
    if (!species) return;
    setIaLoading(true);
    setIaError(null);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FICHA_IA_TIMEOUT_MS);
    try {
      const res = await fetch(FICHA_ESPECIE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          taxon_id: species.id,
          nombre_cientifico: species.scientificName,
          nombre_comun: species.commonName || null,
          resumen_base: species.taxonSummary ?? null,
        }),
      });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(
            'El servidor aún no tiene habilitada la ruta de “Ver más con IA”. ' +
              'Debes redeplegar el backend con el endpoint /api/v1/identificacion/ficha-especie.'
          );
        }
        // Intentar extraer detalle JSON estilo FastAPI: {"detail": "..."}
        const errText = await res.text().catch(() => '');
        try {
          const asJson = JSON.parse(errText) as { detail?: string };
          if (asJson?.detail) throw new Error(asJson.detail);
        } catch {
          // ignore parse errors, fallback to raw text
        }
        throw new Error(errText || `Error del servidor (${res.status})`);
      }
      const json = (await res.json()) as FichaEspecieResponse;
      if (!json.texto_ia?.trim()) {
        throw new Error('La respuesta de la IA llegó vacía.');
      }
      setIaDetailText(json.texto_ia.trim());
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === 'AbortError'
            ? 'La solicitud tardó demasiado. Reintenta cuando tengas buena conexión.'
            : e.message
          : 'No se pudo cargar la información ampliada.';
      setIaError(msg);
    } finally {
      clearTimeout(t);
      setIaLoading(false);
    }
  }, [species]);

  const miniResumen = useMemo(() => {
    const full = (species?.taxonSummary ?? '').trim();
    if (!full) {
      return '';
    }
    if (full.length <= MINI_RESUMEN_MAX_CHARS) {
      return full;
    }
    const cut = full.slice(0, MINI_RESUMEN_MAX_CHARS).trim();
    const lastSpace = cut.lastIndexOf(' ');
    const safe = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
    return `${safe}…`;
  }, [species?.taxonSummary]);

  // Generar HTML para el minimapa
  const miniMapHtml = useMemo(() => {
    if (!species) return '';
    const pointsUrl = `https://api.inaturalist.org/v1/points/{z}/{x}/{y}.png?taxon_id=${species.id}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #map { height: 100vh; width: 100vw; background: #e0e0e0; }
          .leaflet-control-attribution { display: none !important; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            touchZoom: false,
            scrollWheelZoom: false,
            doubleClickZoom: false
          }).setView([7.5, -62.5], 6);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
          L.tileLayer('${pointsUrl}', { zIndex: 1000 }).addTo(map);
        </script>
      </body>
      </html>
    `;
  }, [species]);

  // ── Render: Cargando ──
  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
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
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
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
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      
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
          <Text style={styles.cardTitle}>Resumen</Text>
          {miniResumen ? (
            <Text style={styles.taxonSummary}>{miniResumen}</Text>
          ) : (
            <Text style={styles.taxonSummary}>
              Resumen breve no disponible (Wikipedia / iNaturalist). Puedes pedir una ficha
              ampliada con IA abajo.
            </Text>
          )}

          {!iaDetailText && (
            <TouchableOpacity
              style={[styles.verMasButton, iaLoading && styles.verMasButtonDisabled]}
              onPress={fetchFichaIa}
              disabled={iaLoading}
              activeOpacity={0.85}
            >
              {iaLoading ? (
                <ActivityIndicator size="small" color={COLORS.accent} />
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={18} color={COLORS.accent} />
                  <Text style={styles.verMasButtonText}>Ver más con IA</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {iaError && (
            <View style={styles.iaErrorBox}>
              <Text style={styles.iaErrorText}>{iaError}</Text>
              <TouchableOpacity onPress={fetchFichaIa} style={styles.iaRetryInline}>
                <Text style={styles.iaRetryInlineText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          )}

          {iaDetailText && (
            <>
              <View style={styles.divider} />
              <Text style={styles.cardTitle}>Información ampliada (IA)</Text>
              <Text style={styles.iaDetailText}>{iaDetailText}</Text>
            </>
          )}

          <View style={styles.divider} />

          {species.kingdom && (
            <DetailRow label="Reino:" value={species.kingdom} />
          )}
          {species.rank && (
            <DetailRow label="Rango taxonómico:" value={species.rank} />
          )}
        </View>

        {/* Mini Mapa de Avistamientos */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mapa de Presencia</Text>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.miniMapContainer}
            onPress={() => {
              router.push({
                pathname: '/regions',
                params: {
                  taxonId: species.id.toString(),
                  taxonName: species.commonName
                }
              });
            }}
          >
            <WebView
              originWhitelist={['*']}
              source={{ html: miniMapHtml }}
              style={styles.miniMap}
              pointerEvents="none"
              scrollEnabled={false}
            />
            <View style={styles.miniMapOverlay}>
              <View style={styles.miniMapButton}>
                <Ionicons name="expand-outline" size={16} color="#fff" />
                <Text style={styles.miniMapButtonText}>Ver pantalla completa</Text>
              </View>
            </View>
          </TouchableOpacity>
          <Text style={styles.miniMapHint}>
            Toque el mapa para ver la distribución detallada en Guayana.
          </Text>
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
  verMasButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.primaryMuted,
  },
  verMasButtonDisabled: {
    opacity: 0.65,
  },
  verMasButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
  },
  iaErrorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.warningMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iaErrorText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  iaRetryInline: {
    alignSelf: 'flex-start',
  },
  iaRetryInlineText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
  },
  iaDetailText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 22,
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
  miniMapContainer: {
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#eee',
    position: 'relative',
    marginTop: 8,
  },
  miniMap: {
    flex: 1,
  },
  miniMapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  miniMapButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  miniMapHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
});
