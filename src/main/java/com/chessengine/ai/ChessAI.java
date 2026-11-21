package com.chessengine.ai;

import com.chessengine.board.Board;
import com.chessengine.board.Move;
import com.chessengine.game.Game;
import com.chessengine.game.GameStatus;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Fixed-depth negamax AI enhanced by iterative deepening, alpha-beta pruning,
 * a history-aware transposition table, and tactical quiescence search.
 *
 * <p>The input game is never mutated. Scores use centipawns from the side to
 * move and +/-100000 for mate. This deliberately does not auto-claim draws.
 * There is no time budget or UCI interface yet.
 */
public final class ChessAI {
    public static final int MATE_SCORE = 100_000;
    private static final int INFINITY = 1_000_000;
    private static final int MAX_QUIESCENCE_PLY = 8;

    private final PositionEvaluator evaluator = new PositionEvaluator();

    public Move chooseMove(Game game, int depth) {
        return search(game, depth).bestMove();
    }

    /** Uses all completed depths from one through {@code depth}. */
    public SearchResult search(Game game, int depth) {
        return runSearch(game, depth, true, true);
    }

    /** Baseline: same evaluation and quiescence rules without alpha-beta or TT. */
    public SearchResult searchWithoutPruning(Game game, int depth) {
        return runSearch(game, depth, false, true);
    }

    /**
     * Diagnostic baseline: previous search method regenerated legal moves
     * separately for terminal status and move ordering at every node.
     * Used only by the A/B benchmark and score-equivalence tests.
     */
    public SearchResult searchWithRepeatedMoveGeneration(Game game, int depth) {
        return runSearch(game, depth, true, false);
    }

