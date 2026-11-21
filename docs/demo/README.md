# PlySense v1.0 — Demo walkthrough

This walkthrough demonstrates **real user flows**, not simulated improvements
in chess skill. It is a repeatable script for recording a short demo or
walking an interviewer through the live application.

## 90-second product demonstration

1. **Play (0–15 seconds).** Open the app, start a game, make a legal move,
   show the computer's reply and the move notation. Mention that the Java
   engine is independent of Stockfish.
2. **Import (15–30 seconds).** Open **My Games → Import PGN**, paste a short
   standard PGN from a game you actually played, choose your player color,
   preview and import. Confirm it appears in the IndexedDB library.
3. **Analyze (30–50 seconds).** Select **Review**, step through the notation,
   run **Analyze game**, and show the Stockfish evaluation curve. Mention
   that incomplete checks are flagged and cache results are local.
4. **Reflect (50–65 seconds).** Open **My Patterns**, select one verified
   finding, inspect its evidence and jump to the original board position.
   If no verified example exists, say so and use a prepared, analyzed game.
5. **Practice (65–80 seconds).** Add confirmed decisions to **Decision Lab**.
   Explain that the original best move is hidden until the player commits;
   solve one due position and show how it is rescheduled.
6. **Protect data (80–90 seconds).** Return to **My Games** and download a
   library JSON backup. Note that it includes practice and cached analysis
   and restores additively to the current browser.

For a short, legal tactical example using a custom FEN:

```text
[Event "PlySense demo"]
[White "Me"]
[Black "Opponent"]
[SetUp "1"]
[FEN "4k3/8/8/8/8/8/3q4/K2R4 w - - 0 1"]
[Result "*"]

1. Rb1 *
```

From that position, White should notice that `Rxd2` captures the unprotected
black queen. Only describe the position as a *detected* missed-free-material
error after actual Stockfish verification is present in the browser cache.
Importing it alone doesn't automatically generate a verified pattern.

## Three-minute engineering walkthrough

- **Architecture (30 sec):** React/TypeScript frontend, Java/Spring Boot
  REST gameplay, separate Stockfish Web Worker, IndexedDB game library,
  localStorage Decision Lab cards and JSON backups.
- **Algorithms (45 sec):** Legal move generation, canonical perft,
  negamax/alpha-beta, quiescence, TT and the history-aware search key.
- **Optimization (30 sec):** Eliminated duplicate legal-move enumeration.
  Compare old/new scores and moves before presenting the CI-only timing
  measurements with their depth/sample-size caveat.
- **Correctness of explanations (30 sec):** A centipawn swing isn't a
  causal label. Pattern rules require legal captures, checkmate proof,
  or deeper confirmed evaluation.
- **Persistence (30 sec):** Demonstrate that a migrated legacy archive
  remains untouched, while the modern game library uses transactional
  IndexedDB writes. Explain limits of cross-store restore atomicity.
- **Evidence (15 sec):** Point to Java tests, frontend unit tests,
  Playwright end-to-end cases and Docker smoke workflows.

## Reproducibility and honesty

A demo video should use real app behavior. Do not fake an active analysis
result, rewrite chess-engine output, present benchmark sample data as
production latency, or claim that practice accuracy establishes Elo gain.

A shareable recording is **not bundled** in the repository; this page is
the reproducible demo script. The final README links here so recruiters
can follow the exact workflow even without a video.
