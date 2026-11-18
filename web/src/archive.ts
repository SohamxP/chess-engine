import { resultScore, startingFen, type GameState } from './chess';

export const ARCHIVE_KEY = 'openfile-chess-games-v1';
export const MAX_ARCHIVED_GAMES = 50;

export interface PgnSource {
  kind: 'pgn';
  white: string;
  black: string;
  event: string;
  site: string;
  date: string;
  round: string;
}

export interface ArchivedGame {
  id: string;
  savedAt: string;
  game: GameState;
  source?: PgnSource;
}

/**
 * A browser-local review archive, not a backend session store.
 * A game can be reviewed after Render restarts, but cannot be resumed there.
 */
export function upsertArchivedGame(
  current: ArchivedGame[], game: GameState, savedAt: string,
): ArchivedGame[] {
  if (!game.id || (game.moveHistory.length === 0 && game.status === 'IN_PROGRESS')) return current;
  const updated: ArchivedGame = { id: game.id, savedAt, game };
  return [updated, ...current.filter(item => item.id !== game.id)]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, MAX_ARCHIVED_GAMES);
}

function validSource(value: unknown): value is PgnSource {
  if (!value || typeof value !== 'object') return false;
  const source = value as Partial<PgnSource>;
  return source.kind === 'pgn' &&
    ['white', 'black', 'event', 'site', 'date', 'round']
      .every(key => typeof source[key as keyof PgnSource] === 'string');
}

function validArchive(value: unknown): value is ArchivedGame {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ArchivedGame>;
  const game = item.game;
  return typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.savedAt === 'string' &&
    !!game && typeof game === 'object' &&
    game.id === item.id &&
    (item.source === undefined || validSource(item.source)) &&
    typeof game.fen === 'string' &&
    typeof game.initialFen === 'string' &&
    typeof game.status === 'string' &&
    typeof game.humanWhite === 'boolean' &&
    Array.isArray(game.moveHistory) &&
    game.moveHistory.every(move => !!move && typeof move.ply === 'number' &&
      typeof move.san === 'string' && typeof move.uci === 'string' &&
      typeof move.fen === 'string');
}

export function readArchive(storage?: Pick<Storage, 'getItem'>): ArchivedGame[] {
  try {
    const store = storage ?? window.localStorage;
    const raw = store.getItem(ARCHIVE_KEY);
    if (!raw) return [];
    const result: unknown = JSON.parse(raw);
    if (!Array.isArray(result)) return [];
    return result.filter(validArchive)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .slice(0, MAX_ARCHIVED_GAMES);
  } catch {
    return [];
  }
}

/** Returns false when local storage is disabled or full, without hiding failures. */
export function writeArchive(games: ArchivedGame[], storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    (storage ?? window.localStorage).setItem(ARCHIVE_KEY, JSON.stringify(games));
    return true;
  } catch {
    return false;
  }
}

export function archiveGame(game: GameState, storage?: Storage, now = new Date()): {
  games: ArchivedGame[];
  saved: boolean;
} {
  const store = storage ?? window.localStorage;
  const existing = readArchive(store);
  if (game.moveHistory.length === 0 && game.status === 'IN_PROGRESS') {
    return { games: existing, saved: true };
  }
  const games = upsertArchivedGame(existing, game, now.toISOString());
  return { games, saved: writeArchive(games, store) };
}

export function removeArchivedGame(id: string, storage?: Storage): {
  games: ArchivedGame[]; saved: boolean;
} {
  const store = storage ?? window.localStorage;
  const games = readArchive(store).filter(item => item.id !== id);
  return { games, saved: writeArchive(games, store) };
}

/** Never interpolate unescaped PGN header values from imported files. */
function tagValue(value: string): string {
  return value.slice(0, 150).replace(/[\r\n]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function pgnForGame(game: GameState, date: string, source?: PgnSource): string {
  const result = resultScore(game) ?? '*';
  const dt = Number.isFinite(Date.parse(date)) ? new Date(date).toISOString().slice(0, 10).replaceAll('-', '.') : '????.??.??';
  const white = source?.white ?? (game.humanWhite ? 'You' : 'Computer');
  const black = source?.black ?? (game.humanWhite ? 'Computer' : 'You');
  const headers = [
    '[Event "' + tagValue(source?.event ?? 'PlyForge') + '"]',
    '[Site "' + tagValue(source?.site ?? 'https://openfile-chess.onrender.com') + '"]',
    '[Date "' + tagValue(source?.date ?? dt) + '"]',
    '[Round "' + tagValue(source?.round ?? '-') + '"]',
    '[White "' + tagValue(white) + '"]',
    '[Black "' + tagValue(black) + '"]',
    '[Result "' + result + '"]',
  ];
  if (game.initialFen && game.initialFen !== startingFen) {
    headers.push('[SetUp "1"]', '[FEN "' + game.initialFen + '"]');
  }
  const tokens: string[] = [];
  const initialParts = (game.initialFen || startingFen).split(' ');
  let number = Number(initialParts[5]) || 1;
  let whiteToMove = initialParts[1] !== 'b';
  for (const move of game.moveHistory) {
    // The server's SAN is authoritative and already includes check/capture notation.
    if (whiteToMove) tokens.push(number + '.');
    else if (tokens.length === 0) tokens.push(number + '...');
    tokens.push(move.san);
    if (!whiteToMove) number++;
    whiteToMove = !whiteToMove;
  }
  tokens.push(result);
  return headers.join('\n') + '\n\n' + tokens.join(' ') + '\n';
}

export function downloadPgn(game: GameState, savedAt = new Date().toISOString(), source?: PgnSource): void {
  const content = pgnForGame(game, savedAt, source);
  const blob = new Blob([content], { type: 'application/x-chess-pgn;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const day = savedAt.slice(0, 10);
  link.href = href;
  link.download = 'plyforge-' + day + '-' + game.id.slice(0, 8) + '.pgn';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
