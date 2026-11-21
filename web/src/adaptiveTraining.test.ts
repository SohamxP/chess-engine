import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { startingFen, type GameState } from './chess';
import { PATTERN_ORDER, type PatternEvidence } from './mistakePatterns';
import {
  PRACTICE_KEY, MAX_RECORDED_ATTEMPTS_PER_CARD, adaptiveIntervalDays,
  attachPatternEvidence, duePracticeCards, makePracticeCards,
  readPracticeCards, recurringThemeCounts, recordPracticeAttempt,
  trainingProgress, writePracticeCards, type PracticeCard,
} from './practice';
import type { PositionEvaluation } from './review';

const time = new Date('2026-11-21T12:00:00.000Z');
const later = new Date('2026-11-22T12:00:00.000Z');

function card(id: string, patterns?: PracticeCard['patterns']): PracticeCard {
  return {
    id, gameId: id.split(':')[0], ply: Number(id.split(':')[1]), fen: startingFen,
    white: true, originalUci: 'e2e4', originalSan: 'e4', addedAt: time.toISOString(),
    dueAt: time.toISOString(), streak: 0, attempts: 0, lastPlan: '', lastSuccess: null,
    ...(patterns ? { patterns } : {}),
  };
}

function evidence(gameId: string, ply: number, kind: PatternEvidence['kind']): PatternEvidence {
  return {
    id: gameId + ':' + ply + ':' + kind, kind, gameId,
    ply, gameTitle: 'Saved match', savedAt: time.toISOString(),
    number: '1.', moveSan: 'e4', betterSan: 'd4',
    lossCp: 200, explanation: 'Verified legal position',
  };
}

