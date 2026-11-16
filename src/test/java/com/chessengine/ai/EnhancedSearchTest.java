package com.chessengine.ai;

import com.chessengine.board.Move;
import com.chessengine.game.Game;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class EnhancedSearchTest {
    private static Move m(int fr, int fc, int tr, int tc) {
        return new Move(fr, fc, tr, tc);
    }

    @Test void iterativeDeepeningCompletesRequestedDepth() {
        ChessAI ai = new ChessAI();
        Game game = new Game();
        SearchResult result = ai.search(game, 3);
        assertEquals(3, result.depth());
        assertTrue(game.getAllLegalMoves().contains(result.bestMove()));
        assertTrue(result.nodesVisited() > 20);
    }

    @Test void transpositionTableReusesEarlierIterationPositions() {
        SearchResult result = new ChessAI().search(new Game(), 3);
        assertTrue(result.transpositionHits() > 0);
        assertTrue(result.alphaBetaCutoffs() > 0);
        assertTrue(result.quiescenceNodes() > 0);
    }

    @Test void cacheAndPruningAgreeWithReferenceAtDepthTwo() {
        ChessAI ai = new ChessAI();
        Game game = new Game();
        SearchResult enhanced = ai.search(game, 2);
        SearchResult baseline = ai.searchWithoutPruning(game, 2);
        assertEquals(baseline.bestMove(), enhanced.bestMove());
        assertEquals(baseline.scoreCentipawns(), enhanced.scoreCentipawns());
        assertTrue(enhanced.nodesVisited() < baseline.nodesVisited());
        assertEquals(0L, baseline.transpositionHits());
    }

    @Test void quiescenceAvoidsPoisonedQueenCaptureAtDepthOne() {
        // White can take the rook on d7, but ...Qxd7 immediately loses the queen.
        Game game = new Game("3q2k1/3r4/8/8/8/8/8/3QK3 w - - 0 1");
        Move poisoned = m(7, 3, 1, 3);
        assertTrue(game.getAllLegalMoves().contains(poisoned));
        Game afterCapture = game.copy();
        assertTrue(afterCapture.makeMove(poisoned));
        PositionEvaluator evaluator = new PositionEvaluator();
        assertTrue(evaluator.evaluate(afterCapture.getBoard()) > evaluator.evaluate(game.getBoard()));
        SearchResult result = new ChessAI().search(game, 1);
        assertFalse(poisoned.equals(result.bestMove()));
        assertTrue(result.quiescenceNodes() > 0);
    }

    @Test void quiescenceBaselineAndPrunedEvaluateTacticsEqually() {
        Game game = new Game("3q2k1/3r4/8/8/8/8/8/3QK3 w - - 0 1");
        ChessAI ai = new ChessAI();
        SearchResult pruned = ai.search(game, 1);
        SearchResult baseline = ai.searchWithoutPruning(game, 1);
        assertEquals(baseline.scoreCentipawns(), pruned.scoreCentipawns());
        assertEquals(baseline.bestMove(), pruned.bestMove());
        assertTrue(pruned.nodesVisited() < baseline.nodesVisited());
    }

    @Test void searchKeyPreservesRepetitionHistoryBeyondFen() {
        Game original = new Game("4k2r/8/8/8/8/8/8/R3K3 w - - 0 1");
        assertTrue(original.makeMove(m(7, 0, 6, 0)));
        assertTrue(original.makeMove(m(0, 7, 1, 7)));
        assertTrue(original.makeMove(m(6, 0, 7, 0)));
        assertTrue(original.makeMove(m(1, 7, 0, 7)));
        Game fresh = new Game(original.toFen());
        assertEquals(original.toFen(), fresh.toFen());
        assertFalse(original.getSearchKey().equals(fresh.getSearchKey()));
        assertEquals(original.getSearchKey(), original.copy().getSearchKey());
    }

    @Test void searchKeyChangesAfterNonRepetitionMove() {
        Game game = new Game();
        String before = game.getSearchKey();
        assertTrue(game.makeMove(m(6, 4, 4, 4)));
        assertFalse(before.equals(game.getSearchKey()));
    }

    @Test void repeatedSearchIsDeterministicAndDoesNotAlterHistory() {
        Game game = new Game();
        String before = game.getSearchKey();
        ChessAI ai = new ChessAI();
        SearchResult first = ai.search(game, 3);
        SearchResult second = ai.search(game, 3);
        assertEquals(first.bestMove(), second.bestMove());
        assertEquals(first.scoreCentipawns(), second.scoreCentipawns());
        assertEquals(first.transpositionHits(), second.transpositionHits());
        assertEquals(before, game.getSearchKey());
    }

    @Test void terminalGameReportsNoQuiescenceWork() {
        SearchResult result = new ChessAI().search(new Game("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1"), 3);
        assertEquals(null, result.bestMove());
        assertEquals(0L, result.quiescenceNodes());
        assertEquals(-ChessAI.MATE_SCORE, result.scoreCentipawns());
    }
}
