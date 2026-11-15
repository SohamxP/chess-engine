package com.chessengine.game;

import com.chessengine.board.Board;
import com.chessengine.board.FenParser;
import com.chessengine.board.Move;
import com.chessengine.rules.LegalMoveGenerator;
import com.chessengine.rules.AttackDetector;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

public class SpecialMovesTest {
    private final LegalMoveGenerator legal = new LegalMoveGenerator();
    private final AttackDetector attacks = new AttackDetector();

    private static Move m(int fr, int fc, int tr, int tc) { return new Move(fr, fc, tr, tc); }

    @Test void initialFenRoundTrip() {
        assertEquals("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", new Game().toFen());
    }

    @Test void blackTurnFromFen() {
        Game game = new Game("4k3/8/8/8/8/8/8/4K3 b - - 0 12");
        assertFalse(game.isWhiteToMove());
        assertFalse(game.makeMove(m(7, 4, 6, 4)));
        assertTrue(game.makeMove(m(0, 4, 1, 4)));
        assertTrue(game.isWhiteToMove());
        assertEquals(13, game.getBoard().getFullmoveNumber());
    }

    @Test void invalidCastlingRightsRejected() {
        assertThrows(IllegalArgumentException.class,
            () -> FenParser.parse("4k3/8/8/8/8/8/8/4K3 w KK - 0 1"));
    }

    @Test void copyKeepsAndIsolatesMetadata() {
        Board a = FenParser.parse("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 7 19");
        Board b = a.copy();
        assertEquals(a.toFen(), b.toFen());
        b.makeMove(m(7, 4, 7, 6));
        assertEquals("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 7 19", a.toFen());
    }

    @Test void whiteKingSideCastleMovesRook() {
        Game game = new Game("4k3/8/8/8/8/8/8/4K2R w K - 0 1");
        assertTrue(game.makeMove(m(7, 4, 7, 6)));
        assertEquals('K', game.getBoard().getPiece(7, 6));
        assertEquals('R', game.getBoard().getPiece(7, 5));
        assertEquals('.', game.getBoard().getPiece(7, 7));
        assertFalse(game.getBoard().canCastleKingSide(true));
    }

    @Test void whiteQueenSideCastleMovesRook() {
        Game game = new Game("4k3/8/8/8/8/8/8/R3K3 w Q - 0 1");
        assertTrue(game.makeMove(m(7, 4, 7, 2)));
        assertEquals('K', game.getBoard().getPiece(7, 2));
        assertEquals('R', game.getBoard().getPiece(7, 3));
        assertEquals('.', game.getBoard().getPiece(7, 0));
    }

    @Test void blackKingSideCastleMovesRook() {
        Game game = new Game("r3k2r/8/8/8/8/8/8/4K3 b kq - 0 1");
        assertTrue(game.makeMove(m(0, 4, 0, 6)));
        assertEquals('k', game.getBoard().getPiece(0, 6));
        assertEquals('r', game.getBoard().getPiece(0, 5));
    }

    @Test void blackQueenSideCastleMovesRook() {
        Game game = new Game("r3k2r/8/8/8/8/8/8/4K3 b kq - 0 1");
        assertTrue(game.makeMove(m(0, 4, 0, 2)));
        assertEquals('k', game.getBoard().getPiece(0, 2));
        assertEquals('r', game.getBoard().getPiece(0, 3));
    }

    @Test void cannotCastleOutOfCheck() {
        Game game = new Game("k3r3/8/8/8/8/8/8/4K2R w K - 0 1");
        assertTrue(game.isInCheck());
        assertFalse(game.makeMove(m(7, 4, 7, 6)));
    }

    @Test void cannotCastleThroughAttack() {
        Game game = new Game("4kr2/8/8/8/8/8/8/4K2R w K - 0 1");
        assertFalse(game.makeMove(m(7, 4, 7, 6)));
    }

    @Test void cannotCastleIntoAttack() {
        Game game = new Game("4k1r1/8/8/8/8/8/8/4K2R w K - 0 1");
        assertFalse(game.makeMove(m(7, 4, 7, 6)));
    }

    @Test void cannotCastleWhenBlocked() {
        Game game = new Game("4k3/8/8/8/8/8/8/4KB1R w K - 0 1");
        assertFalse(game.makeMove(m(7, 4, 7, 6)));
    }

    @Test void cannotCastleWithoutRookEvenIfRightClaimed() {
        Game game = new Game("4k3/8/8/8/8/8/8/4K3 w K - 0 1");
        assertFalse(game.makeMove(m(7, 4, 7, 6)));
    }

    @Test void cannotCastleWithoutRights() {
        Game game = new Game("4k3/8/8/8/8/8/8/R3K2R w - - 0 1");
        assertFalse(game.makeMove(m(7, 4, 7, 6)));
        assertFalse(game.makeMove(m(7, 4, 7, 2)));
    }

