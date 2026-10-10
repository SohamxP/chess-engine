
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import java.util.ArrayList;
import java.util.List;

public class PawnMoveGenerator {

    public List<Move> generateMoves(
            Board board, int row, int col) {

        List<Move> moves = new ArrayList<>();

        char pawn = board.getPiece(row, col);

        if (pawn != 'P' && pawn != 'p') {
            return moves;
        }

        int direction = (pawn == 'P') ? -1 : 1;
        int startingRow = (pawn == 'P') ? 6 : 1;

        int nextRow = row + direction;

        // Move forward one square
        if (nextRow >= 0 && nextRow < 8 &&
                board.getPiece(nextRow, col) == '.') {

            moves.add(new Move(row, col, nextRow, col));

            // Move forward two squares from starting rank
            int twoRows = row + 2 * direction;

            if (row == startingRow &&
                    board.getPiece(twoRows, col) == '.') {

                moves.add(new Move(row, col, twoRows, col));
            }
        }

        // Diagonal captures
        for (int dc : new int[]{-1, 1}) {

            int newCol = col + dc;

            if (nextRow < 0 || nextRow >= 8 ||
                    newCol < 0 || newCol >= 8) {
                continue;
            }

            char target = board.getPiece(nextRow, newCol);

            if (target != '.' &&
                    Character.isUpperCase(pawn)
                    != Character.isUpperCase(target)
                    && Character.toLowerCase(target) != 'k') {

                moves.add(new Move(row, col, nextRow, newCol));
            }
        }

        return moves;
    }
}
