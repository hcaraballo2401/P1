/**
 * @module inaturalistUpload
 * @description Servicio de subida de avistamientos a la API v1 de iNaturalist.
 *
 * Flujo completo:
 * 1. Crear la observación: POST /observations
 * 2. Subir la foto: POST /observation_photos
 * 3. Retornar el ID remoto para marcar como sincronizado en SQLite
 *
 * Documentación API: https://api.inaturalist.org/v1/docs/
 * Autenticación: JWT en header `Authorization: <token>` (sin "Bearer")
 */

import type {
  LocalObservation,
  INaturalistObservationPayload,
  INaturalistObservationResponse,
} from '../types/observation';

// ─── Constantes ───────────────────────────────────────────────────────────────

const INAT_API_BASE = 'https://api.inaturalist.org/v1';

// ─── Clase de Error ───────────────────────────────────────────────────────────

/**
 * Error tipado para fallos de la API de iNaturalist.
 * Incluye el paso que falló, el código HTTP y un mensaje amigable para el usuario.
 */
export class INaturalistUploadError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly detail?: string,
    /** Paso del flujo donde ocurrió el error para diagnóstico */
    public readonly step?: 'create_observation' | 'upload_photo' | 'validation'
  ) {
    super(message);
    this.name = 'INaturalistUploadError';
  }
}

// ─── Helpers privados ─────────────────────────────────────────────────────────

/**
 * Extrae la extensión de un URI de imagen.
 * Maneja URIs con query params y sin extensión (caso frecuente en cámara Android).
 *
 * @returns extensión sin punto (ej: "jpg"), o cadena vacía si no se puede determinar
 */
function extractExtension(uri: string): string {
  // Quitar query params antes de analizar la extensión
  const cleanUri = uri.split('?')[0];
  const parts = cleanUri.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Construye el payload Darwin Core para la creación de la observación.
 *
 * Campos importantes según la API v1 de iNaturalist:
 * - `observed_on_string`: fecha + hora completa en formato legible
 *   Ejemplos válidos: "2024-01-03 14:30:00", "2024-01-03"
 *   ⚠️  `time_observed_at` NO existe como campo en el body JSON v1 — causa 422
 * - `time_zone`: zona horaria del dispositivo para interpretar la fecha correctamente
 * - Las coordenadas son opcionales; sin ellas iNaturalist acepta el avistamiento
 *   pero lo marca con calidad de datos reducida.
 *
 * @param obs - Observación local con todos los datos recolectados
 * @returns Payload listo para POST /observations
 */
function buildObservationPayload(
  obs: LocalObservation
): INaturalistObservationPayload {
  const date = new Date(obs.observed_at);

  // iNaturalist acepta "YYYY-MM-DD HH:MM:SS" en el campo observed_on_string.
  // Usamos la hora local del dispositivo (el token ya lleva user_id para la zona horaria).
  const pad = (n: number) => String(n).padStart(2, '0');
  const observedOnString = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

  // Prioriza nombre científico (más preciso para iNaturalist) sobre la etiqueta del modelo local
  const speciesGuess =
    obs.scientific_name ?? obs.species_guess ?? 'Unknown species';

  const payload: INaturalistObservationPayload = {
    observation: {
      species_guess: speciesGuess,
      observed_on_string: observedOnString,
      captive_cultivated: false,
      description: obs.confidence !== null
        ? `Identificado con BioLife IA. Confianza: ${(obs.confidence * 100).toFixed(1)}%`
        : 'Identificado con BioLife IA.',
    },
  };

  // Solo incluir coordenadas si están disponibles
  if (obs.latitude !== null && obs.longitude !== null) {
    payload.observation.latitude = obs.latitude;
    payload.observation.longitude = obs.longitude;
    payload.observation.positional_accuracy = obs.accuracy
      ? Math.round(obs.accuracy)
      : null;
  }

  return payload;
}

/**
 * Serializa el body de error de iNaturalist a un string legible.
 * La API puede devolver el campo `errors` como array, objeto o string.
 *
 * @param errorBody - Body JSON parseado de la respuesta de error
 * @returns String con el detalle del error
 */
function serializeErrorDetail(errorBody: unknown): string {
  if (!errorBody || typeof errorBody !== 'object') return String(errorBody ?? '');
  const body = errorBody as Record<string, unknown>;

  if (body.errors) {
    if (Array.isArray(body.errors)) {
      return body.errors
        .map((e) => (typeof e === 'object' ? JSON.stringify(e) : String(e)))
        .join(', ');
    }
    if (typeof body.errors === 'object') {
      // Objeto { campo: [mensajes] }
      return Object.entries(body.errors as Record<string, unknown>)
        .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : String(msgs)}`)
        .join(' | ');
    }
    return String(body.errors);
  }
  if (body.error) return String(body.error);
  return JSON.stringify(errorBody).slice(0, 300);
}


// ─── API Calls ────────────────────────────────────────────────────────────────

/**
 * Crea la observación en iNaturalist y retorna el ID remoto.
 *
 * La autenticación usa JWT sin el prefijo "Bearer" según la documentación
 * oficial de iNaturalist API v1.
 *
 * @param obs - Datos del avistamiento local
 * @param apiToken - JWT token de iNaturalist del usuario autenticado
 * @returns ID numérico del avistamiento creado en iNaturalist
 * @throws INaturalistUploadError con step='create_observation' si falla
 */
async function createINaturalistObservation(
  obs: LocalObservation,
  apiToken: string
): Promise<number> {
  const payload = buildObservationPayload(obs);

  let response: Response;
  try {
    response = await fetch(`${INAT_API_BASE}/observations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiToken,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    throw new INaturalistUploadError(
      'Sin conexión a iNaturalist. Verifica tu internet e intenta de nuevo.',
      undefined,
      networkError instanceof Error ? networkError.message : String(networkError),
      'create_observation'
    );
  }

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errorBody = await response.json();
      errorDetail = serializeErrorDetail(errorBody);
    } catch {
      // No parseable — usamos statusText
    }

    throw new INaturalistUploadError(
      `Error al crear la observación en iNaturalist (HTTP ${response.status})`,
      response.status,
      errorDetail,
      'create_observation'
    );
  }

  const data = await response.json();
  // La API v1 devuelve { total_results, results: [...] }
  const created: INaturalistObservationResponse = data.results?.[0] ?? data;

  if (!created?.id) {
    throw new INaturalistUploadError(
      'iNaturalist no retornó un ID de observación válido.',
      response.status,
      JSON.stringify(data).slice(0, 200),
      'create_observation'
    );
  }

  return created.id;
}

