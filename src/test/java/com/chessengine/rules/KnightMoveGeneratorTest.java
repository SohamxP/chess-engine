
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

public class KnightMoveGeneratorTest {

    @Test
    void testKnightInitialMoves() {
        Board board = new Board();
        KnightMoveGenerator generator = new KnightMoveGenerator();

        List<Move> moves = generator.generateMoves(board, 7, 6);

        assertEquals(2, moves.size());
    }

    @Test
    void testKnightAfterMoving() {
        Board board = new Board();
        KnightMoveGenerator generator = new KnightMoveGenerator();

        board.makeMove(new Move(7, 6, 5, 5));

        List<Move> moves = generator.generateMoves(board, 5, 5);

        assertEquals(5, moves.size());
    }

    @Test
    void testKnightCannotMoveFromEmptySquare() {
        Board board = new Board();
        KnightMoveGenerator generator = new KnightMoveGenerator();

        assertTrue(generator.generateMoves(board, 4, 4).isEmpty());
    }
}
