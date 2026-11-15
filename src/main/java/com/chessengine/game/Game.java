package com.chessengine.game;

import com.chessengine.board.Board;
import com.chessengine.board.FenParser;
import com.chessengine.board.Move;
import com.chessengine.rules.AttackDetector;
import com.chessengine.rules.LegalMoveGenerator;
import com.chessengine.rules.MoveGenerator;
import java.util.List;

public class Game {
    private final Board board;
    private final MoveGenerator moveGenerator = new MoveGenerator();
    private final LegalMoveGenerator legalMoveGenerator = new LegalMoveGenerator();
    private final AttackDetector attackDetector = new AttackDetector();

    public Game() { board = new Board(); }
    public Game(String fen) { board = FenParser.parse(fen); }
    public Board getBoard() { return board.copy(); }
    public String toFen() { return board.toFen(); }
    public boolean isWhiteToMove() { return board.isWhiteToMove(); }
    public boolean isInCheck() { return attackDetector.isKingInCheck(board, isWhiteToMove()); }

    public List<Move> getLegalMoves(int row, int col) {
        if (!moveGenerator.isInsideBoard(row, col)) return List.of();
        char piece = board.getPiece(row, col);
        if (piece == '.' || Character.isUpperCase(piece) != isWhiteToMove()) return List.of();
        return legalMoveGenerator.generateLegalMoves(board, row, col);
    }

    public boolean makeMove(Move move) {
        if (move == null || !moveGenerator.isInsideBoard(move.getFromRow(), move.getFromCol())
                || !moveGenerator.isInsideBoard(move.getToRow(), move.getToCol())) return false;
        char piece = board.getPiece(move.getFromRow(), move.getFromCol());
        if (piece == '.' || Character.isUpperCase(piece) != isWhiteToMove()) return false;
        if (!legalMoveGenerator.isLegalMove(board, move)) return false;
        board.makeMove(move);
        return true;
    }
}
