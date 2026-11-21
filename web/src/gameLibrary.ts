import { Chess } from 'chess.js';
import { ARCHIVE_KEY, readArchive, validArchive, type ArchivedGame } from './archive';
import { addPgnSelections, type PgnSelection, type PgnImportResult } from './pgnImport';
import { readPracticeCards, validCard, writePracticeCards, type PracticeCard } from './practice';
import { exportCachedEvaluations, importCachedEvaluations, validPortableAnalysisEntry,
  MAX_CACHE_POSITIONS, type PortableAnalysisEntry } from './analysisCache';
import type { GameState } from './chess';

export const MAX_LIBRARY_GAMES = 2000;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const DB_NAME = 'plysense-game-library-v1';
const GAMES = 'games';
const META = 'metadata';
const LEGACY = 'legacy-fingerprint';
const BACKUP_KIND = 'plysense-local-backup';
let databasePromise: Promise<IDBDatabase> | null = null;
let pending: Promise<unknown> = Promise.resolve();

export interface LibraryBackup {
  kind: typeof BACKUP_KIND;
  version: 1;
  exportedAt: string;
  games: ArchivedGame[];
  practiceCards: PracticeCard[];
  evaluations: PortableAnalysisEntry[];
}

export interface RestoreSummary {
  games: ArchivedGame[];
  gamesImported: number;
  gamesSkipped: number;
  cardsImported: number;
  evaluationsImported: number;
}

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const result = pending.then(task, task);
  pending = result.then(() => undefined, () => undefined);
  return result;
}

function openDb(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable. Existing localStorage games have not been removed.'));
  }
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(GAMES)) {
          const games = db.createObjectStore(GAMES, { keyPath: 'id' });
          games.createIndex('savedAt', 'savedAt');
        }
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          databasePromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error('Could not open game library'));
      req.onblocked = () => reject(new Error('Close other PlySense tabs to upgrade your game library.'));
    } catch (error) { reject(error); }
  }).catch(error => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

function fingerprint(raw: string): string {
  // The complete raw archive remains in localStorage as the original backup.
  // The hash only detects whether another old tab has changed that archive.
  let a = 2166136261, b = 0x9e3779b9;
  for (let i = 0; i < raw.length; i++) {
    a = Math.imul(a ^ raw.charCodeAt(i), 16777619) >>> 0;
    b = Math.imul(b ^ raw.charCodeAt(i), 16777619) >>> 0;
  }
  return raw.length + ':' + a.toString(16) + ':' + b.toString(16);
}

/** Import unmodified legacy localStorage games, atomically with the marker. */
async function migrateLegacy(db: IDBDatabase): Promise<void> {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(ARCHIVE_KEY); } catch {
    // If storage is disabled, previously imported IndexedDB games remain usable.
  }
  if (!raw) return;
  const mark = fingerprint(raw);
  const legacy = readArchive(); // Uses existing strict saved-game validation.
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction([GAMES, META], 'readwrite');
      const games = tx.objectStore(GAMES), meta = tx.objectStore(META);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Legacy game migration failed'));
      tx.onabort = () => reject(tx.error ?? new Error('Legacy game migration aborted'));
      const request = meta.get(LEGACY);
      request.onsuccess = () => {
        if ((request.result as { fingerprint?: string } | undefined)?.fingerprint === mark) return;
        const keys = games.getAllKeys();
        keys.onsuccess = () => {
          const existing = new Set(keys.result.map(String));
          for (const item of legacy) {
            if (!existing.has(item.id)) {
              games.put(item);
              existing.add(item.id);
            }
          }
          // Only checkpoint after all required puts are queued in one transaction.
          meta.put({ key: LEGACY, fingerprint: mark });
        };
      };
    } catch (error) { reject(error); }
  });
}

function canonical(items: unknown[]): ArchivedGame[] {
  const unique = new Set<string>();
  return items.filter(validArchive)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .filter(item => {
      if (unique.has(item.id)) return false;
      unique.add(item.id);
      return true;
    });
}

async function listDb(db: IDBDatabase): Promise<ArchivedGame[]> {
  return new Promise((resolve, reject) => {
    try {
      const request = db.transaction(GAMES, 'readonly').objectStore(GAMES).getAll();
      request.onsuccess = () => resolve(canonical(request.result as unknown[]));
      request.onerror = () => reject(request.error ?? new Error('Could not read saved games'));
    } catch (error) { reject(error); }
  });
}

/** All consumers share one serialized migration/write boundary. */
export function loadGameLibrary(): Promise<ArchivedGame[]> {
  return serialized(async () => {
    const db = await openDb();
    await migrateLegacy(db);
    return listDb(db);
  });
}

function applyChanges(db: IDBDatabase, add: ArchivedGame[], remove: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(GAMES, 'readwrite'), store = tx.objectStore(GAMES);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save game library'));
      tx.onabort = () => reject(tx.error ?? new Error('Game library save was aborted'));
      for (const id of remove) store.delete(id);
      for (const item of add) store.put(item);
    } catch (error) { reject(error); }
  });
}

