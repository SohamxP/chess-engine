import type { GameState } from './chess';
import { startingFen } from './chess';
import { parseUciScore, type PositionEvaluation } from './review';

export const REVIEW_DEPTH = 10;
export const MAX_REVIEW_PLIES = 120;
const ENGINE_FILENAME = 'stockfish-19-lite-single.js';

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
  // A small hash table keeps analysis modest on mobile devices.
  worker.postMessage('setoption name Hash value 8');
  ready = waitForLine(worker, signal, 'readyok');
  worker.postMessage('isready');
  await ready;
}

function evaluate(worker: Worker, fen: string, signal: AbortSignal): Promise<PositionEvaluation> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const whiteToMove = fen.split(' ')[1] === 'w';
    let latest: PositionEvaluation = { cp: null, mate: null, bestMove: null, depth: 0 };
    let finished = false;
    const timeout = window.setTimeout(() => finish(new Error('Analysis timed out on one position.')), 45000);
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
    worker.postMessage('go depth ' + REVIEW_DEPTH);
  });
}

/**
 * The Stockfish Lite WebAssembly engine runs entirely in the browser, never on
 * Render's shared Java server. It is only downloaded after user opt-in.
 * Each game is processed sequentially so iPhones do not spawn many workers.
 */
export async function analyzeGame(
  game: GameState,
  signal: AbortSignal,
  onProgress: (evaluations: PositionEvaluation[], total: number) => void,
): Promise<PositionEvaluation[]> {
  isAborted(signal);
  if (typeof Worker === 'undefined') {
    throw new Error('Your browser does not support local chess analysis.');
  }
  const files = [
    game.initialFen || startingFen,
    ...game.moveHistory.slice(0, MAX_REVIEW_PLIES).map(item => item.fen),
  ];
  const worker = new Worker(import.meta.env.BASE_URL + 'engine/' + ENGINE_FILENAME);
  try {
    await prepareWorker(worker, signal);
    const result: PositionEvaluation[] = [];
    for (const fen of files) {
      isAborted(signal);
      result.push(await evaluate(worker, fen, signal));
      onProgress([...result], files.length);
    }
    return result;
  } finally {
    worker.terminate();
  }
}
