package com.chessengine.board;

import java.util.Objects;

/** A move's promotion is Q, R, B, N or zero for an ordinary move. */
public final class Move {
    private final int fromRow, fromCol, toRow, toCol;
    private final char promotion;

    public Move(int fromRow, int fromCol, int toRow, int toCol) {
        this(fromRow, fromCol, toRow, toCol, '\0');
    }

    public Move(int fromRow, int fromCol, int toRow, int toCol, char promotion) {
        char normalized = promotion == '\0' ? '\0' : Character.toUpperCase(promotion);
        if (normalized != '\0' && "QRBN".indexOf(normalized) < 0) {
            throw new IllegalArgumentException("Promotion must be Q, R, B or N");
        }
        this.fromRow = fromRow;
        this.fromCol = fromCol;
        this.toRow = toRow;
        this.toCol = toCol;
        this.promotion = normalized;
    }

    public int getFromRow() { return fromRow; }
    public int getFromCol() { return fromCol; }
    public int getToRow() { return toRow; }
    public int getToCol() { return toCol; }
    public char getPromotion() { return promotion; }

    @Override
    public boolean equals(Object other) {
        if (!(other instanceof Move move)) return false;
        return fromRow == move.fromRow && fromCol == move.fromCol
            && toRow == move.toRow && toCol == move.toCol
            && promotion == move.promotion;
    }

    @Override
    public int hashCode() {
        return Objects.hash(fromRow, fromCol, toRow, toCol, promotion);
    }

    @Override
    public String toString() {
        return "(" + fromRow + ", " + fromCol + ") -> (" + toRow + ", " + toCol + ")"
            + (promotion == '\0' ? "" : "=" + promotion);
    }
}
