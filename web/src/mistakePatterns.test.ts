import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { ArchivedGame } from './archive';
import { startingFen } from './chess';
import { clearMemoryAnalysisCache, saveCachedEvaluation } from './analysisCache';
import { inspectAnalyzedGame, loadPatternReport } from './mistakePatterns';
import type { PositionEvaluation } from './review';

const evaluated = (cp: number, depth: number, bestMove: string | null):
  PositionEvaluation => ({ cp, mate: null, bestMove, depth });

function gameWithMove(id: string, fen: string, uci: string, humanWhite = true): ArchivedGame {
  const chess = new Chess(fen);
  const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
  return {
    id, savedAt: '2026-11-20T12:00:00.000Z',
    game: {
      id, initialFen: fen, fen: chess.fen(), status: 'IMPORTED_UNFINISHED',
      whiteToMove: chess.turn() === 'w', inCheck: chess.inCheck(), humanWhite,
      depth: 0, aiTurn: false, canUndo: false, canClaimThreefold: false,
      canClaimFifty: false, legalMoves: [], lastMove: null, aiStats: null,
      moveHistory: [{
        ply: 1, white: move.color === 'w', ai: false, uci, san: move.san,
        fen: chess.fen(),
      }],
    },
  };
}

describe('high-confidence mistake pattern detection', () => {
  it('identifies a genuinely free major-piece capture with deep verified loss', () => {
    const item = gameWithMove('missed-rook', '4k3/8/8/8/8/8/3q4/K2R4 w - - 0 1', 'd1b1');
    const report = inspectAnalyzedGame(item, [
      evaluated(140, 16, 'd1d2'), evaluated(-190, 16, null),
    ]);
    expect(report.fullyScanned).toBe(true);
    expect(report.confirmedErrors).toBe(1);
    expect(report.evidence.map(e => e.kind)).toEqual(['missed-free-capture']);
    expect(report.evidence[0].explanation).toContain('queen');
    expect(report.evidence[0].betterSan).toContain('Rxd2');
    expect(report.evidence[0].lossCp).toBe(330);
  });

  it('detects an exposed queen only when the opponent has a free legal capture', () => {
    const fen = '4k3/8/8/8/8/4p3/8/K3Q3 w - - 0 1';
    const hanging = gameWithMove('exposed', fen, 'e1f2');
    const evaluations = [evaluated(0, 16, 'e1e3'), evaluated(-410, 16, null)];
    const result = inspectAnalyzedGame(hanging, evaluations);
    expect(result.evidence.map(e => e.kind)).toEqual(['exposed-major-piece']);
    expect(result.evidence[0].explanation).toContain('f2');

    // With the white king on g1, the pawn capturing on f2 can be
    // recaptured by the king. We must not call this a free queen.
    const defended = gameWithMove('defended',
      '4k3/8/8/8/8/4p3/8/4Q1K1 w - - 0 1', 'e1f2');
    expect(inspectAnalyzedGame(defended, evaluations).evidence).toEqual([]);
  });

  it('finds a missed forced mate in one even when mate and cp cannot be compared', () => {
    const chess = new Chess(startingFen);
    for (const san of ['f3', 'e5', 'g4']) chess.move(san);
    const item = gameWithMove('fools-mate', chess.fen(), 'b8c6', false);
    const before: PositionEvaluation = { cp: null, mate: -1, depth: 16, bestMove: 'd8h4' };
    const after = evaluated(-5, 10, 'g4h5');
    const result = inspectAnalyzedGame(item, [before, after]);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].kind).toBe('missed-mate-one');
    expect(result.evidence[0].betterSan).toContain('Qh4#');
    expect(result.evidence[0].lossCp).toBeNull();
    expect(result.evidence[0].number).toBe('2…');
  });

  it('never labels a large unverified depth-10 swing or a tiny deep score loss', () => {
    const item = gameWithMove('unverified',
      '4k3/8/8/8/8/8/3q4/K2R4 w - - 0 1', 'd1b1');
    const shallow = inspectAnalyzedGame(item, [
      evaluated(140, 10, 'd1d2'), evaluated(-300, 10, null),
    ]);
    expect(shallow.evidence).toHaveLength(0);
    expect(shallow.unverified).toBe(1);
    const tinyLoss = inspectAnalyzedGame(item, [
      evaluated(140, 16, 'd1d2'), evaluated(90, 16, null),
    ]);
    expect(tinyLoss.evidence).toHaveLength(0);
    expect(tinyLoss.confirmedErrors).toBe(0);
  });

  it('excludes opponent errors, corruption and unsupported material claims', () => {
    const fen = '4k3/8/8/8/8/8/3q4/K2R4 w - - 0 1';
    const item = gameWithMove('opponent', fen, 'd1b1', false);
    const positions = [evaluated(200, 16, 'd1d2'), evaluated(-200, 16, null)];
    expect(inspectAnalyzedGame(item, positions).evidence).toHaveLength(0);
    item.game.humanWhite = true;
    item.game.moveHistory[0].fen = startingFen; // corrupt unrelated snapshot
    expect(inspectAnalyzedGame(item, positions).evidence).toHaveLength(0);
  });

  it('aggregates examples per distinct game and preserves coverage honesty', async () => {
    clearMemoryAnalysisCache();
    const fen = '4k3/8/8/8/8/8/3q4/K2R4 w - - 0 1';
    const a = gameWithMove('game-a', fen, 'd1b1');
    const b = gameWithMove('game-b', fen, 'd1b1');
    const archivedButNotScanned = gameWithMove('game-c',
      startingFen, 'e2e4');
    const before = evaluated(130, 16, 'd1d2');
    const after = evaluated(-220, 16, null);
    await saveCachedEvaluation(a.game.initialFen, 10, evaluated(130, 10, 'd1d2'));
    await saveCachedEvaluation(a.game.fen, 10, evaluated(-220, 10, null));
    await saveCachedEvaluation(a.game.initialFen, 16, before);
    await saveCachedEvaluation(a.game.fen, 16, after);
    const report = await loadPatternReport([a, b, archivedButNotScanned]);
    expect(report.savedGames).toBe(3);
    expect(report.processedGames).toBe(3);
    expect(report.fullyScannedGames).toBe(2);
    expect(report.gradedDecisions).toBe(2);
    expect(report.groups.find(group => group.kind === 'missed-free-capture')).toMatchObject({
      occurrences: 2, games: 2,
    });
    expect(report.groups.find(group => group.kind === 'missed-free-capture')?.evidence
      .map(finding => finding.gameId)).toEqual(['game-a', 'game-b']);
  });

  it('honors cancellation before touching the next game', async () => {
    const a = gameWithMove('cancel', startingFen, 'e2e4');
    const controller = new AbortController();
    const progress: number[] = [];
    const result = await loadPatternReport([a, a, a], controller.signal, report => {
      progress.push(report.processedGames);
      controller.abort();
    });
    expect(progress).toEqual([1]);
    expect(result.processedGames).toBe(1);
    expect(result.savedGames).toBe(3);
  });
});
