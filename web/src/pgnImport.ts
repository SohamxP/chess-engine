import { Chess } from 'chess.js';
import { MAX_ARCHIVED_GAMES, type ArchivedGame, type PgnSource } from './archive';
import { startingFen, type GameState, type MoveEntry } from './chess';

export const MAX_PGN_CHARS = 1_000_000;
export const MAX_PGN_GAMES = 50;
export const MAX_PGN_PLIES = 500;

export interface ParsedPgn {
  game: GameState;
  source: PgnSource;
}

export interface PgnParseError {
  number: number;
  message: string;
}

export interface PgnPreview {
  games: ParsedPgn[];
  errors: PgnParseError[];
}

export interface PgnSelection {
  parsed: ParsedPgn;
  humanWhite: boolean;
}

export interface PgnImportResult {
  games: ArchivedGame[];
  imported: number;
  duplicates: number;
  full: number;
  collisions: number;
}

const headerLine = /^\s*\[[A-Za-z][A-Za-z0-9_]*\s+"(?:\\.|[^"\\])*"\]\s*$/;

/**
 * PGN archives separate games with new tag-pair blocks. A new header after
 * movetext starts a new game; headers belonging to the same game stay intact.
 * Headerless input is a single game. We do not split on a result token inside
 * a comment or variation (those can legitimately contain game endings).
 */
export function splitPgnGames(input: string): string[] {
  const sections: string[] = [];
  let lines: string[] = [];
  let hasMovetext = false;
  for (const line of input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
    const isHeader = headerLine.test(line);
    if (isHeader && hasMovetext) {
      const text = lines.join('\n').trim();
      if (text) sections.push(text);
      lines = [];
      hasMovetext = false;
    }
    lines.push(line);
    const trimmed = line.trim();
    if (trimmed && !isHeader && !/^%|^;/.test(trimmed) &&
        !/^\{[^}]*\}$/.test(trimmed)) hasMovetext = true;
  }
  const last = lines.join('\n').trim();
  if (last) sections.push(last);
  return sections;
}

function safeHeader(value: string | undefined, fallback: string): string {
  return value?.trim().slice(0, 150) || fallback;
}

// Two seeded FNV passes make an opaque, reproducible identifier. We still
// compare the entire move sequence for duplicate detection and reject hashes
// that collide with a different game; a hash alone is not a proof of identity.
function stableGameId(identity: string): string {
  function fnv(seed: number): string {
    let value = seed >>> 0;
    for (let i = 0; i < identity.length; i++) {
      value = Math.imul(value ^ identity.charCodeAt(i), 16777619) >>> 0;
    }
    return value.toString(16).padStart(8, '0');
  }
  return 'pgn-' + fnv(2166136261) + fnv(0x9e3779b9);
}

export function sameMainline(a: GameState, b: GameState): boolean {
  return (a.initialFen || startingFen) === (b.initialFen || startingFen) &&
    a.moveHistory.length === b.moveHistory.length &&
    a.moveHistory.every((move, i) => move.uci.toLowerCase() === b.moveHistory[i].uci.toLowerCase());
}

