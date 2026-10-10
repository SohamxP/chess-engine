
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import java.util.ArrayList;
import java.util.List;

public class RookMoveGenerator {

    private static final int[][] DIRECTIONS = {
        {-1, 0},  // Up
        {1, 0},   // Down
        {0, -1},  // Left
        {0, 1}    // Right
    };

    public List<Move> generateMoves(
            Board board, int row, int col) {

        List<Move> moves = new ArrayList<>();

        char rook = board.getPiece(row, col);

        if (rook != 'R' && rook != 'r') {
            return moves;
        }

        for (int[] direction : DIRECTIONS) {

            int newRow = row + direction[0];
            int newCol = col + direction[1];

            while (newRow >= 0 && newRow < 8 &&
                   newCol >= 0 && newCol < 8) {

                char target = board.getPiece(newRow, newCol);

                if (target == '.') {
                    moves.add(
                        new Move(row, col, newRow, newCol)
                    );
                }
                else {
                    // Capture enemy piece, except king
                    if (Character.isUpperCase(rook)
                            != Character.isUpperCase(target)
                            && Character.toLowerCase(target) != 'k') {

                        moves.add(
                            new Move(row, col, newRow, newCol)
                        );
                    }

                    // Stop when any piece blocks the path
                    break;
                }

                newRow += direction[0];
                newCol += direction[1];
            }
        }

        return moves;
    }
}
