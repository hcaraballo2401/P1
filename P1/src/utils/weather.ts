import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración y Constantes
// ─────────────────────────────────────────────────────────────────────────────

// Configuración de la API usando variables de entorno de Expo
const WEATHER_API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
const WEATHER_API_BASE = 'https://api.openweathermap.org/data/2.5';
const WEATHER_STORAGE_KEY = '@biolife_weather_cache';

export interface WeatherData {
  temp: number;
  tempMax: number;
  tempMin: number;
  condition: string;
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  locationName: string;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de Utilidad
// ─────────────────────────────────────────────────────────────────────────────

async function getCurrentLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permiso de ubicación denegado');
  }

  const location = await Location.getCurrentPositionAsync({});
  return location.coords;
}

export function mapWeatherIcon(iconCode: string): any {
  // Mapeo extendido para cubrir todos los estados de OpenWeatherMap
  const map: Record<string, string> = {
    '01d': 'sunny',
    '01n': 'moon',
    '02d': 'partly-sunny',
    '02n': 'cloudy-night',
    '03d': 'cloud', // Nubes dispersas
    '03n': 'cloud',
    '04d': 'clouds', // Nubes rotas / nublado
    '04n': 'clouds',
    '09d': 'rainy', // Lluvia ligera
    '09n': 'rainy',
    '10d': 'rainy', // Lluvia moderada
    '10n': 'rainy',
    '11d': 'thunderstorm',
    '11n': 'thunderstorm',
    '13d': 'snow',
    '13n': 'snow',
    '50d': 'water', // Niebla / Neblina
    '50n': 'water',
  };

  return map[iconCode] || 'partly-sunny';
}

/**
 * Datos de prueba (Solo se usan si la API falla completamente y no hay cache)
 */
const MOCK_WEATHER: WeatherData = {
  temp: 0,
  condition: 'Unknown',
  description: 'Sin conexión',
  icon: '01d',
  humidity: 0,
  locationName: 'Ubicación...',
  timestamp: Date.now(),
};

export async function fetchCurrentWeather(): Promise<WeatherData> {
  try {
    // Si no hay API Key, usamos mock para evitar errores de desarrollo
    if (!WEATHER_API_KEY) {
      console.warn('Weather API Key missing. Using mock data.');
      return MOCK_WEATHER;
    }

    const coords = await getCurrentLocation();

    const response = await fetch(
      `${WEATHER_API_BASE}/weather?lat=${coords.latitude}&lon=${coords.longitude}&appid=${WEATHER_API_KEY}&units=metric&lang=es`
    );

    if (!response.ok) {
      throw new Error('Error al conectar con el servicio de clima');
    }

    const json = await response.json();

    const weather: WeatherData = {
      temp: Math.round(json.main.temp),
      tempMax: Math.round(json.main.temp_max),
      tempMin: Math.round(json.main.temp_min),
      condition: json.weather[0].main,
      description: json.weather[0].description,
      icon: json.weather[0].icon,
      humidity: json.main.humidity,
      windSpeed: Math.round(json.wind.speed * 3.6), // Convertir m/s a km/h
      precipitation: json.pop ? Math.round(json.pop * 100) : 0, // Probabilidad de precipitación si está disponible
      locationName: json.name,
      timestamp: Date.now(),
    };

    await AsyncStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(weather));
    return weather;
  } catch (error) {
    const cachedData = await AsyncStorage.getItem(WEATHER_STORAGE_KEY);
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    // Fallback final a mock si nunca hubo cache
    return MOCK_WEATHER;
  }
}
