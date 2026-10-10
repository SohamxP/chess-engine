
package com.chessengine;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import com.chessengine.rules.BishopMoveGenerator;

import java.util.List;

public class Main {

    public static void main(String[] args) {

        Board board = new Board();
        BishopMoveGenerator bishopGenerator =
                new BishopMoveGenerator();

        // Clear path for bishop at c1
        board.makeMove(new Move(6, 3, 4, 3));

        // Move black pawn from f7 to f4
        // Used to test diagonal capture
        board.makeMove(new Move(1, 5, 4, 5));

        System.out.println("Test Board:");
        board.printBoard();

        List<Move> moves =
                bishopGenerator.generateMoves(board, 7, 2);

        System.out.println("\nBishop moves from c1:");

        for (Move move : moves) {
            System.out.println(move);
        }

        System.out.println("\nNumber of moves: " + moves.size());
    }
}
