package com.chessengine.benchmark;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class EngineBenchmarkTest {
    @Test
    void nearestRankPercentilesHandleUnsortedSamplesWithoutMutation() {
        long[] samples = { 90, 10, 30, 70, 50 };
        assertEquals(50L, EngineBenchmark.percentile(samples, 0.5));
        assertEquals(90L, EngineBenchmark.percentile(samples, 0.95));
        assertArrayEquals(new long[] { 90, 10, 30, 70, 50 }, samples);
        assertEquals(10L, EngineBenchmark.percentile(samples, 0.01));
    }

    @Test
    void refusesMisleadingPercentilesWithoutAnySamples() {
        assertThrows(IllegalArgumentException.class,
            () -> EngineBenchmark.percentile(new long[] {}, 0.5));
        assertThrows(IllegalArgumentException.class,
            () -> EngineBenchmark.percentile(new long[] { 1, 2 }, 1.1));
    }

    @Test
    void uciReportsNormalMovesAndPromotions() {
        assertEquals("e2e4", Perft.uci(new com.chessengine.board.Move(6, 4, 4, 4)));
        assertEquals("a7a8q", Perft.uci(new com.chessengine.board.Move(1, 0, 0, 0, 'Q')));
    }
}
