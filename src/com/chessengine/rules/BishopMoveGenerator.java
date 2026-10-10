
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import java.util.ArrayList;
import java.util.List;

public class BishopMoveGenerator {

    private static final int[][] DIRECTIONS = {
        {-1, -1},
        {-1, 1},
        {1, -1},
        {1, 1}
    };

    public List<Move> generateMoves(
            Board board, int row, int col) {

        List<Move> moves = new ArrayList<>();

        char bishop = board.getPiece(row, col);

        if (bishop != 'B' && bishop != 'b') {
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
                    // Capture opponent's piece, but not king
                    if (Character.isUpperCase(bishop)
                            != Character.isUpperCase(target)
                            && Character.toLowerCase(target) != 'k') {

                        moves.add(
                            new Move(row, col, newRow, newCol)
                        );
                    }

                    // Cannot move beyond an occupied square
                    break;
                }

                newRow += direction[0];
                newCol += direction[1];
            }
        }

        return moves;
    }
}
