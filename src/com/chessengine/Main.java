
package com.chessengine;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import com.chessengine.rules.PawnMoveGenerator;

import java.util.List;

public class Main {

    public static void main(String[] args) {

        Board board = new Board();
        PawnMoveGenerator pawnGenerator = new PawnMoveGenerator();

        System.out.println("Initial Board:");
        board.printBoard();

        // Generate moves for white pawn at e2
        List<Move> moves = pawnGenerator.generateMoves(
            board, 6, 4
        );

        System.out.println("\nPossible moves for pawn at e2:");

        for (Move move : moves) {
            System.out.println(move);
        }

        // Move pawn from e2 to e4
        board.makeMove(new Move(6, 4, 4, 4));

        System.out.println("\nAfter e2 to e4:");
        board.printBoard();

        // Generate moves for pawn now at e4
        moves = pawnGenerator.generateMoves(board, 4, 4);

        System.out.println("\nPossible moves for pawn at e4:");

        for (Move move : moves) {
            System.out.println(move);
        }
    }
}