    @Test void queenSideCastlingDoesNotRequireBFileToBeSafe() {
        Game game = new Game("1r5k/8/8/8/8/8/8/R3K3 w Q - 0 1");
        assertTrue(game.makeMove(m(7, 4, 7, 2)));
    }

    @Test void movingRookRevokesOwnSideRight() {
        Game game = new Game("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
        assertTrue(game.makeMove(m(7, 7, 6, 7)));
        assertFalse(game.getBoard().canCastleKingSide(true));
        assertTrue(game.getBoard().canCastleQueenSide(true));
        assertTrue(game.makeMove(m(0, 4, 1, 4)));
        assertTrue(game.makeMove(m(6, 7, 7, 7)));
        assertFalse(game.getBoard().canCastleKingSide(true));
    }

    @Test void movingKingRevokesBothRights() {
        Game game = new Game("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
        assertTrue(game.makeMove(m(7, 4, 6, 4)));
        assertFalse(game.getBoard().canCastleKingSide(true));
        assertFalse(game.getBoard().canCastleQueenSide(true));
    }

    @Test void capturingHomeRookRevokesRight() {
        Game game = new Game("4k2r/8/8/8/8/8/8/R3K2R b KQ - 0 1");
        assertTrue(game.makeMove(m(0, 7, 7, 7)));
        assertFalse(game.getBoard().canCastleKingSide(true));
        assertTrue(game.getBoard().canCastleQueenSide(true));
    }

    @Test void whiteEnPassantRemovesCapturedPawn() {
        Game game = new Game("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
        assertTrue(game.makeMove(m(3, 4, 2, 3)));
        assertEquals('P', game.getBoard().getPiece(2, 3));
        assertEquals('.', game.getBoard().getPiece(3, 3));
        assertEquals('.', game.getBoard().getPiece(3, 4));
        assertEquals(-1, game.getBoard().getEnPassantRow());
    }

    @Test void blackEnPassantRemovesCapturedPawn() {
        Game game = new Game("4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1");
        assertTrue(game.makeMove(m(4, 4, 5, 3)));
        assertEquals('p', game.getBoard().getPiece(5, 3));
        assertEquals('.', game.getBoard().getPiece(4, 3));
    }

    @Test void enPassantExpiresAfterOneMove() {
        Game game = new Game("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
        assertTrue(game.makeMove(m(7, 4, 6, 4)));
        assertTrue(game.makeMove(m(0, 4, 1, 4)));
        assertFalse(game.makeMove(m(3, 4, 2, 3)));
    }

    @Test void enPassantNeedsRealOpponentPawn() {
        Game game = new Game("4k3/8/8/4P3/8/8/8/4K3 w - d6 0 1");
        assertFalse(game.makeMove(m(3, 4, 2, 3)));
    }

    @Test void enPassantCannotExposeOwnKing() {
        Game game = new Game("k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
        assertFalse(game.makeMove(m(3, 4, 2, 3)));
    }

    @Test void enPassantCanResolveCheck() {
        Game game = new Game("k7/8/8/3pP3/4K3/8/8/8 w - d6 0 1");
        assertTrue(game.isInCheck());
        assertTrue(game.makeMove(m(3, 4, 2, 3)));
        assertFalse(attacks.isKingInCheck(game.getBoard(), true));
    }

    @Test void afterDoublePawnAdvanceFENHasEnPassantTarget() {
        Game game = new Game();
        assertTrue(game.makeMove(m(6, 4, 4, 4)));
        assertEquals("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", game.toFen());
        assertTrue(game.makeMove(m(1, 4, 3, 4)));
        assertEquals("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2", game.toFen());
    }

    @Test void oneRankPawnMoveClearsEnPassant() {
        Game game = new Game();
        assertTrue(game.makeMove(m(6, 4, 4, 4)));
        assertTrue(game.makeMove(m(1, 0, 2, 0)));
        assertEquals(-1, game.getBoard().getEnPassantRow());
    }

    @Test void whitePawnHasFourPromotionChoices() {
        Board board = FenParser.parse("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
        List<Move> moves = legal.generateLegalMoves(board, 1, 0);
        assertEquals(4, moves.size());
        for (char piece : new char[]{'Q', 'R', 'B', 'N'}) {
            assertTrue(moves.contains(new Move(1, 0, 0, 0, piece)));
        }
    }

    @Test void blackPawnHasFourPromotionChoices() {
        Board board = FenParser.parse("4k3/8/8/8/8/8/7p/4K3 b - - 0 1");
        List<Move> moves = legal.generateLegalMoves(board, 6, 7);
        assertEquals(4, moves.size());
    }

    @Test void whiteUnderPromotionToKnight() {
        Game game = new Game("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
        assertTrue(game.makeMove(new Move(1, 0, 0, 0, 'n')));
        assertEquals('N', game.getBoard().getPiece(0, 0));
    }

    @Test void blackUnderPromotionToRook() {
        Game game = new Game("4k3/8/8/8/8/8/7p/4K3 b - - 0 1");
        assertTrue(game.makeMove(new Move(6, 7, 7, 7, 'r')));
        assertEquals('r', game.getBoard().getPiece(7, 7));
    }

    @Test void promotionCaptureWorks() {
        Game game = new Game("1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1");
        assertTrue(game.makeMove(new Move(1, 0, 0, 1, 'B')));
        assertEquals('B', game.getBoard().getPiece(0, 1));
    }

    @Test void ordinaryPromotionDefaultsToQueen() {
        Game game = new Game("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
        assertTrue(game.makeMove(m(1, 0, 0, 0)));
        assertEquals('Q', game.getBoard().getPiece(0, 0));
    }

    @Test void cannotSpecifyPromotionOnOrdinaryMove() {
        Game game = new Game();
        assertFalse(game.makeMove(new Move(6, 4, 4, 4, 'Q')));
    }

    @Test void invalidPromotionPieceRejected() {
        assertThrows(IllegalArgumentException.class, () -> new Move(1, 0, 0, 0, 'K'));
    }

    @Test void promotionResetsHalfmoveClock() {
        Game game = new Game("4k3/P7/8/8/8/8/8/4K3 w - - 12 4");
        assertTrue(game.makeMove(new Move(1, 0, 0, 0, 'Q')));
        assertEquals(0, game.getBoard().getHalfmoveClock());
    }

    @Test void quietMoveIncrementsHalfmoveClock() {
        Game game = new Game("4k3/8/8/8/8/8/8/4K3 w - - 12 4");
        assertTrue(game.makeMove(m(7, 4, 6, 4)));
        assertEquals(13, game.getBoard().getHalfmoveClock());
    }

    @Test void generatedMoveSimulationPreservesOriginalFen() {
        Board board = FenParser.parse("r3k2r/8/8/3pP3/8/8/8/R3K2R w KQkq d6 14 8");
        String before = board.toFen();
        legal.generateLegalMoves(board, 7, 4);
        legal.generateLegalMoves(board, 3, 4);
        assertEquals(before, board.toFen());
    }

    @Test void blockedEnPassantDoesNotMutateGame() {
        Game game = new Game("k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
        String before = game.toFen();
        assertFalse(game.makeMove(m(3, 4, 2, 3)));
        assertEquals(before, game.toFen());
    }

    private long perft(Board board, int depth) {
        if (depth == 0) return 1;
        long count = 0;
        for (int r = 0; r < 8; r++) {
            for (int c = 0; c < 8; c++) {
                char p = board.getPiece(r, c);
                if (p == '.' || Character.isUpperCase(p) != board.isWhiteToMove()) continue;
                for (Move move : legal.generateLegalMoves(board, r, c)) {
                    Board next = board.copy();
                    next.makeMove(move);
                    count += perft(next, depth - 1);
                }
            }
        }
        return count;
    }


    @Test void gameLegalMovesRespectSideToMove() {
        Game game = new Game();
        assertEquals(2, game.getLegalMoves(6, 4).size());
        assertEquals(0, game.getLegalMoves(1, 4).size());
        assertEquals(0, game.getLegalMoves(-1, 4).size());
    }

    @Test void gameListsEveryPromotionChoice() {
        Game game = new Game("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
        assertEquals(4, game.getLegalMoves(1, 0).size());
    }

    @Test void initialPositionPerftDepthOne() { assertEquals(20L, perft(new Board(), 1)); }
    @Test void initialPositionPerftDepthTwo() { assertEquals(400L, perft(new Board(), 2)); }
    @Test void initialPositionPerftDepthThree() { assertEquals(8902L, perft(new Board(), 3)); }
    @Test void initialPositionPerftDepthFour() { assertEquals(197281L, perft(new Board(), 4)); }

    @Test void kiwipetePerftDepthFour() {
        assertEquals(4085603L, perft(FenParser.parse(
            "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"), 4));
    }

    @Test void kiwipetePerftDepthThree() {
        assertEquals(97862L, perft(FenParser.parse(
            "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"), 3));
    }

    @Test void discoveredCheckPerftDepthThree() {
        assertEquals(2812L, perft(FenParser.parse(
            "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1"), 3));
    }

    @Test void promotionsAndCastlingPerftDepthThree() {
        assertEquals(9467L, perft(FenParser.parse(
            "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1"), 3));
    }

    @Test void complexPromotionPerftDepthThree() {
        assertEquals(62379L, perft(FenParser.parse(
            "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8"), 3));
    }

    @Test void tacticalPositionPerftDepthThree() {
        assertEquals(89890L, perft(FenParser.parse(
            "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10"), 3));
    }
}
