import { Chess } from 'chess.js';
import type { GameState } from './chess';
import { startingFen } from './chess';
import { readCachedEvaluation, saveCachedEvaluation } from './analysisCache';
import { CONFIRM_DEPTH, REVIEW_BASE_DEPTH, needsDeepVerification,
  parseUciScore, type PositionEvaluation } from './review';

export const REVIEW_DEPTH = REVIEW_BASE_DEPTH;
export const REVIEW_CONFIRM_DEPTH = CONFIRM_DEPTH;
export const MAX_DEEP_CHECKS_PER_PASS = 24;
const ENGINE_FILENAME = 'stockfish-19-lite-single.js';

export interface AnalysisProgress {
  phase: 'scan' | 'verify' | 'complete';
  scanned: number;
  cached: number;
  verified: number;
  pending: number;
  suspects: number;
}

function abortError(): Error {
  return new Error('Analysis cancelled.');
}

function isAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function messages(event: MessageEvent): string[] {
  const payload: unknown = event.data;
  if (typeof payload === 'string') return payload.split(/\r?\n/);
  return [];
}

function waitForLine(worker: Worker, signal: AbortSignal, expected: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const timeout = window.setTimeout(() => finish(new Error('Chess analysis engine did not start.')), 30000);
    function cleanup() {
      window.clearTimeout(timeout);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    }
    function finish(error?: Error) {
      cleanup();
      if (error) reject(error);
      else resolve();
    }
    function onMessage(event: MessageEvent) {
      if (messages(event).some(line => line.trim() === expected)) finish();
    }
    function onError() { finish(new Error('Could not load the browser chess engine.')); }
    function onAbort() { finish(abortError()); }
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function prepareWorker(worker: Worker, signal: AbortSignal): Promise<void> {
  let ready = waitForLine(worker, signal, 'uciok');
  worker.postMessage('uci');
  await ready;
  // Single-threaded worker + small hash stays usable on mobile browsers.
  worker.postMessage('setoption name Hash value 8');
  ready = waitForLine(worker, signal, 'readyok');
  worker.postMessage('isready');
  await ready;
}

function terminalEvaluation(fen: string, depth: number): PositionEvaluation | null {
  // Stockfish can return "bestmove (none)" without a score for checkmate/
  // stalemate. Chess.js verifies game-over locally before starting a worker.
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return {
    cp: null, mate: chess.turn() === 'w' ? -0.01 : 0.01, bestMove: null, depth,
  };
  if (chess.isDraw()) return { cp: 0, mate: null, bestMove: null, depth };
  return null;
}

/** A single UCI search, with a finite per-position deadline and full cleanup. */
function evaluate(worker: Worker, fen: string, depth: number,
                  signal: AbortSignal): Promise<PositionEvaluation> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const whiteToMove = fen.split(' ')[1] === 'w';
    let latest: PositionEvaluation = { cp: null, mate: null, bestMove: null, depth: 0 };
    let finished = false;
    const timeout = window.setTimeout(() =>
      finish(new Error('Analysis timed out on one position. Completed positions are cached.')),
      depth > REVIEW_DEPTH ? 65000 : 45000);
    function cleanup() {
      window.clearTimeout(timeout);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    }
    function finish(error?: Error, bestMove?: string | null) {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error);
      else resolve({ ...latest, bestMove: bestMove ?? latest.bestMove });
    }
    function onMessage(event: MessageEvent) {
      for (const line of messages(event)) {
        const score = parseUciScore(line, whiteToMove);
        if (score && score.depth >= latest.depth) latest = score;
        if (line.startsWith('bestmove ')) {
          const best = /^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/.exec(line)?.[1] ?? null;
          finish(undefined, best);
          return;
        }
      }
    }
    function onError() { finish(new Error('Chess analysis worker failed.')); }
    function onAbort() { finish(abortError()); }
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    worker.postMessage('position fen ' + fen);
    worker.postMessage('go depth ' + depth);
  });
}

function candidateSeverity(before: PositionEvaluation, after: PositionEvaluation,
                           white: boolean): number {
  if (before.cp !== null && after.cp !== null) {
    return Math.max(0, (before.cp - after.cp) * (white ? 1 : -1));
  }
  return 1000; // Potential forced-mate shift or an incomplete evaluation.
}

