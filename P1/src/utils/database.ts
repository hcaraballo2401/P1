/**
 * @module database
 * @description Capa de acceso a datos para la base de datos SQLite local.
 *
 * Gestiona el ciclo de vida completo de los avistamientos (observaciones)
 * en el dispositivo, siguiendo el estándar Darwin Core para compatibilidad
 * con iNaturalist y modelos de IA externos.
 *
 * Arquitectura: este módulo actúa como la capa "Model" del patrón
 * Route → Controller → Service → Model.
 */

import * as SQLite from 'expo-sqlite';
import type {
  LocalObservation,
  NewObservationInput,
  SyncStatusValue,
} from '../types/observation';
import { SyncStatus } from '../types/observation';

// ─── Constantes ───────────────────────────────────────────────────────────────

const DB_NAME = 'biolife.db';
const TABLE_NAME = 'local_observations';

// ─── Instancia singleton ──────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

/**
 * Obtiene (o abre) la instancia singleton de la base de datos.
 * expo-sqlite v14+ usa la API synchronous por defecto.
 */
function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync(DB_NAME);
  }
  return _db;
}

// ─── Inicialización / Migración ───────────────────────────────────────────────

/**
 * Inicializa el esquema de la base de datos.
 * Debe llamarse una vez al arrancar la app (ej. en el _layout.tsx o al abrir la pantalla de cámara).
 *
 * La tabla `local_observations` es compatible con Darwin Core:
 * - latitude/longitude → decimalLatitude / decimalLongitude
 * - accuracy          → coordinateUncertaintyInMeters
 * - observed_at       → eventDate (ISO8601)
 * - scientific_name   → scientificName
 * - species_guess     → identificationRemarks
 */
export function initDatabase(): void {
  const db = getDb();

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id                INTEGER  PRIMARY KEY AUTOINCREMENT,
      image_path        TEXT     NOT NULL,
      latitude          REAL,
      longitude         REAL,
      accuracy          REAL,
      observed_at       TEXT     NOT NULL,
      species_guess     TEXT,
      scientific_name   TEXT,
      confidence        REAL,
      ai_raw_response   TEXT,
      sync_status       INTEGER  NOT NULL DEFAULT ${SyncStatus.PENDING},
      inaturalist_id    INTEGER,
      sync_error        TEXT
    );
  `);
}

// ─── Operaciones CRUD ─────────────────────────────────────────────────────────

/**
 * Inserta una nueva observación en la base de datos local.
 *
 * @param data - Datos del avistamiento (sin id ni campos post-sync)
 * @returns El id autoincremental asignado por SQLite
 * @throws Error si la inserción falla
 */
export function saveObservation(data: NewObservationInput): number {
  const db = getDb();

  const result = db.runSync(
    `INSERT INTO ${TABLE_NAME} (
      image_path, latitude, longitude, accuracy,
      observed_at, species_guess, scientific_name,
      confidence, ai_raw_response, sync_status,
      inaturalist_id, sync_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [
      data.image_path,
      data.latitude,
      data.longitude,
      data.accuracy,
      data.observed_at,
      data.species_guess,
      data.scientific_name,
      data.confidence,
      data.ai_raw_response,
      SyncStatus.PENDING,
    ]
  );

  return result.lastInsertRowId;
}

/**
 * Obtiene todas las observaciones con `sync_status = PENDING`.
 * Útil para la lógica de sincronización offline → online.
 *
 * @returns Array de observaciones pendientes de sincronización
 */
export function getPendingObservations(): LocalObservation[] {
  const db = getDb();
  return db.getAllSync<LocalObservation>(
    `SELECT * FROM ${TABLE_NAME} WHERE sync_status = ? ORDER BY observed_at DESC`,
    [SyncStatus.PENDING]
  );
}

/**
 * Obtiene todas las observaciones guardadas, ordenadas por fecha descendente.
 *
 * @returns Array completo de observaciones locales
 */
export function getAllObservations(): LocalObservation[] {
  const db = getDb();
  return db.getAllSync<LocalObservation>(
    `SELECT * FROM ${TABLE_NAME} ORDER BY observed_at DESC`
  );
}

/**
 * Obtiene una observación por su id local.
 *
 * @param id - ID local de SQLite
 * @returns La observación o null si no existe
 */
export function getObservationById(id: number): LocalObservation | null {
  const db = getDb();
  return db.getFirstSync<LocalObservation>(
    `SELECT * FROM ${TABLE_NAME} WHERE id = ?`,
    [id]
  );
}

/**
 * Marca una observación como sincronizada con iNaturalist.
 * Actualiza sync_status = SYNCED y guarda el id remoto.
 *
 * @param localId - ID local de SQLite
 * @param inaturalistId - ID asignado por iNaturalist tras la subida exitosa
 */
export function markAsSynced(localId: number, inaturalistId: number): void {
  const db = getDb();
  db.runSync(
    `UPDATE ${TABLE_NAME}
     SET sync_status = ?, inaturalist_id = ?, sync_error = NULL
     WHERE id = ?`,
    [SyncStatus.SYNCED, inaturalistId, localId]
  );
}

/**
 * Marca una observación con error de sincronización.
 *
 * @param localId - ID local de SQLite
 * @param errorMessage - Descripción del error para diagnóstico
 */
export function markSyncError(localId: number, errorMessage: string): void {
  const db = getDb();
  db.runSync(
    `UPDATE ${TABLE_NAME}
     SET sync_status = ?, sync_error = ?
     WHERE id = ?`,
    [SyncStatus.ERROR as SyncStatusValue, errorMessage, localId]
  );
}

/**
 * Elimina una observación por su id local.
 * Solo usar si el usuario decide descartar un avistamiento guardado.
 *
 * @param id - ID local de SQLite
 */
export function deleteObservation(id: number): void {
  const db = getDb();
  db.runSync(`DELETE FROM ${TABLE_NAME} WHERE id = ?`, [id]);
}
