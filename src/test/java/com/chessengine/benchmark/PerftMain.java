package com.chessengine.benchmark;

import com.chessengine.game.Game;

/**
 * Perft CLI: `java ... PerftMain start 3 --divide`.
 * Counts exact leaf move sequences and optionally prints each root branch.
 */
public final class PerftMain {
    private static final String START =
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    private static final String KIWIPETE =
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
    private static final String ENDGAME =
        "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1";

    private PerftMain() { }

    public static void main(String[] args) {
        if (args.length < 2 || args.length > 3) {
            throw new IllegalArgumentException(
                "Usage: PerftMain <start|kiwipete|endgame|quoted-FEN> <depth> [--divide]");
        }
        String fen = switch (args[0].toLowerCase()) {
            case "start" -> START;
            case "kiwipete" -> KIWIPETE;
            case "endgame" -> ENDGAME;
            default -> args[0];
        };
        int depth = Integer.parseInt(args[1]);
        if (depth < 0 || depth > 6) {
            throw new IllegalArgumentException("Depth must be 0..6 (high depths can be very slow)");
        }
        boolean divide = args.length == 3 && args[2].equals("--divide");
        if (args.length == 3 && !divide) throw new IllegalArgumentException("Unknown argument: " + args[2]);
        if (divide && depth < 1) throw new IllegalArgumentException("--divide requires depth >= 1");
        Game game = new Game(fen);
        String original = game.getSearchKey();
        long started = System.nanoTime();
        long nodes;
        if (divide) {
            var branches = Perft.divide(game, depth);
            branches.forEach((move, count) -> System.out.println(move + ": " + count));
            nodes = branches.values().stream().mapToLong(Long::longValue).sum();
        } else {
            nodes = Perft.count(game, depth);
        }
        double seconds = (System.nanoTime() - started) / 1_000_000_000.0;
        if (!original.equals(game.getSearchKey())) {
            throw new IllegalStateException("Perft unexpectedly mutated the root game");
        }
        System.out.printf(java.util.Locale.ROOT,
            "position=%s depth=%d nodes=%d duration_seconds=%.3f%n",
            args[0], depth, nodes, seconds);
    }
}
