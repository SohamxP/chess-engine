
package com.chessengine;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import com.chessengine.rules.KnightMoveGenerator;

import java.util.List;

public class Main {

    public static void main(String[] args) {

        Board board = new Board();
        KnightMoveGenerator knightGenerator =
                new KnightMoveGenerator();

        System.out.println("Initial Board:");
        board.printBoard();

        // Test white knight at g1
        List<Move> moves =
                knightGenerator.generateMoves(board, 7, 6);

        System.out.println("\nPossible moves for knight at g1:");

        for (Move move : moves) {
            System.out.println(move);
        }

        // Move knight from g1 to f3
        board.makeMove(new Move(7, 6, 5, 5));

        System.out.println("\nAfter g1 to f3:");
        board.printBoard();

        // Generate moves from f3
        moves = knightGenerator.generateMoves(board, 5, 5);

        System.out.println("\nPossible moves for knight at f3:");

        for (Move move : moves) {
            System.out.println(move);
        }
    }
}
