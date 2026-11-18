import { beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { analyzeGame, MAX_DEEP_CHECKS_PER_PASS, REVIEW_CONFIRM_DEPTH } from './analysis';
import { clearMemoryAnalysisCache, saveCachedEvaluation } from './analysisCache';
import { startingFen, type GameState, type MoveEntry } from './chess';
import { buildReviewedMoves, type PositionEvaluation } from './review';

const score = (cp: number, depth: number, bestMove: string | null = null):
  PositionEvaluation => ({ cp, mate: null, depth, bestMove });

function makeGame(fens: string[]): GameState {
  const entries: MoveEntry[] = fens.slice(1).map((fen, index) => ({
    ply: index + 1, white: index % 2 === 0,
    ai: index % 2 !== 0, uci: index % 2 === 0 ? 'e2e4' : 'e7e5',
    san: index % 2 === 0 ? 'e4' : 'e5', fen,
  }));
  return {
    id: 'test-analysis', initialFen: fens[0], fen: fens.at(-1) ?? fens[0],
    status: 'IN_PROGRESS', whiteToMove: true, inCheck: false,
    humanWhite: true, depth: 2, aiTurn: false, canUndo: false,
    canClaimThreefold: false, canClaimFifty: false,
    legalMoves: [], moveHistory: entries, lastMove: null, aiStats: null,
  };
}

describe('resumable, full-length analysis pipeline', () => {
  beforeEach(() => clearMemoryAnalysisCache());

  it('covers all half-moves beyond the old 120-ply cutoff without a worker on cache hit', async () => {
    await saveCachedEvaluation(startingFen, 10, score(0, 10));
    const game = makeGame(Array.from({ length: 151 }, () => startingFen));
    let last = { phase: '', scanned: 0, pending: 0, cached: 0 };
    const result = await analyzeGame(game, new AbortController().signal, (_partial, _total, p) => {
      last = p;
    });
    expect(result).toHaveLength(151);
    expect(last.phase).toBe('complete');
    expect(last.scanned).toBe(151);
    expect(last.pending).toBe(0);
    expect(last.cached).toBeGreaterThan(120);
  });

  it('merges deep-check scores from cache and confirms only the affected mistake', async () => {
    const chess = new Chess();
    const fens = [chess.fen()];
    for (const san of ['e4', 'e5']) {
      chess.move(san);
      fens.push(chess.fen());
    }
    const quick = [score(200, 10, 'd2d4'), score(-180, 10, 'e7e5'), score(-160, 10)];
    for (const [i, fen] of fens.entries()) {
      await saveCachedEvaluation(fen, 10, quick[i]);
    }
    const first = buildReviewedMoves(makeGame(fens).moveHistory, quick);
    expect(first[0].pendingVerification).toBe(true);
    expect(first[0].grade).toBe('Unrated');

    await saveCachedEvaluation(fens[0], 16, score(180, 16, 'd2d4'));
    await saveCachedEvaluation(fens[1], 16, score(-170, 16, 'e7e5'));
    const updates: number[] = [];
    const refined = await analyzeGame(makeGame(fens), new AbortController().signal,
      (_partial, _total, p) => updates.push(p.verified));
    expect(updates.at(-1)).toBe(1);
    expect(refined[0].depth).toBe(REVIEW_CONFIRM_DEPTH);
    expect(refined[1].depth).toBe(REVIEW_CONFIRM_DEPTH);
    const reviewed = buildReviewedMoves(makeGame(fens).moveHistory, refined);
    expect(reviewed[0].pendingVerification).toBe(false);
    expect(reviewed[0].grade).toBe('Blunder');
  });

  it('cancels a long scan and resumes from saved work instead of restarting computation', async () => {
    await saveCachedEvaluation(startingFen, 10, score(0, 10));
    const game = makeGame(Array.from({ length: 131 }, () => startingFen));
    const controller = new AbortController();
    await expect(analyzeGame(game, controller.signal, () => controller.abort()))
      .rejects.toThrow('Analysis cancelled.');
    let finalCached = 0;
    const result = await analyzeGame(game, new AbortController().signal, (_partial, _total, p) => {
      finalCached = p.cached;
    });
    expect(result).toHaveLength(131);
    expect(finalCached).toBeGreaterThanOrEqual(131);
  });

  it('scores checkmate and stalemate without waiting for a non-existent bestmove', async () => {
    const mate = '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1';
    const drawn = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
    const { analyzePositions } = await import('./analysis');
    const results = await analyzePositions([mate, drawn], new AbortController().signal);
    expect(results).toEqual([
      { cp: null, mate: 0.01, bestMove: null, depth: 10 },
      { cp: 0, mate: null, bestMove: null, depth: 10 },
    ]);
  });

  it('uses a bounded number of deep verifications per pass on large collections', () => {
    expect(MAX_DEEP_CHECKS_PER_PASS).toBeGreaterThan(0);
    expect(MAX_DEEP_CHECKS_PER_PASS).toBeLessThanOrEqual(30);
  });
});
