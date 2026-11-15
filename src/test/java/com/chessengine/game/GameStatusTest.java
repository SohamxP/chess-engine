package com.chessengine.game;

import com.chessengine.board.Move;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class GameStatusTest {
    private static Move m(int fr, int fc, int tr, int tc) {
        return new Move(fr, fc, tr, tc);
    }

    private static void rookCycle(Game game) {
        assertTrue(game.makeMove(m(7, 0, 6, 0))); // Ra2
        assertTrue(game.makeMove(m(0, 7, 1, 7))); // ...Rh7
        assertTrue(game.makeMove(m(6, 0, 7, 0))); // Ra1
        assertTrue(game.makeMove(m(1, 7, 0, 7))); // ...Rh8
    }

    @Test void startingPositionIsOngoing() {
        Game game = new Game();
        assertEquals(GameStatus.IN_PROGRESS, game.getStatus());
        assertFalse(game.isGameOver());
        assertEquals(1, game.getCurrentPositionCount());
        assertEquals(20, game.getAllLegalMoves().size());
    }

    @Test void recognizesFoolsMateAndCorrectWinner() {
        Game game = new Game();
        assertTrue(game.playMove(m(6, 5, 5, 5))); // f3
        assertTrue(game.playMove(m(1, 4, 3, 4))); // ...e5
        assertTrue(game.playMove(m(6, 6, 4, 6))); // g4
        assertTrue(game.playMove(m(0, 3, 4, 7))); // ...Qh4#
        assertTrue(game.isInCheck());
        assertEquals(GameStatus.CHECKMATE, game.getStatus());
        assertTrue(game.didBlackWin());
        assertFalse(game.didWhiteWin());
        assertTrue(game.getAllLegalMoves().isEmpty());
        String fen = game.toFen();
        assertFalse(game.playMove(m(6, 0, 5, 0)));
        assertEquals(fen, game.toFen());
    }

    @Test void recognizesCheckmateFromFenForBlack() {
        Game game = new Game("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1");
        assertEquals(GameStatus.CHECKMATE, game.getStatus());
        assertTrue(game.didWhiteWin());
    }

    @Test void recognizesStalemateFromFen() {
        Game game = new Game("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
        assertFalse(game.isInCheck());
        assertEquals(GameStatus.STALEMATE, game.getStatus());
        assertTrue(game.getAllLegalMoves().isEmpty());
        assertFalse(game.didWhiteWin());
        assertFalse(game.didBlackWin());
        assertFalse(game.playMove(m(0, 7, 0, 6)));
    }

    @Test void checkWithAvailableEscapeIsNotCheckmate() {
        Game game = new Game("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
        assertTrue(game.isInCheck());
        assertEquals(GameStatus.IN_PROGRESS, game.getStatus());
        assertTrue(game.getAllLegalMoves().contains(m(7, 4, 6, 4)));
    }

    @Test void kingAgainstKingIsDead() {
        assertEquals(GameStatus.DRAW_INSUFFICIENT_MATERIAL,
            new Game("4k3/8/8/8/8/8/8/4K3 w - - 0 1").getStatus());
    }

    @Test void singleKnightAgainstKingIsDead() {
        assertEquals(GameStatus.DRAW_INSUFFICIENT_MATERIAL,
            new Game("4k3/8/8/8/8/8/8/2N1K3 w - - 0 1").getStatus());
    }

    @Test void singleBishopAgainstKingIsDead() {
        assertEquals(GameStatus.DRAW_INSUFFICIENT_MATERIAL,
            new Game("4k3/8/8/8/8/8/8/2B1K3 w - - 0 1").getStatus());
    }

    @Test void oppositeSidesSameColorBishopsAreDead() {
        assertEquals(GameStatus.DRAW_INSUFFICIENT_MATERIAL,
            new Game("4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1").getStatus());
    }

    @Test void oppositeColorBishopsAreNotIncorrectlyDeclaredDead() {
        assertEquals(GameStatus.IN_PROGRESS,
            new Game("2b1k3/8/8/8/8/8/8/2B1K3 w - - 0 1").getStatus());
    }

    @Test void twoKnightsAgainstKingAreNotAutomaticallyDead() {
        assertEquals(GameStatus.IN_PROGRESS,
            new Game("4k3/8/8/8/8/8/8/1NN1K3 w - - 0 1").getStatus());
    }

    @Test void pawnPreventsDeadMaterialDraw() {
        assertEquals(GameStatus.IN_PROGRESS,
            new Game("4k3/8/8/8/8/8/P7/4K3 w - - 0 1").getStatus());
    }

    @Test void thirdOccurrenceIsClaimableButNotAutomatic() {
        Game game = new Game("4k2r/8/8/8/8/8/8/R3K3 w - - 0 1");
        assertFalse(game.canClaimThreefoldRepetition());
        rookCycle(game);
        assertEquals(2, game.getCurrentPositionCount());
        assertFalse(game.canClaimThreefoldRepetition());
        rookCycle(game);
        assertEquals(3, game.getCurrentPositionCount());
        assertTrue(game.canClaimThreefoldRepetition());
        assertEquals(GameStatus.IN_PROGRESS, game.getStatus());
        assertTrue(game.claimDraw(DrawClaim.THREEFOLD_REPETITION));
        assertEquals(GameStatus.DRAW_THREEFOLD_REPETITION, game.getStatus());
        String fen = game.toFen();
        assertFalse(game.playMove(m(7, 0, 6, 0)));
        assertFalse(game.makeMove(m(7, 0, 6, 0)));
        assertEquals(fen, game.toFen());
    }

    @Test void fifthOccurrenceIsAutomatic() {
        Game game = new Game("4k2r/8/8/8/8/8/8/R3K3 w - - 0 1");
        for (int i = 0; i < 4; i++) rookCycle(game);
        assertEquals(5, game.getCurrentPositionCount());
        assertEquals(GameStatus.DRAW_FIVEFOLD_REPETITION, game.getStatus());
        assertFalse(game.playMove(m(7, 0, 6, 0)));
    }

    @Test void threefoldClaimBeforeEligibleIsRejected() {
        Game game = new Game();
        assertFalse(game.claimDraw(DrawClaim.THREEFOLD_REPETITION));
        assertFalse(game.claimDraw(null));
        assertEquals(GameStatus.IN_PROGRESS, game.getStatus());
    }

    @Test void fiftyMoveThresholdIsClaimableNotAutomatic() {
        Game game = new Game("4k2r/8/8/8/8/8/8/R3K3 w - - 100 50");
        assertEquals(GameStatus.IN_PROGRESS, game.getStatus());
        assertTrue(game.canClaimFiftyMoveRule());
        assertTrue(game.claimDraw(DrawClaim.FIFTY_MOVE_RULE));
        assertEquals(GameStatus.DRAW_FIFTY_MOVE_RULE, game.getStatus());
        assertFalse(game.playMove(m(7, 0, 6, 0)));
    }

    @Test void fiftyMoveClaimNotAvailableBeforeThreshold() {
        Game game = new Game("4k2r/8/8/8/8/8/8/R3K3 w - - 99 50");
        assertFalse(game.canClaimFiftyMoveRule());
        assertFalse(game.claimDraw(DrawClaim.FIFTY_MOVE_RULE));
        assertEquals(GameStatus.IN_PROGRESS, game.getStatus());
    }

    @Test void seventyFiveMoveThresholdAutomatic() {
        Game game = new Game("4k2r/8/8/8/8/8/8/R3K3 w - - 149 50");
        assertEquals(GameStatus.IN_PROGRESS, game.getStatus());
        assertTrue(game.playMove(m(7, 0, 6, 0)));
        assertEquals(150, game.getBoard().getHalfmoveClock());
        assertEquals(GameStatus.DRAW_SEVENTY_FIVE_MOVE_RULE, game.getStatus());
        assertFalse(game.playMove(m(0, 7, 1, 7)));
    }

    @Test void checkmateHasPrecedenceOverSeventyFiveMoveRule() {
        Game game = new Game("7k/8/5KQ1/8/8/8/8/8 w - - 149 1");
        assertTrue(game.playMove(m(2, 6, 1, 6)));
        assertEquals(150, game.getBoard().getHalfmoveClock());
        assertEquals(GameStatus.CHECKMATE, game.getStatus());
    }

    @Test void pawnMoveResetsFiftyMoveCount() {
        Game game = new Game("4k2r/8/8/8/8/8/P7/R3K3 w - - 99 20");
        assertTrue(game.playMove(m(6, 0, 5, 0)));
        assertEquals(0, game.getBoard().getHalfmoveClock());
        assertFalse(game.canClaimFiftyMoveRule());
    }

    @Test void captureResetsFiftyMoveCount() {
        Game game = new Game("4k2r/8/8/8/8/8/r7/R3K3 w - - 99 20");
        assertTrue(game.playMove(m(7, 0, 6, 0)));
        assertEquals(0, game.getBoard().getHalfmoveClock());
    }

    @Test void invalidMoveDoesNotRecordRepetition() {
        Game game = new Game();
        String fen = game.toFen();
        assertFalse(game.makeMove(m(6, 4, 3, 4)));
        assertEquals(fen, game.toFen());
        assertEquals(1, game.getCurrentPositionCount());
    }

    @Test void irrelevantEnPassantFlagDoesNotSplitPositionIdentity() {
        Game game = new Game("4k2r/8/8/8/3p4/8/8/R3K3 w - d6 0 1");
        rookCycle(game);
        assertEquals(2, game.getCurrentPositionCount());
    }

    @Test void legalEnPassantCaptureDoesDistinguishPositions() {
        Game game = new Game("4k2r/8/8/3pP3/8/8/8/R3K3 w - d6 0 1");
        rookCycle(game);
        assertEquals(1, game.getCurrentPositionCount());
    }

    @Test void illegalPinnedEnPassantDoesNotSplitPositionIdentity() {
        Game game = new Game("4r1kr/8/8/3pP3/8/8/8/R3K3 w - d6 0 1");
        rookCycle(game);
        assertEquals(2, game.getCurrentPositionCount());
    }

    @Test void castlingRightsDistinguishRepeatedPiecePlacement() {
        Game game = new Game("4k2r/8/8/8/8/8/8/R3K3 w Qk - 0 1");
        assertTrue(game.makeMove(m(7, 0, 6, 0)));
        assertTrue(game.makeMove(m(0, 4, 1, 4)));
        assertTrue(game.makeMove(m(6, 0, 7, 0)));
        assertTrue(game.makeMove(m(1, 4, 0, 4)));
        assertEquals(1, game.getCurrentPositionCount());
        assertEquals(GameStatus.IN_PROGRESS, game.getStatus());
    }

    @Test void strictPlayRejectsDeadPositionButAnalysisCanInspect() {
        Game game = new Game("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
        String fen = game.toFen();
        assertFalse(game.playMove(m(7, 4, 6, 4)));
        assertEquals(fen, game.toFen());
        assertTrue(game.makeMove(m(7, 4, 6, 4)));
    }
}