function parseOne(input: string): ParsedPgn {
  const chess = new Chess();
  chess.loadPgn(input);
  const headers = chess.getHeaders();
  const variant = headers.Variant?.trim().toLowerCase();
  if (variant && !['standard', 'chess', 'from position'].includes(variant)) {
    throw new Error('Only standard chess PGNs are supported (not Chess960 or other variants).');
  }

  const moves = chess.history({ verbose: true });
  if (!moves.length) throw new Error('No mainline moves were found.');
  if (moves.length > MAX_PGN_PLIES) {
    throw new Error('This game exceeds the 500-half-move import limit.');
  }
  const initialFen = moves[0].before;
  const moveHistory: MoveEntry[] = moves.map((move, i) => ({
    ply: i + 1,
    white: move.color === 'w',
    ai: false,
    uci: move.from + move.to + (move.promotion ?? ''),
    san: move.san,
    fen: move.after,
  }));
  const result = headers.Result ?? (chess.isCheckmate()
    ? chess.turn() === 'w' ? '0-1' : '1-0'
    : '*');
  if (!['1-0', '0-1', '1/2-1/2', '*'].includes(result)) {
    throw new Error('The PGN has an unsupported result.');
  }
  if (chess.isCheckmate() && result !== (chess.turn() === 'w' ? '0-1' : '1-0')) {
    throw new Error('Result contradicts the checkmate on the board.');
  }
  const status = chess.isCheckmate() ? 'CHECKMATE'
    : result === '1-0' ? 'IMPORTED_WHITE_WIN'
    : result === '0-1' ? 'IMPORTED_BLACK_WIN'
    : result === '1/2-1/2' ? 'IMPORTED_DRAW'
    : 'IMPORTED_UNFINISHED';
  const source: PgnSource = {
    kind: 'pgn',
    white: safeHeader(headers.White, 'White'),
    black: safeHeader(headers.Black, 'Black'),
    event: safeHeader(headers.Event, 'Imported game'),
    site: safeHeader(headers.Site, '-'),
    date: safeHeader(headers.Date, '????.??.??'),
    round: safeHeader(headers.Round, '-'),
  };
  const identity = initialFen + '|' + moveHistory.map(move => move.uci).join(',');
  const game: GameState = {
    id: stableGameId(identity),
    initialFen,
    fen: chess.fen(),
    status,
    whiteToMove: chess.turn() === 'w',
    inCheck: chess.inCheck(),
    humanWhite: true, // Explicit user choice is collected in the import preview.
    depth: 0,
    aiTurn: false,
    canUndo: false,
    canClaimThreefold: false,
    canClaimFifty: false,
    legalMoves: [],
    moveHistory,
    lastMove: moves.length ? {
      from: moves[moves.length - 1].from,
      to: moves[moves.length - 1].to,
      promotion: moves[moves.length - 1].promotion?.toUpperCase() ?? null,
    } : null,
    aiStats: null,
  };
  return { game, source };
}

/** No network requests: chess.js checks SAN and reconstructs each FEN locally. */
export function parsePgnBatch(text: string): PgnPreview {
  if (!text.trim()) return { games: [], errors: [{ number: 1, message: 'Paste PGN text or choose a .pgn file.' }] };
  if (text.length > MAX_PGN_CHARS) {
    return { games: [], errors: [{ number: 1, message: 'PGN exceeds the 1,000,000-character limit. Import a smaller batch.' }] };
  }
  const sections = splitPgnGames(text);
  if (sections.length > MAX_PGN_GAMES) {
    return { games: [], errors: [{ number: 1, message: 'Batch exceeds 50 games. Split it into smaller files.' }] };
  }
  const games: ParsedPgn[] = [];
  const errors: PgnParseError[] = [];
  for (const [index, section] of sections.entries()) {
    try {
      games.push(parseOne(section));
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : 'Unable to parse this game.';
      errors.push({ number: index + 1, message: raw.replace(/\s+/g, ' ').slice(0, 220) });
    }
  }
  return { games, errors };
}

/**
 * Import is transactional: this function does not write to browser storage.
 * Do not evict existing games when the 50-snapshot archive is full.
 */
export function addPgnSelections(
  existing: ArchivedGame[], choices: PgnSelection[], now = new Date(),
): PgnImportResult {
  const next = [...existing];
  let imported = 0, duplicates = 0, full = 0, collisions = 0;
  for (const { parsed, humanWhite } of choices) {
    if (next.some(item => sameMainline(item.game, parsed.game))) {
      duplicates++;
      continue;
    }
    if (next.some(item => item.id === parsed.game.id)) {
      collisions++;
      continue;
    }
    if (next.length >= MAX_ARCHIVED_GAMES) {
      full++;
      continue;
    }
    next.unshift({
      id: parsed.game.id,
      savedAt: new Date(now.getTime() + imported).toISOString(),
      game: { ...parsed.game, humanWhite },
      source: parsed.source,
    });
    imported++;
  }
  return {
    games: next.sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    imported, duplicates, full, collisions,
  };
}
