package com.chessengine.ai;

import com.chessengine.board.Board;
import java.util.Objects;

/**
 * A deterministic material-and-placement evaluation in centipawns.
 * Positive scores favor White; negative scores favor Black.
 */
public final class PositionEvaluator {

    /** Does not assign material value to kings: checkmate is scored by search. */
    public static int pieceValue(char piece) {
        return switch (Character.toLowerCase(piece)) {
            case 'p' -> 100;
            case 'n' -> 320;
            case 'b' -> 330;
            case 'r' -> 500;
            case 'q' -> 900;
            default -> 0;
        };
    }

    public int evaluate(Board board) {
        Objects.requireNonNull(board, "board");
        int whiteMinusBlack = 0;
        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) {
                char piece = board.getPiece(row, col);
                if (piece == '.') continue;
                boolean white = Character.isUpperCase(piece);
                int score = pieceValue(piece) + placementBonus(piece, row, col, white);
                whiteMinusBlack += white ? score : -score;
            }
        }
        return whiteMinusBlack;
    }

    private int placementBonus(char piece, int row, int col, boolean white) {
        int fileDistance = Math.min(Math.abs(col - 3), Math.abs(col - 4));
        int rankDistance = Math.min(Math.abs(row - 3), Math.abs(row - 4));
        int center = 6 - fileDistance - rankDistance;
        return switch (Character.toLowerCase(piece)) {
            case 'p' -> (white ? 6 - row : row - 1) * 12 + (3 - fileDistance) * 4;
            case 'n' -> center * 6;
            case 'b' -> center * 3;
            case 'r' -> center;
            case 'q' -> center;
            default -> 0;
        };
    }
}
