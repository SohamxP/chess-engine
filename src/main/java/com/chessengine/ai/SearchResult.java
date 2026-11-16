package com.chessengine.ai;

import com.chessengine.board.Move;

/**
 * Best move and score from the perspective of the player whose turn it is.
 * bestMove is null when the supplied game has already ended.
 */
public record SearchResult(Move bestMove, int scoreCentipawns,
                           int depth, long nodesVisited, long alphaBetaCutoffs) {
}
