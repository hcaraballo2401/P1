import React, { useState, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { COLORS } from '../utils/inaturalist';

// Categorías sugeridas por Héctor
const CATEGORIES = [
  { id: 'all', label: 'Todo', icon: 'apps-outline', type: 'ionicons', taxonId: null },
  { id: 'birds', label: 'Aves', icon: 'bird', type: 'material', taxonId: 3 },
  { id: 'mammals', label: 'Mamíferos', icon: 'paw-outline', type: 'ionicons', taxonId: 40115 },
  { id: 'reptiles', label: 'Reptiles', icon: 'bug-outline', type: 'ionicons', taxonId: 26036 },
  { id: 'plants', label: 'Plantas', icon: 'leaf-outline', type: 'ionicons', taxonId: 47126 },
];

export default function RegionsScreen() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);

  // Manejar mensajes desde el WebView
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
      console.error('Error procesando mensaje del WebView:', err);
    }
  };

  // Generamos el HTML para el mapa usando Leaflet
  const mapHtml = useMemo(() => {
    const taxonParam = activeCategory.taxonId ? `&taxon_id=${activeCategory.taxonId}` : '';
    const gridUrl = `https://api.inaturalist.org/v1/grid/{z}/{x}/{y}.png?color=orange${taxonParam}`;
    const pointsUrl = `https://api.inaturalist.org/v1/points/{z}/{x}/{y}.png?${taxonParam}`;
    const utfGridUrl = `https://api.inaturalist.org/v1/points/{z}/{x}/{y}.grid.json?${taxonParam}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script src="https://cdn.jsdelivr.net/gh/danzel/Leaflet.utfgrid/dist/leaflet.utfgrid.js"></script>
        <style>
          body { margin: 0; padding: 0; background-color: #f0f0f0; }
          #map { height: 100vh; width: 100vw; background-color: #f0f0f0; }

          /* Estilos para el Popup de iNaturalist */
          .leaflet-popup-content-wrapper {
            padding: 0;
            overflow: hidden;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          }
          .leaflet-popup-content {
            margin: 0;
            width: 280px !important;
          }
          .leaflet-popup-tip-container {
            margin-top: -1px;
          }

          .preview-card {
            display: flex;
            padding: 10px;
            align-items: center;
            background: white;
            cursor: pointer;
          }
          .obs-image {
            width: 70px;
            height: 70px;
            border-radius: 8px;
            object-fit: cover;
            background: #eee;
          }
          .obs-info {
            flex: 1;
            margin-left: 12px;
            overflow: hidden;
          }
          .common-name {
            font-size: 15px;
            font-weight: bold;
            color: #333;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin: 0;
          }
          .scientific-name {
            font-size: 11px;
            font-style: italic;
            color: #666;
            margin: 2px 0;
          }
          .location {
            font-size: 10px;
            color: #888;
            margin: 2px 0;
            display: flex;
            align-items: center;
          }
          .date {
            font-size: 10px;
            color: #aaa;
            margin-top: 2px;
          }
          .user-icon {
            width: 30px;
            height: 30px;
            border-radius: 15px;
            border: 1px solid #eee;
            margin-left: 8px;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: true,
            attributionControl: false
          }).setView([7.5, -62.5], 7);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);

          var gridLayer = L.tileLayer('${gridUrl}', {
            maxZoom: 19, opacity: 0.7, zIndex: 1000
          });

          var pointsLayer = L.tileLayer('${pointsUrl}', {
            maxZoom: 19, opacity: 1.0, zIndex: 1001
          });

          var utfGrid = new L.UtfGrid('${utfGridUrl}', {
            useJsonP: false,
            resolution: 4, // Estándar para máxima compatibilidad móvil
            pointerEvents: true
          });

          // Al hacer clic en un punto
          utfGrid.on('click', function (e) {
            if (e.data && e.data.id) {
              // Cargamos los datos para el popup
              fetch('https://api.inaturalist.org/v1/observations/' + e.data.id)
                .then(res => res.json())
                .then(json => {
                  if (json.results && json.results.length > 0) {
                    var obs = json.results[0];
                    var photo = obs.photos?.[0]?.url || obs.taxon?.default_photo?.medium_url || '';
                    var userIcon = obs.user?.icon_url || 'https://www.inaturalist.org/attachment_defaults/users/icons/defaults/thumb.png';

                    var content = \`
                      <div class="preview-card" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type: 'NAVIGATE_TO_SPECIES', taxonId: \${obs.taxon.id}}))">
                        <img src="\${photo}" class="obs-image" />
                        <div class="obs-info">
                          <p class="common-name">\${obs.taxon.preferred_common_name || obs.taxon.name}</p>
                          <p class="scientific-name">(\${obs.taxon.name})</p>
                          <p class="location">\${obs.place_guess || 'Ubicación desconocida'}</p>
                          <p class="date">\${formatDate(obs.observed_on_string || obs.created_at)}</p>
                        </div>
                        <img src="\${userIcon}" class="user-icon" />
                      </div>
                    \`;

                    L.popup({
                      offset: [0, -5],
                      className: 'custom-popup',
                      autoPan: true,
                      autoPanPadding: [50, 50]
                    })
                      .setLatLng([obs.location.split(',')[0], obs.location.split(',')[1]])
                      .setContent(content)
                      .openOn(map);
                  }
                });
            }
          });

          // Añadimos detección de movimiento para que el usuario sepa que hay algo
          utfGrid.on('mouseover', function (e) {
            if (e.data) {
              document.getElementById('map').style.cursor = 'pointer';
            } else {
              document.getElementById('map').style.cursor = '';
            }
          });

          function formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
          }

          // Lógica para cambiar de capa según el zoom
          function updateLayers() {
            var zoom = map.getZoom();
            if (zoom >= 12) {
              if (map.hasLayer(gridLayer)) map.removeLayer(gridLayer);

              // IMPORTANTE: Primero añadir la capa visual, LUEGO la interactiva
              if (!map.hasLayer(pointsLayer)) map.addLayer(pointsLayer);
              if (!map.hasLayer(utfGrid)) {
                map.addLayer(utfGrid);
              } else {
                // Forzar que la capa de clics esté siempre al frente
                utfGrid.bringToFront();
              }
            } else {
              if (map.hasLayer(pointsLayer)) map.removeLayer(pointsLayer);
              if (map.hasLayer(utfGrid)) map.removeLayer(utfGrid);
              if (!map.hasLayer(gridLayer)) map.addLayer(gridLayer);
            }
          }

          // Escuchar también cuando se termina de mover el mapa para asegurar interactividad
          map.on('zoomend moveend', updateLayers);
          updateLayers();
        </script>
      </body>
      </html>
    `;
  }, [activeCategory]);

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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.filterTab,
                activeCategory.id === cat.id && styles.filterTabActive
              ]}
              onPress={() => setActiveCategory(cat)}
            >
              {cat.type === 'material' ? (
                <MaterialCommunityIcons
                  name={cat.icon as any}
                  size={18}
                  color={activeCategory.id === cat.id ? COLORS.background : COLORS.textPrimary}
                />
              ) : (
                <Ionicons
                  name={cat.icon as any}
                  size={18}
                  color={activeCategory.id === cat.id ? COLORS.background : COLORS.textPrimary}
                />
              )}
              <Text style={[
                styles.filterText,
                activeCategory.id === cat.id && styles.filterTextActive
              ]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.mapWrapper}>
        <WebView
          originWhitelist={['*']}
          source={{ html: mapHtml }}
          style={styles.map}
          backgroundColor="#f0f0f0"
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onMessage={onMessage}
        />
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
    paddingBottom: 15,
    backgroundColor: COLORS.surface,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  filterContainer: {
    backgroundColor: COLORS.surface,
    paddingBottom: 10,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  filterTextActive: {
    color: COLORS.background,
  },
  mapWrapper: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
