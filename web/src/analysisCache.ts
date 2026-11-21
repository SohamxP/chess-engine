import type { PositionEvaluation } from './review';

/**
 * Evaluation cache intentionally has its own schema/version.
 * Increment CACHE_NAMESPACE when the Stockfish binary, score handling or
 * UCI options change; never mix results from incompatible analysis settings.
 */
export const CACHE_NAMESPACE = 'stockfish-19-lite-v2';
export const MAX_CACHE_POSITIONS = 2400;
const DB_NAME = 'plyforge-analysis-cache-v1';
const STORE_NAME = 'positions';
const MEMORY_LIMIT = 240;
const memory = new Map<string, PositionEvaluation>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
let writesSincePrune = 0;

interface StoredEvaluation {
  key: string;
  evaluation: PositionEvaluation;
  storedAt: number;
}

export function evaluationCacheKey(fen: string, requestedDepth: number): string {
  // Keep the full FEN: halfmove clock affects draw/50-move evaluations.
  return CACHE_NAMESPACE + '|hash8|depth' + requestedDepth + '|' + fen;
}

export function cacheableEvaluation(value: unknown, requestedDepth: number): value is PositionEvaluation {
  if (!value || typeof value !== 'object') return false;
  const score = value as Partial<PositionEvaluation>;
  return Number.isInteger(score.depth) && (score.depth ?? 0) >= requestedDepth &&
    ((typeof score.cp === 'number' && Number.isFinite(score.cp) && score.mate === null) ||
      (typeof score.mate === 'number' && Number.isFinite(score.mate) && score.cp === null)) &&
    (score.bestMove === null ||
      (typeof score.bestMove === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(score.bestMove)));
}

function remember(key: string, evaluation: PositionEvaluation): void {
  memory.delete(key);
  memory.set(key, evaluation);
  if (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
}

function database(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbPromise = new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('storedAt', 'storedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** Database failures never block analysis. The short-lived memory cache still works. */
export async function readCachedEvaluation(
  fen: string, depth: number,
): Promise<PositionEvaluation | null> {
  const key = evaluationCacheKey(fen, depth);
  const inMemory = memory.get(key);
  if (cacheableEvaluation(inMemory, depth)) return inMemory;
  const db = await database();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const value: unknown = (req.result as StoredEvaluation | undefined)?.evaluation;
        if (cacheableEvaluation(value, depth)) {
          remember(key, value);
          resolve(value);
        } else resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Read a complete game's positions in one readonly transaction. The insights
 * dashboard never starts Stockfish: it only displays analysis already done.
 * Missing/corrupt scores are absent from the result map.
 */
export async function readCachedEvaluationBatch(
  fens: string[], depths: number[],
): Promise<Map<string, PositionEvaluation>> {
  const result = new Map<string, PositionEvaluation>();
  const missing = new Map<string, number>();
  for (const fen of fens) {
    for (const depth of depths) {
      const key = evaluationCacheKey(fen, depth);
      const value = memory.get(key);
      if (cacheableEvaluation(value, depth)) result.set(key, value);
      else missing.set(key, depth);
    }
  }
  if (!missing.size) return result;
  const db = await database();
  if (!db) return result;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
      for (const [key, depth] of missing.entries()) {
        const req = store.get(key);
        req.onsuccess = () => {
          const value: unknown = (req.result as StoredEvaluation | undefined)?.evaluation;
          if (cacheableEvaluation(value, depth)) {
            result.set(key, value);
            remember(key, value);
          }
        };
        req.onerror = () => { /* One missing entry cannot block the report. */ };
      }
    } catch {
      resolve();
    }
  });
  return result;
}

/** IndexedDB persists between reloads; storage errors degrade to memory only. */
export async function saveCachedEvaluation(
  fen: string, depth: number, evaluation: PositionEvaluation,
): Promise<void> {
  if (!cacheableEvaluation(evaluation, depth)) return;
  const key = evaluationCacheKey(fen, depth);
  remember(key, evaluation);
  const db = await database();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      // Wait for COMMIT, not the request's success, so a reload immediately
      // after the UI reports completion cannot discard the last checkpoint.
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
      tx.objectStore(STORE_NAME)
        .put({ key, evaluation, storedAt: Date.now() } satisfies StoredEvaluation);
    } catch {
      resolve();
    }
  });
  if (++writesSincePrune >= 36) {
    writesSincePrune = 0;
    await pruneCachedEvaluations(db);
  }
}

/** Cursor trims the oldest entries, without loading all cached positions into JS. */
async function pruneCachedEvaluations(db: IDBDatabase): Promise<void> {
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const counter = store.count();
      counter.onsuccess = () => {
        let excess = Math.max(0, counter.result - MAX_CACHE_POSITIONS);
        if (!excess) return;
        const cursor = store.index('storedAt').openCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (item && excess > 0) {
            store.delete(item.primaryKey);
            excess--;
            item.continue();
          }
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Portable, versioned analysis entries for local JSON backup/restore. */
export interface PortableAnalysisEntry {
  key: string;
  evaluation: PositionEvaluation;
  storedAt: number;
}

export function validPortableAnalysisEntry(value: unknown): value is PortableAnalysisEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PortableAnalysisEntry>;
  if (typeof entry.key !== 'string' || !entry.key.startsWith(CACHE_NAMESPACE + '|hash8|depth') ||
      !Number.isFinite(entry.storedAt) || (entry.storedAt ?? 0) < 0) return false;
  const prefix = CACHE_NAMESPACE + '|hash8|depth';
  const remainder = entry.key.slice(prefix.length);
  const separator = remainder.indexOf('|');
  if (separator < 0) return false;
  const depthText = remainder.slice(0, separator);
  const depth = Number(depthText);
  return /^[1-9][0-9]*$/.test(depthText) && Number.isSafeInteger(depth) && depth <= 50 &&
    remainder.slice(separator + 1).length > 0 &&
    cacheableEvaluation(entry.evaluation, depth);
}

/** Export all durable cached evaluations without mutating their LRU order. */
export async function exportCachedEvaluations(): Promise<PortableAnalysisEntry[]> {
  const db = await database();
  if (!db) return []; // No durable cache; transient memory is not a backup.
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(
        (req.result as unknown[]).filter(validPortableAnalysisEntry)
          .sort((a, b) => b.storedAt - a.storedAt).slice(0, MAX_CACHE_POSITIONS));
      req.onerror = () => reject(req.error ?? new Error('Could not read analysis cache'));
    } catch (error) { reject(error); }
  });
}

/** Import only missing keys. Never overwrite newer analysis already on the device. */
export async function importCachedEvaluations(entries: PortableAnalysisEntry[]): Promise<number> {
  if (!entries.every(validPortableAnalysisEntry) || entries.length > MAX_CACHE_POSITIONS) {
    throw new Error('Backup contains unsupported cached evaluations');
  }
  if (!entries.length) return 0;
  const db = await database();
  if (!db) throw new Error('IndexedDB is unavailable for restoring analysis scores');
  let added = 0;
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Analysis cache restore failed'));
      tx.onabort = () => reject(tx.error ?? new Error('Analysis cache restore aborted'));
      for (const entry of entries) {
        const exists = store.getKey(entry.key);
        exists.onsuccess = () => {
          if (exists.result === undefined) {
            store.put(entry);
            added++;
          }
        };
      }
    } catch (error) { reject(error); }
  });
  await pruneCachedEvaluations(db);
  return added;
}

/** Used by tests to prove in-process cache invalidation without browser APIs. */
export function clearMemoryAnalysisCache(): void {
  memory.clear();
}
