# PlySense v1 validation — reproducible integration and recovery checks

This is a **regression test plan**, not an accuracy or user-outcome study.
The automated tests use labeled, deterministic chess positions to make the
expected behavior independently checkable.

## What CI exercises

| Layer | Test | Failure that should be caught |
| --- | --- | --- |
| Java engine | JUnit canonical perft + search-equivalence suite | Illegal move generation, altered search scores or pruning correctness |
| React / browser storage | Vitest archive and practice tests | Broken persistence, stale state, malformed/missing FEN, invalid UCI or timestamps |
| Pattern detection | Vitest legal-position evidence tests | Calling an undefended piece defended, inventing a mate loss, opponent mistake counted as personal |
| Cross-feature browser flow | Playwright imports **two distinct PGN games** sharing a well-defined tactical error, seeds the **real versioned IndexedDB cache schema**, detects the recurring free-material theme, opens Game Review, builds a tagged Decision Lab card and checks reload persistence | Disconnected route, incorrect distinct-game counts, broken IndexedDB reuse, lost tags/streaks |
| Mixed archive recovery | Playwright seeds a valid archived game next to a malformed one and reloads | Entire library inaccessible because one record is corrupt |
| Application deployment | Docker / HTTP smoke | Broken built assets, health check or Java API startup |

### Controlled PGN fixture

The integrated browser test imports two chess games with different event/date
tags but the same legal tactical position:

```text
[Event "Pattern fixture A"]
[Date "2026.11.19"]
[White "Soham"]
[Black "Opponent"]
[SetUp "1"]
[FEN "4k3/8/8/8/8/8/3q4/K2R4 w - - 0 1"]
[Result "*"]

1. Rb1 *
```

The counterpart uses event `Pattern fixture B` and a different date.
At depth 16, the **test fixture** supplies evaluations before and after the
move. Because White could legally capture the unprotected queen on d2 and
instead moves their rook away, the expected cross-game label is
`missed-free-capture`, **two occurrences in two distinct games**.

The injected evaluations are deliberately **test doubles**, not independently
measured Stockfish results. This validates the application plumbing and
classification rules. Separate real-browser tests run the actual local
Stockfish worker for general gameplay review and Decision Lab evaluation.

### User-facing acceptance walkthrough

1. Import at least two PGNs that contain recognized mistakes, selecting the
   correct player/color. Run Game Review analysis on each.
2. Open **My Patterns**. Verify each finding shows its source game, actual
   move and suggested alternative. Confirm the **distinct-games count** is
   different from raw occurrence count when one game has repeated errors.
3. Open an example in Game Review. Confirm it jumps to the correct ply.
   Use **Add decisions to Decision Lab** after analysis.
4. Enter Decision Lab, solve due positions and verify that repeated patterns
   receive priority only when the evidence comes from distinct games.
5. Reload, revisit the page and confirm the saved cards, schedules, tags and
   recorded exercise outcomes remain unchanged.
6. Import malformed PGN or simulate blocked browser storage; confirm honest
   errors without destroying the existing saved games.

## Explicit limits

- Local game archive currently stores **up to 50 games**.
- Only three narrowly provable tactical categories are recognized; absence
  of findings **does not mean** a game has no mistakes.
- A missing or incomplete cache is shown as incomplete coverage, not a
  synthesized classification.
- Adaptive training is a transparent heuristic based on repeat patterns,
  not a trained AI model.
- Exercise accuracy does not prove chess rating improvement. No deployment
  health check can prove user outcomes.

Run regression tests:

```sh
mvn --batch-mode clean verify
cd web
npm install --no-audit --no-fund
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Reproducibility note: the Rollup transitive dependency is temporarily pinned
to the last verified published version in `web/package.json`. A later
dependency maintenance PR should add a committed lockfile and use `npm ci`.
