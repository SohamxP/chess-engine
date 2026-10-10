package com.chessengine.board;

public class Board {

    private final char[][] squares = new char[8][8];

    public Board() {
        initialize();
    }

    private void initialize() {
        String[] startingPosition = {
            "rnbqkbnr",
            "pppppppp",
            "........",
            "........",
            "........",
            "........",
            "PPPPPPPP",
            "RNBQKBNR"
        };

        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) {
                squares[row][col] =
                    startingPosition[row].charAt(col);
            }
        }
    }

    public char getPiece(int row, int col) {
        return squares[row][col];
    }

    public void printBoard() {
        for (int row = 0; row < 8; row++) {
            System.out.print((8 - row) + " ");

            for (int col = 0; col < 8; col++) {
                System.out.print(squares[row][col] + " ");
            }

            System.out.println();
        }

        System.out.println("  a b c d e f g h");
    }

    public void makeMove(Move move) {

        int fromRow = move.getFromRow();
        int fromCol = move.getFromCol();
        int toRow = move.getToRow();
        int toCol = move.getToCol();

        char piece = squares[fromRow][fromCol];

        squares[toRow][toCol] = piece;
        squares[fromRow][fromCol] = '.';
    }
}

