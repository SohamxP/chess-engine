
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.FenParser;
import com.chessengine.board.Move;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class LegalMovePositionTest {

    private final LegalMoveGenerator legal =
            new LegalMoveGenerator();

    private final AttackDetector attacks =
            new AttackDetector();

    @Test
    void pinnedKnightCannotMove() {
        Board board = FenParser.parse(
            "k3r3/8/8/8/8/8/4N3/4K3 w - - 0 1"
        );

        assertTrue(
            legal.generateLegalMoves(board, 6, 4).isEmpty()
        );
    }

    @Test
    void pinnedRookCanMoveAlongPin() {
        Board board = FenParser.parse(
            "k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1"
        );

        assertTrue(
            legal.isLegalMove(
                board, new Move(6, 4, 5, 4)
            )
        );

        assertFalse(
            legal.isLegalMove(
                board, new Move(6, 4, 6, 5)
            )
        );
    }

    @Test
    void cannotIgnoreCheck() {
        Board board = FenParser.parse(
            "k3r3/8/8/8/8/8/P7/4K3 w - - 0 1"
        );

        assertTrue(attacks.isKingInCheck(board, true));

        assertFalse(
            legal.isLegalMove(
                board, new Move(6, 0, 5, 0)
            )
        );
    }

    @Test
    void kingCanEscapeCheck() {
        Board board = FenParser.parse(
            "k3r3/8/8/8/8/8/8/4K3 w - - 0 1"
        );

        assertTrue(attacks.isKingInCheck(board, true));

        assertTrue(
            legal.isLegalMove(
                board, new Move(7, 4, 7, 3)
            )
        );
    }

    
    @Test
    void bishopCanBlockCheck() {
        Board board = FenParser.parse(
            "k3r3/8/8/8/8/2B5/8/4K3 w - - 0 1"
        );

        assertTrue(attacks.isKingInCheck(board, true));

        // Bishop moves from c3 to e5, blocking the rook's attack.
        assertTrue(
            legal.isLegalMove(
                board, new Move(5, 2, 3, 4)
            )
        );

        // Bishop moving to b4 does not resolve the check.
        assertFalse(
            legal.isLegalMove(
                board, new Move(5, 2, 4, 1)
            )
        );
    }


    @Test
    void canCaptureCheckingRook() {
        Board board = FenParser.parse(
            "k7/8/8/8/8/8/4r3/4K3 w - - 0 1"
        );

        assertTrue(attacks.isKingInCheck(board, true));

        assertTrue(
            legal.isLegalMove(
                board, new Move(7, 4, 6, 4)
            )
        );
    }
}
