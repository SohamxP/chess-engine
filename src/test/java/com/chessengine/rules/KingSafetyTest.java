
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

public class KingSafetyTest {

    private final LegalMoveGenerator legal =
            new LegalMoveGenerator();

    private final AttackDetector attacks =
            new AttackDetector();

    private boolean contains(
            List<Move> moves, int row, int col) {

        return moves.stream().anyMatch(
            move -> move.getToRow() == row
                 && move.getToCol() == col
        );
    }

    @Test
    void pinnedKnightCannotMove() {
        Board board = new Board();

        // Open the e-file and pin the white knight.
        board.makeMove(new Move(6, 4, 4, 4));
        board.makeMove(new Move(1, 4, 3, 4));
        board.makeMove(new Move(7, 6, 6, 4));
        board.makeMove(new Move(0, 0, 3, 4));
        board.makeMove(new Move(4, 4, 4, 3));

        assertTrue(
            legal.generateLegalMoves(board, 6, 4).isEmpty()
        );
    }

    @Test
    void kingCannotEnterAttackedSquare() {
        Board board = new Board();

        board.makeMove(new Move(6, 4, 4, 4));
        board.makeMove(new Move(0, 0, 5, 4));

        List<Move> moves =
                legal.generateLegalMoves(board, 7, 4);

        assertFalse(contains(moves, 6, 4));
    }

    @Test
    void kingCannotMoveNextToEnemyKing() {
        Board board = new Board();

        // Move black king to e3 for a controlled test.
        board.makeMove(new Move(0, 4, 5, 4));

        // Clear white pawn at e2.
        board.makeMove(new Move(6, 4, 4, 4));

        // White king cannot move to e2:
        // black king on e3 controls e2.
        assertFalse(
            legal.isLegalMove(
                board, new Move(7, 4, 6, 4)
            )
        );
    }

    @Test
    void simulatedMovesDoNotModifyBoard() {
        Board board = new Board();
        Board original = board.copy();

        legal.generateLegalMoves(board, 6, 4);
        legal.generateLegalMoves(board, 7, 6);

        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) {
                assertEquals(
                    original.getPiece(row, col),
                    board.getPiece(row, col)
                );
            }
        }
    }

    @Test
    void blackPawnAttacksDiagonally() {
        Board board = new Board();

        board.makeMove(new Move(1, 4, 3, 4));

        assertTrue(
            attacks.isSquareAttacked(board, 4, 3, false)
        );

        assertTrue(
            attacks.isSquareAttacked(board, 4, 5, false)
        );

        assertFalse(
            attacks.isSquareAttacked(board, 4, 4, false)
        );
    }
}