    private SearchResult runSearch(Game game, int depth, boolean enhanced, boolean sharedMoves) {
        Objects.requireNonNull(game, "game");
        if (depth < 1) throw new IllegalArgumentException("Search depth must be >= 1");
        Game root = game.copy();
        Game.SearchPosition rootState = sharedMoves ? root.inspectForSearch() : null;
        GameStatus status = sharedMoves ? rootState.status() : root.getStatus();
        if (status != GameStatus.IN_PROGRESS) {
            return new SearchResult(null, terminalScore(status, 0), depth, 1, 0, 0, 0);
        }

        SearchStats stats = new SearchStats();
        Map<String, Transposition> table = new HashMap<>();
        List<Move> rootMoves = orderedMoves(root, null,
                sharedMoves ? rootState.legalMoves() : root.getAllLegalMoves());
        Move chosen = null;
        int chosenScore = -INFINITY;
        int firstDepth = enhanced ? 1 : depth;
        for (int iteration = firstDepth; iteration <= depth; iteration++) {
            int alpha = -INFINITY;
            int bestScore = -INFINITY;
            Move bestMove = null;
            // Root ordering remains stable so equal-scored moves are deterministic.
            for (Move move : rootMoves) {
                Game child = apply(root, move);
                int score = -negamax(child, iteration - 1, -INFINITY,
                        enhanced ? -alpha : INFINITY, 1, stats, table, enhanced, sharedMoves);
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = move;
                }
                if (enhanced) alpha = Math.max(alpha, score);
            }
            chosen = bestMove;
            chosenScore = bestScore;
        }
        return new SearchResult(chosen, chosenScore, depth, stats.nodes,
                stats.cutoffs, stats.transpositionHits, stats.quiescenceNodes);
    }

    private int negamax(Game position, int remaining, int alpha, int beta, int ply,
                        SearchStats stats, Map<String, Transposition> table,
                        boolean enhanced, boolean sharedMoves) {
        if (remaining == 0) {
            return quiescence(position, alpha, beta, ply, 0, stats, enhanced, sharedMoves);
        }
        stats.nodes++;
        Game.SearchPosition scan = sharedMoves ? position.inspectForSearch() : null;
        GameStatus status = sharedMoves ? scan.status() : position.getStatus();
        if (status != GameStatus.IN_PROGRESS) return terminalScore(status, ply);

        int originalAlpha = alpha;
        int originalBeta = beta;
        String key = null;
        Move preferred = null;
        if (enhanced) {
            key = position.getSearchKey();
            Transposition stored = table.get(key);
            if (stored != null) {
                stats.transpositionHits++;
                preferred = stored.move;
                if (stored.depth >= remaining) {
                    if (stored.type == Bound.EXACT) return stored.score;
                    if (stored.type == Bound.LOWER) alpha = Math.max(alpha, stored.score);
                    if (stored.type == Bound.UPPER) beta = Math.min(beta, stored.score);
                    if (alpha >= beta) {
                        stats.cutoffs++;
                        return stored.score;
                    }
                }
            }
        }

        int best = -INFINITY;
        Move bestMove = null;
        for (Move move : orderedMoves(position, preferred,
                sharedMoves ? scan.legalMoves() : position.getAllLegalMoves())) {
            int score = -negamax(apply(position, move), remaining - 1,
                    enhanced ? -beta : -INFINITY,
                    enhanced ? -alpha : INFINITY,
                    ply + 1, stats, table, enhanced, sharedMoves);
            if (score > best) {
                best = score;
                bestMove = move;
            }
            if (enhanced) {
                alpha = Math.max(alpha, score);
                if (alpha >= beta) {
                    stats.cutoffs++;
                    break;
                }
            }
        }
        if (enhanced) {
            Bound bound = best <= originalAlpha ? Bound.UPPER
                    : best >= originalBeta ? Bound.LOWER : Bound.EXACT;
            Transposition old = table.get(key);
            if (old == null || remaining >= old.depth) {
                table.put(key, new Transposition(remaining, best, bound, bestMove));
            }
        }
        return best;
    }

    private int quiescence(Game position, int alpha, int beta, int ply,
                           int qPly, SearchStats stats, boolean enhanced,
                           boolean sharedMoves) {
        stats.nodes++;
        stats.quiescenceNodes++;
        Game.SearchPosition scan = sharedMoves ? position.inspectForSearch() : null;
        GameStatus status = sharedMoves ? scan.status() : position.getStatus();
        if (status != GameStatus.IN_PROGRESS) return terminalScore(status, ply);

        Board board = position.getBoard();
        int whiteScore = evaluator.evaluate(board);
        int standPat = position.isWhiteToMove() ? whiteScore : -whiteScore;
        if (qPly >= MAX_QUIESCENCE_PLY) return standPat;

        boolean inCheck = position.isInCheck();
        int best = inCheck ? -INFINITY : standPat;
        if (!inCheck && enhanced) {
            if (best >= beta) {
                stats.cutoffs++;
                return best;
            }
            alpha = Math.max(alpha, best);
        }

        for (Move move : orderedMoves(position, null,
                sharedMoves ? scan.legalMoves() : position.getAllLegalMoves())) {
            if (!inCheck && !isTactical(board, move)) continue;
            int score = -quiescence(apply(position, move),
                    enhanced ? -beta : -INFINITY,
                    enhanced ? -alpha : INFINITY,
                    ply + 1, qPly + 1, stats, enhanced, sharedMoves);
            best = Math.max(best, score);
            if (enhanced) {
                alpha = Math.max(alpha, score);
                if (alpha >= beta) {
                    stats.cutoffs++;
                    break;
                }
            }
        }
        return best;
    }

    private static boolean isTactical(Board board, Move move) {
        char mover = board.getPiece(move.getFromRow(), move.getFromCol());
        return board.getPiece(move.getToRow(), move.getToCol()) != '.'
                || move.getPromotion() != '\0'
                || (Character.toLowerCase(mover) == 'p'
                    && move.getFromCol() != move.getToCol()); // en passant
    }

    private static Game apply(Game position, Move move) {
        Game child = position.copy();
        if (!child.makeMove(move)) throw new IllegalStateException("Generated illegal move: " + move);
        return child;
    }

    private static int terminalScore(GameStatus status, int ply) {
        return status == GameStatus.CHECKMATE ? -MATE_SCORE + ply : 0;
    }

    private List<Move> orderedMoves(Game position, Move preferred, List<Move> legalMoves) {
        Board board = position.getBoard();
        List<Move> moves = new ArrayList<>(legalMoves);
        moves.sort(Comparator.comparingInt((Move move) ->
                (move.equals(preferred) ? 1_000_000 : 0) + priority(board, move)).reversed());
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
                && move.getFromCol() != move.getToCol()) score += 10_000;
        if (move.getPromotion() != '\0') score += 7_000 + PositionEvaluator.pieceValue(move.getPromotion());
        return score + 6 - Math.min(Math.abs(move.getToCol() - 3), Math.abs(move.getToCol() - 4))
                - Math.min(Math.abs(move.getToRow() - 3), Math.abs(move.getToRow() - 4));
    }

    private enum Bound { EXACT, LOWER, UPPER }
    private record Transposition(int depth, int score, Bound type, Move move) {}
    private static final class SearchStats {
        long nodes;
        long cutoffs;
        long transpositionHits;
        long quiescenceNodes;
    }
}
