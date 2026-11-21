import { describe, expect, it } from 'vitest';
import { startingFen, type GameState } from './chess';
import { parseLibraryBackup, MAX_BACKUP_BYTES, MAX_LIBRARY_GAMES } from './gameLibrary';
import { addPgnSelections } from './pgnImport';
import type { ArchivedGame } from './archive';
import type { ParsedPgn } from './pgnImport';

const when = '2026-11-21T04:00:00.000Z';
function game(id: string): GameState {
  return {
    id, fen: startingFen, initialFen: startingFen, status: 'IMPORTED_UNFINISHED',
    whiteToMove: true, inCheck: false, humanWhite: true, depth: 1,
    aiTurn: false, canUndo: false, canClaimThreefold: false, canClaimFifty: false,
    legalMoves: [], lastMove: null, aiStats: null, moveHistory: [],
  };
}
function archived(id: string): ArchivedGame {
  return { id, savedAt: when, game: game(id) };
}
function backup(games: ArchivedGame[] = [archived('g1')]) {
  return {
    kind: 'plysense-local-backup', version: 1, exportedAt: when,
    games, practiceCards: [], evaluations: [],
  };
}

describe('portable game library backup integrity', () => {
  it('round-trips a library larger than the old 50-game limit', () => {
    const library = Array.from({ length: 70 }, (_, i) => archived('game-' + i));
    const parsed = parseLibraryBackup(JSON.stringify(backup(library)));
    expect(parsed.games).toHaveLength(70);
    expect(parsed.games.map(row => row.id)).toEqual(library.map(row => row.id));
    expect(MAX_LIBRARY_GAMES).toBeGreaterThan(50);
  });

  it('refuses invalid JSON, versions and incomplete documents before writing anything', () => {
    expect(() => parseLibraryBackup('bad-json')).toThrow('not valid JSON');
    expect(() => parseLibraryBackup(JSON.stringify({ ...backup(), version: 2 })))
      .toThrow('Unsupported backup');
    expect(() => parseLibraryBackup(JSON.stringify({ ...backup(), practiceCards: undefined })))
      .toThrow('Unsupported backup');
    expect(() => parseLibraryBackup(JSON.stringify({ ...backup(), evaluations: 'wrong type' })))
      .toThrow('Unsupported backup');
    expect(() => parseLibraryBackup(' '.repeat(MAX_BACKUP_BYTES + 1)))
      .toThrow('50 MB');
  });

  it('refuses duplicate IDs, invalid FEN and corrupt moves', () => {
    expect(() => parseLibraryBackup(JSON.stringify(backup([
      archived('same'), archived('same'),
    ])))).toThrow('invalid or duplicated');
    expect(() => parseLibraryBackup(JSON.stringify(backup([
      { ...archived('bad'), game: { ...game('bad'), fen: 'not a fen' } },
    ])))).toThrow('invalid or duplicated');
    expect(() => parseLibraryBackup(JSON.stringify(backup([
      { ...archived('bad'), game: { ...game('bad'), moveHistory: [
        { ply: 1, ai: false, white: true, san: 'e4',
          uci: 'bad', fen: startingFen },
      ] } },
    ])))).toThrow('invalid or duplicated');
  });

  it('rejects poisoned analysis keys and allows valid typed entries', () => {
    const sample = {
      key: 'stockfish-19-lite-v2|hash8|depth10|' + startingFen,
      evaluation: { cp: 35, mate: null, depth: 10, bestMove: 'e2e4' },
      storedAt: Date.now(),
    };
    expect(parseLibraryBackup(JSON.stringify({
      ...backup(), evaluations: [sample],
    })).evaluations).toHaveLength(1);
    expect(() => parseLibraryBackup(JSON.stringify({
      ...backup(), evaluations: [{ ...sample, key: 'wrong-engine|' + startingFen }],
    }))).toThrow('invalid or duplicated');
  });

  it('permits a larger library without changing legacy 50-game import defaults', () => {
    const source = { kind: 'pgn' as const, white: 'A', black: 'B', event: 'E',
      site: 'S', date: 'D', round: 'R' };
    const make = (id: string, uci: string): ParsedPgn => ({ source, game: {
      ...game(id),
      moveHistory: [{ ply: 1, white: true, ai: false, uci,
        san: 'e4', fen: startingFen }],
    } });
    const choices = ['e2e4', 'd2d4', 'g1f3'].map((uci, i) => ({
      parsed: make('new-' + i, uci), humanWhite: true,
    }));
    const existing = Array.from({ length: 50 }, (_, i) => archived('existing-' + i));
    const legacy = addPgnSelections(existing, choices);
    expect(legacy.full).toBe(3);
    const scalable = addPgnSelections(existing, choices, new Date(when), MAX_LIBRARY_GAMES);
    expect(scalable.imported).toBe(3);
    expect(scalable.games).toHaveLength(53);
  });
});