describe('adaptive training scheduling and records', () => {
  it('backfills verified patterns without resetting old streak, notes or schedules', () => {
    const old = { ...card('g1:1'), dueAt: later.toISOString(),
      attempts: 5, streak: 3, lastPlan: 'I looked for checks' };
    const tagged = attachPatternEvidence([old, card('g2:1')], [
      evidence('g1', 1, 'missed-free-capture'),
      evidence('g1', 1, 'missed-free-capture'),
      evidence('g2', 99, 'missed-mate-one'),
    ]);
    expect(tagged[0]).toEqual({ ...old, patterns: ['missed-free-capture'] });
    expect(tagged[1]).toEqual(card('g2:1'));
    expect(old.patterns).toBeUndefined();
    expect(attachPatternEvidence(tagged, [evidence('g1', 1, 'missed-free-capture')])[0])
      .toBe(tagged[0]);
  });

  it('uses distinct games to determine recurrence, not repeated moves in one game', () => {
    const cards = [card('g1:1', ['missed-free-capture']),
      card('g1:2', ['missed-free-capture']),
      card('g2:1', ['missed-free-capture']),
      card('g3:1', ['missed-mate-one'])];
    const counts = recurringThemeCounts(cards);
    expect(counts.get('missed-free-capture')).toBe(2);
    expect(counts.get('missed-mate-one')).toBe(1);
    expect(adaptiveIntervalDays(cards[0], 3, counts)).toBe(5);
    expect(adaptiveIntervalDays(cards[3], 3, counts)).toBe(7);
  });

  it('uses distinct saved-game evidence even when only one position was saved for training', () => {
    const onlyCard = [card('g1:1', ['missed-mate-one'])];
    const analyzed = new Map([['missed-mate-one' as const, 3]]);
    const next = recordPracticeAttempt(onlyCard, 'g1:1', true, '', time, analyzed);
    const second = recordPracticeAttempt(next, 'g1:1', true, '', new Date(next[0].dueAt), analyzed);
    const third = recordPracticeAttempt(second, 'g1:1', true, '', new Date(second[0].dueAt), analyzed);
    expect(third[0].history?.map(row => row.intervalDays)).toEqual([1, 2, 4]);
    expect(recurringThemeCounts(onlyCard, analyzed).get('missed-mate-one')).toBe(3);
  });

  it('shortens successive recall intervals for repeated verified themes', () => {
    const tagged = [card('g1:1', ['missed-free-capture']),
      card('g2:1', ['missed-free-capture'])];
    let deck = tagged;
    deck = recordPracticeAttempt(deck, 'g1:1', true, 'Look for undefended pieces', time);
    expect(deck[0].dueAt).toBe('2026-11-22T12:00:00.000Z');
    deck = recordPracticeAttempt(deck, 'g1:1', true, '', later);
    expect(deck[0].dueAt).toBe('2026-11-24T12:00:00.000Z');
    deck = recordPracticeAttempt(deck, 'g1:1', true, '', new Date(deck[0].dueAt));
    expect(deck[0].dueAt).toBe('2026-11-29T12:00:00.000Z');
    expect(deck[0].history?.map(entry => entry.intervalDays)).toEqual([1, 2, 5]);
    expect(deck[0].streak).toBe(3);
    expect(deck[0].history?.every(entry => entry.patterns[0] === 'missed-free-capture'))
      .toBe(true);
    expect(tagged[0].history).toBeUndefined();
  });

  it('keeps legacy fixed intervals, resets a failure and ignores early rehearsals', () => {
    let deck = [card('old:1')];
    deck = recordPracticeAttempt(deck, 'old:1', true, 'calm', time);
    expect(deck[0].dueAt).toBe(later.toISOString());
    const early = recordPracticeAttempt(deck, 'old:1', true, 'trying ahead', time);
    expect(early[0]).toBe(deck[0]);
    deck = recordPracticeAttempt(deck, 'old:1', true, 'calm', later);
    expect(deck[0].dueAt).toBe('2026-11-25T12:00:00.000Z');
    deck = recordPracticeAttempt(deck, 'old:1', false, 'forgot', new Date(deck[0].dueAt));
    expect(deck[0].streak).toBe(0);
    expect(deck[0].lastSuccess).toBe(false);
    expect(deck[0].history?.map(entry => entry.success)).toEqual([true, true, false]);
    expect(deck[0].history?.map(entry => entry.intervalDays)).toEqual([1, 3, 1]);
    expect(deck[0].attempts).toBe(3);
  });

  it('prioritizes failure and distinct-game themes only among currently due cards', () => {
    const deck = [card('old:1'), card('g1:1', ['missed-mate-one']),
      card('g2:1', ['missed-mate-one']),
      { ...card('g3:1'), lastSuccess: false },
      { ...card('future:1', ['missed-mate-one']), dueAt: later.toISOString() }];
    const priority = duePracticeCards(deck, time).map(row => row.id);
    expect(priority).toEqual(['g3:1', 'g1:1', 'g2:1', 'old:1']);
  });

  it('records honest 30-day and per-pattern sample sizes', () => {
    const first = {
      ...card('g1:1', ['missed-free-capture']),
      history: [
        { at: '2026-10-01T12:00:00.000Z', success: true, intervalDays: 1,
          patterns: ['missed-free-capture' as const] },
        { at: '2026-11-20T12:00:00.000Z', success: false, intervalDays: 1,
          patterns: ['missed-free-capture' as const] },
      ],
    };
    const second = { ...card('g2:1', ['missed-free-capture']),
      history: [{ at: '2026-11-19T12:00:00.000Z',
        success: true, intervalDays: 2,
        patterns: ['missed-free-capture' as const] }] };
    const p = trainingProgress([first, second, card('legacy:1')], time);
    expect(p).toMatchObject({
      totalAttempts: 3, correctAttempts: 2,
      last30Days: 2, correctLast30Days: 1, practicedPositions: 2,
    });
    expect(p.themes.find(row => row.kind === 'missed-free-capture'))
      .toMatchObject({ cards: 2, games: 2, attempts: 3, successes: 2 });
    expect(p.themes.find(row => row.kind === 'missed-mate-one'))
      .toMatchObject({ cards: 0, games: 0, attempts: 0, successes: 0 });
  });

  it('bounds detailed history and retains the lifetime attempts counter', () => {
    let deck = [card('g1:1')];
    for (let i = 0; i < MAX_RECORDED_ATTEMPTS_PER_CARD + 4; i++) {
      deck = recordPracticeAttempt(deck, 'g1:1', false, 'keep practicing',
        new Date(deck[0].dueAt));
    }
    expect(deck[0].history).toHaveLength(MAX_RECORDED_ATTEMPTS_PER_CARD);
    expect(deck[0].attempts).toBe(MAX_RECORDED_ATTEMPTS_PER_CARD + 4);
    expect(trainingProgress(deck, new Date(deck[0].dueAt)).totalAttempts)
      .toBe(MAX_RECORDED_ATTEMPTS_PER_CARD);
  });

  it('loads old browser cards unchanged and validates new metadata', () => {
    const saved = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => { saved.set(key, value); },
      getItem: (key: string) => saved.get(key) ?? null,
    };
    const original = card('legacy:1');
    expect(writePracticeCards([original], storage)).toBe(true);
    expect(readPracticeCards(storage)).toEqual([original]);
    const newer = recordPracticeAttempt([original], 'legacy:1', true, '', time);
    expect(writePracticeCards(newer, storage)).toBe(true);
    expect(readPracticeCards(storage)).toEqual(newer);
    saved.set(PRACTICE_KEY, JSON.stringify([
      { ...original, patterns: ['not-a-pattern'] },
      { ...original, history: [{ at: 'bogus', success: true, intervalDays: 2, patterns: [] }] },
      newer[0],
    ]));
    expect(readPracticeCards(storage)).toEqual(newer);
    expect(PATTERN_ORDER).toHaveLength(3);
  });

  it('recognizes verified free-capture errors when creating cards from review', () => {
    const chess = new Chess('4k3/8/8/8/8/8/3q4/K2R4 w - - 0 1');
    const initialFen = chess.fen();
    const actual = chess.move({ from: 'd1', to: 'b1' });
    const game: GameState = {
      id: 'g1', initialFen, fen: chess.fen(), status: 'IMPORTED_UNFINISHED',
      whiteToMove: false, inCheck: false, humanWhite: true, depth: 1,
      aiTurn: false, canUndo: false, canClaimThreefold: false,
      canClaimFifty: false, legalMoves: [], lastMove: null, aiStats: null,
      moveHistory: [{ ply: 1, white: true, ai: false, uci: 'd1b1',
        san: actual.san, fen: chess.fen() }],
    };
    const scores: PositionEvaluation[] = [
      { cp: 140, mate: null, bestMove: 'd1d2', depth: 16 },
      { cp: -190, mate: null, bestMove: null, depth: 16 },
    ];
    const result = makePracticeCards(game, scores, [], time);
    expect(result.added).toBe(1);
    expect(result.cards[0].patterns).toEqual(['missed-free-capture']);
    expect(result.cards[0].fen).toBe(initialFen);
  });
});
