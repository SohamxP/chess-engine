
package com.chessengine.rules;

import com.chessengine.board.Board;

public class AttackDetector {

    private static final int[][] KNIGHT_OFFSETS = {
        {-2, -1}, {-2, 1}, {-1, -2}, {-1, 2},
        {1, -2}, {1, 2}, {2, -1}, {2, 1}
    };

    private static final int[][] STRAIGHT = {
        {-1, 0}, {1, 0}, {0, -1}, {0, 1}
    };

    private static final int[][] DIAGONAL = {
        {-1, -1}, {-1, 1}, {1, -1}, {1, 1}
    };

    private boolean inside(int row, int col) {
        return row >= 0 && row < 8 &&
               col >= 0 && col < 8;
    }

    private boolean matches(
            char piece, char type, boolean byWhite) {

        return Character.toLowerCase(piece) == type
            && Character.isUpperCase(piece) == byWhite;
    }

    public boolean isSquareAttacked(
            Board board, int row, int col, boolean byWhite) {

        // Pawn attacks: white pawns attack upward.
        int pawnRow = row + (byWhite ? 1 : -1);

        for (int dc : new int[]{-1, 1}) {
            int pawnCol = col + dc;

            if (inside(pawnRow, pawnCol) &&
                matches(board.getPiece(pawnRow, pawnCol),
                        'p', byWhite)) {
                return true;
            }
        }

        // Knight attacks
        for (int[] offset : KNIGHT_OFFSETS) {
            int r = row + offset[0];
            int c = col + offset[1];

            if (inside(r, c) &&
                matches(board.getPiece(r, c), 'n', byWhite)) {
                return true;
            }
        }

        // Adjacent enemy king attacks
        for (int dr = -1; dr <= 1; dr++) {
            for (int dc = -1; dc <= 1; dc++) {
                if (dr == 0 && dc == 0) continue;

                int r = row + dr;
                int c = col + dc;

                if (inside(r, c) &&
                    matches(board.getPiece(r, c), 'k', byWhite)) {
                    return true;
                }
            }
        }

        // Rook and queen attacks
        if (attackedAlong(
                board, row, col, byWhite, STRAIGHT, 'r')) {
            return true;
        }

        // Bishop and queen attacks
        return attackedAlong(
            board, row, col, byWhite, DIAGONAL, 'b'
        );
    }

    private boolean attackedAlong(
            Board board, int row, int col,
            boolean byWhite, int[][] directions,
            char pieceType) {

        for (int[] direction : directions) {
            int r = row + direction[0];
            int c = col + direction[1];

            while (inside(r, c)) {
                char piece = board.getPiece(r, c);

                if (piece != '.') {
                    if (Character.isUpperCase(piece) == byWhite) {
                        char type = Character.toLowerCase(piece);

                        if (type == pieceType || type == 'q') {
                            return true;
                        }
                    }

                    break;
                }

                r += direction[0];
                c += direction[1];
            }
        }

        return false;
    }

    public boolean isKingInCheck(
            Board board, boolean whiteKing) {

        char king = whiteKing ? 'K' : 'k';

        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) {
                if (board.getPiece(row, col) == king) {
                    return isSquareAttacked(
                        board, row, col, !whiteKing
                    );
                }
            }
        }

        throw new IllegalStateException(
            "King not found on board: " + king
        );
    }
}
