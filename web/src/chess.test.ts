import { describe, expect, it } from 'vitest';
import {
  isLightSquare, kingSquare, moveNotation, parseFen, squareOrder,
  startingFen, statusLabel, resultScore, uciFor, type GameState,
} from './chess';

describe('chess UI board helpers', () => {
  it('places kings and queens on their correct starting squares', () => {
    const board = parseFen(startingFen);
    expect(board.e1).toBe('K');
    expect(board.d1).toBe('Q');
    expect(board.e8).toBe('k');
    expect(board.d8).toBe('q');
    expect(Object.values(board)).toHaveLength(32);
  });

  it('keeps h1 light and a1 dark', () => {
    expect(isLightSquare('h1')).toBe(true);
    expect(isLightSquare('a1')).toBe(false);
    expect(isLightSquare('a8')).toBe(true);
  });

  it('orients the board correctly for both colors', () => {
    const white = squareOrder(true);
    const black = squareOrder(false);
    expect(white).toHaveLength(64);
    expect(white[0]).toBe('a8');
    expect(white[63]).toBe('h1');
    expect(black[0]).toBe('h1');
    expect(black[63]).toBe('a8');
  });

  it('expands ranks and identifies the checked king', () => {
    const board = parseFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(board.e8).toBe('k');
    expect(board.e1).toBe('K');
    expect(Object.values(board)).toHaveLength(2);
    expect(kingSquare(board, true)).toBe('e1');
    expect(kingSquare(board, false)).toBe('e8');
  });

  it('rejects malformed positions', () => {
    expect(() => parseFen('8/8/8 w - - 0 1')).toThrow();
    expect(() => parseFen('9/8/8/8/8/8/8/8 w - - 0 1')).toThrow();
  });

  it('formats promotion and ordinary moves', () => {
    expect(moveNotation('e2e4')).toBe('e2–e4');
    expect(moveNotation('a7a8q')).toBe('a7–a8=Q');
    expect(uciFor({ from: 'a7', to: 'a8', promotion: 'N' })).toBe('a7a8n');
  });

  it('reports mate winner using the side to move', () => {
    const game = { status: 'CHECKMATE', whiteToMove: true } as GameState;
    expect(statusLabel(game)).toContain('Black wins');
    expect(statusLabel({ ...game, whiteToMove: false })).toContain('White wins');
  });

  it('uses official result scores for mate and draws', () => {
    expect(resultScore({ status: 'IN_PROGRESS', whiteToMove: true })).toBeNull();
    expect(resultScore({ status: 'CHECKMATE', whiteToMove: false })).toBe('1-0');
    expect(resultScore({ status: 'CHECKMATE', whiteToMove: true })).toBe('0-1');
    expect(resultScore({ status: 'STALEMATE', whiteToMove: true })).toBe('1/2-1/2');
    expect(resultScore({ status: 'DRAW_THREEFOLD_REPETITION', whiteToMove: false })).toBe('1/2-1/2');
    expect(resultScore({ status: 'DRAW_INSUFFICIENT_MATERIAL', whiteToMove: true })).toBe('1/2-1/2');
  });

  it('reports status and draw reasons', () => {
    expect(statusLabel({ status: 'DRAW_FIFTY_MOVE_RULE' } as GameState)).toContain('50-move');
    expect(statusLabel({ status: 'IN_PROGRESS', aiTurn: true } as GameState)).toContain('engine');
    expect(statusLabel({ status: 'IN_PROGRESS', aiTurn: false, inCheck: true } as GameState)).toContain('Check');
  });
});