/** Full game coverage, checkpointed after each position and refined in bounded passes. */
export async function analyzeGame(
  game: GameState,
  signal: AbortSignal,
  onProgress: (evaluations: PositionEvaluation[], total: number,
    progress: AnalysisProgress) => void,
): Promise<PositionEvaluation[]> {
  isAborted(signal);
  const fens = [game.initialFen || startingFen, ...game.moveHistory.map(move => move.fen)];
  let worker: Worker | null = null;
  let cached = 0;

  async function obtain(fen: string, depth: number): Promise<PositionEvaluation> {
    isAborted(signal);
    const reuse = await readCachedEvaluation(fen, depth);
    isAborted(signal);
    if (reuse) { cached++; return reuse; }
    const terminal = terminalEvaluation(fen, depth);
    if (terminal) {
      await saveCachedEvaluation(fen, depth, terminal);
      isAborted(signal);
      return terminal;
    }
    if (!worker) {
      if (typeof Worker === 'undefined') {
        throw new Error('Your browser does not support local chess analysis.');
      }
      worker = new Worker(import.meta.env.BASE_URL + 'engine/' + ENGINE_FILENAME);
      await prepareWorker(worker, signal);
    }
    const evaluation = await evaluate(worker, fen, depth, signal);
    isAborted(signal);
    await saveCachedEvaluation(fen, depth, evaluation);
    isAborted(signal);
    return evaluation;
  }

  try {
    const base: PositionEvaluation[] = [];
    let lastUpdate = 0;
    for (const fen of fens) {
      base.push(await obtain(fen, REVIEW_DEPTH));
      // Avoid a React re-render for every half-move in very long games.
      const now = Date.now();
      if (base.length === fens.length || base.length === 1 ||
          (base.length % 5 === 0 && now - lastUpdate > 120)) {
        lastUpdate = now;
        onProgress([...base], fens.length, {
          phase: 'scan', scanned: base.length, cached, verified: 0, pending: 0, suspects: 0,
        });
      }
    }

    // Prioritize a player's most costly decisions. Other positions still
    // receive their base-depth analysis and can be confirmed in a later pass.
    const suspects = game.moveHistory
      .map((move, index) => ({ index, white: move.white,
        severity: candidateSeverity(base[index], base[index + 1], move.white) }))
      .filter(({ index }) => needsDeepVerification(
        base[index], base[index + 1], game.moveHistory[index]))
      .sort((a, b) => Number(b.white === game.humanWhite) -
        Number(a.white === game.humanWhite) || b.severity - a.severity || a.index - b.index);

    const refined = [...base];
    let verified = 0;
    let deepChecks = 0;
    onProgress([...refined], fens.length, {
      phase: 'verify', scanned: fens.length, cached, verified, pending: suspects.length,
      suspects: suspects.length,
    });

    for (const { index } of suspects) {
      isAborted(signal);
      const beforeCached = await readCachedEvaluation(fens[index], CONFIRM_DEPTH);
      const afterCached = await readCachedEvaluation(fens[index + 1], CONFIRM_DEPTH);
      isAborted(signal);
      const fullyCached = !!beforeCached && !!afterCached;
      if (!fullyCached && deepChecks >= MAX_DEEP_CHECKS_PER_PASS) continue;
      if (!fullyCached) deepChecks++;
      if (beforeCached) cached++;
      if (afterCached) cached++;
      refined[index] = beforeCached ?? await obtain(fens[index], CONFIRM_DEPTH);
      refined[index + 1] = afterCached ?? await obtain(fens[index + 1], CONFIRM_DEPTH);
      if (refined[index].depth >= CONFIRM_DEPTH &&
          refined[index + 1].depth >= CONFIRM_DEPTH) verified++;
      onProgress([...refined], fens.length, {
        phase: 'verify', scanned: fens.length, cached, verified,
        pending: suspects.length - verified, suspects: suspects.length,
      });
    }

    isAborted(signal);
    onProgress([...refined], fens.length, {
      phase: 'complete', scanned: fens.length, cached, verified,
      pending: suspects.length - verified, suspects: suspects.length,
    });
    return refined;
  } finally {
    worker?.terminate();
  }
}

/** Practice retries compare all three alternatives at the same settings. */
export async function analyzePositions(
  fens: string[], signal: AbortSignal,
): Promise<PositionEvaluation[]> {
  isAborted(signal);
  if (fens.length === 0 || fens.length > 3) {
    throw new Error('Expected one to three practice positions.');
  }
  let worker: Worker | null = null;
  try {
    const results: PositionEvaluation[] = [];
    for (const fen of fens) {
      isAborted(signal);
      const hit = await readCachedEvaluation(fen, REVIEW_DEPTH);
      isAborted(signal);
      if (hit) { results.push(hit); continue; }
      const terminal = terminalEvaluation(fen, REVIEW_DEPTH);
      if (terminal) {
        results.push(terminal);
        await saveCachedEvaluation(fen, REVIEW_DEPTH, terminal);
        continue;
      }
      if (!worker) {
        if (typeof Worker === 'undefined') {
          throw new Error('Your browser does not support local chess analysis.');
        }
        worker = new Worker(import.meta.env.BASE_URL + 'engine/' + ENGINE_FILENAME);
        await prepareWorker(worker, signal);
      }
      const result = await evaluate(worker, fen, REVIEW_DEPTH, signal);
      isAborted(signal);
      await saveCachedEvaluation(fen, REVIEW_DEPTH, result);
      results.push(result);
    }
    return results;
  } finally {
    worker?.terminate();
  }
}
