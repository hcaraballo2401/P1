/**
 * Contratos de la API BioLife — Interfaz TypeScript.
 *
 * Estas interfaces mapean EXACTAMENTE el schema Pydantic del backend FastAPI.
 * Si se modifica el backend (schemas.py), este archivo DEBE actualizarse.
 *
 * Referencia backend: src/api/identificacion/schemas.py
 */

/** Especie candidata retornada por el modelo de IA. */
export interface CandidatoEspecie {
  /** Nombre de la especie/categoría (en inglés, tal como lo reporta el modelo HF). */
  etiqueta: string;
  /** Score de confianza del modelo entre 0.0 y 1.0. */
  confianza: number;
}

/** Cuerpo POST /api/v1/identificacion/ficha-especie. */
export interface FichaEspecieRequest {
  taxon_id?: number | null;
  nombre_cientifico: string;
  nombre_comun?: string | null;
  resumen_base?: string | null;
}

/** Respuesta POST /api/v1/identificacion/ficha-especie. */
export interface FichaEspecieResponse {
  texto_ia: string;
}

/** Respuesta completa del endpoint POST /api/v1/identificacion/identificar. */
export interface IdentificacionResponse {
  /** Animal identificado con mayor confianza. */
  especie_principal: CandidatoEspecie;
  /** Otras especies posibles, ordenadas por confianza descendente. */
  alternativas: CandidatoEspecie[];
  /**
   * True si la confianza del resultado principal es menor al umbral configurado.
   * La app debe mostrar una advertencia visual al usuario.
   */
  requiere_revision_humana: boolean;
  /** Identificador del modelo HuggingFace utilizado (para trazabilidad científica). */
  modelo_usado: string;
}

/** Registro local de un avistamiento guardado por el usuario. */
export interface ObservacionLocal {
  /** UUID generado en el frontend para identificar el avistamiento. */
  id: string;
  /** Especie principal identificada. */
  especie: CandidatoEspecie;
  /** Alternativas retornadas por la IA. */
  alternativas: CandidatoEspecie[];
  /** Indica si la IA requirió revisión humana. */
  requiereRevision: boolean;
  /** Modelo de IA utilizado. */
  modeloUsado: string;
  /** Timestamp ISO 8601 del momento de la captura. */
  fechaCaptura: string;
  /** Ruta local de la imagen capturada (file://...). */
  rutaImagen?: string;
  /** Si el usuario marcó esta observación como favorita. */
  esFavorita: boolean;
}

/** Agrupación de especies por categoría para el filtro de Discover. */
export type CategoriaEspecie =
  | 'Todas'
  | 'Aves'
  | 'Mamíferos'
  | 'Reptiles'
  | 'Anfibios'
  | 'Peces'
  | 'Insectos'
  | 'Otros';
