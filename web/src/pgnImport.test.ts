import { describe, expect, it } from 'vitest';
import { pgnForGame, readArchive, writeArchive, type ArchivedGame } from './archive';
import { resultScore, startingFen } from './chess';
import { addPgnSelections, parsePgnBatch, sameMainline, splitPgnGames } from './pgnImport';

const gameOne = `[Event "Evening Rapid"]
[Site "https://lichess.org/example1"]
[Date "2026.11.17"]
[Round "-"]
[White "Soham"]
[Black "Opponent"]
[Result "1-0"]

1. e4 {Claiming space} e5 2. Nf3 Nc6 (2... d6) 3. Bc4 Bc5 $1 1-0`;

const gameTwo = `[Event "Blitz"]
[Site "https://www.chess.com/game/live/10000"]
[Date "2026.11.18"]
[White "Opponent"]
[Black "Soham"]
[Result "0-1"]

1. d4 Nf6 2. c4 e6 0-1`;

function first(text = gameOne) {
  const preview = parsePgnBatch(text);
  expect(preview.errors).toEqual([]);
  expect(preview.games).toHaveLength(1);
  return preview.games[0];
}

describe('PGN import parser', () => {
  it('splits a Chess.com/Lichess-style multi-game archive without splitting variations', () => {
    const parts = splitPgnGames(gameOne + '\n\n' + gameTwo);
    expect(parts).toHaveLength(2);
    const result = parsePgnBatch(gameOne + '\n\n' + gameTwo);
    expect(result.errors).toEqual([]);
    expect(result.games).toHaveLength(2);
    expect(result.games[0].source.white).toBe('Soham');
    expect(result.games[1].source.black).toBe('Soham');
  });

  it('reconstructs server-compatible SAN, UCI and FEN snapshots from a legal mainline', () => {
    const parsed = first();
    const game = parsed.game;
    expect(game.initialFen).toBe(startingFen);
    expect(game.moveHistory.map(move => move.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']);
    expect(game.moveHistory.map(move => move.uci)).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5']);
    expect(game.moveHistory[0].fen).toContain(' b KQkq ');
    expect(game.fen).toBe(game.moveHistory.at(-1)?.fen);
    expect(game.moveHistory[0].ai).toBe(false);
    expect(game.aiTurn).toBe(false);
    expect(game.canUndo).toBe(false);
    expect(game.status).toBe('IMPORTED_WHITE_WIN');
    expect(resultScore(game)).toBe('1-0');
    expect(parsed.source.site).toBe('https://lichess.org/example1');
  });

  it('supports a black-to-move custom FEN and PGN re-export', () => {
    const input = `[Event "Endgame study"]
[White "Opponent"]
[Black "Soham"]
[SetUp "1"]
[FEN "4k3/8/8/8/8/8/8/4K3 b - - 0 12"]
[Result "*"]

12... Kd7 13. Kd2 *`;
    const parsed = first(input);
    expect(parsed.game.initialFen).toBe('4k3/8/8/8/8/8/8/4K3 b - - 0 12');
    expect(parsed.game.moveHistory.map(move => move.uci)).toEqual(['e8d7', 'e1d2']);
    expect(parsed.game.moveHistory.map(move => move.white)).toEqual([false, true]);
    expect(parsed.game.status).toBe('IMPORTED_UNFINISHED');
    expect(resultScore(parsed.game)).toBeNull();
    const output = pgnForGame(parsed.game, '2026-11-18T00:00:00Z', parsed.source);
    expect(output).toContain('[FEN "4k3/8/8/8/8/8/8/4K3 b - - 0 12"]');
    expect(output).toContain('[Black "Soham"]');
    expect(output).toContain('12... Kd7 13. Kd2 *');
    const roundTrip = first(output);
    expect(sameMainline(parsed.game, roundTrip.game)).toBe(true);
  });

  it('handles checkmate results without inventing a resignation', () => {
    const mate = first('1. f3 e5 2. g4 Qh4# 0-1').game;
    expect(mate.status).toBe('CHECKMATE');
    expect(resultScore(mate)).toBe('0-1');
    expect(mate.whiteToMove).toBe(true);
  });

  it('rejects nonstandard variants, illegal lines and empty records without losing valid games', () => {
    const illegal = `[Event "Invalid"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 e5 2. Bh6 *`;
    const badVariant = `[Event "Chess960"]
[Variant "Chess960"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 e5 *`;
    const input = gameOne + '\n\n' + illegal + '\n\n' + badVariant + '\n\n' + gameTwo;
    const preview = parsePgnBatch(input);
    expect(preview.games).toHaveLength(2);
    expect(preview.errors).toHaveLength(2);
    expect(preview.errors.map(error => error.number)).toEqual([2, 3]);
    expect(preview.errors[1].message).toMatch(/standard chess/i);
    expect(parsePgnBatch('  ').games).toEqual([]);
    expect(parsePgnBatch('1. e4 e5 *').games).toHaveLength(1);
    expect(parsePgnBatch('1. e4 e5 2. Bh6').games).toEqual([]);
    expect(parsePgnBatch('x'.repeat(1_000_001)).errors).toHaveLength(1);
  });

  it('keeps repeated-game imports idempotent, even if player names or websites change', () => {
    const parsed = first();
    const selected = [{ parsed, humanWhite: false }];
    const original = addPgnSelections([], selected, new Date('2026-11-18T12:00:00Z'));
    expect(original.imported).toBe(1);
    expect(original.games[0].game.humanWhite).toBe(false);
    expect(original.games[0].source?.black).toBe('Opponent');
    const duplicate = addPgnSelections(original.games, selected);
    expect(duplicate.imported).toBe(0);
    expect(duplicate.duplicates).toBe(1);
    expect(duplicate.games).toEqual(original.games);
    // Different real matches can happen to follow the same mainline.
    // Their distinct source game URLs must not be collapsed into one game.
    const otherMatch = first(gameOne.replace('https://lichess.org/example1',
      'https://lichess.org/another-game'));
    expect(sameMainline(parsed.game, otherMatch.game)).toBe(true);
    expect(otherMatch.game.id).not.toBe(parsed.game.id);
    const separate = addPgnSelections(original.games, [{ parsed: otherMatch, humanWhite: true }]);
    expect(separate.imported).toBe(1);
    expect(separate.games).toHaveLength(2);
  });

  it('protects existing saved games when the 50-record archive is full', () => {
    const parsed = first();
    const stored: ArchivedGame[] = Array.from({ length: 50 }, (_, i) => ({
      id: 'existing-' + i,
      savedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      game: { ...parsed.game, id: 'existing-' + i,
        moveHistory: [{ ...parsed.game.moveHistory[0], uci: 'a2a' + i }] },
    }));
    const result = addPgnSelections(stored, [{ parsed, humanWhite: true }]);
    expect(result.imported).toBe(0);
    expect(result.full).toBe(1);
    expect(result.games).toHaveLength(50);
    expect(new Set(result.games.map(item => item.id)))
      .toEqual(new Set(stored.map(item => item.id)));
    expect(result.games.map(item => item.savedAt))
      .toEqual([...stored].map(item => item.savedAt).sort().reverse());
  });

  it('persists original PGN metadata through local-storage reloads', () => {
    const parsed = first();
    const result = addPgnSelections([], [{ parsed, humanWhite: true }]);
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
    };
    expect(writeArchive(result.games, storage)).toBe(true);
    const restored = readArchive(storage);
    expect(restored[0].source?.event).toBe('Evening Rapid');
    expect(restored[0].source?.white).toBe('Soham');
    expect(restored[0].game.moveHistory).toHaveLength(6);
    expect(restored[0].game.id).toBe(parsed.game.id);
  });
});
