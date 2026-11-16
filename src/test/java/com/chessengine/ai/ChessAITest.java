package com.chessengine.ai;

import com.chessengine.board.Board;
import com.chessengine.board.FenParser;
import com.chessengine.board.Move;
import com.chessengine.game.DrawClaim;
import com.chessengine.game.Game;
import com.chessengine.game.GameStatus;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class ChessAITest {
    private final ChessAI ai = new ChessAI();
    private final PositionEvaluator evaluation = new PositionEvaluator();

    private static Move m(int fr, int fc, int tr, int tc) {
        return new Move(fr, fc, tr, tc);
    }

    @Test void balancedInitialMaterialAndPlacement() {
        assertEquals(0, evaluation.evaluate(new Board()));
    }

    @Test void materialDifferenceDeterminesEvaluationSign() {
        Board whiteQueen = FenParser.parse("4k3/8/8/8/8/8/8/3QK3 w - - 0 1");
        Board blackQueen = FenParser.parse("3qk3/8/8/8/8/8/8/4K3 w - - 0 1");
        assertTrue(evaluation.evaluate(whiteQueen) > 850);
        assertTrue(evaluation.evaluate(blackQueen) < -850);
    }

    @Test void centralKnightIsPreferredToEdgeKnight() {
        Board center = FenParser.parse("4k3/8/8/8/3N4/8/8/4K3 w - - 0 1");
        Board edge = FenParser.parse("4k3/8/8/8/8/8/8/N3K3 w - - 0 1");
        assertTrue(evaluation.evaluate(center) > evaluation.evaluate(edge));
    }

    @Test void pieceValuesUseCentipawns() {
        assertEquals(100, PositionEvaluator.pieceValue('P'));
        assertEquals(320, PositionEvaluator.pieceValue('n'));
        assertEquals(330, PositionEvaluator.pieceValue('B'));
        assertEquals(500, PositionEvaluator.pieceValue('R'));
        assertEquals(900, PositionEvaluator.pieceValue('q'));
        assertEquals(0, PositionEvaluator.pieceValue('K'));
    }

    @Test void openingMoveIsLegalAndSearchDoesNotMutateGame() {
        Game game = new Game();
        String before = game.toFen();
        int repetitions = game.getCurrentPositionCount();
        SearchResult result = ai.search(game, 2);
        assertTrue(game.getAllLegalMoves().contains(result.bestMove()));
        assertEquals(before, game.toFen());
        assertEquals(repetitions, game.getCurrentPositionCount());
        assertEquals(2, result.depth());
        assertTrue(result.nodesVisited() > 20);
    }

    @Test void deterministicSearchReturnsSameResult() {
        Game game = new Game();
        SearchResult one = ai.search(game, 2);
        SearchResult two = ai.search(game, 2);
        assertEquals(one.bestMove(), two.bestMove());
        assertEquals(one.scoreCentipawns(), two.scoreCentipawns());
    }

    @Test void alphaBetaFindsSameMoveAsPlainMinimaxAndCutsNodes() {
        Game game = new Game();
        SearchResult pruned = ai.search(game, 2);
        SearchResult baseline = ai.searchWithoutPruning(game, 2);
        assertEquals(baseline.bestMove(), pruned.bestMove());
        assertEquals(baseline.scoreCentipawns(), pruned.scoreCentipawns());
        assertTrue(pruned.nodesVisited() <= baseline.nodesVisited());
        assertTrue(pruned.alphaBetaCutoffs() > 0);
        assertEquals(0L, baseline.alphaBetaCutoffs());
    }

    @Test void findsFoolsMateInOneForBlack() {
        Game game = new Game(
            "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2");
        SearchResult result = ai.search(game, 1);
        assertEquals(m(0, 3, 4, 7), result.bestMove());
        assertTrue(result.scoreCentipawns() >= ChessAI.MATE_SCORE - 1);
        assertTrue(game.playMove(result.bestMove()));
        assertEquals(GameStatus.CHECKMATE, game.getStatus());
    }

    @Test void blackChoosesFreeRookCapture() {
        Game game = new Game("4k3/8/8/8/8/4q3/4R3/K7 b - - 0 1");
        assertEquals(m(5, 4, 6, 4), ai.chooseMove(game, 2));
    }

    @Test void whiteChoosesFreeQueenCapture() {
        Game game = new Game("4k3/8/8/8/8/4q3/4R3/K7 w - - 0 1");
        assertEquals(m(6, 4, 5, 4), ai.chooseMove(game, 1));
    }

    @Test void promotionSearchChoosesQueen() {
        Game game = new Game("7k/P7/8/8/8/8/8/4K3 w - - 0 1");
        assertEquals(new Move(1, 0, 0, 0, 'Q'), ai.chooseMove(game, 1));
    }

    @Test void seesEnPassantCapture() {
        Game game = new Game("k7/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
        assertEquals(m(3, 4, 2, 3), ai.chooseMove(game, 1));
    }

    @Test void checkmatedPlayerHasNoMoveAndNegativeMateScore() {
        Game game = new Game("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1");
        SearchResult result = ai.search(game, 2);
        assertEquals(null, result.bestMove());
        assertEquals(-ChessAI.MATE_SCORE, result.scoreCentipawns());
        assertEquals(1L, result.nodesVisited());
    }

    @Test void noMoveWhenStalemated() {
        Game game = new Game("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
        SearchResult result = ai.search(game, 2);
        assertEquals(null, result.bestMove());
        assertEquals(0, result.scoreCentipawns());
    }

    @Test void noMoveWhenAutomaticSeventyFiveMoveDraw() {
        Game game = new Game("4k2r/8/8/8/8/8/8/R3K3 w - - 150 50");
        assertEquals(GameStatus.DRAW_SEVENTY_FIVE_MOVE_RULE, game.getStatus());
        assertEquals(null, ai.chooseMove(game, 1));
    }

    @Test void noMoveWhenInsufficientMaterial() {
        assertEquals(null, ai.chooseMove(new Game("4k3/8/8/8/8/8/8/4K3 w - - 0 1"), 2));
    }

    @Test void noMoveAfterClaimedDraw() {
        Game game = new Game("4k2r/8/8/8/8/8/8/R3K3 w - - 100 50");
        assertTrue(game.claimDraw(DrawClaim.FIFTY_MOVE_RULE));
        assertEquals(null, ai.chooseMove(game, 1));
    }

    @Test void copiedGamePreservesRepetitionAndHasIndependentHistory() {
        Game original = new Game("4k2r/8/8/8/8/8/8/R3K3 w - - 0 1");
        assertTrue(original.makeMove(m(7, 0, 6, 0)));
        assertTrue(original.makeMove(m(0, 7, 1, 7)));
        assertTrue(original.makeMove(m(6, 0, 7, 0)));
        assertTrue(original.makeMove(m(1, 7, 0, 7)));
        assertEquals(2, original.getCurrentPositionCount());
        Game copy = original.copy();
        assertEquals(original.toFen(), copy.toFen());
        assertEquals(2, copy.getCurrentPositionCount());
        assertTrue(copy.makeMove(m(7, 0, 6, 0)));
        assertEquals(2, original.getCurrentPositionCount());
        assertEquals(2, copy.getCurrentPositionCount());
        assertFalse(original.toFen().equals(copy.toFen()));
    }

    @Test void copiedGamePreservesClaimedDraw() {
        Game game = new Game("4k2r/8/8/8/8/8/8/R3K3 w - - 100 50");
        assertTrue(game.claimDraw(DrawClaim.FIFTY_MOVE_RULE));
        Game copy = game.copy();
        assertEquals(GameStatus.DRAW_FIFTY_MOVE_RULE, copy.getStatus());
        assertFalse(copy.playMove(m(7, 0, 6, 0)));
    }

    @Test void rejectsZeroAndNegativeDepth() {
        Game game = new Game();
        assertThrows(IllegalArgumentException.class, () -> ai.search(game, 0));
        assertThrows(IllegalArgumentException.class, () -> ai.searchWithoutPruning(game, -1));
    }

    @Test void rejectsNullGame() {
        assertThrows(NullPointerException.class, () -> ai.search(null, 1));
    }
}
