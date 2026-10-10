
package com.chessengine.game;

import com.chessengine.board.Move;
import com.chessengine.game.Game;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class CheckResolutionTest {

    @Test
    void detectsFoolsMateCheck() {
        Game game = new Game();

        assertTrue(game.makeMove(new Move(6, 5, 5, 5))); // f3
        assertTrue(game.makeMove(new Move(1, 4, 3, 4))); // e5
        assertTrue(game.makeMove(new Move(6, 6, 4, 6))); // g4
        assertTrue(game.makeMove(new Move(0, 3, 4, 7))); // Qh4+

        assertTrue(game.isInCheck());
        assertTrue(game.isWhiteToMove());
    }

    @Test
    void cannotIgnoreCheck() {
        Game game = new Game();

        game.makeMove(new Move(6, 5, 5, 5)); // f3
        game.makeMove(new Move(1, 4, 3, 4)); // e5
        game.makeMove(new Move(6, 6, 4, 6)); // g4
        game.makeMove(new Move(0, 3, 4, 7)); // Qh4+

        // White cannot ignore the check by moving a2-a3.
        assertFalse(
            game.makeMove(new Move(6, 0, 5, 0))
        );

        assertTrue(game.isWhiteToMove());
        assertEquals(
            'P', game.getBoard().getPiece(6, 0)
        );
    }

    @Test
    void detectsQueensCheckOnOpenDiagonal() {
        Game game = new Game();

        assertTrue(game.makeMove(new Move(6, 4, 4, 4))); // e4
        assertTrue(game.makeMove(new Move(1, 5, 2, 5))); // f6
        assertTrue(game.makeMove(new Move(6, 3, 4, 3))); // d4
        assertTrue(game.makeMove(new Move(1, 6, 3, 6))); // g5

        // Queen moves to h5, attacking the black king
        // along h5-g6-f7-e8.
        assertTrue(game.makeMove(new Move(7, 3, 3, 7))); // Qh5+

        assertTrue(game.isInCheck());
        assertFalse(game.isWhiteToMove());
    }

}
