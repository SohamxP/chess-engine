
package com.chessengine.game;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import com.chessengine.rules.AttackDetector;
import com.chessengine.rules.LegalMoveGenerator;
import com.chessengine.rules.MoveGenerator;

public class Game {

    private final Board board;
    private final MoveGenerator moveGenerator;
    private final LegalMoveGenerator legalMoveGenerator;
    private final AttackDetector attackDetector;

    private boolean whiteToMove;

    public Game() {
        board = new Board();
        moveGenerator = new MoveGenerator();
        legalMoveGenerator = new LegalMoveGenerator();
        attackDetector = new AttackDetector();
        whiteToMove = true;
    }

    public Board getBoard() {
        return board.copy();
    }

    public boolean isWhiteToMove() {
        return whiteToMove;
    }

    public boolean isInCheck() {
        return attackDetector.isKingInCheck(
            board, whiteToMove
        );
    }

    public boolean makeMove(Move move) {

        if (move == null) {
            return false;
        }

        int fromRow = move.getFromRow();
        int fromCol = move.getFromCol();
        int toRow = move.getToRow();
        int toCol = move.getToCol();

        if (!moveGenerator.isInsideBoard(fromRow, fromCol) ||
            !moveGenerator.isInsideBoard(toRow, toCol)) {
            return false;
        }

        char piece = board.getPiece(fromRow, fromCol);

        if (piece == '.') {
            return false;
        }

        if (Character.isUpperCase(piece) != whiteToMove) {
            return false;
        }

        if (!legalMoveGenerator.isLegalMove(board, move)) {
            return false;
        }

        board.makeMove(move);
        whiteToMove = !whiteToMove;

        return true;
    }
}
