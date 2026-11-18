import { Chess } from 'chess.js';
import { frameAtPly, type GameState } from './chess';
import { buildReviewedMoves, type PositionEvaluation } from './review';

export const PRACTICE_KEY = 'plyforge-decision-lab-v1';
export const MAX_PRACTICE_CARDS = 180;
const INTERVAL_DAYS = [1, 3, 7, 14, 30];

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
}

/** Only the player's own measurable errors become practice prompts. */
export function makePracticeCards(
  game: GameState,
  positions: PositionEvaluation[],
  current: PracticeCard[],
  now = new Date(),
): { cards: PracticeCard[]; added: number } {
  const existing = new Set(current.map(card => card.id));
  const created: PracticeCard[] = [];
  for (const item of buildReviewedMoves(game.moveHistory, positions)) {
    if (item.move.white !== game.humanWhite ||
        !['Inaccuracy', 'Mistake', 'Blunder'].includes(item.grade)) continue;
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
    });
    existing.add(id);
  }
  return {
    cards: [...created, ...current].slice(0, MAX_PRACTICE_CARDS),
    added: created.length,
  };
}

function validCard(value: unknown): value is PracticeCard {
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
    (v.lastSuccess === null || typeof v.lastSuccess === 'boolean');
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

export function duePracticeCards(cards: PracticeCard[], now = new Date()): PracticeCard[] {
  return cards.filter(card => Date.parse(card.dueAt) <= now.getTime())
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.addedAt.localeCompare(b.addedAt));
}

/** A retry is recorded once after evaluation; intervals are deliberately simple and inspectable. */
export function recordPracticeAttempt(
  cards: PracticeCard[], id: string, success: boolean, plan: string, now = new Date(),
): PracticeCard[] {
  return cards.map(card => {
    if (card.id !== id) return card;
    const streak = success ? card.streak + 1 : 0;
    const days = success ? INTERVAL_DAYS[Math.min(streak - 1, INTERVAL_DAYS.length - 1)] : 1;
    return {
      ...card,
      streak, attempts: card.attempts + 1,
      lastPlan: plan.trim().slice(0, 500), lastSuccess: success,
      dueAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    };
  });
}

export function removePracticeCard(cards: PracticeCard[], id: string): PracticeCard[] {
  return cards.filter(card => card.id !== id);
}
