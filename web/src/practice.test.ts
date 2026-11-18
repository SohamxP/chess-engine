import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  PRACTICE_KEY, duePracticeCards, makePracticeCards, readPracticeCards,
  recordPracticeAttempt, removePracticeCard, writePracticeCards,
} from './practice';
import { startingFen, type GameState, type MoveEntry } from './chess';
import type { PositionEvaluation } from './review';

function fixture(): GameState {
  const board = new Chess();
  const history: MoveEntry[] = [];
  for (const uci of ['e2e4', 'e7e5', 'g1f3']) {
    const played = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    history.push({
      ply: history.length + 1, white: played.color === 'w', ai: false,
      uci, san: played.san, fen: board.fen(),
    });
  }
  return {
    id: 'match-5', fen: board.fen(), initialFen: startingFen, moveHistory: history,
    status: 'IN_PROGRESS', whiteToMove: false, humanWhite: true, depth: 2,
    inCheck: false, aiTurn: true, canUndo: false, canClaimThreefold: false,
    canClaimFifty: false, legalMoves: [], lastMove: null, aiStats: null,
  };
}

const evalAt = (cp: number, bestMove: string): PositionEvaluation => ({
  cp, mate: null, bestMove, depth: 10,
});
const analysis = [
  evalAt(0, 'd2d4'), evalAt(-200, 'e7e5'), evalAt(-160, 'b1c3'), evalAt(-500, 'b8c6'),
];
const time = new Date('2026-11-17T18:00:00.000Z');

describe('Decision Lab practice deck', () => {
  it('captures only the human mistakes, saving legal pre-move positions', () => {
    const { cards, added } = makePracticeCards(fixture(), analysis, [], time);
    expect(added).toBe(2);
    expect(cards.map(card => card.id)).toEqual(['match-5:1', 'match-5:3']);
    expect(cards[0].fen).toBe(startingFen);
    expect(cards[1].fen).toBe(fixture().moveHistory[1].fen);
    expect(cards[0].originalSan).toBe('e4');
    expect(cards[0].dueAt).toBe(time.toISOString());
    expect(cards.every(card => card.white)).toBe(true);
  });

  it('preserves progress when a game is imported twice', () => {
    const initial = makePracticeCards(fixture(), analysis, [], time).cards;
    const practiced = recordPracticeAttempt(initial, 'match-5:1', true, 'Develop my pieces.', time);
    const repeated = makePracticeCards(fixture(), analysis, practiced, new Date('2026-11-18'));
    expect(repeated.added).toBe(0);
    expect(repeated.cards[0].streak).toBe(1);
    expect(repeated.cards[0].lastPlan).toBe('Develop my pieces.');
    expect(repeated.cards[0].dueAt).toBe('2026-11-18T18:00:00.000Z');
  });

  it('schedules repeated recall, resets after a miss, and counts attempts', () => {
    let cards = makePracticeCards(fixture(), analysis, [], time).cards;
    cards = recordPracticeAttempt(cards, 'match-5:1', true, '  I need activity  ', time);
    expect(cards[0].dueAt).toBe('2026-11-18T18:00:00.000Z');
    cards = recordPracticeAttempt(cards, 'match-5:1', true, 'reconsider', new Date(cards[0].dueAt));
    expect(cards[0].dueAt).toBe('2026-11-21T18:00:00.000Z');
    expect(cards[0].streak).toBe(2);
    cards = recordPracticeAttempt(cards, 'match-5:1', false, 'missed tactic', new Date(cards[0].dueAt));
    expect(cards[0].streak).toBe(0);
    expect(cards[0].attempts).toBe(3);
    expect(cards[0].lastSuccess).toBe(false);
    expect(cards[0].dueAt).toBe('2026-11-22T18:00:00.000Z');
    expect(cards[1].attempts).toBe(0);
    expect(duePracticeCards(cards, new Date('2026-11-17T18:01:00Z')).map(card => card.id))
      .toEqual(['match-5:3']);
  });

  it('persists defensively, filters tampering and allows removing a position', () => {
    const values = new Map<string, string>();
    const storage = {
      setItem: (key: string, val: string) => { values.set(key, val); },
      getItem: (key: string) => values.get(key) ?? null,
    };
    const cards = makePracticeCards(fixture(), analysis, [], time).cards;
    expect(writePracticeCards(cards, storage)).toBe(true);
    expect(readPracticeCards(storage)).toEqual(cards);
    expect(removePracticeCard(cards, 'match-5:1').map(item => item.id)).toEqual(['match-5:3']);
    expect(writePracticeCards(cards, { setItem() { throw Error('quota'); } })).toBe(false);
    storage.setItem(PRACTICE_KEY, '{bad JSON');
    expect(readPracticeCards(storage)).toEqual([]);
    storage.setItem(PRACTICE_KEY, JSON.stringify([
      { ...cards[0], fen: 'invalid' }, cards[1], cards[1], { ...cards[0], dueAt: 'bad' },
    ]));
    expect(readPracticeCards(storage)).toEqual([cards[1]]);
  });

  it('does not introduce corrupted pre-move positions to a training deck', () => {
    const broken = fixture();
    broken.initialFen = 'not a FEN';
    expect(makePracticeCards(broken, analysis.slice(0, 2), [], time).cards).toEqual([]);
  });
});
