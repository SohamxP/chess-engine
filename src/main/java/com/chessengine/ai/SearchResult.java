package com.chessengine.ai;

import com.chessengine.board.Move;

/**
 * Best move and score from the perspective of the side to move.
 * A null move means the supplied game is terminal.
 * Statistics aggregate all completed iterative-deepening passes.
 */
public record SearchResult(Move bestMove, int scoreCentipawns, int depth,
                           long nodesVisited, long alphaBetaCutoffs,
                           long transpositionHits, long quiescenceNodes) {
    /** Compatibility constructor for the original search metrics API. */
    public SearchResult(Move move, int score, int depth, long nodes, long cutoffs) {
        this(move, score, depth, nodes, cutoffs, 0, 0);
    }
}
