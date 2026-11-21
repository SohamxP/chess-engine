# PlySense Java Chess Engine — Correctness & Performance

This folder documents **reproducible checks**, not unmeasured claims about speed or
playing strength. The Java opponent is an independent implementation (not
Stockfish). The browser uses Stockfish only to review games.

## 1. Correctness: perft

The `PerftTest` suite compares exact legal-move tree counts against the
[Chessprogramming Wiki's canonical perft positions](https://www.chessprogramming.org/Perft_Results).
Unlike AI search, perft does **not** prune, evaluate a position, reuse a
transposition score, or terminate an ordinary legal move tree just because a
draw may be claimed.

| Position | FEN | Depth 1 | Depth 2 | Depth 3 |
| --- | --- | ---: | ---: | ---: |
| Start | `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1` | 20 | 400 | 8,902 |
| Kiwipete | `r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1` | 48 | 2,039 | 97,862 |
| Rook/pawn endgame | `8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1` | 14 | 191 | 2,812 |

The regular Maven suite checks start through depth 3, Kiwipete through depth 2,
and the endgame through depth 3. A deeper Kiwipete run is **opt-in** because
this engine copies the whole game at each search node, making deeper perft
expensive.

Run from the repository root (JDK 25 and Maven required):

```sh
mvn --batch-mode clean verify
java -cp target/classes:target/test-classes com.chessengine.benchmark.PerftMain start 3
java -cp target/classes:target/test-classes com.chessengine.benchmark.PerftMain kiwipete 2 --divide
# Optional deeper reference, can take significantly longer:
java -cp target/classes:target/test-classes com.chessengine.benchmark.PerftMain kiwipete 3
```

`--divide` prints the exact leaf count after each legal root move, using UCI
coordinates (including promotion letters), which helps isolate discrepancies.
The original game is checked for accidental mutation after enumeration.

## 2. Performance: fixed-position search comparison

`EngineBenchmark` compares the same evaluator, quiescence logic and search
depth with two search modes already implemented in `ChessAI`:

- `without-pruning`: reference negamax (no alpha-beta / transposition table),
  used only for measurement and search-result comparisons.
- `alpha-beta-tt`: iterative deepening, alpha-beta cutoffs, transposition
  caching and move ordering used by the actual Java opponent.

We test three deterministic positions: starting, tactical (a poisoned-queen
capture), and a quiet pawn endgame. Inputs are **never mutated**. The benchmark
now compares **three** variants:

- `without-pruning` — minimax reference (separate algorithmic comparison).
- `alpha-beta-tt-repeated` — original alpha-beta/TT search, which generates
  legal moves twice at most nonterminal nodes (once to check game status and
  once for move ordering).
- `alpha-beta-tt` — same search, same evaluation, same move ordering and
  transposition keys, but reuses the legal move list during status checks and
  move ordering. This also avoids duplicate generation in quiescence search.

The two alpha-beta variants must produce the exact same best moves,
scores and search statistics (nodes, cutoffs and TT hits). The unpruned
reference must agree on score. Any disagreement is a correctness failure,
not a performance win. We **do not** weaken legal move validation or change
the FIDE game termination rules to obtain faster timings.

```sh
mvn --batch-mode -q -DskipTests test-compile
java -cp target/classes:target/test-classes com.chessengine.benchmark.EngineBenchmark \
  --depth=2 --warmup=3 --runs=15 > engine-baseline.csv
```

For a controlled old-vs-new comparison, use the **two alpha-beta rows**
and calculate median latency improvement as
`(oldMedianMs - newMedianMs) / oldMedianMs * 100`. Rerun with
`--depth=3 --warmup=5 --runs=15` on an idle local JDK 25 machine
only if both depths complete in an acceptable duration. Small improvements
at depth 1 are easily dominated by JIT/GC noise. Shared CI runners are for
correctness and smoke results; their timing artifacts are not a defensible
performance claim.

The CSV includes median and p95 elapsed time, median nodes visited,
alpha-beta cutoffs, transposition hits and quiescence nodes, optional
per-thread allocated bytes (or `-1` when unavailable), selected move and
score. Comment lines record JVM version, OS, CPU count, maximum heap and
commit SHA when `GITHUB_SHA` is available.

**Important:** Elapsed-time measurements are noisy and machine dependent.
This is a transparent application-level sampler, not the OpenJDK
[Java Microbenchmark Harness (JMH)](https://github.com/openjdk/jmh). Run
on an idle machine, with a consistent JDK/heap and several repetitions,
and use JMH or a profiler before claiming small latency improvements.
Do not assert CI timing thresholds on shared runners. Benchmark reports
must be tied to an actual commit and machine; do not invent performance
numbers or report a synthetic speedup.

## 3. Next optimization experiments (not yet implemented)

1. Profile the cost of `Game.copy()` and rebuilding string-based repetition
   keys at every search node.
2. Evaluate reversible make/unmake and an incremental position hash while
   preserving draw/repetition history and legal-move correctness.
3. Use the A/B benchmark to confirm whether the already-implemented move-list
   reuse improves elapsed time and allocation without changing a single
   search score, move, node count, or cutoff.
4. Re-run all perft, minimax-equivalence and benchmark tests before comparing
   before/after results at identical depth, positions, JDK and machine.
5. If profiling warrants it, add JMH microbenchmarks for copy/make/unmake,
   legal move generation and the transposition lookup separately.

A search-time improvement that breaks perft or changes verified minimax
scores is not an optimization.
