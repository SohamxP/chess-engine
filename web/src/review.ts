import { Chess } from 'chess.js';
import type { MoveEntry } from './chess';

export interface PositionEvaluation {
  /** Centipawns, from White's point of view. Null when the engine gave no score. */
  cp: number | null;
  /** Mate distance from White's perspective, when the UCI score is a mate. */
  mate: number | null;
  /** UCI move favored by Stockfish from this exact position. */
  bestMove: string | null;
  depth: number;
}

export type MoveGrade = 'Best' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder' | 'Unrated';

export interface ReviewedMove {
  move: MoveEntry;
  grade: MoveGrade;
  lossCp: number | null;
  betterMove: string | null;
  evaluation: PositionEvaluation;
}

/** UCI information is reported from the perspective of the side to move. */
export function parseUciScore(line: string, whiteToMove: boolean): PositionEvaluation | null {
  if (!line.startsWith('info ') || /\b(lowerbound|upperbound)\b/.test(line)) return null;
  const depth = Number(/\bdepth (\d+)/.exec(line)?.[1] ?? 0);
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  if (!score) return null;
  const value = Number(score[2]) * (whiteToMove ? 1 : -1);
  const bestMove = /\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/.exec(line)?.[1] ?? null;
  return {
    cp: score[1] === 'cp' ? value : null,
    mate: score[1] === 'mate' ? (Number(score[2]) === 0 ? (whiteToMove ? -0.01 : 0.01) : value) : null,
    bestMove, depth,
  };
}

export function numericEvaluation(evaluation: PositionEvaluation): number | null {
  if (evaluation.mate !== null) {
    const sign = Math.sign(evaluation.mate);
    return sign * (10000 - Math.min(50, Math.abs(evaluation.mate)) * 100);
  }
  return evaluation.cp;
}

export function formatEvaluation(evaluation: PositionEvaluation | undefined): string {
  if (!evaluation || (evaluation.cp === null && evaluation.mate === null)) return '—';
  if (evaluation.mate !== null) {
    const side = evaluation.mate > 0 ? '+' : '−';
    return side + 'M' + (Math.abs(evaluation.mate) < 1 ? '0' : Math.abs(evaluation.mate));
  }
  const number = (evaluation.cp ?? 0) / 100;
  return (number >= 0 ? '+' : '−') + Math.abs(number).toFixed(2);
}

/**
 * A shallow analysis is approximate. Avoid calling slight score shifts mistakes.
 * Scores are from White's perspective, so Black's changes must be inverted.
 */
export function gradeMove(before: PositionEvaluation, after: PositionEvaluation,
                          move: Pick<MoveEntry, 'white' | 'uci'>): {
  grade: MoveGrade; lossCp: number | null; betterMove: string | null;
} {
  const previous = numericEvaluation(before);
  const following = numericEvaluation(after);
  if (previous === null || following === null) {
    return { grade: 'Unrated', lossCp: null, betterMove: null };
  }
  const lossCp = Math.max(0, Math.round((previous - following) * (move.white ? 1 : -1)));
  const betterMove = before.bestMove && before.bestMove.toLowerCase() !== move.uci.toLowerCase()
    ? before.bestMove : null;
  const grade: MoveGrade = betterMove === null && before.bestMove ? 'Best'
    : lossCp >= 300 ? 'Blunder'
    : lossCp >= 140 ? 'Mistake'
    : lossCp >= 60 ? 'Inaccuracy'
    : 'Good';
  return { grade, lossCp, betterMove: lossCp >= 60 ? betterMove : null };
}

export function buildReviewedMoves(moves: MoveEntry[], evaluations: PositionEvaluation[]): ReviewedMove[] {
  return moves.slice(0, Math.max(0, evaluations.length - 1)).map((move, index) => ({
    move, evaluation: evaluations[index + 1],
    ...gradeMove(evaluations[index], evaluations[index + 1], move),
  }));
}

export function analysisSummary(moves: ReviewedMove[], humanWhite: boolean): {
  blunders: number; mistakes: number; inaccuracies: number;
} {
  const human = moves.filter(item => item.move.white === humanWhite);
  return {
    blunders: human.filter(item => item.grade === 'Blunder').length,
    mistakes: human.filter(item => item.grade === 'Mistake').length,
    inaccuracies: human.filter(item => item.grade === 'Inaccuracy').length,
  };
}


/** Render Stockfish's coordinate-based best move in the same SAN as the match history. */
export function uciToSan(fen: string, uci: string): string | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  try {
    const chess = new Chess(fen);
    const played = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci[4] } : {}),
    });
    return played.san;
  } catch {
    return null;
  }
}
