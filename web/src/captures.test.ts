import { describe, expect, it } from 'vitest';
import { capturedMaterial, capturedGlyph } from './captures';
import { startingFen, type GameState, type MoveEntry } from './chess';

const entry = (uci: string, white: boolean, fen: string, ply: number): MoveEntry =>
  ({ uci, white, fen, ply, san: uci, ai: !white });

describe('captured piece strips', () => {
  it('updates both sides using FEN snapshots while navigating history', () => {
    const game = {
      initialFen: startingFen,
      fen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
      moveHistory: [
        entry('e2e4', true, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 1),
        entry('d7d5', false, 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', 2),
        entry('e4d5', true, 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2', 3),
      ],
    } as GameState;
    expect(capturedMaterial(game, 0)).toEqual({ byWhite: [], byBlack: [], advantage: 0 });
    expect(capturedMaterial(game, 2).byWhite).toEqual([]);
    expect(capturedMaterial(game, 3)).toEqual({
      byWhite: ['p'], byBlack: [], advantage: 1,
    });
    expect(capturedGlyph('p')).toBe('♟\\uFE0E');
  });

  it('detects en passant and never treats a promoting pawn as captured', () => {
    const ep = {
      initialFen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
      fen: '4k3/8/3P4/8/8/8/8/4K3 b - - 0 1',
      moveHistory: [entry('e5d6', true, '4k3/8/3P4/8/8/8/8/4K3 b - - 0 1', 1)],
    } as GameState;
    expect(capturedMaterial(ep).byWhite).toEqual(['p']);

    const promotion = {
      initialFen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
      fen: 'Q3k3/8/8/8/8/8/8/4K3 b - - 0 1',
      moveHistory: [entry('a7a8q', true, 'Q3k3/8/8/8/8/8/8/4K3 b - - 0 1', 1)],
    } as GameState;
    expect(capturedMaterial(promotion).byBlack).toEqual([]);
  });

  it('counts captured white pieces for Black even when White played first', () => {
    const game = {
      initialFen: '4k3/8/8/8/3p4/4P3/8/4K3 b - - 0 1',
      fen: '4k3/8/8/8/8/4p3/8/4K3 w - - 0 2',
      moveHistory: [entry('d4e3', false, '4k3/8/8/8/8/4p3/8/4K3 w - - 0 2', 1)],
    } as GameState;
    expect(capturedMaterial(game).byBlack).toEqual(['P']);
    expect(capturedMaterial(game).advantage).toBe(-1);
  });
});
