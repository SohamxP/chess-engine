
package com.chessengine.game;

import com.chessengine.board.Move;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class GameTest {

    @Test
    void whiteMovesFirst() {
        Game game = new Game();

        assertTrue(game.isWhiteToMove());
    }

    @Test
    void validMoveChangesTurn() {
        Game game = new Game();

        assertTrue(game.makeMove(new Move(6, 4, 4, 4)));
        assertFalse(game.isWhiteToMove());
    }

    @Test
    void blackCannotMoveFirst() {
        Game game = new Game();

        assertFalse(game.makeMove(new Move(1, 4, 3, 4)));
        assertTrue(game.isWhiteToMove());
    }

    @Test
    void cannotMoveFromEmptySquare() {
        Game game = new Game();

        assertFalse(game.makeMove(new Move(4, 4, 3, 4)));
    }

    @Test
    void cannotMoveOutsideBoard() {
        Game game = new Game();

        assertFalse(game.makeMove(new Move(6, 4, 8, 4)));
        assertFalse(game.makeMove(new Move(-1, 4, 3, 4)));
    }

    @Test
    void cannotMoveOntoFriendlyPiece() {
        Game game = new Game();

        assertFalse(game.makeMove(new Move(7, 1, 6, 3)));
    }

    @Test
    void validMovesAlternateTurns() {
        Game game = new Game();

        assertTrue(game.makeMove(new Move(6, 4, 4, 4))); // e4
        assertTrue(game.makeMove(new Move(1, 4, 3, 4))); // e5
        assertTrue(game.makeMove(new Move(7, 6, 5, 5))); // Nf3

        assertFalse(game.isWhiteToMove());
    }

    @Test
    void invalidMoveDoesNotChangeBoardOrTurn() {
        Game game = new Game();

        assertFalse(game.makeMove(new Move(6, 4, 3, 4)));

        assertEquals('P', game.getBoard().getPiece(6, 4));
        assertEquals('.', game.getBoard().getPiece(3, 4));
        assertTrue(game.isWhiteToMove());
    }

    @Test
    void cannotCaptureFriendlyPiece() {
        Game game = new Game();

        assertFalse(game.makeMove(new Move(7, 2, 6, 3)));
    }
}
