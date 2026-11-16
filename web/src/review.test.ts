import { describe, expect, it } from 'vitest';
import {
  analysisSummary, buildReviewedMoves, formatEvaluation,
  gradeMove, numericEvaluation, parseUciScore, uciToSan, type PositionEvaluation,
} from './review';
import type { MoveEntry } from './chess';

const evaluation = (cp: number, bestMove: string | null = null): PositionEvaluation =>
  ({ cp, mate: null, bestMove, depth: 10 });
const move = (white: boolean, uci: string): MoveEntry =>
  ({ ply: 1, white, ai: !white, uci, san: uci, fen: '' });

describe('Stockfish game review', () => {
  it('reads UCI scores relative to White, even when Black is to move', () => {
    const text = 'info depth 10 seldepth 15 multipv 1 score cp 123 nodes 500 pv e7e5 g1f3';
    expect(parseUciScore(text, true)).toEqual({
      cp: 123, mate: null, bestMove: 'e7e5', depth: 10,
    });
    expect(parseUciScore(text, false)?.cp).toBe(-123);
    expect(parseUciScore('info depth 8 score mate -3 pv a2a3', true)?.mate).toBe(-3);
    expect(parseUciScore('info depth 8 score mate 2 pv a7a8q', false)?.mate).toBe(-2);
    expect(parseUciScore('info depth 5 score cp 250 lowerbound', true)).toBeNull();
    expect(parseUciScore('bestmove e2e4', true)).toBeNull();
  });

  it('classifies losses from the correct mover perspective', () => {
    const before = evaluation(100, 'e2e4');
    expect(gradeMove(before, evaluation(96), move(true, 'e2e4')).grade).toBe('Best');
    expect(gradeMove(before, evaluation(80), move(true, 'd2d4')).grade).toBe('Good');
    expect(gradeMove(before, evaluation(25), move(true, 'd2d4')).grade).toBe('Inaccuracy');
    expect(gradeMove(before, evaluation(-60), move(true, 'd2d4')).grade).toBe('Mistake');
    const worst = gradeMove(before, evaluation(-300), move(true, 'd2d4'));
    expect(worst.grade).toBe('Blunder');
    expect(worst.betterMove).toBe('e2e4');

    // A rise in White's evaluation after Black's move means Black lost ground.
    expect(gradeMove(evaluation(-100, 'e7e5'), evaluation(100), move(false, 'a7a6')).grade)
      .toBe('Mistake');
    expect(gradeMove(evaluation(-100, 'e7e5'), evaluation(-130), move(false, 'a7a6')).grade)
      .toBe('Good');
  });

  it('preserves uncertain positions rather than inventing a grade', () => {
    expect(gradeMove({ cp: null, mate: null, bestMove: null, depth: 0 },
      evaluation(10), move(true, 'e2e4'))).toEqual({
      grade: 'Unrated', lossCp: null, betterMove: null,
    });
  });

  it('handles mate scores and formats scores for either side', () => {
    expect(numericEvaluation({ cp: null, mate: 3, bestMove: null, depth: 10 })).toBe(9700);
    expect(numericEvaluation({ cp: null, mate: -2, bestMove: null, depth: 10 })).toBe(-9800);
    expect(formatEvaluation(evaluation(135))).toBe('+1.35');
    expect(formatEvaluation(evaluation(-42))).toBe('−0.42');
    expect(formatEvaluation({ cp: null, mate: -3, bestMove: null, depth: 10 })).toBe('−M3');
  });

  it('summarizes only the human side and does not overrun partial analysis', () => {
    const moves = [
      move(true, 'e2e4'), move(false, 'e7e5'),
      move(true, 'g1f3'),
    ];
    const scores = [
      evaluation(0, 'd2d4'), evaluation(-330),
      evaluation(20, 'g1f3'), evaluation(18),
    ];
    const reviewed = buildReviewedMoves(moves, scores);
    expect(reviewed).toHaveLength(3);
    expect(reviewed[0].grade).toBe('Blunder');
    expect(reviewed[1].grade).toBe('Blunder');
    expect(reviewed[2].grade).toBe('Best');
    expect(analysisSummary(reviewed, true)).toEqual({
      blunders: 1, mistakes: 0, inaccuracies: 0,
    });
    expect(buildReviewedMoves(moves, scores.slice(0, 2))).toHaveLength(1);
  });

  it('shows engine alternatives in the same SAN format as game history', () => {
    expect(uciToSan('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'g1f3'))
      .toBe('Nf3');
    expect(uciToSan('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4'))
      .toBe('e4');
    expect(uciToSan('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1'))
      .toBe('O-O');
    expect(uciToSan('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7a8q'))
      .toBe('a8=Q+');
    expect(uciToSan('invalid', 'e2e4')).toBeNull();
    expect(uciToSan('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e5'))
      .toBeNull();
  });

});
