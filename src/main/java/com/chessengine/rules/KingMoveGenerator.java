package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import java.util.ArrayList;
import java.util.List;

public class KingMoveGenerator {
    private static final int[][] DIRECTIONS = {
        {-1, -1}, {-1, 0}, {-1, 1}, {0, -1}, {0, 1}, {1, -1}, {1, 0}, {1, 1}
    };

    public List<Move> generateMoves(Board board, int row, int col) {
        List<Move> moves = new ArrayList<>();
        char king = board.getPiece(row, col);
        if (king != 'K' && king != 'k') return moves;
        boolean white = king == 'K';
        for (int[] direction : DIRECTIONS) {
            int newRow = row + direction[0], newCol = col + direction[1];
            if (newRow < 0 || newRow >= 8 || newCol < 0 || newCol >= 8) continue;
            char target = board.getPiece(newRow, newCol);
            if (target == '.' || (Character.isUpperCase(target) != white
                    && Character.toLowerCase(target) != 'k')) {
                moves.add(new Move(row, col, newRow, newCol));
            }
        }
        int home = white ? 7 : 0;
        if (row == home && col == 4) {
            if (board.canCastleKingSide(white)
                    && board.getPiece(home, 7) == (white ? 'R' : 'r')
                    && board.getPiece(home, 5) == '.'
                    && board.getPiece(home, 6) == '.') {
                moves.add(new Move(row, col, home, 6));
            }
            if (board.canCastleQueenSide(white)
                    && board.getPiece(home, 0) == (white ? 'R' : 'r')
                    && board.getPiece(home, 1) == '.'
                    && board.getPiece(home, 2) == '.'
                    && board.getPiece(home, 3) == '.') {
                moves.add(new Move(row, col, home, 2));
            }
        }
        return moves;
    }
}
