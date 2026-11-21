import { Chess } from 'chess.js';
import { frameAtPly, type GameState } from './chess';
import { buildReviewedMoves, type PositionEvaluation } from './review';
import { inspectAnalyzedGame, PATTERN_ORDER, type PatternKind,
  type PatternEvidence } from './mistakePatterns';

// Keep the original storage key to preserve existing practice cards and recall streaks.
export const PRACTICE_KEY = 'plyforge-decision-lab-v1';
export const MAX_PRACTICE_CARDS = 180;
const INTERVAL_DAYS = [1, 3, 7, 14, 30];
export const MAX_RECORDED_ATTEMPTS_PER_CARD = 40;

export interface RecordedAttempt {
  at: string;
  success: boolean;
  intervalDays: number;
  /** Snapshot of verified categories at the time the attempt occurred. */
  patterns: PatternKind[];
}

export interface TrainingTheme {
  kind: PatternKind;
  cards: number;
  games: number;
  attempts: number;
  successes: number;
}

export interface TrainingProgress {
  totalAttempts: number;
  correctAttempts: number;
  last30Days: number;
  correctLast30Days: number;
  practicedPositions: number;
  themes: TrainingTheme[];
}

export interface PracticeCard {
  id: string;
  gameId: string;
  ply: number;
  fen: string;
  white: boolean;
  originalUci: string;
  originalSan: string;
  addedAt: string;
  dueAt: string;
  streak: number;
  attempts: number;
  lastPlan: string;
  lastSuccess: boolean | null;
  /** Optional so legacy browser-local cards remain readable without a migration. */
  patterns?: PatternKind[];
  /** Bounded history; old attempts have no reconstructible outcome timestamps. */
  history?: RecordedAttempt[];
}

/** Only the player's own measurable errors become practice prompts. */
export function makePracticeCards(
  game: GameState,
  positions: PositionEvaluation[],
  current: PracticeCard[],
  now = new Date(),
): { cards: PracticeCard[]; added: number } {
  const existing = new Set(current.map(card => card.id));
  const evidence = inspectAnalyzedGame(
    { id: game.id, game, savedAt: now.toISOString() }, positions,
  ).evidence;
  const byPly = new Map<number, PatternKind[]>();
  for (const entry of evidence) {
    byPly.set(entry.ply, uniquePatterns([...(byPly.get(entry.ply) ?? []), entry.kind]));
  }
  const created: PracticeCard[] = [];
  for (const item of buildReviewedMoves(game.moveHistory, positions)) {
    if (item.move.white !== game.humanWhite ||
        (!['Inaccuracy', 'Mistake', 'Blunder'].includes(item.grade) &&
          !(byPly.get(item.move.ply) ?? []).includes('missed-mate-one'))) continue;
    const id = game.id + ':' + item.move.ply;
    if (existing.has(id)) continue;
    const fen = frameAtPly(game, item.move.ply - 1).fen;
    try {
      const board = new Chess(fen);
      if ((board.turn() === 'w') !== item.move.white) continue;
      const original = board.move({
        from: item.move.uci.slice(0, 2),
        to: item.move.uci.slice(2, 4),
        ...(item.move.uci.length === 5 ? { promotion: item.move.uci[4] } : {}),
      });
      if (!original) continue;
    } catch {
      continue; // Never put a corrupt snapshot into the training deck.
    }
    created.push({
      id, gameId: game.id, ply: item.move.ply, fen,
      white: item.move.white, originalUci: item.move.uci,
      originalSan: item.move.san, addedAt: now.toISOString(),
      dueAt: now.toISOString(), streak: 0, attempts: 0,
      lastPlan: '', lastSuccess: null,
      ...(byPly.has(item.move.ply) ? { patterns: byPly.get(item.move.ply) } : {}),
    });
    existing.add(id);
  }
  return {
    cards: [...created, ...current.map(card => {
      if (card.gameId !== game.id) return card;
      const fresh = byPly.get(card.ply);
      if (!fresh?.length) return card;
      const combined = uniquePatterns([...(card.patterns ?? []), ...fresh]);
      return samePatterns(card.patterns ?? [], combined) ? card : { ...card, patterns: combined };
    })].slice(0, MAX_PRACTICE_CARDS),
    added: created.length,
  };
}

