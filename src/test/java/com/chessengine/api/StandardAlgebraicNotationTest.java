package com.chessengine.api;

import com.chessengine.board.Move;
import com.chessengine.game.Game;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class StandardAlgebraicNotationTest {
    private static Move m(int fr, int fc, int tr, int tc) {
        return new Move(fr, fc, tr, tc);
    }

    private static String san(String fen, Move move) {
        Game before = new Game(fen);
        Game after = before.copy();
        assertTrue(after.playMove(move), "Expected legal move: " + move);
        return StandardAlgebraicNotation.format(before, move, after);
    }

    @Test void pawnPushIsDestinationOnly() {
        assertEquals("e4", san(new Game().toFen(), m(6, 4, 4, 4)));
    }

    @Test void whiteAndBlackOpeningKnightNotation() {
        Game before = new Game();
        assertTrue(before.playMove(m(6, 4, 4, 4)));
        assertEquals("e5", san(before.toFen(), m(1, 4, 3, 4)));
        assertTrue(before.playMove(m(1, 4, 3, 4)));
        assertEquals("Nf3", san(before.toFen(), m(7, 6, 5, 5)));
    }

    @Test void pawnCaptureUsesOriginFile() {
        assertEquals("exd5", san("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1",
                m(4, 4, 3, 3)));
    }

    @Test void enPassantIsNormalPawnCaptureSan() {
        assertEquals("exd6", san("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1",
                m(3, 4, 2, 3)));
    }

    @Test void knightFileDisambiguation() {
        assertEquals("Nbd2", san("4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1",
                m(7, 1, 6, 3)));
    }

    @Test void knightRankDisambiguation() {
        assertEquals("N1d2", san("4k3/8/8/8/8/1N6/8/1N2K3 w - - 0 1",
                m(7, 1, 6, 3)));
    }

    @Test void knightFullSquareDisambiguation() {
        assertEquals("Nb1d2", san("4k3/8/8/8/8/1N6/8/1N2KN2 w - - 0 1",
                m(7, 1, 6, 3)));
    }

    @Test void kingsideAndQueensideCastling() {
        String fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
        assertEquals("O-O", san(fen, m(7, 4, 7, 6)));
        assertEquals("O-O-O", san(fen, m(7, 4, 7, 2)));
    }

    @Test void pawnPromotionWithAndWithoutCheck() {
        String fen = "7k/P7/8/8/8/8/8/4K3 w - - 0 1";
        assertEquals("a8=Q+", san(fen, new Move(1, 0, 0, 0, 'Q')));
        assertEquals("a8=N", san(fen, new Move(1, 0, 0, 0, 'N')));
    }

    @Test void checkAppendsPlus() {
        assertEquals("Qe2+", san("4k3/8/8/8/8/8/8/3QK3 w - - 0 1",
                m(7, 3, 6, 4)));
    }

    @Test void checkmateAppendsHash() {
        assertEquals("Qg7#", san("7k/8/5KQ1/8/8/8/8/8 w - - 0 1",
                m(2, 6, 1, 6)));
    }

    @Test void rejectsMoveNotLegalInOriginalPosition() {
        Game start = new Game();
        assertThrows(IllegalArgumentException.class, () ->
            StandardAlgebraicNotation.format(start, m(6, 4, 3, 4), start.copy()));
    }

    @Test void positionsAreNeverMutatedByNotation() {
        Game before = new Game();
        Game after = before.copy();
        assertTrue(after.playMove(m(6, 4, 4, 4)));
        String oldFen = before.toFen(), newFen = after.toFen();
        assertEquals("e4", StandardAlgebraicNotation.format(before, m(6, 4, 4, 4), after));
        assertEquals(oldFen, before.toFen());
        assertEquals(newFen, after.toFen());
    }
}
