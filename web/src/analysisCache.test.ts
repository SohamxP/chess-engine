import { beforeEach, describe, expect, it } from 'vitest';
import { cacheableEvaluation, clearMemoryAnalysisCache, evaluationCacheKey,
  readCachedEvaluation, saveCachedEvaluation } from './analysisCache';
import { startingFen } from './chess';
import type { PositionEvaluation } from './review';

const evalAt = (depth: number, cp: number): PositionEvaluation =>
  ({ cp, mate: null, bestMove: 'e2e4', depth });

describe('bounded browser analysis cache', () => {
  beforeEach(() => clearMemoryAnalysisCache());

  it('isolates full FENs, hash settings, depth, and the engine implementation version', () => {
    expect(evaluationCacheKey(startingFen, 10)).not.toBe(evaluationCacheKey(startingFen, 16));
    expect(evaluationCacheKey(startingFen, 10))
      .not.toBe(evaluationCacheKey(startingFen.replace(' 0 1', ' 99 1'), 10));
    expect(evaluationCacheKey(startingFen, 10)).toContain('stockfish-19-lite-v2');
    expect(evaluationCacheKey(startingFen, 10)).toContain('|hash8|depth10|');
  });

  it('reuses exact-depth results and refuses shallow, incomplete or corrupt scores', async () => {
    await saveCachedEvaluation(startingFen, 10, evalAt(10, 32));
    expect(await readCachedEvaluation(startingFen, 10)).toEqual(evalAt(10, 32));
    expect(await readCachedEvaluation(startingFen, 16)).toBeNull();
    await saveCachedEvaluation(startingFen, 16, evalAt(10, 42));
    expect(await readCachedEvaluation(startingFen, 16)).toBeNull();
    await saveCachedEvaluation(startingFen, 16, evalAt(16, 28));
    expect(await readCachedEvaluation(startingFen, 16)).toEqual(evalAt(16, 28));
    expect(cacheableEvaluation({ ...evalAt(16, 42), cp: Infinity }, 16)).toBe(false);
    expect(cacheableEvaluation({ ...evalAt(16, 42), bestMove: 'invalid' }, 16)).toBe(false);
    expect(cacheableEvaluation({ cp: null, mate: null, bestMove: null, depth: 16 }, 16)).toBe(false);
  });

  it('keeps the in-memory fallback bounded when IndexedDB is unavailable', async () => {
    // Vitest runs without browser IndexedDB; the durable path is exercised in Playwright.
    for (let i = 0; i < 245; i++) {
      await saveCachedEvaluation(startingFen + ' memo-' + i, 10, evalAt(10, i));
    }
    expect(await readCachedEvaluation(startingFen + ' memo-0', 10)).toBeNull();
    expect(await readCachedEvaluation(startingFen + ' memo-244', 10)).toEqual(evalAt(10, 244));
  });
});
