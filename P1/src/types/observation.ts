/**
 * Tipos TypeScript para el módulo de avistamientos locales.
 * Compatible con el estándar Darwin Core (DwC) para exportación
 * e integración con la API de iNaturalist v1.
 */

// ─── Sincronización ───────────────────────────────────────────────────────────

/** Estado de sincronización con iNaturalist */
export const SyncStatus = {
  PENDING: 0,
  SYNCED: 1,
  ERROR: 2,
} as const;

export type SyncStatusValue = typeof SyncStatus[keyof typeof SyncStatus];

// ─── Observación local ────────────────────────────────────────────────────────

/**
 * Representa un avistamiento guardado en la base de datos SQLite local.
 * Todos los campos siguen los nombres del estándar Darwin Core cuando aplica.
 */
export interface LocalObservation {
  /** Clave primaria autoincremental de SQLite */
  id?: number;

  // ── Medios ──────────────────────────────────────────────────────────────────
  /** Ruta absoluta del archivo de imagen en el sistema de archivos del dispositivo */
  image_path: string;

  // ── Ubicación (Darwin Core: decimalLatitude / decimalLongitude) ──────────────
  /** Latitud decimal WGS84. NULL si no se pudo obtener GPS */
  latitude: number | null;
  /** Longitud decimal WGS84. NULL si no se pudo obtener GPS */
  longitude: number | null;
  /** Precisión del GPS en metros (Darwin Core: coordinateUncertaintyInMeters) */
  accuracy: number | null;

  // ── Tiempo ──────────────────────────────────────────────────────────────────
  /**
   * Marca de tiempo en formato ISO8601 del momento de captura.
   * Darwin Core: eventDate
   * Ejemplo: "2026-05-03T21:08:43-04:00"
   */
  observed_at: string;

  // ── Identificación de especie ────────────────────────────────────────────────
  /**
   * Identificación preliminar sugerida por el usuario o la IA.
   * Darwin Core: identificationRemarks
   */
  species_guess: string | null;

  /**
   * Nombre científico extraído de la respuesta de Gemma.
   * Darwin Core: scientificName
   */
  scientific_name: string | null;

  /** Confianza del modelo ResNet-50 en escala 0-1 */
  confidence: number | null;

  /** Respuesta JSON completa de la API de identificación (serializada como string) */
  ai_raw_response: string | null;

  // ── Sincronización ───────────────────────────────────────────────────────────
  /**
   * Estado de sincronización con iNaturalist.
   * 0 = Pendiente, 1 = Sincronizado, 2 = Error
   */
  sync_status: SyncStatusValue;

  /** ID del avistamiento en iNaturalist (disponible tras sincronización exitosa) */
  inaturalist_id: number | null;

  /** Mensaje de error si sync_status === 2 */
  sync_error: string | null;
}

/**
 * Datos mínimos requeridos para crear una nueva observación.
 * Omite campos gestionados por SQLite (id) y post-sincronización.
 */
export type NewObservationInput = Omit<
  LocalObservation,
  'id' | 'inaturalist_id' | 'sync_error' | 'sync_status'
>;

// ─── iNaturalist API ──────────────────────────────────────────────────────────

/**
 * Payload para la API v1 de iNaturalist: POST /observations
 * Documentación: https://api.inaturalist.org/v1/docs/#!/Observations/post_observations
 */
export interface INaturalistObservationPayload {
  observation: {
    species_guess: string;
    /**
     * Fecha + hora completa en formato "YYYY-MM-DD HH:MM:SS".
     * ⚠️ NO usar `time_observed_at` como campo separado — causa HTTP 422.
     */
    observed_on_string: string;
    /** Opcional: si no hay GPS se omite; iNaturalist acepta el avistamiento sin ubicación */
    latitude?: number;
    longitude?: number;
    positional_accuracy?: number | null;
    description?: string;
    captive_cultivated: boolean;
    observation_field_values_attributes?: Array<{
      observation_field_id: number;
      value: string;
    }>;
  };
}

/** Respuesta de iNaturalist al crear un avistamiento */
export interface INaturalistObservationResponse {
  id: number;
  uuid: string;
  quality_grade: string;
  uri: string;
}
