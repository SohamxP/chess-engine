package com.chessengine.board;

public class Board {
    private final char[][] squares;
    private boolean whiteToMove;
    private boolean whiteKingSide, whiteQueenSide, blackKingSide, blackQueenSide;
    private int enPassantRow, enPassantCol;
    private int halfmoveClock, fullmoveNumber;

    public Board() {
        this(new String[]{"rnbqkbnr", "pppppppp", "........", "........",
                          "........", "........", "PPPPPPPP", "RNBQKBNR"},
             true, true, true, true, true, -1, -1, 0, 1);
    }

    private Board(String[] rows, boolean whiteToMove,
            boolean whiteKingSide, boolean whiteQueenSide,
            boolean blackKingSide, boolean blackQueenSide,
            int enPassantRow, int enPassantCol,
            int halfmoveClock, int fullmoveNumber) {
        this.squares = new char[8][8];
        for (int r = 0; r < 8; r++) this.squares[r] = rows[r].toCharArray();
        this.whiteToMove = whiteToMove;
        this.whiteKingSide = whiteKingSide;
        this.whiteQueenSide = whiteQueenSide;
        this.blackKingSide = blackKingSide;
        this.blackQueenSide = blackQueenSide;
        this.enPassantRow = enPassantRow;
        this.enPassantCol = enPassantCol;
        this.halfmoveClock = halfmoveClock;
        this.fullmoveNumber = fullmoveNumber;
    }

    public static Board fromPosition(char[][] position) {
        if (position == null || position.length != 8) {
            throw new IllegalArgumentException("Board must have exactly 8 rows");
        }
        String[] rows = new String[8];
        for (int r = 0; r < 8; r++) {
            if (position[r] == null || position[r].length != 8) {
                throw new IllegalArgumentException("Each board row must have exactly 8 columns");
            }
            rows[r] = new String(position[r]);
        }
        return new Board(rows, true, false, false, false, false, -1, -1, 0, 1);
    }

    void setFenState(boolean activeWhite, String castling, int epRow, int epCol,
                     int halfmove, int fullmove) {
        whiteToMove = activeWhite;
        whiteKingSide = castling.contains("K");
        whiteQueenSide = castling.contains("Q");
        blackKingSide = castling.contains("k");
        blackQueenSide = castling.contains("q");
        enPassantRow = epRow;
        enPassantCol = epCol;
        halfmoveClock = halfmove;
        fullmoveNumber = fullmove;
    }

    public char getPiece(int row, int col) { return squares[row][col]; }
    public boolean isWhiteToMove() { return whiteToMove; }
    public boolean canCastleKingSide(boolean white) { return white ? whiteKingSide : blackKingSide; }
    public boolean canCastleQueenSide(boolean white) { return white ? whiteQueenSide : blackQueenSide; }
    public int getEnPassantRow() { return enPassantRow; }
    public int getEnPassantCol() { return enPassantCol; }
    public int getHalfmoveClock() { return halfmoveClock; }
    public int getFullmoveNumber() { return fullmoveNumber; }

    /** Applies a move without checking its legality. Game validates moves first. */
    public void makeMove(Move move) {
        int fr = move.getFromRow(), fc = move.getFromCol();
        int tr = move.getToRow(), tc = move.getToCol();
        char piece = squares[fr][fc];
        char captured = squares[tr][tc];
        boolean white = Character.isUpperCase(piece);
        boolean pawn = Character.toLowerCase(piece) == 'p';
        boolean king = Character.toLowerCase(piece) == 'k';
        boolean rook = Character.toLowerCase(piece) == 'r';
        boolean enPassant = pawn && fc != tc && captured == '.'
                && tr == enPassantRow && tc == enPassantCol;

        // A pawn capture en passant removes the pawn on its original rank.
        if (enPassant) {
            captured = squares[fr][tc];
            squares[fr][tc] = '.';
        }

        // Update rights for kings/rooks moved and original-square rooks captured.
        if (king) {
            if (white) { whiteKingSide = false; whiteQueenSide = false; }
            else { blackKingSide = false; blackQueenSide = false; }
        }
        if (rook) revokeRookRight(fr, fc);
        if (Character.toLowerCase(captured) == 'r' && !enPassant) revokeRookRight(tr, tc);

        squares[tr][tc] = piece;
        squares[fr][fc] = '.';

        // Move the rook as part of castling.
        if (king && fr == tr && fc == 4 && Math.abs(tc - fc) == 2) {
            if (tc == 6) {
                squares[fr][5] = squares[fr][7];
                squares[fr][7] = '.';
            } else if (tc == 2) {
                squares[fr][3] = squares[fr][0];
                squares[fr][0] = '.';
            }
        }

        if (pawn && (tr == 0 || tr == 7)) {
            char promotion = move.getPromotion() == '\0' ? 'Q' : move.getPromotion();
            squares[tr][tc] = white ? promotion : Character.toLowerCase(promotion);
        }

        enPassantRow = -1;
        enPassantCol = -1;
        if (pawn && fc == tc && Math.abs(tr - fr) == 2) {
            enPassantRow = (fr + tr) / 2;
            enPassantCol = fc;
        }
        halfmoveClock = (pawn || captured != '.') ? 0 : halfmoveClock + 1;
        if (!white) fullmoveNumber++;
        whiteToMove = !white;
    }

    private void revokeRookRight(int row, int col) {
        if (row == 7 && col == 0) whiteQueenSide = false;
        else if (row == 7 && col == 7) whiteKingSide = false;
        else if (row == 0 && col == 0) blackQueenSide = false;
        else if (row == 0 && col == 7) blackKingSide = false;
    }

    public Board copy() {
        char[][] chars = new char[8][8];
        for (int r = 0; r < 8; r++) System.arraycopy(squares[r], 0, chars[r], 0, 8);
        Board result = fromPosition(chars);
        result.whiteToMove = whiteToMove;
        result.whiteKingSide = whiteKingSide;
        result.whiteQueenSide = whiteQueenSide;
        result.blackKingSide = blackKingSide;
        result.blackQueenSide = blackQueenSide;
        result.enPassantRow = enPassantRow;
        result.enPassantCol = enPassantCol;
        result.halfmoveClock = halfmoveClock;
        result.fullmoveNumber = fullmoveNumber;
        return result;
    }

    public String toFen() {
        StringBuilder sb = new StringBuilder();
        for (int r = 0; r < 8; r++) {
            if (r > 0) sb.append('/');
            int empty = 0;
            for (int c = 0; c < 8; c++) {
                char p = squares[r][c];
                if (p == '.') empty++;
                else {
                    if (empty > 0) { sb.append(empty); empty = 0; }
                    sb.append(p);
                }
            }
            if (empty > 0) sb.append(empty);
        }
        sb.append(whiteToMove ? " w " : " b ");
        String rights = (whiteKingSide ? "K" : "") + (whiteQueenSide ? "Q" : "")
                + (blackKingSide ? "k" : "") + (blackQueenSide ? "q" : "");
        sb.append(rights.isEmpty() ? "-" : rights).append(' ');
        if (enPassantRow == -1) sb.append('-');
        else sb.append((char)('a' + enPassantCol)).append((char)('8' - enPassantRow));
        return sb.append(' ').append(halfmoveClock).append(' ').append(fullmoveNumber).toString();
    }

    public void printBoard() {
        for (int row = 0; row < 8; row++) {
            System.out.print((8 - row) + " ");
            for (int col = 0; col < 8; col++) System.out.print(squares[row][col] + " ");
            System.out.println();
        }
        System.out.println("  a b c d e f g h");
    }
}
