
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class KingMoveGeneratorTest {

    @Test
    void testKingInitiallyBlocked() {
        Board board = new Board();
        KingMoveGenerator generator = new KingMoveGenerator();

        assertEquals(0, generator.generateMoves(board, 7, 4).size());
    }

    @Test
    void testKingAfterClearingPawn() {
        Board board = new Board();
        KingMoveGenerator generator = new KingMoveGenerator();

        board.makeMove(new Move(6, 4, 4, 4));

        assertEquals(1, generator.generateMoves(board, 7, 4).size());
    }

    @Test
    void testKingCannotMoveFromEmptySquare() {
        Board board = new Board();
        KingMoveGenerator generator = new KingMoveGenerator();

        assertTrue(generator.generateMoves(board, 4, 4).isEmpty());
    }
}
