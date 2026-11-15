
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class LegalMoveGeneratorTest {

    private final LegalMoveGenerator generator =
            new LegalMoveGenerator();

    @Test
    void initialPawnHasTwoLegalMoves() {
        Board board = new Board();

        assertEquals(
            2, generator.generateLegalMoves(board, 6, 4).size()
        );
    }

    @Test
    void initialKnightHasTwoLegalMoves() {
        Board board = new Board();

        assertEquals(
            2, generator.generateLegalMoves(board, 7, 6).size()
        );
    }

    @Test
    void pinnedPieceCannotExposeKing() {
        Board board = new Board();

        // Clear the e-file above the white king.
        board.makeMove(new Move(6, 4, 4, 4));
        board.makeMove(new Move(1, 4, 3, 4));

        // Move white knight onto e2.
        board.makeMove(new Move(7, 6, 6, 4));

        // Replace black pawn at e5 with black rook.
        board.makeMove(new Move(0, 0, 3, 4));

        // Remove white pawn from e4.
        board.makeMove(new Move(4, 4, 4, 3));

        // Knight on e2 is pinned to the king on e1.
        assertTrue(
            generator.generateLegalMoves(board, 6, 4).isEmpty()
        );
    }

    @Test
    void kingCannotMoveIntoAttack() {
        Board board = new Board();

        // Open e2 for the white king.
        board.makeMove(new Move(6, 4, 4, 4));

        // Place black rook on e3.
        board.makeMove(new Move(0, 0, 5, 4));

        assertFalse(
            generator.isLegalMove(
                board, new Move(7, 4, 6, 4)
            )
        );
    }

    @Test
    void simulationDoesNotModifyOriginalBoard() {
        Board board = new Board();

        generator.generateLegalMoves(board, 6, 4);

        assertEquals('P', board.getPiece(6, 4));
        assertEquals('.', board.getPiece(4, 4));
    }
}
