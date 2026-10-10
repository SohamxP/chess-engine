
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import java.util.ArrayList;
import java.util.List;

public class LegalMoveGenerator {

    private final MoveGenerator moveGenerator =
            new MoveGenerator();

    private final AttackDetector attackDetector =
            new AttackDetector();

    public List<Move> generateLegalMoves(
            Board board, int row, int col) {

        List<Move> legalMoves = new ArrayList<>();

        if (!moveGenerator.isInsideBoard(row, col)) {
            return legalMoves;
        }

        char piece = board.getPiece(row, col);

        if (piece == '.') {
            return legalMoves;
        }

        boolean whitePiece = Character.isUpperCase(piece);

        List<Move> possibleMoves =
                moveGenerator.generateMoves(board, row, col);

        for (Move move : possibleMoves) {

            Board simulatedBoard = board.copy();
            simulatedBoard.makeMove(move);

            if (!attackDetector.isKingInCheck(
                    simulatedBoard, whitePiece)) {

                legalMoves.add(move);
            }
        }

        return legalMoves;
    }

    public boolean isLegalMove(Board board, Move move) {

        List<Move> legalMoves = generateLegalMoves(
            board, move.getFromRow(), move.getFromCol()
        );

        for (Move legalMove : legalMoves) {
            if (legalMove.getToRow() == move.getToRow() &&
                legalMove.getToCol() == move.getToCol()) {
                return true;
            }
        }

        return false;
    }
}
