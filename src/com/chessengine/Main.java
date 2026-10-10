
package com.chessengine;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import com.chessengine.rules.RookMoveGenerator;

import java.util.List;

public class Main {

    public static void main(String[] args) {

        Board board = new Board();
        RookMoveGenerator rookGenerator =
                new RookMoveGenerator();

        // Test 1: Rook blocked in starting position
        System.out.println("Initial Board:");
        board.printBoard();

        List<Move> moves =
                rookGenerator.generateMoves(board, 7, 0);

        System.out.println("\nRook moves from a1:");
        System.out.println("Number of moves: " + moves.size());

        // Test 2: Clear the a-file
        board.makeMove(new Move(6, 0, 4, 0));

        System.out.println("\nAfter a2 to a4:");
        board.printBoard();

        moves = rookGenerator.generateMoves(board, 7, 0);

        System.out.println("\nRook moves from a1:");

        for (Move move : moves) {
            System.out.println(move);
        }

        System.out.println("Number of moves: " + moves.size());

        
        // Test 3: Place enemy pawn at a5
        board.makeMove(new Move(1, 1, 3, 0));

        // Move white pawn away from a4
        board.makeMove(new Move(4, 0, 4, 1));

        System.out.println("\nRook capture test:");
        board.printBoard();

        moves = rookGenerator.generateMoves(board, 7, 0);

        System.out.println("\nRook moves from a1:");

        for (Move move : moves) {
            System.out.println(move);
        }

        System.out.println("Number of moves: " + moves.size());
    }
}