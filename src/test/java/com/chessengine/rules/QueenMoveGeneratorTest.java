
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class QueenMoveGeneratorTest {

    @Test
    void testQueenInitiallyBlocked() {
        Board board = new Board();
        QueenMoveGenerator generator = new QueenMoveGenerator();

        assertEquals(0, generator.generateMoves(board, 7, 3).size());
    }

    @Test
    void testQueenAfterClearingPath() {
        Board board = new Board();
        QueenMoveGenerator generator = new QueenMoveGenerator();

        board.makeMove(new Move(6, 3, 4, 3));

        assertEquals(2, generator.generateMoves(board, 7, 3).size());
    }

    @Test
    void testQueenCannotMoveFromEmptySquare() {
        Board board = new Board();
        QueenMoveGenerator generator = new QueenMoveGenerator();

        assertTrue(generator.generateMoves(board, 4, 4).isEmpty());
    }
}