export function validCard(value: unknown): value is PracticeCard {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<PracticeCard>;
  return typeof v.id === 'string' && v.id.length > 0 &&
    typeof v.gameId === 'string' && typeof v.fen === 'string' &&
    typeof v.ply === 'number' && Number.isInteger(v.ply) && v.ply > 0 &&
    typeof v.white === 'boolean' &&
    typeof v.originalUci === 'string' &&
    /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(v.originalUci) &&
    typeof v.originalSan === 'string' &&
    typeof v.addedAt === 'string' && !Number.isNaN(Date.parse(v.addedAt)) &&
    typeof v.dueAt === 'string' && !Number.isNaN(Date.parse(v.dueAt)) &&
    typeof v.streak === 'number' && Number.isInteger(v.streak) && v.streak >= 0 &&
    typeof v.attempts === 'number' && Number.isInteger(v.attempts) && v.attempts >= 0 &&
    typeof v.lastPlan === 'string' &&
    (v.lastSuccess === null || typeof v.lastSuccess === 'boolean') &&
    (v.patterns === undefined || validPatterns(v.patterns)) &&
    (v.history === undefined || (Array.isArray(v.history) &&
      v.history.length <= MAX_RECORDED_ATTEMPTS_PER_CARD &&
      v.history.every(item => !!item && typeof item === 'object' &&
        typeof item.at === 'string' && !Number.isNaN(Date.parse(item.at)) &&
        typeof item.success === 'boolean' &&
        Number.isInteger(item.intervalDays) && item.intervalDays >= 1 &&
        item.intervalDays <= 30 && validPatterns(item.patterns))));
}

