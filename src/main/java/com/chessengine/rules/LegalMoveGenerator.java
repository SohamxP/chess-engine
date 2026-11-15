package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import java.util.ArrayList;
import java.util.List;

public class LegalMoveGenerator {
    private final MoveGenerator moveGenerator = new MoveGenerator();
    private final AttackDetector attackDetector = new AttackDetector();

    public List<Move> generateLegalMoves(Board board, int row, int col) {
        List<Move> legalMoves = new ArrayList<>();
        if (board == null || !moveGenerator.isInsideBoard(row, col)) return legalMoves;
        char piece = board.getPiece(row, col);
        if (piece == '.') return legalMoves;
        boolean white = Character.isUpperCase(piece);
        for (Move move : moveGenerator.generateMoves(board, row, col)) {
            if (Character.toLowerCase(piece) == 'k'
                    && Math.abs(move.getToCol() - col) == 2) {
                // Castling is illegal out of check or through an attacked transit square.
                if (attackDetector.isKingInCheck(board, white)) continue;
                int transitCol = col + (move.getToCol() > col ? 1 : -1);
                if (attackDetector.isSquareAttacked(board, row, transitCol, !white)) continue;
            }
            Board simulated = board.copy();
            simulated.makeMove(move);
            if (!attackDetector.isKingInCheck(simulated, white)) legalMoves.add(move);
        }
        return legalMoves;
    }

    public boolean isLegalMove(Board board, Move move) {
        if (board == null || move == null
                || !moveGenerator.isInsideBoard(move.getFromRow(), move.getFromCol())
                || !moveGenerator.isInsideBoard(move.getToRow(), move.getToCol())) return false;
        char piece = board.getPiece(move.getFromRow(), move.getFromCol());
        if (piece == '.') return false;
        boolean isPromotion = Character.toLowerCase(piece) == 'p'
                && (move.getToRow() == 0 || move.getToRow() == 7);
        char desiredPromotion = move.getPromotion();
        if (isPromotion && desiredPromotion == '\0') desiredPromotion = 'Q';
        if (!isPromotion && desiredPromotion != '\0') return false;
        for (Move candidate : generateLegalMoves(board, move.getFromRow(), move.getFromCol())) {
            if (candidate.getToRow() == move.getToRow()
                    && candidate.getToCol() == move.getToCol()
                    && candidate.getPromotion() == desiredPromotion) return true;
        }
        return false;
    }
}
