
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

public class PawnMoveGeneratorTest {

    @Test
    void testWhitePawnInitialMoves() {

        Board board = new Board();
        PawnMoveGenerator generator = new PawnMoveGenerator();

        // White pawn at e2
        List<Move> moves = generator.generateMoves(board, 6, 4);

        // e3 and e4
        assertEquals(2, moves.size());
    }

    @Test
    void testWhitePawnAfterMoving() {

        Board board = new Board();
        PawnMoveGenerator generator = new PawnMoveGenerator();

        // Move white pawn from e2 to e4
        board.makeMove(new Move(6, 4, 4, 4));

        List<Move> moves = generator.generateMoves(board, 4, 4);

        // Only e5 should be available
        assertEquals(1, moves.size());
    }

    @Test
    void testPawnBlockedByOwnPiece() {

        Board board = new Board();
        PawnMoveGenerator generator = new PawnMoveGenerator();

        // Move white knight from g1 to e3
        // e3 blocks the pawn at e2
        board.makeMove(new Move(7, 6, 5, 4));

        List<Move> moves = generator.generateMoves(board, 6, 4);

        assertEquals(0, moves.size());
    }
}
