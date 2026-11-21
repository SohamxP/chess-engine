package com.chessengine.ai;

import com.chessengine.board.Move;
import com.chessengine.game.Game;
import com.chessengine.game.GameStatus;
import org.junit.jupiter.api.Test;

import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

/** Exact A/B parity checks around eliminating duplicate legal move generation. */
class SearchMoveReuseTest {
    private static final List<String> POSITIONS = List.of(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "3q2k1/3r4/8/8/8/8/8/3QK3 w - - 0 1",
        "4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 1",
        "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2",
        "7k/6Q1/5K2/8/8/8/8/8 b - - 0 1",
        "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
        "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
        "4k2r/8/8/8/8/8/8/R3K3 w - - 150 50"
    );

    @Test
    void snapshotMatchesGameStatusAndLegalMoveEnumeration() {
        for (String fen : POSITIONS) {
            Game game = new Game(fen);
            String before = game.getSearchKey();
            Game.SearchPosition snapshot = game.inspectForSearch();
            assertEquals(game.getStatus(), snapshot.status(), fen);
            if (snapshot.status() == GameStatus.IN_PROGRESS) {
                assertEquals(game.getAllLegalMoves(), snapshot.legalMoves(), fen);
            }
            assertEquals(before, game.getSearchKey(), "Snapshot mutated history for " + fen);
        }
    }

    @Test
    void optimizedSearchMatchesExactPreviousAlgorithmAndStats() {
        ChessAI ai = new ChessAI();
        for (String fen : POSITIONS) {
            Game position = new Game(fen);
            String before = position.getSearchKey();
            for (int depth = 1; depth <= 2; depth++) {
                SearchResult old = ai.searchWithRepeatedMoveGeneration(position, depth);
                SearchResult fast = ai.search(position, depth);
                assertEquals(old.bestMove(), fast.bestMove(), "Best move " + fen + " depth " + depth);
                assertEquals(old.scoreCentipawns(), fast.scoreCentipawns(),
                    "Score " + fen + " depth " + depth);
                assertEquals(old.nodesVisited(), fast.nodesVisited(), "Nodes " + fen);
                assertEquals(old.alphaBetaCutoffs(), fast.alphaBetaCutoffs(), "Cutoffs " + fen);
                assertEquals(old.transpositionHits(), fast.transpositionHits(), "TT hits " + fen);
                assertEquals(old.quiescenceNodes(), fast.quiescenceNodes(), "Quiescence " + fen);
            }
            assertEquals(before, position.getSearchKey(), "Search mutated history " + fen);
        }
    }

    @Test
    void snapshotsDoNotLeakMutabilityOrBreakLegalPlay() {
        Game game = new Game();
        Game.SearchPosition snapshot = game.inspectForSearch();
        assertThrows(UnsupportedOperationException.class,
            () -> snapshot.legalMoves().add(new Move(6, 4, 4, 4)));
        assertEquals(20, snapshot.legalMoves().size());
        assertTrue(game.playMove(new Move(6, 4, 4, 4)));
        assertEquals(GameStatus.IN_PROGRESS, game.inspectForSearch().status());
        assertEquals(20, snapshot.legalMoves().size(), "Old snapshot should stay immutable");
    }
}
