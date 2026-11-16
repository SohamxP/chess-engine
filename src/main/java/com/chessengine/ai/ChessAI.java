package com.chessengine.ai;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import com.chessengine.game.Game;
import com.chessengine.game.GameStatus;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * A depth-limited negamax chess searcher with alpha-beta pruning.
 *
 * <p>Every branch starts from an independent Game snapshot, preserving the
 * position-history information needed for fivefold repetition. It never
 * modifies the caller's game. Scores are in centipawns from the current
 * side's perspective, with scores near +/-100000 reserved for checkmate.
 * Draw claims are left to the player; automatic draws terminate search.
 *
 * <p>This is a deterministic baseline engine, without opening books,
 * time limits, transposition tables or quiescence search.
 */
public final class ChessAI {
    public static final int MATE_SCORE = 100_000;
    private static final int INFINITY = 1_000_000;

    private final PositionEvaluator evaluator = new PositionEvaluator();

    public Move chooseMove(Game game, int depth) {
        return search(game, depth).bestMove();
    }

    public SearchResult search(Game game, int depth) {
        return runSearch(game, depth, true);
    }

    /** Reference minimax search to benchmark alpha-beta's node savings. */
    public SearchResult searchWithoutPruning(Game game, int depth) {
        return runSearch(game, depth, false);
    }

    private SearchResult runSearch(Game game, int depth, boolean useAlphaBeta) {
        Objects.requireNonNull(game, "game");
        if (depth < 1) throw new IllegalArgumentException("Search depth must be >= 1");

        Game root = game.copy();
        GameStatus status = root.getStatus();
        if (status != GameStatus.IN_PROGRESS) {
            return new SearchResult(null, terminalScore(status, 0), depth, 1, 0);
        }

        SearchStats stats = new SearchStats();
        int alpha = -INFINITY;
        int bestScore = -INFINITY;
        Move bestMove = null;
        for (Move move : orderedMoves(root)) {
            Game child = root.copy();
            if (!child.makeMove(move)) throw new IllegalStateException("Generated move is not legal: " + move);
            int score = -negamax(child, depth - 1, -INFINITY, -alpha,
                    1, stats, useAlphaBeta);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
            if (useAlphaBeta) alpha = Math.max(alpha, score);
        }
        return new SearchResult(bestMove, bestScore, depth,
                stats.nodes, stats.cutoffs);
    }

    private int negamax(Game position, int remainingDepth, int alpha, int beta,
                        int ply, SearchStats stats, boolean prune) {
        stats.nodes++;
        GameStatus status = position.getStatus();
        if (status != GameStatus.IN_PROGRESS) return terminalScore(status, ply);
        if (remainingDepth == 0) {
            int whiteScore = evaluator.evaluate(position.getBoard());
            return position.isWhiteToMove() ? whiteScore : -whiteScore;
        }

        int bestScore = -INFINITY;
        for (Move move : orderedMoves(position)) {
            Game child = position.copy();
            if (!child.makeMove(move)) throw new IllegalStateException("Generated move is not legal: " + move);
            int score = -negamax(child, remainingDepth - 1,
                    prune ? -beta : -INFINITY,
                    prune ? -alpha : INFINITY,
                    ply + 1, stats, prune);
            bestScore = Math.max(bestScore, score);
            if (prune) {
                alpha = Math.max(alpha, score);
                if (alpha >= beta) {
                    stats.cutoffs++;
                    break;
                }
            }
        }
        return bestScore;
    }

    private static int terminalScore(GameStatus status, int ply) {
        return status == GameStatus.CHECKMATE ? -MATE_SCORE + ply : 0;
    }

    private List<Move> orderedMoves(Game game) {
        Board board = game.getBoard();
        List<Move> moves = new ArrayList<>(game.getAllLegalMoves());
        // Stable sort: equal priorities preserve row/column move-generation order.
        moves.sort(Comparator.comparingInt((Move move) -> priority(board, move)).reversed());
        return moves;
    }

    private static int priority(Board board, Move move) {
        char mover = board.getPiece(move.getFromRow(), move.getFromCol());
        char target = board.getPiece(move.getToRow(), move.getToCol());
        int score = 0;
        if (target != '.') {
            score += 10_000 + PositionEvaluator.pieceValue(target) * 10
                    - PositionEvaluator.pieceValue(mover);
        } else if (Character.toLowerCase(mover) == 'p'
                && move.getFromCol() != move.getToCol()) {
            score += 10_000; // En passant capture.
        }
        if (move.getPromotion() != '\0') {
            score += 7_000 + PositionEvaluator.pieceValue(move.getPromotion());
        }
        int col = move.getToCol();
        int row = move.getToRow();
        score += 6 - Math.min(Math.abs(col - 3), Math.abs(col - 4))
                   - Math.min(Math.abs(row - 3), Math.abs(row - 4));
        return score;
    }

    private static final class SearchStats {
        private long nodes;
        private long cutoffs;
    }
}
