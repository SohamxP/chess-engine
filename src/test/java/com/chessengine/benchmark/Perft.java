package com.chessengine.benchmark;

import com.chessengine.board.Move;
import com.chessengine.game.Game;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/**
 * Perft (performance test) counts legal move sequences, not unique positions.
 *
 * This is deliberately independent of the chess AI: no evaluation, move
 * ordering, pruning, transposition cache, or automatic draw claiming.
 *
 * Reference counts: https://www.chessprogramming.org/Perft_Results
 */
public final class Perft {
    private Perft() { }

    public static long count(Game position, int depth) {
        Objects.requireNonNull(position, "position");
        if (depth < 0) throw new IllegalArgumentException("Depth must be non-negative");
        if (depth == 0) return 1L;
        var legal = position.getAllLegalMoves();
        if (depth == 1) return legal.size();
        long nodes = 0L;
        for (Move move : legal) {
            Game child = position.copy();
            if (!child.makeMove(move)) {
                throw new IllegalStateException("Engine generated an illegal move: " + uci(move));
            }
            nodes = Math.addExact(nodes, count(child, depth - 1));
        }
        return nodes;
    }

    /** Per-root-move counts help localize a wrong perft result to one line. */
    public static Map<String, Long> divide(Game position, int depth) {
        Objects.requireNonNull(position, "position");
        if (depth < 1) throw new IllegalArgumentException("Divide requires depth >= 1");
        Map<String, Long> counts = new TreeMap<>();
        for (Move move : position.getAllLegalMoves()) {
            Game child = position.copy();
            if (!child.makeMove(move)) {
                throw new IllegalStateException("Engine generated an illegal move: " + uci(move));
            }
            counts.put(uci(move), count(child, depth - 1));
        }
        return counts;
    }

    public static String uci(Move move) {
        return square(move.getFromRow(), move.getFromCol()) +
                square(move.getToRow(), move.getToCol()) +
                (move.getPromotion() == '\0' ? "" :
                    Character.toLowerCase(move.getPromotion()));
    }

    private static String square(int row, int col) {
        return "" + (char) ('a' + col) + (8 - row);
    }
}
