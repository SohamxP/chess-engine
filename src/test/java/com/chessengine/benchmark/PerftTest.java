package com.chessengine.benchmark;

import com.chessengine.game.Game;
import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Canonical perft counts, transcribed from chessprogramming.org/Perft_Results.
 * These are exact legal-move enumeration assertions, not timing thresholds.
 */
class PerftTest {
    private static final String START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    private static final String KIWIPETE =
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
    private static final String ENDGAME =
        "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1";

    @Test
    void startingPositionMatchesKnownExactCounts() {
        Game game = new Game(START);
        String before = game.getSearchKey();
        assertEquals(1L, Perft.count(game, 0));
        assertEquals(20L, Perft.count(game, 1));
        assertEquals(400L, Perft.count(game, 2));
        assertEquals(8_902L, Perft.count(game, 3));
        assertEquals(before, game.getSearchKey(), "Perft must never mutate the input game");
    }

    @Test
    void kiwipeteValidatesPinsCastlingAndCaptures() {
        Game game = new Game(KIWIPETE);
        assertEquals(48L, Perft.count(game, 1));
        assertEquals(2_039L, Perft.count(game, 2));
    }

    @Test
    void rookPawnEndgameValidatesEnPassantAndKingSafety() {
        Game game = new Game(ENDGAME);
        assertEquals(14L, Perft.count(game, 1));
        assertEquals(191L, Perft.count(game, 2));
        assertEquals(2_812L, Perft.count(game, 3));
    }

    @Test
    void divideAccountsForEveryLeafAndDoesNotMutateRoot() {
        Game game = new Game(START);
        String identity = game.getSearchKey();
        Map<String, Long> byMove = Perft.divide(game, 2);
        assertEquals(20, byMove.size());
        assertEquals(20L, byMove.get("e2e4"));
        assertEquals(400L, byMove.values().stream().mapToLong(Long::longValue).sum());
        assertEquals(identity, game.getSearchKey());
        assertThrows(IllegalArgumentException.class, () -> Perft.divide(game, 0));
        assertThrows(IllegalArgumentException.class, () -> Perft.count(game, -1));
    }
}
