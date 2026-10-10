
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import java.util.ArrayList;
import java.util.List;

public class QueenMoveGenerator {

    private final RookMoveGenerator rookGenerator =
            new RookMoveGenerator();

    private final BishopMoveGenerator bishopGenerator =
            new BishopMoveGenerator();

    public List<Move> generateMoves(Board board, int row, int col) {

        List<Move> moves = new ArrayList<>();

        char queen = board.getPiece(row, col);

        if (queen != 'Q' && queen != 'q') {
            return moves;
        }

        // Rook and bishop generators require their own piece types.
        // Generate queen moves directly in all eight directions.
        int[][] directions = {
            {-1, 0}, {1, 0}, {0, -1}, {0, 1},
            {-1, -1}, {-1, 1}, {1, -1}, {1, 1}
        };

        for (int[] direction : directions) {

            int newRow = row + direction[0];
            int newCol = col + direction[1];

            while (newRow >= 0 && newRow < 8 &&
                   newCol >= 0 && newCol < 8) {

                char target = board.getPiece(newRow, newCol);

                if (target == '.') {
                    moves.add(new Move(row, col, newRow, newCol));
                } else {
                    if (Character.isUpperCase(queen)
                            != Character.isUpperCase(target)
                            && Character.toLowerCase(target) != 'k') {

                        moves.add(new Move(row, col, newRow, newCol));
                    }

                    break;
                }

                newRow += direction[0];
                newCol += direction[1];
            }
        }

        return moves;
    }
}
