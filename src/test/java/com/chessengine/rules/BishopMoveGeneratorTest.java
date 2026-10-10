
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

public class BishopMoveGeneratorTest {

    @Test
    void testBishopInitiallyBlocked() {
        Board board = new Board();
        BishopMoveGenerator generator = new BishopMoveGenerator();

        assertEquals(0, generator.generateMoves(board, 7, 2).size());
    }

    @Test
    void testBishopAfterClearingPath() {
        Board board = new Board();
        BishopMoveGenerator generator = new BishopMoveGenerator();

        board.makeMove(new Move(6, 3, 4, 3));

        assertEquals(5, generator.generateMoves(board, 7, 2).size());
    }

    @Test
    void testBishopCapture() {
        Board board = new Board();
        BishopMoveGenerator generator = new BishopMoveGenerator();

        board.makeMove(new Move(6, 3, 4, 3));
        board.makeMove(new Move(1, 5, 4, 5));

        assertEquals(3, generator.generateMoves(board, 7, 2).size());
    }
}
