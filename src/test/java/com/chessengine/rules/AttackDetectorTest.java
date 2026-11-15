
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class AttackDetectorTest {

    private final AttackDetector detector =
            new AttackDetector();

    @Test
    void initialKingsAreNotInCheck() {
        Board board = new Board();

        assertFalse(detector.isKingInCheck(board, true));
        assertFalse(detector.isKingInCheck(board, false));
    }

    @Test
    void detectsQueenAttackOnKing() {
        Board board = new Board();

        // Remove the pawn at f7, opening the f-file.
        board.makeMove(new Move(1, 5, 3, 5));

        // Place the white queen at f6.
        board.makeMove(new Move(7, 3, 2, 5));

        // Queen on f6 attacks the black king on e8
        // diagonally through e7, but e7 is occupied.
        assertFalse(detector.isKingInCheck(board, false));

        // Place the queen at e7, directly beside the king.
        board.makeMove(new Move(2, 5, 1, 4));

        assertTrue(detector.isKingInCheck(board, false));
    }

    @Test
    void detectsPawnAttacks() {
        Board board = new Board();

        // White pawn on e4
        board.makeMove(new Move(6, 4, 4, 4));

        assertTrue(detector.isSquareAttacked(board, 3, 3, true));
        assertTrue(detector.isSquareAttacked(board, 3, 5, true));
        assertFalse(detector.isSquareAttacked(board, 3, 4, true));
    }

    @Test
    void detectsKnightAttacks() {
        Board board = new Board();

        // White knight on f3
        board.makeMove(new Move(7, 6, 5, 5));

        assertTrue(detector.isSquareAttacked(board, 3, 4, true));
        assertTrue(detector.isSquareAttacked(board, 3, 6, true));
        assertFalse(detector.isSquareAttacked(board, 4, 5, true));
    }

    @Test
    void friendlyPiecesBlockSlidingAttacks() {
        Board board = new Board();

        // Black rook at a8 cannot attack a1
        // because pieces block the a-file.
        assertFalse(detector.isSquareAttacked(board, 7, 0, false));
    }
}
