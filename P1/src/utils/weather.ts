import * as Location from 'expo-location';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración y Constantes
// ─────────────────────────────────────────────────────────────────────────────

// Configuración de la API con la clave fija
const WEATHER_API_KEY = '8d3235d2228cb82b024c170bda7f0720';
const WEATHER_API_BASE = 'https://api.openweathermap.org/data/2.5';

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
  // Mapeo corregido para Ionicons (evitando nombres no existentes que causan el signo "?")
  const map: Record<string, string> = {
    '01d': 'sunny',
    '01n': 'moon',
    '02d': 'partly-sunny',
    '02n': 'cloudy-night',
    '03d': 'cloudy', // Nubes dispersas
    '03n': 'cloudy',
    '04d': 'cloudy', // Muy nuboso
    '04n': 'cloudy',
    '09d': 'rainy',
    '09n': 'rainy',
    '10d': 'rainy',
    '10n': 'rainy',
    '11d': 'thunderstorm',
    '11n': 'thunderstorm',
    '13d': 'snow',
    '13n': 'snow',
    '50d': 'water',
    '50n': 'water',
  };

  return map[iconCode] || 'partly-sunny';
}

/**
 * Datos de prueba (Solo se usan si la API falla completamente y no hay cache)
 */
const MOCK_WEATHER: WeatherData = {
  temp: 0,
  tempMax: 0,
  tempMin: 0,
  condition: 'Unknown',
  description: 'Sin conexión',
  icon: '01d',
  humidity: 0,
  windSpeed: 0,
  precipitation: 0,
  locationName: 'Ubicación...',
  timestamp: Date.now(),
};

// Cache simple en memoria para evitar llamadas excesivas en la misma sesión
let inMemoryWeatherCache: WeatherData | null = null;

export async function fetchCurrentWeather(): Promise<WeatherData> {
  try {
    // Si no hay API Key, usamos mock para evitar errores de desarrollo
    if (!WEATHER_API_KEY) {
      console.warn('Weather API Key missing. Using mock data.');
      return MOCK_WEATHER;
    }

    const coords = await getCurrentLocation();

    const response = await fetch(
      `${WEATHER_API_BASE}/weather?lat=${coords.latitude}&lon=${coords.longitude}&appid=${WEATHER_API_KEY}&units=metric&lang=es&_t=${Date.now()}`
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
      description: json.weather[0].description.replace(/nuboso/gi, 'nublado'),
      icon: json.weather[0].icon,
      humidity: json.main.humidity,
      windSpeed: Math.round(json.wind.speed * 3.6), // Convertir m/s a km/h
      precipitation: json.pop ? Math.round(json.pop * 100) : 0, // Probabilidad de precipitación si está disponible
      locationName: json.name,
      timestamp: Date.now(),
    };

    inMemoryWeatherCache = weather;
    return weather;
  } catch (error) {
    if (inMemoryWeatherCache) {
      return inMemoryWeatherCache;
    }
    // Fallback final a mock si nunca hubo cache
    return MOCK_WEATHER;
  }
}