/**
 * Sube la foto de la observación a iNaturalist.
 * DEBE llamarse después de crear la observación para vincular la foto.
 *
 * Nota: Expo Camera produce URIs sin extensión en algunos dispositivos Android.
 * Siempre asumimos JPEG ya que `takePictureAsync()` solo produce JPEG.
 *
 * @param observationId - ID remoto de iNaturalist
 * @param imagePath - Ruta local del archivo de imagen
 * @param apiToken - JWT token de iNaturalist
 * @throws INaturalistUploadError con step='upload_photo' si falla
 */
async function uploadObservationPhoto(
  observationId: number,
  imagePath: string,
  apiToken: string
): Promise<void> {
  // Determinar MIME type real. La cámara de Expo siempre produce JPEG.
  // Si no hay extensión reconocida, asumimos JPEG para no bloquear el upload.
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'tif', 'tiff', 'webp'];
  const ext = extractExtension(imagePath);
  const mimeType = allowedExtensions.includes(ext)
    ? `image/${ext === 'jpg' ? 'jpeg' : ext}`
    : 'image/jpeg'; // Fallback seguro para cámara nativa

  const uri = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;

  const photoFormData = new FormData();
  photoFormData.append('observation_photo[observation_id]', String(observationId));
  photoFormData.append('file', {
    uri,
    type: mimeType,
    name: `observation_${observationId}.jpg`,
  } as unknown as Blob);

  let photoResponse: Response;
  try {
    photoResponse = await fetch(`${INAT_API_BASE}/observation_photos`, {
      method: 'POST',
      headers: {
        // No poner Content-Type manual en multipart — fetch lo establece con boundary correcto
        Authorization: apiToken,
      },
      body: photoFormData,
    });
  } catch (networkError) {
    throw new INaturalistUploadError(
      'Sin conexión al subir la foto. La observación fue creada pero sin imagen.',
      undefined,
      networkError instanceof Error ? networkError.message : String(networkError),
      'upload_photo'
    );
  }

  if (!photoResponse.ok) {
    let errorDetail = photoResponse.statusText;
    try {
      const errorBody = await photoResponse.json();
      errorDetail = serializeErrorDetail(errorBody);
    } catch {
      // No parseable
    }

    throw new INaturalistUploadError(
      `La observación se creó pero falló al subir la foto (HTTP ${photoResponse.status})`,
      photoResponse.status,
      errorDetail,
      'upload_photo'
    );
  }
}

// ─── Función principal exportada ──────────────────────────────────────────────

/**
 * Sube un avistamiento completo a iNaturalist:
 * 1. Crea la observación con metadatos Darwin Core
 * 2. Adjunta la foto al avistamiento creado
 *
 * Si no hay coordenadas GPS, el avistamiento se sube igualmente pero
 * iNaturalist lo marcará sin ubicación (calidad de datos reducida).
 *
 * @param obs - Observación local con todos los datos recolectados
 * @param apiToken - JWT token de iNaturalist obtenido del perfil del usuario
 * @returns ID del avistamiento en iNaturalist tras subida exitosa
 * @throws INaturalistUploadError con mensaje amigable y `step` para diagnóstico
 *
 * @example
 * ```typescript
 * try {
 *   const inatId = await uploadToINaturalist(obs, INAT_API_TOKEN);
 *   markAsSynced(obs.id!, inatId);
 * } catch (err) {
 *   if (err instanceof INaturalistUploadError) {
 *     markSyncError(obs.id!, `[${err.step}] ${err.message}`);
 *   }
 * }
 * ```
 */
export async function uploadToINaturalist(
  obs: LocalObservation,
  apiToken: string
): Promise<number> {
  if (!apiToken) {
    throw new INaturalistUploadError(
      'Token de iNaturalist no configurado.',
      undefined,
      undefined,
      'validation'
    );
  }

  const observationId = await createINaturalistObservation(obs, apiToken);
  await uploadObservationPhoto(observationId, obs.image_path, apiToken);

  return observationId;
}
