import React, { useState, useMemo, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, Modal, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { COLORS } from '../utils/inaturalist';

// Categorías oficiales de iNaturalist (Iconic Taxa)
const CATEGORIES = [
  { id: 'all', label: 'Todo', icon: 'apps-outline', type: 'ionicons', taxonId: null },
  { id: 'birds', label: 'Aves', icon: 'bird', type: 'material', taxonId: 3 },
  { id: 'reptiles', label: 'Reptiles', icon: 'snake', type: 'material', taxonId: 26036 },
  { id: 'amphibians', label: 'Anfibios', icon: 'water-outline', type: 'ionicons', taxonId: 20978 },
  { id: 'fish', label: 'Peces', icon: 'fish', type: 'material', taxonId: 47178 },
  { id: 'insects', label: 'Insectos', icon: 'bug-outline', type: 'ionicons', taxonId: 47158 },
  { id: 'arachnids', label: 'Arácnidos', icon: 'spider', type: 'material', taxonId: 47119 },
  { id: 'fungi', label: 'Hongos', icon: 'mushroom-outline', type: 'material', taxonId: 47170 },
  { id: 'plants', label: 'Plantas', icon: 'leaf-outline', type: 'ionicons', taxonId: 47126 },
  { id: 'protozoa', label: 'Protozoos', icon: 'microscope', type: 'material', taxonId: 47686 },
];

export default function RegionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Inicialización de categoría dinámica basada en navegación externa
  const initialCategory = useMemo(() => {
    if (params.taxonId && params.taxonName) {
      return {
        id: 'dynamic',
        label: params.taxonName as string,
        icon: '',
        type: 'none',
        taxonId: parseInt(params.taxonId as string, 10),
        hideIcon: true
      };
    }
    return CATEGORIES[0];
  }, [params.taxonId, params.taxonName]);

  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Sincronizar estado cuando los parámetros de navegación cambian
  useEffect(() => {
    if (params.taxonId && params.taxonName) {
      setActiveCategory({
        id: 'dynamic',
        label: params.taxonName as string,
        icon: '',
        type: 'none',
        taxonId: parseInt(params.taxonId as string, 10),
        hideIcon: true
      });
    }
  }, [params.taxonId, params.taxonName]);

  const extraCategories = CATEGORIES.filter(cat => cat.id !== 'all');

  // Puente de comunicación WebView -> React Native
  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'NAVIGATE_TO_SPECIES' && data.taxonId) {
        router.push({
          pathname: '/information',
          params: { taxonId: data.taxonId.toString() }
        });
      }
    } catch (err) {
      console.error('Error en onMessage:', err);
    }
  };

  const mapHtml = useMemo(() => {
    const taxonParam = activeCategory.taxonId ? `&taxon_id=${activeCategory.taxonId}` : '';
    const gridUrl = `https://api.inaturalist.org/v1/grid/{z}/{x}/{y}.png?color=orange${taxonParam}`;
    const pointsUrl = `https://api.inaturalist.org/v1/points/{z}/{x}/{y}.png?${taxonParam}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; background-color: #f0f0f0; }
          #map { height: 100vh; width: 100vw; background-color: #f0f0f0; }

          /* Estilos del Popup estilo iNaturalist */
          .leaflet-popup-content-wrapper { padding: 0; overflow: hidden; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
          .leaflet-popup-content { margin: 0; width: 280px !important; }
          .preview-card { display: flex; padding: 10px; align-items: center; background: white; cursor: pointer; }
          .obs-image { width: 70px; height: 70px; border-radius: 8px; object-fit: cover; background: #eee; }
          .obs-info { flex: 1; margin-left: 12px; overflow: hidden; }
          .common-name { font-size: 14px; font-weight: bold; color: #333; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .scientific-name { font-size: 11px; font-style: italic; color: #666; margin: 2px 0; }
          .location { font-size: 10px; color: #888; margin: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .date { font-size: 10px; color: #aaa; }
          .user-icon { width: 30px; height: 30px; border-radius: 15px; border: 1px solid #eee; margin-left: 8px; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: true,
            attributionControl: false,
            maxZoom: 16
          }).setView([7.5, -62.5], 7);

          // Capa base
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 16 }).addTo(map);

          // Capas visuales de iNaturalist
          var gridLayer = L.tileLayer('${gridUrl}', { maxZoom: 11, opacity: 0.7, zIndex: 1000 });
          var pointsLayer = L.tileLayer('${pointsUrl}', { minZoom: 12, maxZoom: 16, opacity: 1.0, zIndex: 1001 });

          gridLayer.addTo(map);
          pointsLayer.addTo(map);

          function formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
          }

          // SOLUCIÓN DEFINITIVA: Detección de clics por proximidad (API Spatial Query)
          // Esto funciona en TODOS los niveles de zoom porque no depende de teselas interactivas
          map.on('click', function(e) {
            var zoom = map.getZoom();
            if (zoom < 11) return; // No buscar si estamos muy lejos (modo cuadrados)

            var lat = e.latlng.lat;
            var lng = e.latlng.lng;

            // Calculamos un radio de sensibilidad basado en el zoom para que sea fácil tocar
            var radius = 0.5 / Math.pow(2, zoom - 10);

            var url = 'https://api.inaturalist.org/v1/observations?lat=' + lat + '&lng=' + lng + '&radius=' + radius + '&per_page=1&order_by=created_at&order=desc';
            ${activeCategory.taxonId ? "url += '&taxon_id=" + activeCategory.taxonId + "';" : ""}

            fetch(url)
              .then(res => res.json())
              .then(json => {
                if (json.results && json.results.length > 0) {
                  var obs = json.results[0];
                  var photo = obs.photos?.[0]?.url || obs.taxon?.default_photo?.medium_url || '';
                  var userIcon = (obs.user && obs.user.icon_url) ? obs.user.icon_url : 'https://www.inaturalist.org/attachment_defaults/users/icons/defaults/thumb.png';

                  var content = '<div class="preview-card" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type: \\'NAVIGATE_TO_SPECIES\\', taxonId: ' + obs.taxon.id + '}))">' +
                      '<img src="' + photo + '" class="obs-image" />' +
                      '<div class="obs-info">' +
                        '<p class="common-name">' + (obs.taxon.preferred_common_name || obs.taxon.name) + '</p>' +
                        '<p class="scientific-name">(' + obs.taxon.name + ')</p>' +
                        '<p class="location">' + (obs.place_guess || 'Ubicación desconocida').replace(/'/g, "\\'") + '</p>' +
                        '<p class="date">' + formatDate(obs.observed_on_string || obs.created_at) + '</p>' +
                      '</div>' +
                      '<img src="' + userIcon + '" class="user-icon" />' +
                    '</div>';

                  var latlng = obs.location.split(',');
                  L.popup({ offset: [0, -5], autoPan: true })
                    .setLatLng([parseFloat(latlng[0]), parseFloat(latlng[1])])
                    .setContent(content)
                    .openOn(map);
                }
              });
          });
        </script>
      </body>
      </html>
    `;
  }, [activeCategory]);

  const CategoryItem = ({ cat, isActive, onPress }: { cat: any, isActive: boolean, onPress: () => void }) => (
    <TouchableOpacity style={[styles.filterTab, isActive && styles.filterTabActive]} onPress={onPress}>
      {!cat.hideIcon && (
        cat.type === 'material' ? (
          <MaterialCommunityIcons name={cat.icon as any} size={18} color={isActive ? COLORS.background : COLORS.textPrimary} />
        ) : (
          <Ionicons name={cat.icon as any} size={18} color={isActive ? COLORS.background : COLORS.textPrimary} />
        )
      )}
      <Text style={[styles.filterText, isActive && styles.filterTextActive, cat.hideIcon && { flex: 1, textAlign: 'center' }]} numberOfLines={1} ellipsizeMode="tail">
        {cat.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mapa de Avistamientos</Text>
      </View>

      <View style={styles.filterContainer}>
        <View style={styles.filterRow}>
          <CategoryItem cat={CATEGORIES[0]} isActive={activeCategory.id === 'all'} onPress={() => setActiveCategory(CATEGORIES[0])} />
          <CategoryItem
            cat={activeCategory.id === 'all' ? CATEGORIES[1] : activeCategory}
            isActive={activeCategory.id !== 'all'}
            onPress={() => {
              if (activeCategory.id === 'all') setActiveCategory(CATEGORIES[1]);
              else setIsMenuOpen(true);
            }}
          />
          <TouchableOpacity style={styles.moreButton} onPress={() => setIsMenuOpen(true)}>
            <Ionicons name="chevron-down" size={18} color={COLORS.primary} />
            <Text style={styles.moreButtonText}>Más</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={isMenuOpen} transparent animationType="fade" onRequestClose={() => setIsMenuOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsMenuOpen(false)}>
          <View style={styles.dropdownMenu}>
            <Text style={styles.dropdownTitle}>Otras Categorías</Text>
            <ScrollView style={styles.dropdownScroll}>
              {extraCategories.map((cat) => (
                <TouchableOpacity key={cat.id} style={[styles.dropdownItem, activeCategory.id === cat.id && styles.dropdownItemActive]} onPress={() => { setActiveCategory(cat); setIsMenuOpen(false); }}>
                  <View style={styles.dropdownIconBox}>
                    {cat.type === 'material' ? (
                      <MaterialCommunityIcons name={cat.icon as any} size={20} color={activeCategory.id === cat.id ? COLORS.primary : COLORS.textSecondary} />
                    ) : (
                      <Ionicons name={cat.icon as any} size={20} color={activeCategory.id === cat.id ? COLORS.primary : COLORS.textSecondary} />
                    )}
                  </View>
                  <Text style={[styles.dropdownText, activeCategory.id === cat.id && styles.dropdownTextActive]}>{cat.label}</Text>
                  {activeCategory.id === cat.id && <Ionicons name="checkmark" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <View style={styles.mapWrapper}>
        <WebView originWhitelist={['*']} source={{ html: mapHtml }} style={styles.map} backgroundColor="#f0f0f0" javaScriptEnabled domStorageEnabled onMessage={onMessage} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingHorizontal: 16, paddingBottom: 15, backgroundColor: COLORS.surface },
  backButton: { marginRight: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.textPrimary },
  filterContainer: { backgroundColor: COLORS.surface, paddingBottom: 12, paddingHorizontal: 16 },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  filterTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceAlt, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: COLORS.background },
  moreButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceAlt, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, gap: 4 },
  moreButtonText: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  dropdownMenu: { width: '80%', maxHeight: '60%', backgroundColor: COLORS.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.border, elevation: 10 },
  dropdownTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  dropdownScroll: { flexGrow: 0 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dropdownItemActive: { backgroundColor: 'rgba(200, 164, 46, 0.05)' },
  dropdownIconBox: { width: 30, alignItems: 'center', marginRight: 12 },
  dropdownText: { flex: 1, color: COLORS.textSecondary, fontSize: 16 },
  dropdownTextActive: { color: COLORS.primary, fontWeight: 'bold' },
  mapWrapper: { flex: 1 },
  map: { flex: 1 },
});
