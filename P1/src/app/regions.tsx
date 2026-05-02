 import React, { useState, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
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

  // Generamos el HTML para el mapa usando Leaflet
  const mapHtml = useMemo(() => {
    // Usamos el endpoint /grid para ver los cuadraditos naranjas como en iNaturalist
    // color=orange asegura el tono vibrante de la web oficial
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
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: true,
            attributionControl: false
          }).setView([7.5, -62.5], 7);

          // Capa base de Calles
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);

          // Capas de iNaturalist
          var gridLayer = L.tileLayer('${gridUrl}', {
            maxZoom: 19,
            opacity: 0.7,
            zIndex: 1000
          });

          var pointsLayer = L.tileLayer('${pointsUrl}', {
            maxZoom: 19,
            opacity: 1.0,
            zIndex: 1001
          });

          // Lógica para cambiar de capa según el zoom
          function updateLayers() {
            var zoom = map.getZoom();
            if (zoom >= 13) {
              if (map.hasLayer(gridLayer)) map.removeLayer(gridLayer);
              if (!map.hasLayer(pointsLayer)) map.addLayer(pointsLayer);
            } else {
              if (map.hasLayer(pointsLayer)) map.removeLayer(pointsLayer);
              if (!map.hasLayer(gridLayer)) map.addLayer(gridLayer);
            }
          }

          map.on('zoomend', updateLayers);
          updateLayers(); // Ejecutar al inicio
        </script>
      </body>
      </html>
    `;
  }, [activeCategory]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mapa de Avistamientos</Text>
      </View>

      {/* Selector de Categorías */}
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

      {/* Mapa via WebView */}
      <View style={styles.mapWrapper}>
        <WebView
          originWhitelist={['*']}
          source={{ html: mapHtml }}
          style={styles.map}
          backgroundColor="#f0f0f0"
          javaScriptEnabled={true}
          domStorageEnabled={true}
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
  legend: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(20, 20, 20, 0.8)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  legendText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
});
