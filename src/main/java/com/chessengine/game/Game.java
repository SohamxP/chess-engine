
package com.chessengine.game;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import com.chessengine.rules.MoveGenerator;

import java.util.List;

public class Game {

    private final Board board;
    private final MoveGenerator moveGenerator;

    private boolean whiteToMove;

    public Game() {
        board = new Board();
        moveGenerator = new MoveGenerator();
        whiteToMove = true;
    }

    public Board getBoard() {
        return board;
    }

    public boolean isWhiteToMove() {
        return whiteToMove;
    }

    public boolean makeMove(Move move) {

        int fromRow = move.getFromRow();
        int fromCol = move.getFromCol();
        int toRow = move.getToRow();
        int toCol = move.getToCol();

        // 1. Validate coordinates
        if (!moveGenerator.isInsideBoard(fromRow, fromCol)
                || !moveGenerator.isInsideBoard(toRow, toCol)) {
            return false;
        }

        // 2. Check source square
        char piece = board.getPiece(fromRow, fromCol);

        if (piece == '.') {
            return false;
        }

        // 3. Check correct player's turn
        boolean isWhitePiece = Character.isUpperCase(piece);

        if (isWhitePiece != whiteToMove) {
            return false;
        }

        // 4. Check whether the piece can make this move
        List<Move> possibleMoves =
                moveGenerator.generateMoves(board, fromRow, fromCol);

        boolean valid = false;

        for (Move possibleMove : possibleMoves) {

            if (possibleMove.getToRow() == toRow
                    && possibleMove.getToCol() == toCol) {

                valid = true;
                break;
            }
        }

        if (!valid) {
            return false;
        }

        // 5. Execute the move
        board.makeMove(move);

        // 6. Switch turns
        whiteToMove = !whiteToMove;

        return true;
    }
}