export function readPracticeCards(store?: Pick<Storage, 'getItem'>): PracticeCard[] {
  try {
    const value: unknown = JSON.parse((store ?? window.localStorage).getItem(PRACTICE_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    const unique = new Set<string>();
    return value.filter((item): item is PracticeCard => {
      if (!validCard(item) || unique.has(item.id)) return false;
      try { new Chess(item.fen); } catch { return false; }
      unique.add(item.id);
      return true;
    }).slice(0, MAX_PRACTICE_CARDS);
  } catch {
    return [];
  }
}

export function writePracticeCards(cards: PracticeCard[], store?: Pick<Storage, 'setItem'>): boolean {
  try {
    (store ?? window.localStorage).setItem(PRACTICE_KEY,
      JSON.stringify(cards.slice(0, MAX_PRACTICE_CARDS)));
    return true;
  } catch {
    return false;
  }
}

function uniquePatterns(input: PatternKind[]): PatternKind[] {
  return PATTERN_ORDER.filter(kind => input.includes(kind));
}

function validPatterns(value: unknown): value is PatternKind[] {
  return Array.isArray(value) && value.length <= PATTERN_ORDER.length &&
    value.every(kind => typeof kind === 'string' && PATTERN_ORDER.includes(kind as PatternKind)) &&
    new Set(value).size === value.length;
}

function samePatterns(left: PatternKind[], right: PatternKind[]): boolean {
  return left.length === right.length && left.every(kind => right.includes(kind));
}

/** Attach evidence to existing cards without resetting streak, due date or notes. */
export function attachPatternEvidence(cards: PracticeCard[], evidence: PatternEvidence[]): PracticeCard[] {
  const categories = new Map<string, PatternKind[]>();
  for (const entry of evidence) {
    const key = entry.gameId + ':' + entry.ply;
    categories.set(key, uniquePatterns([...(categories.get(key) ?? []), entry.kind]));
  }
  return cards.map(card => {
    const detected = categories.get(card.id);
    if (!detected?.length) return card;
    const patterns = uniquePatterns([...(card.patterns ?? []), ...detected]);
    return samePatterns(card.patterns ?? [], patterns) ? card : { ...card, patterns };
  });
}

/** Distinct games, not number of moves, determine whether a theme recurs. */
export function recurringThemeCounts(
  cards: PracticeCard[], analyzedGameCounts?: Map<PatternKind, number>,
): Map<PatternKind, number> {
  const gamesByTheme = new Map<PatternKind, Set<string>>(
    PATTERN_ORDER.map(kind => [kind, new Set<string>()]),
  );
  for (const card of cards) {
    for (const kind of card.patterns ?? []) gamesByTheme.get(kind)?.add(card.gameId);
  }
  return new Map(PATTERN_ORDER.map(kind => [
    kind, Math.max(gamesByTheme.get(kind)?.size ?? 0, analyzedGameCounts?.get(kind) ?? 0),
  ]));
}

function urgency(card: PracticeCard, counts: Map<PatternKind, number>): number {
  const repeated = Math.max(0, ...(card.patterns ?? []).map(kind => counts.get(kind) ?? 0));
  return (card.lastSuccess === false ? 10 : 0) + (repeated >= 2 ? Math.min(repeated, 5) : 0);
}

/** Due cards are prioritized by prior misses and repeated weaknesses. */
export function duePracticeCards(
  cards: PracticeCard[], now = new Date(), analyzedGameCounts?: Map<PatternKind, number>,
): PracticeCard[] {
  const counts = recurringThemeCounts(cards, analyzedGameCounts);
  return cards.filter(card => Date.parse(card.dueAt) <= now.getTime())
    .sort((a, b) => urgency(b, counts) - urgency(a, counts) ||
      a.dueAt.localeCompare(b.dueAt) || a.addedAt.localeCompare(b.addedAt) ||
      a.id.localeCompare(b.id));
}

/**
 * A transparent heuristic, not machine learning. Repeated evidence across
 * distinct games shortens successful review intervals, while failures reset
 * streaks. Untagged legacy cards keep the original 1/3/7/14/30 cadence.
 */
export function adaptiveIntervalDays(
  card: PracticeCard, nextStreak: number, counts: Map<PatternKind, number>,
): number {
  const base = INTERVAL_DAYS[Math.min(Math.max(nextStreak - 1, 0), INTERVAL_DAYS.length - 1)];
  const repeat = Math.max(0, ...(card.patterns ?? []).map(kind => counts.get(kind) ?? 0));
  const scale = repeat >= 3 ? 0.6 : repeat >= 2 ? 0.75 : 1;
  return Math.max(1, Math.min(30, Math.round(base * scale)));
}

/** Only post-upgrade attempt logs are included; historical aggregate counts stay on cards. */
export function trainingProgress(cards: PracticeCard[], now = new Date()): TrainingProgress {
  const since = now.getTime() - 30 * 86_400_000;
  const themes = PATTERN_ORDER.map(kind => {
    const tagged = cards.filter(card => card.patterns?.includes(kind));
    const events = cards.flatMap(card => (card.history ?? []).filter(row => row.patterns.includes(kind)));
    return {
      kind, cards: tagged.length, games: new Set(tagged.map(card => card.gameId)).size,
      attempts: events.length, successes: events.filter(row => row.success).length,
    };
  });
  const history = cards.flatMap(card => card.history ?? []);
  const recent = history.filter(row => Date.parse(row.at) >= since && Date.parse(row.at) <= now.getTime());
  return {
    totalAttempts: history.length,
    correctAttempts: history.filter(row => row.success).length,
    last30Days: recent.length,
    correctLast30Days: recent.filter(row => row.success).length,
    practicedPositions: cards.filter(card => (card.history?.length ?? 0) > 0).length,
    themes,
  };
}

/** A retry is recorded once after reliable evaluation and only when due. */
export function recordPracticeAttempt(
  cards: PracticeCard[], id: string, success: boolean, plan: string, now = new Date(),
  analyzedGameCounts?: Map<PatternKind, number>,
): PracticeCard[] {
  const counts = recurringThemeCounts(cards, analyzedGameCounts);
  return cards.map(card => {
    if (card.id !== id || Date.parse(card.dueAt) > now.getTime()) return card;
    const streak = success ? card.streak + 1 : 0;
    const days = success ? adaptiveIntervalDays(card, streak, counts) : 1;
    const entry: RecordedAttempt = {
      at: now.toISOString(), success, intervalDays: days,
      patterns: uniquePatterns(card.patterns ?? []),
    };
    return {
      ...card,
      streak, attempts: card.attempts + 1,
      lastPlan: plan.trim().slice(0, 500), lastSuccess: success,
      dueAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
      history: [...(card.history ?? []), entry].slice(-MAX_RECORDED_ATTEMPTS_PER_CARD),
    };
  });
}

export function removePracticeCard(cards: PracticeCard[], id: string): PracticeCard[] {
  return cards.filter(card => card.id !== id);
}
