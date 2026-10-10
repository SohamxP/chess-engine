
package com.chessengine.board;

public class Board {

    private final char[][] squares;

    public Board() {
        squares = new char[8][8];

        String[] initialPosition = {
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
            squares[row] = initialPosition[row].toCharArray();
        }
    }

    private Board(char[][] position) {
        squares = position;
    }

    public char getPiece(int row, int col) {
        return squares[row][col];
    }

    public void makeMove(Move move) {
        int fromRow = move.getFromRow();
        int fromCol = move.getFromCol();
        int toRow = move.getToRow();
        int toCol = move.getToCol();

        squares[toRow][toCol] = squares[fromRow][fromCol];
        squares[fromRow][fromCol] = '.';
    }

    public Board copy() {
        char[][] copiedSquares = new char[8][8];

        for (int row = 0; row < 8; row++) {
            System.arraycopy(
                squares[row], 0,
                copiedSquares[row], 0, 8
            );
        }

        return new Board(copiedSquares);
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
}