/** Serialize game snapshots with concurrent PGN imports and removals. */
export function saveGameSnapshot(game: GameState, now = new Date()): Promise<ArchivedGame[]> {
  return serialized(async () => {
    const db = await openDb();
    await migrateLegacy(db);
    const before = await listDb(db);
    if (!game.id || (game.moveHistory.length === 0 && game.status === 'IN_PROGRESS')) return before;
    const item: ArchivedGame = { id: game.id, savedAt: now.toISOString(), game };
    if (!validArchive(item)) throw new Error('Game snapshot was invalid; it was not saved');
    if (!before.some(record => record.id === item.id) && before.length >= MAX_LIBRARY_GAMES) {
      throw new Error('Game library limit reached. Back up or remove games before continuing.');
    }
    await applyChanges(db, [item]);
    return listDb(db);
  });
}

export function importLibraryPgn(choices: PgnSelection[]): Promise<PgnImportResult> {
  return serialized(async () => {
    const db = await openDb();
    await migrateLegacy(db);
    const current = await listDb(db);
    const result = addPgnSelections(current, choices, new Date(), MAX_LIBRARY_GAMES);
    if (result.imported) {
      const known = new Set(current.map(item => item.id));
      await applyChanges(db, result.games.filter(item => !known.has(item.id)));
    }
    return { ...result, games: await listDb(db) };
  });
}

export function deleteLibraryGame(id: string): Promise<ArchivedGame[]> {
  return serialized(async () => {
    const db = await openDb();
    await migrateLegacy(db);
    await applyChanges(db, [], [id]);
    return listDb(db);
  });
}

export function parseLibraryBackup(text: string): LibraryBackup {
  if (new Blob([text]).size > MAX_BACKUP_BYTES) {
    throw new Error('Backup exceeds 50 MB; split your library into smaller exports.');
  }
  let candidate: unknown;
  try { candidate = JSON.parse(text); } catch { throw new Error('Backup is not valid JSON.'); }
  if (!candidate || typeof candidate !== 'object') throw new Error('Unsupported backup file.');
  const data = candidate as Partial<LibraryBackup>;
  if (data.kind !== BACKUP_KIND || data.version !== 1 ||
      typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt)) ||
      !Array.isArray(data.games) || data.games.length > MAX_LIBRARY_GAMES ||
      !Array.isArray(data.practiceCards) || data.practiceCards.length > 180 ||
      !Array.isArray(data.evaluations) || data.evaluations.length > MAX_CACHE_POSITIONS) {
    throw new Error('Unsupported backup version, structure or size.');
  }
  if (!data.games.every(validArchive) ||
      new Set(data.games.map(item => item.id)).size !== data.games.length ||
      !data.practiceCards.every(item => {
        if (!validCard(item)) return false;
        try { new Chess(item.fen); return true; } catch { return false; }
      }) ||
      new Set(data.practiceCards.map(item => item.id)).size !== data.practiceCards.length ||
      !data.evaluations.every(validPortableAnalysisEntry) ||
      new Set(data.evaluations.map(item => item.key)).size !== data.evaluations.length) {
    throw new Error('Backup contains invalid or duplicated saved data. Nothing was restored.');
  }
  return data as LibraryBackup;
}

export async function exportGameLibraryBackup(): Promise<string> {
  const games = await loadGameLibrary();
  const backup: LibraryBackup = {
    kind: BACKUP_KIND, version: 1, exportedAt: new Date().toISOString(),
    games, practiceCards: readPracticeCards(),
    evaluations: await exportCachedEvaluations(),
  };
  const text = JSON.stringify(backup, null, 2);
  if (new Blob([text]).size > MAX_BACKUP_BYTES) {
    throw new Error('Backup exceeds 50 MB. Reduce the library before exporting.');
  }
  return text;
}

/**
 * Restore is additive, never overwrites existing games/cards/analysis.
 * Validate the *entire* file before any write. Game records are committed
 * in one transaction; other browser stores are separate and may fail later.
 */
export function restoreGameLibraryBackup(text: string): Promise<RestoreSummary> {
  const backup = parseLibraryBackup(text);
  return serialized(async () => {
    const db = await openDb();
    await migrateLegacy(db);
    const before = await listDb(db);
    const known = new Set(before.map(item => item.id));
    const available = Math.max(0, MAX_LIBRARY_GAMES - before.length);
    const additions = backup.games.filter(item => !known.has(item.id)).slice(0, available);
    if (additions.length) await applyChanges(db, additions);
    const games = await listDb(db);
    const originalCards = readPracticeCards();
    const existingCards = new Set(originalCards.map(card => card.id));
    const extraCards = backup.practiceCards.filter(card => !existingCards.has(card.id))
      .slice(0, Math.max(0, 180 - originalCards.length));
    if (extraCards.length && !writePracticeCards([...originalCards, ...extraCards])) {
      throw new Error('Games restored, but Decision Lab storage is blocked. Existing cards are unchanged; retry after enabling storage.');
    }
    let evaluationsImported: number;
    try {
      evaluationsImported = await importCachedEvaluations(backup.evaluations);
    } catch {
      throw new Error('Games and cards restored, but the analysis cache could not be restored. Existing scores were not deleted.');
    }
    return {
      games, gamesImported: additions.length, gamesSkipped: backup.games.length - additions.length,
      cardsImported: extraCards.length, evaluationsImported,
    };
  });
}
