
package com.chessengine.rules;

import com.chessengine.board.Board;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class MoveGeneratorTest {

    @Test
    void generatesPawnMoves() {
        Board board = new Board();
        MoveGenerator generator = new MoveGenerator();

        assertEquals(2, generator.generateMoves(board, 6, 4).size());
    }

    @Test
    void generatesKnightMoves() {
        Board board = new Board();
        MoveGenerator generator = new MoveGenerator();

        assertEquals(2, generator.generateMoves(board, 7, 6).size());
    }

    @Test
    void generatesNoMovesForEmptySquare() {
        Board board = new Board();
        MoveGenerator generator = new MoveGenerator();

        assertTrue(generator.generateMoves(board, 4, 4).isEmpty());
    }

    @Test
    void rejectsCoordinatesOutsideBoard() {
        Board board = new Board();
        MoveGenerator generator = new MoveGenerator();

        assertTrue(generator.generateMoves(board, -1, 0).isEmpty());
        assertTrue(generator.generateMoves(board, 8, 8).isEmpty());
    }
}
