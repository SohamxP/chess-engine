
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class RookMoveGeneratorTest {

    @Test
    void testRookInitiallyBlocked() {
        Board board = new Board();
        RookMoveGenerator generator = new RookMoveGenerator();

        assertEquals(0, generator.generateMoves(board, 7, 0).size());
    }

    @Test
    void testRookAfterClearingPath() {
        Board board = new Board();
        RookMoveGenerator generator = new RookMoveGenerator();

        board.makeMove(new Move(6, 0, 4, 0));

        assertEquals(2, generator.generateMoves(board, 7, 0).size());
    }

    @Test
    void testRookCapture() {
        Board board = new Board();
        RookMoveGenerator generator = new RookMoveGenerator();

        board.makeMove(new Move(6, 0, 4, 0));
        board.makeMove(new Move(1, 1, 3, 0));
        board.makeMove(new Move(4, 0, 4, 1));

        assertEquals(4, generator.generateMoves(board, 7, 0).size());
    }
}
