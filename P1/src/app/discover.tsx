import React, { useState, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  StatusBar 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import WildlifePlayer from '../components/WildlifePlayer';

// Colores base de la app
const COLORS = {
  background: '#111111',
  surfaceAlt: '#1A1A1A',
  border: '#333333',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  primary: '#4ade80', // Verde de la app
  primaryMuted: 'rgba(74, 222, 128, 0.2)',
};

const DEFAULT_VIDEO_ID = '9Rp7Ddxzajs';
// Usaremos la URL local si estamos en desarrollo, pero render en producción es mejor
// En este caso el backend en local corre en http://10.0.2.2:8000 para Android
// Pero usemos Render directamente para estar seguros
const API_URL = 'https://p1-q8lf.onrender.com/api/v1/wildlife/streams';

interface Stream {
  video_id: string;
  title: string;
  channel_title: string;
  thumbnail_url: string;
}

const FILTERS = [
  { id: 'aves', label: 'Aves', query: '?animal=birds' },
  { id: 'africa', label: 'África', query: '?region=africa' },
  { id: 'oceano', label: 'Océano', query: '?region=ocean' },
  { id: 'osos', label: 'Osos', query: '?animal=bears' },
];

export default function DiscoverScreen() {
  const [activeVideoId, setActiveVideoId] = useState<string>(DEFAULT_VIDEO_ID);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const fetchStreams = useCallback(async (filterQuery: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // 20000ms timeout para cold start
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(`${API_URL}${filterQuery}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.status}`);
      }
      
      const data = await response.json();
      setStreams(data.streams || []);
      
      if (data.streams && data.streams.length > 0) {
        setActiveVideoId(data.streams[0].video_id);
      } else {
        // Fallback si no hay streams
        setActiveVideoId(DEFAULT_VIDEO_ID);
      }
    } catch (err: any) {
      let msg = err.message || 'Error desconocido';
      if (err.name === 'AbortError') {
        msg = 'El servidor está tardando mucho en responder (Cold Start de Render). Por favor, intenta de nuevo.';
      }
      setError(msg);
      setStreams([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleFilterPress = (filter: any) => {
    if (activeFilter === filter.id) {
      // Deseleccionar
      setActiveFilter(null);
      setStreams([]);
      setActiveVideoId(DEFAULT_VIDEO_ID);
    } else {
      setActiveFilter(filter.id);
      fetchStreams(filter.query);
    }
  };

  const renderStreamItem = ({ item }: { item: Stream }) => {
    const isSelected = item.video_id === activeVideoId;
    return (
      <TouchableOpacity 
        style={[styles.streamCard, isSelected && styles.streamCardSelected]}
        onPress={() => setActiveVideoId(item.video_id)}
        activeOpacity={0.8}
      >
        <View style={styles.streamInfo}>
          <Text style={styles.streamTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.streamChannel} numberOfLines={1}>{item.channel_title}</Text>
        </View>
        {isSelected && (
          <View style={styles.playingBadge}>
            <Text style={styles.playingText}>Reproduciendo</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      
      <View style={styles.header}>
        <Ionicons name="videocam-outline" size={28} color={COLORS.primary} />
        <Text style={styles.headerTitle}>Live Cams</Text>
      </View>

      <View style={styles.playerSection}>
        <WildlifePlayer videoId={activeVideoId} />
      </View>

      <View style={styles.filtersSection}>
        <Text style={styles.sectionTitle}>Descubrir Cámaras</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.filtersList}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={[
                styles.filterButton, 
                activeFilter === item.id && styles.filterButtonActive
              ]}
              onPress={() => handleFilterPress(item)}
            >
              <Text style={[
                styles.filterText,
                activeFilter === item.id && styles.filterTextActive
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <View style={styles.contentSection}>
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Conectando con el servidor...</Text>
            <Text style={styles.loadingSubText}>(Puede tardar hasta 20s si el servidor estaba inactivo)</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Ionicons name="warning-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => activeFilter ? handleFilterPress(FILTERS.find(f => f.id === activeFilter)) : null}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : streams.length > 0 ? (
          <FlatList
            data={streams}
            keyExtractor={(item) => item.video_id}
            renderItem={renderStreamItem}
            contentContainerStyle={styles.streamsList}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.centerState}>
            <Ionicons name="leaf-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Selecciona un filtro para descubrir más cámaras en vivo.</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  playerSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  filtersSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginLeft: 16,
    marginBottom: 12,
  },
  filtersList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primaryMuted,
    borderColor: COLORS.primary,
  },
  filterText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  filterTextActive: {
    color: COLORS.primary,
  },
  contentSection: {
    flex: 1,
  },
  streamsList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  streamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceAlt,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  streamCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(74, 222, 128, 0.05)',
  },
  streamInfo: {
    flex: 1,
    marginRight: 12,
  },
  streamTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  streamChannel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  playingBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  playingText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '500',
    marginTop: 8,
  },
  loadingSubText: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 16,
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
});
