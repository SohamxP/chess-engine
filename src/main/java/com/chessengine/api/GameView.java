package com.chessengine.api;

import com.chessengine.ai.SearchResult;
import com.chessengine.board.Move;
import java.util.List;
import java.util.UUID;

/** The JSON contract consumed by the React application. */
public record GameView(
        UUID id,
        String fen,
        String initialFen,
        String status,
        boolean whiteToMove,
        boolean inCheck,
        boolean humanWhite,
        int depth,
        boolean aiTurn,
        boolean canUndo,
        boolean canClaimThreefold,
        boolean canClaimFifty,
        List<MoveView> legalMoves,
        List<MoveEntry> moveHistory,
        MoveView lastMove,
        AiStats aiStats) {

    public record MoveView(String from, String to, String promotion) {
        public static MoveView of(Move move) {
            return new MoveView(square(move.getFromRow(), move.getFromCol()),
                    square(move.getToRow(), move.getToCol()),
                    move.getPromotion() == '\0' ? null : String.valueOf(move.getPromotion()));
        }

        public static String square(int row, int col) {
            return "abcdefgh".charAt(col) + String.valueOf(8 - row);
        }

        public String uci() {
            return from + to + (promotion == null ? "" : promotion.toLowerCase());
        }
    }

    /** Exact board state after this ply, including side to move and rights. */
    public record MoveEntry(int ply, boolean white, boolean ai, String uci, String san, String fen) { }

    public record AiStats(int depth, int scoreCentipawns, long nodesVisited,
                          long alphaBetaCutoffs, long transpositionHits, long quiescenceNodes) {
        public static AiStats of(SearchResult result) {
            return new AiStats(result.depth(), result.scoreCentipawns(),
                    result.nodesVisited(), result.alphaBetaCutoffs(),
                    result.transpositionHits(), result.quiescenceNodes());
        }
    }
}
