package com.chessengine.benchmark;

import com.chessengine.ai.ChessAI;
import com.chessengine.ai.SearchResult;
import com.chessengine.game.Game;
import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Reproducible, no-dependency search comparison on fixed chess positions.
 *
 * This is an application-level latency sampler, not a replacement for JMH.
 * Output includes the JVM/machine context and raw deterministic search counts.
 * Run outside CI and compare numbers only on the same hardware/JVM settings.
 */
public final class EngineBenchmark {
    private static final String START =
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    private static final String TACTICAL =
        "3q2k1/3r4/8/8/8/8/8/3QK3 w - - 0 1";
    private static final String ENDGAME =
        "4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 1";

    private static final List<Position> POSITIONS = List.of(
        new Position("start", START),
        new Position("tactical", TACTICAL),
        new Position("endgame", ENDGAME)
    );

    private record Position(String label, String fen) { }
    private record Sample(long nanos, long allocatedBytes, SearchResult result) { }

    private EngineBenchmark() { }

    public static void main(String[] args) {
        int depth = getOption(args, "--depth", 2, 1, 4);
        int runs = getOption(args, "--runs", 7, 1, 100);
        int warmup = getOption(args, "--warmup", 3, 0, 50);
        var allocated = allocatedBytesAccessor();

        System.out.println("# PlySense Java search baseline");
        System.out.println("# generated_utc=" + Instant.now());
        System.out.println("# java_version=" + System.getProperty("java.version"));
        System.out.println("# java_vm=" + System.getProperty("java.vm.name"));
        System.out.println("# os=" + System.getProperty("os.name") + "/" + System.getProperty("os.arch"));
        System.out.println("# processors=" + Runtime.getRuntime().availableProcessors());
        System.out.println("# max_heap_bytes=" + Runtime.getRuntime().maxMemory());
        System.out.println("# git_sha=" + System.getenv().getOrDefault("GITHUB_SHA", "not provided"));
        System.out.println("# depth=" + depth + " warmup=" + warmup + " runs=" + runs);
        System.out.println("# Caveat: run after build, while idle; latency and allocation vary by machine and JIT.");
        System.out.println("position,strategy,depth,runs,median_ms,p95_ms,median_allocated_bytes," +
            "median_nodes,median_cutoffs,median_tt_hits,median_quiescence_nodes,score_cp,best_uci");

        ChessAI ai = new ChessAI();
        for (Position position : POSITIONS) {
            Game root = new Game(position.fen());
            String original = root.getSearchKey();

            for (int i = 0; i < warmup; i++) {
                sample(ai, root, depth, false, allocated);
                sample(ai, root, depth, true, allocated);
            }
            List<Sample> baseline = new ArrayList<>();
            List<Sample> enhanced = new ArrayList<>();
            for (int i = 0; i < runs; i++) {
                // Alternate order to avoid consistently favoring the warm cache.
                if (i % 2 == 0) {
                    enhanced.add(sample(ai, root, depth, true, allocated));
                    baseline.add(sample(ai, root, depth, false, allocated));
                } else {
                    baseline.add(sample(ai, root, depth, false, allocated));
                    enhanced.add(sample(ai, root, depth, true, allocated));
                }
            }
            if (!original.equals(root.getSearchKey())) {
                throw new IllegalStateException("Search mutated the benchmark position: " + position.label());
            }

            // A pruning optimization should never change the exact minimax
            // score at the same depth and with the same evaluation.
            for (int i = 0; i < runs; i++) {
                if (baseline.get(i).result().scoreCentipawns() !=
                    enhanced.get(i).result().scoreCentipawns()) {
                    throw new IllegalStateException("Baseline/enhanced score disagree on " +
                        position.label() + " at depth " + depth +
                        ": baseline=" + baseline.get(i).result().scoreCentipawns() +
                        " enhanced=" + enhanced.get(i).result().scoreCentipawns());
                }
            }
            print(position.label(), "without-pruning", depth, baseline);
            print(position.label(), "alpha-beta-tt", depth, enhanced);
        }
    }

