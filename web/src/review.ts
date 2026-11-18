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
  /** Quick-depth score retained alongside a deeper score for adjacent moves. */
  shallow?: PositionEvaluation;
}

export type MoveGrade = 'Best' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder' | 'Unrated';

export interface ReviewedMove {
  move: MoveEntry;
  grade: MoveGrade;
  lossCp: number | null;
  betterMove: string | null;
  evaluation: PositionEvaluation;
  /** A possible costly move with insufficient deep-search confirmation. */
  pendingVerification: boolean;
}

/** UCI information is reported from the perspective of the side to move. */
export function parseUciScore(line: string, whiteToMove: boolean): PositionEvaluation | null {
  if (!line.startsWith('info ') || /\b(lowerbound|upperbound)\b/.test(line) ||
      /\bmultipv ([2-9]|[1-9]\d+)/.test(line)) return null;
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
export const CONFIRM_DEPTH = 16;
export const REVIEW_BASE_DEPTH = 10;

/**
 * Quick scores identify candidates for confirmation, not final blunders.
 * A 45cp threshold gives a margin around the 60cp inaccuracy boundary.
 */
export function needsDeepVerification(
  before: PositionEvaluation, after: PositionEvaluation,
  move: Pick<MoveEntry, 'white' | 'uci'>,
): boolean {
  if ((before.cp === null && before.mate === null) ||
      (after.cp === null && after.mate === null)) return true;
  if (before.mate !== null || after.mate !== null) {
    return before.mate === null || after.mate === null ||
      Math.sign(before.mate) !== Math.sign(after.mate);
  }
  return Math.max(0, ((before.cp ?? 0) - (after.cp ?? 0)) * (move.white ? 1 : -1)) >= 45;
}

/**
 * Conservative grading: mate-vs-centipawn transitions are NOT a numeric
 * pawn swing. A change in forced-mate winner can be identified without
 * inventing a "90-pawn loss". Search depth still matters.
 */
export function gradeMove(before: PositionEvaluation, after: PositionEvaluation,
                          move: Pick<MoveEntry, 'white' | 'uci'>): {
  grade: MoveGrade; lossCp: number | null; betterMove: string | null;
} {
  const bestMatch = !!before.bestMove &&
    before.bestMove.toLowerCase() === move.uci.toLowerCase();
  const better = !bestMatch ? before.bestMove : null;
  if (before.depth < REVIEW_BASE_DEPTH || after.depth < REVIEW_BASE_DEPTH ||
      (before.cp === null && before.mate === null) ||
      (after.cp === null && after.mate === null)) {
    return { grade: 'Unrated', lossCp: null, betterMove: null };
  }
  if (before.mate !== null || after.mate !== null) {
    if (before.mate === null || after.mate === null) {
      return { grade: 'Unrated', lossCp: null, betterMove: null };
    }
    const beforeWinner = Math.sign(before.mate);
    const afterWinner = Math.sign(after.mate);
    if (beforeWinner === afterWinner) {
      return { grade: bestMatch ? 'Best' : 'Good', lossCp: 0, betterMove: null };
    }
    // A player gave away a forced win / allowed a forced loss.
    return {
      grade: beforeWinner === (move.white ? 1 : -1) ? 'Blunder' : 'Good',
      lossCp: null,
      betterMove: beforeWinner === (move.white ? 1 : -1) ? better : null,
    };
  }
  const lossCp = Math.max(0, Math.round(((before.cp ?? 0) - (after.cp ?? 0)) *
    (move.white ? 1 : -1)));
  const grade: MoveGrade = bestMatch && lossCp <= 40 ? 'Best'
    : lossCp >= 300 ? 'Blunder'
    : lossCp >= 140 ? 'Mistake'
    : lossCp >= 60 ? 'Inaccuracy'
    : 'Good';
  return { grade, lossCp, betterMove: lossCp >= 60 ? better : null };
}

export function buildReviewedMoves(moves: MoveEntry[], evaluations: PositionEvaluation[]): ReviewedMove[] {
  return moves.slice(0, Math.max(0, evaluations.length - 1)).map((move, index) => {
    const before = evaluations[index], after = evaluations[index + 1];
    // Never compare depth-16 on one side with depth-10 on the other.
    // A deep score for move N must not manufacture a blunder on move N-1.
    const bothConfirmed = before.depth >= CONFIRM_DEPTH && after.depth >= CONFIRM_DEPTH;
    const comparableBefore = bothConfirmed ? before : before.shallow ?? before;
    const comparableAfter = bothConfirmed ? after : after.shallow ?? after;
    const pendingVerification = needsDeepVerification(comparableBefore, comparableAfter, move) &&
      !bothConfirmed;
    return {
      move, evaluation: after, pendingVerification,
      ...(pendingVerification ? { grade: 'Unrated' as const, lossCp: null, betterMove: null }
        : gradeMove(comparableBefore, comparableAfter, move)),
    };
  });
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
