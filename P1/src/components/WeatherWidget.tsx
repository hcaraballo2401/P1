import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchCurrentWeather, WeatherData, mapWeatherIcon } from '../utils/weather';
import { COLORS } from '../utils/inaturalist';

export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    loadWeather();
  }, []);

  const loadWeather = async () => {
    try {
      setLoading(true);
      const data = await fetchCurrentWeather();
      setWeather(data);
    } catch (error) {
      console.error('WeatherWidget: Failed to load weather:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleModal = (visible: boolean) => {
    if (visible) {
      loadWeather(); // Recargar datos al abrir
    }
    setModalVisible(visible);
  };

  if (loading && !weather) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text style={styles.loadingText}>Cargando clima...</Text>
      </View>
    );
  }

  if (!weather) return null;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => toggleModal(true)}
        style={styles.container}
      >
        <View style={styles.leftContent}>
          <Text style={styles.locationText}>{weather.locationName}</Text>
          <Text style={styles.tempText}>{weather.temp} °C</Text>
        </View>

        <View style={styles.rightContent}>
          <Ionicons
            name={mapWeatherIcon(weather.icon)}
            size={44}
            color={COLORS.warning}
          />
          <Text style={styles.descriptionText}>{weather.description}</Text>
        </View>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => toggleModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => toggleModal(false)}
        >
          <Pressable style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => toggleModal(false)}>
                <Ionicons name="close" size={28} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Detalles del Clima</Text>
              <View style={{ width: 28 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalBody}>
                <Text style={styles.cityNameModal}>{weather.locationName}</Text>
                <Text style={styles.regionNameModal}>Ciudad Guayana</Text>

                <View style={styles.detailsListModal}>
                  <Text style={styles.detailItemModal}>Prob. de precipitaciones: {weather.precipitation}%</Text>
                  <Text style={styles.detailItemModal}>Humedad: {weather.humidity}%</Text>
                  <Text style={styles.detailItemModal}>Viento: a {weather.windSpeed} km/h</Text>
                </View>

                <View style={styles.iconContainerModal}>
                  <Ionicons
                    name={mapWeatherIcon(weather.icon)}
                    size={120}
                    color={COLORS.warning}
                  />
                  <Text style={styles.weatherDescriptionModal}>{weather.description}</Text>
                </View>

                <View style={styles.footerSectionModal}>
                  <Text style={styles.mainTempModal}>{weather.temp} °C</Text>
                  <View style={styles.minMaxContainerModal}>
                    <View style={styles.minMaxRowModal}>
                      <Ionicons name="arrow-up" size={18} color={COLORS.warning} />
                      <Text style={styles.minMaxTextModal}>{weather.tempMax} °C</Text>
                    </View>
                    <View style={styles.minMaxRowModal}>
                      <Ionicons name="arrow-down" size={18} color={COLORS.warning} />
                      <Text style={styles.minMaxTextModal}>{weather.tempMin} °C</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.updateTimeText}>
                  {new Date(weather.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 10,
    paddingHorizontal: 25,
    paddingVertical: 18,
    borderRadius: 35,
    borderWidth: 1.5,
    backgroundColor: COLORS.background,
    borderColor: COLORS.accent,
  },
  loadingContainer: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  leftContent: {
    justifyContent: 'center',
    flex: 1,
  },
  rightContent: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 100,
  },
  locationText: {
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
  },
  tempText: {
    fontSize: 24,
    fontWeight: '500',
    marginTop: 4,
    color: COLORS.textPrimary,
  },
  descriptionText: {
    fontSize: 12,
    color: COLORS.textPrimary,
    marginTop: 4,
    textTransform: 'capitalize',
    textAlign: 'center',
    fontWeight: '600',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: COLORS.surface,
    borderRadius: 30,
    padding: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  modalBody: {
    paddingHorizontal: 10,
  },
  cityNameModal: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  regionNameModal: {
    fontSize: 18,
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  detailsListModal: {
    marginTop: 20,
    gap: 4,
  },
  detailItemModal: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  iconContainerModal: {
    alignItems: 'center',
    marginTop: 30,
  },
  weatherDescriptionModal: {
    fontSize: 20,
    color: COLORS.textPrimary,
    marginTop: 10,
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  footerSectionModal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 40,
    paddingBottom: 10,
  },
  mainTempModal: {
    fontSize: 50,
    fontWeight: 'bold',
    color: COLORS.warning,
  },
  minMaxContainerModal: {
    gap: 6,
    marginBottom: 5,
  },
  minMaxRowModal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  minMaxTextModal: {
    fontSize: 16,
    color: COLORS.warning,
    fontWeight: '600',
  },
  updateTimeText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 20,
    fontStyle: 'italic',
  },
});
