package com.chessengine.api;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import com.chessengine.game.Game;
import com.chessengine.game.GameStatus;
import java.util.List;
import java.util.Objects;

/**
 * Standard Algebraic Notation (SAN), as used in FIDE move scores.
 * The caller supplies the positions immediately before and after a legal move.
 * Move history retains UCI separately for machine-readable consumers.
 */
public final class StandardAlgebraicNotation {
    private StandardAlgebraicNotation() { }

    public static String format(Game before, Move move, Game after) {
        Objects.requireNonNull(before, "before");
        Objects.requireNonNull(move, "move");
        Objects.requireNonNull(after, "after");

        List<Move> legalMoves = before.getAllLegalMoves();
        if (!legalMoves.contains(move)) {
            throw new IllegalArgumentException("SAN requires a legal move");
        }

        Board board = before.getBoard();
        char piece = board.getPiece(move.getFromRow(), move.getFromCol());
        char type = Character.toUpperCase(piece);
        boolean capture = board.getPiece(move.getToRow(), move.getToCol()) != '.'
                || (type == 'P' && move.getFromCol() != move.getToCol());
        StringBuilder san = new StringBuilder();

        if (type == 'K' && move.getFromRow() == move.getToRow()
                && Math.abs(move.getToCol() - move.getFromCol()) == 2) {
            san.append(move.getToCol() > move.getFromCol() ? "O-O" : "O-O-O");
        } else {
            if (type != 'P') {
                san.append(type);
                appendDisambiguation(san, board, legalMoves, move, type);
            } else if (capture) {
                san.append(file(move.getFromCol()));
            }

            if (capture) san.append('x');
            san.append(GameView.MoveView.square(move.getToRow(), move.getToCol()));
            if (move.getPromotion() != '\0') {
                san.append('=').append(move.getPromotion());
            }
        }

        if (after.isInCheck()) {
            san.append(after.getStatus() == GameStatus.CHECKMATE ? '#' : '+');
        }
        return san.toString();
    }

    private static void appendDisambiguation(StringBuilder san, Board board,
                                              List<Move> legal, Move move, char type) {
        boolean competitor = false;
        boolean sameFile = false;
        boolean sameRank = false;
        for (Move candidate : legal) {
            if (candidate.equals(move)
                    || candidate.getToRow() != move.getToRow()
                    || candidate.getToCol() != move.getToCol()
                    || Character.toUpperCase(board.getPiece(
                            candidate.getFromRow(), candidate.getFromCol())) != type) {
                continue;
            }
            competitor = true;
            if (candidate.getFromCol() == move.getFromCol()) sameFile = true;
            if (candidate.getFromRow() == move.getFromRow()) sameRank = true;
        }
        if (!competitor) return;
        if (!sameFile) san.append(file(move.getFromCol()));
        else if (!sameRank) san.append(8 - move.getFromRow());
        else san.append(file(move.getFromCol())).append(8 - move.getFromRow());
    }

    private static char file(int col) {
        return (char) ('a' + col);
    }
}