    /** Nearest-rank percentile. Exposed to test the reporting math. */
    static long percentile(long[] samples, double percentile) {
        if (samples.length == 0 || percentile <= 0 || percentile > 1) {
            throw new IllegalArgumentException("Invalid percentile or empty samples");
        }
        long[] ordered = samples.clone();
        Arrays.sort(ordered);
        return ordered[Math.max(0, (int) Math.ceil(percentile * ordered.length) - 1)];
    }

    private static void print(String position, String strategy, int depth, List<Sample> samples) {
        long[] nanos = samples.stream().mapToLong(Sample::nanos).toArray();
        long[] allocated = samples.stream().mapToLong(Sample::allocatedBytes).toArray();
        long[] nodes = samples.stream().mapToLong(s -> s.result().nodesVisited()).toArray();
        long[] cutoffs = samples.stream().mapToLong(s -> s.result().alphaBetaCutoffs()).toArray();
        long[] hits = samples.stream().mapToLong(s -> s.result().transpositionHits()).toArray();
        long[] quiescence = samples.stream().mapToLong(s -> s.result().quiescenceNodes()).toArray();
        SearchResult result = samples.getLast().result();

        System.out.printf(Locale.ROOT, "%s,%s,%d,%d,%.3f,%.3f,%d,%d,%d,%d,%d,%d,%s%n",
            position, strategy, depth, samples.size(),
            percentile(nanos, 0.5) / 1_000_000.0,
            percentile(nanos, 0.95) / 1_000_000.0,
            allocated[0] < 0 ? -1L : percentile(allocated, 0.5),
            percentile(nodes, 0.5),
            percentile(cutoffs, 0.5),
            percentile(hits, 0.5),
            percentile(quiescence, 0.5),
            result.scoreCentipawns(),
            result.bestMove() == null ? "(none)" : Perft.uci(result.bestMove()));
    }

    private static Sample sample(
        ChessAI ai, Game game, int depth, boolean optimized,
        java.util.function.LongSupplier allocated
    ) {
        long beforeAllocated = allocated.getAsLong();
        long started = System.nanoTime();
        SearchResult result = optimized ? ai.search(game, depth) : ai.searchWithoutPruning(game, depth);
        long elapsed = System.nanoTime() - started;
        long afterAllocated = allocated.getAsLong();

        if (result.bestMove() == null || !game.getAllLegalMoves().contains(result.bestMove())) {
            throw new IllegalStateException("Search did not choose a legal move");
        }
        return new Sample(elapsed,
            beforeAllocated >= 0 && afterAllocated >= beforeAllocated
                ? afterAllocated - beforeAllocated : -1L, result);
    }

    private static java.util.function.LongSupplier allocatedBytesAccessor() {
        try {
            var bean = ManagementFactory.getThreadMXBean();
            if (bean instanceof com.sun.management.ThreadMXBean provider &&
                provider.isThreadAllocatedMemorySupported()) {
                if (!provider.isThreadAllocatedMemoryEnabled()) {
                    provider.setThreadAllocatedMemoryEnabled(true);
                }
                long threadId = Thread.currentThread().threadId();
                return () -> provider.getThreadAllocatedBytes(threadId);
            }
        } catch (UnsupportedOperationException | SecurityException ignored) {
            // JVMs without allocation counters still report latency and node counts.
        }
        return () -> -1L;
    }

    private static int getOption(String[] args, String name, int fallback, int min, int max) {
        for (int i = 0; i < args.length; i++) {
            if (args[i].startsWith(name + "=")) {
                return bounded(Integer.parseInt(args[i].substring(name.length() + 1)), min, max);
            }
            if (args[i].equals(name) && i + 1 < args.length) {
                return bounded(Integer.parseInt(args[i + 1]), min, max);
            }
        }
        return fallback;
    }

    private static int bounded(int input, int min, int max) {
        if (input < min || input > max) {
            throw new IllegalArgumentException("Value must be between " + min + " and " + max);
        }
        return input;
    }
}
