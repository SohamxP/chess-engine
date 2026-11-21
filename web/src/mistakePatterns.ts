import { Chess } from 'chess.js';
import type { ArchivedGame } from './archive';
import { readCachedEvaluationBatch, evaluationCacheKey } from './analysisCache';
import { CONFIRM_DEPTH, REVIEW_BASE_DEPTH, buildReviewedMoves,
  type PositionEvaluation, type ReviewedMove } from './review';

export type PatternKind = 'missed-mate-one' | 'missed-free-capture' | 'exposed-major-piece';

export const PATTERN_CATALOG: Record<PatternKind, {
  title: string; description: string; practice: string;
}> = {
  'missed-mate-one': {
    title: 'Missed mate in one',
    description: 'A legal, immediate checkmate was available but not played.',
    practice: 'Look for forcing checks before choosing a quieter move.',
  },
  'missed-free-capture': {
    title: 'Missed free material',
    description: 'The engine preferred capturing an unprotected minor or major piece.',
    practice: 'Scan for captures of pieces that cannot be immediately recaptured.',
  },
  'exposed-major-piece': {
    title: 'Exposed major piece',
    description: 'A rook or queen was moved to a square where a cheaper attacker could capture it without an immediate recapture.',
    practice: 'Before moving a rook or queen, check every legal enemy capture on its destination.',
  },
};

export const PATTERN_ORDER: PatternKind[] = [
  'exposed-major-piece', 'missed-free-capture', 'missed-mate-one',
];

export interface PatternEvidence {
  id: string;
  kind: PatternKind;
  gameId: string;
  gameTitle: string;
  savedAt: string;
  ply: number;
  number: string;
  moveSan: string;
  betterSan: string | null;
  lossCp: number | null;
  explanation: string;
}

export interface PatternGroup {
  kind: PatternKind;
  occurrences: number;
  games: number;
  evidence: PatternEvidence[];
}

export interface PatternReport {
  savedGames: number;
  processedGames: number;
  fullyScannedGames: number;
  gradedDecisions: number;
  unverifiedDecisions: number;
  confirmedErrors: number;
  groups: PatternGroup[];
}

function emptyReport(total: number): PatternReport {
  return {
    savedGames: total, processedGames: 0, fullyScannedGames: 0,
    gradedDecisions: 0, unverifiedDecisions: 0, confirmedErrors: 0,
    groups: PATTERN_ORDER.map(kind => ({ kind, occurrences: 0, games: 0, evidence: [] })),
  };
}

function pieceValue(piece: string): number {
  return ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 } as Record<string, number>)[piece] ?? 0;
}

function playUci(position: Chess, uci: string) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  try {
    return position.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci[4] } : {}),
    });
  } catch {
    return null;
  }
}

function moveNumber(fen: string, white: boolean): string {
  const fullmove = Number(fen.split(' ')[5]);
  return (Number.isInteger(fullmove) && fullmove > 0 ? fullmove : 1) +
    (white ? '.' : '…');
}

function titleOf(item: ArchivedGame): string {
  return item.source ? item.source.white + ' vs. ' + item.source.black
    : 'You vs. Computer';
}

/** Proof that the capture is legal and cannot immediately be recaptured. */
function noImmediateRecapture(afterCapture: Chess, square: string): boolean {
  return !afterCapture.moves({ verbose: true })
    .some(move => move.to === square && !!move.captured);
}

function detectForMove(
  item: ArchivedGame, reviewed: ReviewedMove, beforeFen: string,
  before: PositionEvaluation, after: PositionEvaluation,
): PatternEvidence[] {
  const { move } = reviewed;
  if (move.white !== item.game.humanWhite || !before.bestMove ||
      before.depth < REVIEW_BASE_DEPTH || after.depth < REVIEW_BASE_DEPTH) return [];
  let board: Chess;
  try {
    board = new Chess(beforeFen);
  } catch { return []; }
  if ((board.turn() === 'w') !== move.white) return [];
  const playedBoard = new Chess(beforeFen);
  const actual = playUci(playedBoard, move.uci);
  if (!actual) return [];
  // Corrupt snapshots must never generate evidence for training.
  if (playedBoard.fen().split(' ').slice(0, 2).join(' ') !==
      move.fen.split(' ').slice(0, 2).join(' ')) return [];

  const bestBoard = new Chess(beforeFen);
  const best = playUci(bestBoard, before.bestMove);
  if (!best) return [];
  const base = {
    gameId: item.id, gameTitle: titleOf(item), savedAt: item.savedAt,
    ply: move.ply, number: moveNumber(beforeFen, move.white),
    moveSan: move.san, betterSan: best.san,
  };
  const found: PatternEvidence[] = [];

  // Mate-in-one is an objective board-level proof, not a guessed pawn loss.
  if (before.depth >= CONFIRM_DEPTH && bestBoard.isCheckmate() && !playedBoard.isCheckmate()) {
    found.push({
      ...base, id: item.id + ':' + move.ply + ':missed-mate-one',
      kind: 'missed-mate-one', lossCp: null,
      explanation: best.san + ' was legal checkmate immediately; ' +
        move.san + ' did not end the game.',
    });
  }

  // Material themes must have a meaningful verified engine score loss.
  if (reviewed.pendingVerification ||
      !['Mistake', 'Blunder'].includes(reviewed.grade) ||
      (reviewed.lossCp ?? 0) < 140 ||
      before.depth < CONFIRM_DEPTH || after.depth < CONFIRM_DEPTH) return found;

  if (best.captured && pieceValue(best.captured) >= 3 &&
      noImmediateRecapture(bestBoard, best.to)) {
    found.push({
      ...base, id: item.id + ':' + move.ply + ':missed-free-capture',
      kind: 'missed-free-capture', lossCp: reviewed.lossCp,
      explanation: best.san + ' captured an unprotected ' +
        (best.captured === 'q' ? 'queen' : best.captured === 'r' ? 'rook' :
          best.captured === 'b' ? 'bishop' : 'knight') +
        ' with no legal immediate recapture.',
    });
  }

  if (['q', 'r'].includes(actual.piece)) {
    const capturable = playedBoard.moves({ verbose: true })
      .filter(moveOption => moveOption.to === actual.to && !!moveOption.captured &&
        pieceValue(moveOption.piece) < pieceValue(actual.piece))
      .some(moveOption => {
        const response = new Chess(playedBoard.fen());
        const captured = playUci(response, moveOption.from + moveOption.to +
          (moveOption.promotion ?? ''));
        return !!captured && noImmediateRecapture(response, actual.to);
      });
    if (capturable) found.push({
      ...base, id: item.id + ':' + move.ply + ':exposed-major-piece',
      kind: 'exposed-major-piece', lossCp: reviewed.lossCp, betterSan: best.san,
      explanation: (actual.piece === 'q' ? 'The queen' : 'The rook') +
        ' on ' + actual.to +
        ' could be legally captured by a lower-value piece without an immediate recapture.',
    });
  }
  return found;
}

