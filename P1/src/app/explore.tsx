import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  StatusBar,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import HeaderBuscador from '../components/HeaderBuscador';
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

export default function ExploreScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [speciesList, setSpeciesList] = useState<SpeciesDisplay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredList = useMemo<SpeciesDisplay[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return speciesList;
    return speciesList.filter((s) => {
      const inCommon = s.commonName.toLowerCase().includes(q);
      const inScientific = s.scientificName.toLowerCase().includes(q);
      const inKingdom = (s.kingdom ?? '').toLowerCase().includes(q);
      return inCommon || inScientific || inKingdom;
    });
  }, [speciesList, searchQuery]);

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
    fetchSpecies();
  }, [fetchSpecies]);

  // Cabecera secundaria del diseño de exploración
  const renderTopMenu = () => (
    <View style={[styles.topMenu, { alignItems: 'center' }]}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
        <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.replace('/')} style={styles.menuTab}>
        <Text style={styles.menuTabText}>Todo</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.menuTab, styles.menuTabActive]}>
        <Text style={[styles.menuTabText, styles.menuTabTextActive]}>Explorar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.menuTab}>
        <Text style={styles.menuTabText}>Regiones</Text>
      </TouchableOpacity>
    </View>
  );

  const renderItem = ({ item }: { item: SpeciesDisplay }) => (
    <SpeciesCard item={item} />
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      
      <HeaderBuscador onSearch={setSearchQuery} />

      {renderTopMenu()}

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando especies...</Text>
        </View>
      ) : error || speciesList.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.errorText}>{error ?? 'Sin datos'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchSpecies}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : filteredList.length === 0 && searchQuery.trim().length > 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="search-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.errorText}>
            Sin resultados para «{searchQuery.trim()}»
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
        />
      )}
    </View>
  );
}

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
  listContent: {
    padding: 10,
    paddingBottom: 48,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 32,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 16,
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
});
