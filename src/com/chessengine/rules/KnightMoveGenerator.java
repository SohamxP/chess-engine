
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import java.util.ArrayList;
import java.util.List;

public class KnightMoveGenerator {

    private static final int[][] DIRECTIONS = {
        {-2, -1}, {-2, 1},
        {-1, -2}, {-1, 2},
        {1, -2}, {1, 2},
        {2, -1}, {2, 1}
    };

    public List<Move> generateMoves(
            Board board, int row, int col) {

        List<Move> moves = new ArrayList<>();

        char knight = board.getPiece(row, col);

        if (knight != 'N' && knight != 'n') {
            return moves;
        }

        for (int[] direction : DIRECTIONS) {

            int newRow = row + direction[0];
            int newCol = col + direction[1];

            if (newRow < 0 || newRow >= 8 ||
                newCol < 0 || newCol >= 8) {
                continue;
            }

            char target = board.getPiece(newRow, newCol);

            if (target == '.') {
                moves.add(new Move(row, col, newRow, newCol));
            }
            else if (
                Character.isUpperCase(knight)
                    != Character.isUpperCase(target)
                && Character.toLowerCase(target) != 'k'
            ) {
                moves.add(new Move(row, col, newRow, newCol));
            }
        }

        return moves;
    }
}
