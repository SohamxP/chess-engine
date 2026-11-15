package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import java.util.ArrayList;
import java.util.List;

public class PawnMoveGenerator {
    private void addMove(List<Move> moves, int fr, int fc, int tr, int tc) {
        if (tr == 0 || tr == 7) {
            for (char promotion : new char[]{'Q', 'R', 'B', 'N'}) {
                moves.add(new Move(fr, fc, tr, tc, promotion));
            }
        } else moves.add(new Move(fr, fc, tr, tc));
    }

    public List<Move> generateMoves(Board board, int row, int col) {
        List<Move> moves = new ArrayList<>();
        char pawn = board.getPiece(row, col);
        if (pawn != 'P' && pawn != 'p') return moves;
        boolean white = pawn == 'P';
        int direction = white ? -1 : 1;
        int nextRow = row + direction;
        if (nextRow < 0 || nextRow >= 8) return moves;
        if (board.getPiece(nextRow, col) == '.') {
            addMove(moves, row, col, nextRow, col);
            int twoRows = row + 2 * direction;
            if (row == (white ? 6 : 1) && board.getPiece(twoRows, col) == '.') {
                moves.add(new Move(row, col, twoRows, col));
            }
        }
        for (int dc : new int[]{-1, 1}) {
            int c = col + dc;
            if (c < 0 || c >= 8) continue;
            char target = board.getPiece(nextRow, c);
            if (target != '.' && Character.isUpperCase(target) != white
                    && Character.toLowerCase(target) != 'k') {
                addMove(moves, row, col, nextRow, c);
            } else if (target == '.' && nextRow == board.getEnPassantRow()
                    && c == board.getEnPassantCol()
                    && row == (white ? 3 : 4)
                    && board.getPiece(row, c) == (white ? 'p' : 'P')) {
                moves.add(new Move(row, col, nextRow, c));
            }
        }
        return moves;
    }
}