/** Completely deterministic, pure game-to-evidence classification. */
export function inspectAnalyzedGame(
  item: ArchivedGame, positions: PositionEvaluation[],
): { evidence: PatternEvidence[]; fullyScanned: boolean;
     graded: number; unverified: number; confirmedErrors: number } {
  const game = item.game;
  const fens = [game.initialFen, ...game.moveHistory.map(move => move.fen)];
  const fullyScanned = positions.length === fens.length &&
    positions.every(score => score.depth >= REVIEW_BASE_DEPTH &&
      (score.cp !== null || score.mate !== null));
  const reviewed = buildReviewedMoves(game.moveHistory, positions);
  let graded = 0, unverified = 0, confirmedErrors = 0;
  const evidence: PatternEvidence[] = [];
  for (let i = 0; i < reviewed.length; i++) {
    const row = reviewed[i];
    if (row.move.white !== game.humanWhite) continue;
    if (row.grade !== 'Unrated') graded++;
    if (row.pendingVerification) unverified++;
    if (['Inaccuracy', 'Mistake', 'Blunder'].includes(row.grade)) confirmedErrors++;
    const before = positions[i], after = positions[i + 1];
    if (before && after) {
      evidence.push(...detectForMove(item, row, fens[i], before, after));
    }
  }
  return { evidence, fullyScanned, graded, unverified, confirmedErrors };
}

const missing: PositionEvaluation = { cp: null, mate: null, bestMove: null, depth: 0 };

/** No new engine work: reconstruct the previous scan from the local cache. */
export async function loadPatternReport(
  games: ArchivedGame[], signal?: AbortSignal,
  onProgress?: (report: PatternReport) => void,
): Promise<PatternReport> {
  const report = emptyReport(games.length);
  const evidenceByKind = new Map<PatternKind, PatternEvidence[]>(
    PATTERN_ORDER.map(kind => [kind, []]),
  );
  for (const item of games) {
    if (signal?.aborted) break;
    const fens = [item.game.initialFen,
      ...item.game.moveHistory.map(move => move.fen)];
    const cached = await readCachedEvaluationBatch(fens, [REVIEW_BASE_DEPTH, CONFIRM_DEPTH]);
    if (signal?.aborted) break;
    const positions = fens.map(fen => {
      const quick = cached.get(evaluationCacheKey(fen, REVIEW_BASE_DEPTH));
      const deep = cached.get(evaluationCacheKey(fen, CONFIRM_DEPTH));
      return deep ? { ...deep, shallow: quick } : quick ?? missing;
    });
    const inspected = inspectAnalyzedGame(item, positions);
    report.processedGames++;
    if (inspected.fullyScanned) report.fullyScannedGames++;
    report.gradedDecisions += inspected.graded;
    report.unverifiedDecisions += inspected.unverified;
    report.confirmedErrors += inspected.confirmedErrors;
    for (const finding of inspected.evidence) {
      evidenceByKind.get(finding.kind)?.push(finding);
    }
    report.groups = PATTERN_ORDER.map(kind => {
      const evidence = evidenceByKind.get(kind) ?? [];
      return {
        kind, occurrences: evidence.length,
        games: new Set(evidence.map(entry => entry.gameId)).size,
        evidence: [...evidence].sort((a, b) =>
          b.savedAt.localeCompare(a.savedAt) || a.ply - b.ply),
      };
    });
    onProgress?.({ ...report, groups: report.groups.map(group => ({
      ...group, evidence: [...group.evidence],
    })) });
  }
  return report;
}
