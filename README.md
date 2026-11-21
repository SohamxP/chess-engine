# PlySense — Your Personal Chess Improvement Engine

**Play a game. Revisit the decisions that cost you. Practice a better idea before the engine reveals its answer. Remember it next week.**

PlySense is a full-stack chess game plus a private, spaced-recall training system built from *your own games*. Its focus is the thinking process: you can write down your plan, try a different legal move, compare that decision to your original move with local Stockfish analysis, and return when the position is due. No account, LLM API, or paid analysis service required.

**[Try PlySense](https://openfile-chess.onrender.com/)** · [Read the Decision Lab guide](#decision-lab--learn-from-your-own-decisions)

### How it works

```text
Java chess engine (Java 25 + Spring Boot)
      -> React 19 game board + FIDE move history
      -> browser-local saved games
      -> Stockfish 19 Lite Web Worker analyzes historical positions
      -> human mistakes become Decision Lab cards
      -> blind legal move + written plan
      -> compare new move vs. original vs. engine suggestion
      -> spaced review: 1 / 3 / 7 / 14 / 30 days
```

**Engineering:** custom Java engine with legal moves, negamax/alpha-beta, iterative deepening, quiescence and transposition caching; React/TypeScript UI; Spring Boot REST; chess.js for legal offline practice and SAN formatting; Stockfish WASM in a disposable browser worker; IndexedDB game archives and JSON backups; Java, Vitest and real-browser Playwright tests; Dockerized deployment to Render.


## Engine correctness and reproducible benchmarks

The custom Java engine is checked against published legal-move **perft**
reference counts (starting position, Kiwipete, and a rook/pawn endgame), and
includes a standalone command-line baseline vs. optimized search comparison
showing nodes searched, cutoffs, transposition hits, timing percentiles and
optional allocation counts. The comparison checks score agreement with the
unpruned search; benchmark values depend on the machine and **are not
invented or presented as user-performance claims**.

**[Run and interpret the benchmark suite](docs/benchmarks/README.md)**.
The browser-based Stockfish reviewer is a separate component; its depth-16
scores are not evidence of the strength of the custom Java opponent.

## Reliability and integration validation

PlySense now includes a reproducible **cross-feature browser regression** for
two imported games, cached verified pattern detection, review-to-training
navigation and offline persistence. Damaged browser-local saved games are
filtered individually rather than blocking the entire archive.
[Validation matrix, controlled fixture, acceptance steps and limitations](docs/validation/README.md).

## Requirements

- JDK 25 and Maven
- Node.js 22 and npm

## Run locally

Open two terminals in the repository root:

**Terminal 1 — Java API on port 8080**

```sh
mvn spring-boot:run
```

**Terminal 2 — React development server on port 5173**

```sh
cd web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite forwards `/api`
requests to `http://localhost:8080`. The API does not require CORS because
requests go through the same-origin development proxy.

## Play

Select a piece and click a highlighted legal square. You can play White or
Black, select Easy (depth 1), Medium (depth 2) or Hard (depth 3), undo an
entire human/AI turn, claim eligible draws, and start a new match. The board
flips when you play Black. Pawn promotion supports Queen, Rook, Bishop or Knight.
When playing Black, the engine makes the opening move first. You can also **resign** (after confirmation), or **offer a draw** on your turn. Unlike a rules-based claim, the computer can decline and the game continues. This baseline opponent accepts when its position evaluation is at least 300 centipawns worse than yours.

The browser sends the human move to Java, then animates it on the board.
**Both human and computer captures resolve on arrival:** the captured piece
remains visible until the moving piece reaches its square. The computer's
reply has a minimum 700 ms presentation pause, concurrent with search,
followed by a 420 ms piece animation. Reduced-motion users see the updated
board immediately, without the movement animation.

The move log displays **FIDE standard algebraic notation** (e.g. `e4`,
`Nf3`, `Rxe4+`, `O-O`, `Qg7#`). The backend also retains UCI
coordinates for machine-readable clients. A completed game displays the
official result (`1-0`, `0-1`, or `1/2-1/2`) in a dismissible dialog.

If a computer reply fails, use **Retry engine move**; the game remains
stored in the Java process.

## REST API

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/games` | New session; `{ "playAsWhite": true, "depth": 2 }` |
| GET | `/api/games/{id}` | Current FEN, legal moves, status, history |
| POST | `/api/games/{id}/moves` | Human move: `{ "from": "e2", "to": "e4" }` |
| POST | `/api/games/{id}/ai` | Compute the engine's reply |
| POST | `/api/games/{id}/undo` | Undo the last human move and AI reply |
| POST | `/api/games/{id}/resign` | Resign; opponent wins |
| POST | `/api/games/{id}/offers/draw` | Offer draw; returns `accepted`, `message`, `game` |
| POST | `/api/games/{id}/claims` | `{ "claim": "THREEFOLD_REPETITION" }` or `FIFTY_MOVE_RULE` |
| DELETE | `/api/games/{id}` | Discard a session |

Promotions use an optional `promotion` value of `Q`, `R`, `B`, or `N`.
All game rules are validated server-side. Invalid moves return HTTP 400,
conflicting turns return HTTP 409, and unknown session IDs return HTTP 404.

## Test

```sh
mvn clean verify
cd web
npm install
npm test
npm run build
```

The **required GitHub Actions `test` job** runs Java tests, frontend unit
tests, type-checking, the production build, and Chromium E2E tests against
a real Spring Boot API, plus a Docker production-image smoke test. No merge should happen until the entire job passes
on the PR.

### Browser integration tests

With JDK 25, Maven, and Node.js 22 installed:

```sh
cd web
npm install
npx playwright install chromium
npm run test:e2e
```

Playwright starts the Java server and Vite automatically (or reuses your
locally running servers). The browser checks playing against the actual Java
AI, undo, starting a Black-side match, new-game reset, and mobile layout.
A near-promotion position is mocked solely for testing the promotion picker;
the other browser cases use the real API.

## Current limits

Game sessions are **in memory**, and are lost when the Java process restarts, redeploys, or is suspended by free hosting. Match sessions cannot resume after a restart. Browser-local game snapshots and Decision Lab cards persist only on the same device; there are no accounts, multiplayer or cloud sync. AI difficulty changes search depth rather than time
budget; depth 3 may be slower on some positions. The React development server
requires the Java API to be running separately.

## Under the hood

The Java chess engine implements legal moves, castling, en passant, promotion,
checkmate, stalemate, repetition and move-count draws. AI uses fixed maximum
search depth, iterative deepening, negamax, alpha-beta pruning, quiescence
search, and a history-aware transposition table. Search is deterministic and
does not alter the user's current game.

### Drag moves and review history

Move any of your pieces by clicking a piece and a highlighted destination, or
by dragging and dropping it with a mouse, pen, or touch. Legal moves are still
validated by Java; an invalid drag leaves the position unchanged. White and
Black use solid chess-piece silhouettes with contrasting fills.

The move list doubles as a **replay timeline**: click any SAN move to see the
position *after* that move, including captures, promotion, castling, and en
passant. Use **Left/Right arrow keys** or the timeline controls to step back
and forward. **Live** returns to the actual ongoing game. Review mode is
read-only; it never changes the game on the Java server. Undo still explicitly
changes the live game state.


## Publish on Render (one web service)

The root `Dockerfile` compiles React and bundles it in the Spring Boot JAR.
Both the website (`/`) and Java API (`/api/games`) use one origin, so no
CORS setup or extra frontend host is required.

1. Connect your GitHub repository `SohamxP/chess-engine` to [Render](https://dashboard.render.com/).
2. In the Render dashboard select **New > Blueprint**, then choose the repo's `render.yaml`.
3. Review the proposed service (`openfile-chess`, its unchanged legacy Render service name) and **Free** plan before approving.
4. Deploy `main`. Render will assign a public HTTPS `*.onrender.com` address.

The blueprint sets the health check to `/healthz`, and new commits are
deployed only after GitHub CI checks pass.

**Free tier limitations:** A Free Render service currently has 512 MB RAM,
spins down after 15 minutes of inactivity, and can take about one minute to
wake. All games live in the Java process memory, so they are lost when
the instance is restarted, redeployed, or put to sleep. This is a hobby demo
with no persisted match data; verify Render usage/billing limits.

### Try the production container locally

```sh
docker build -t plysense .
docker run --rm -p 10000:10000 plysense
# Visit http://localhost:10000
```

## Game Review (Stockfish Lite)

The optional **Game Review** page evaluates all half-moves of a completed or
in-progress game locally with the **Stockfish 19 Lite single-threaded WebAssembly**
engine. A depth-10 scan covers the full game, then potentially costly or ambiguous
decisions are rechecked at depth 16. Up to 24 candidate moves are checked per
pass to control CPU use on phones; **Continue verification** handles remaining
candidates without losing completed work.

A provisional depth-10 blunder is **not** presented as an established mistake
or added to Decision Lab. Move grading waits for matching deeper evaluations
of both sides of suspicious moves. Position scores are compared at compatible
depths; checkmate and stalemate are handled explicitly, and ambiguous mate vs.
centipawn transitions are not converted into imaginary pawn losses. Scores and
move classifications remain **heuristic**, not authoritative chess assessments.

Completed positions are cached in a bounded, versioned **IndexedDB** store
(roughly 2,400 position/depth entries), with an in-memory fallback when storage is
unavailable. Cache keys include the full FEN, engine version, hash configuration,
and target depth; changes to these settings invalidate stale results. Stopping
analysis leaves completed positions cached, and reopening the game or clicking
**Resume analysis** reuses them. The review progress indicator distinguishes a
quick scan from deeper verification and shows reused evaluations. Analysis runs
in a disposable Web Worker **only on your device**, not on the Java server.
Large games can take multiple passes, especially on slower mobile hardware.

**License:** Stockfish.js 19.0.1 is GNU GPLv3 software. The browser engine is
distributed unmodified from the [stockfish npm package](https://www.npmjs.com/package/stockfish/v/19.0.1);
matching sources, build instructions and COPYING are maintained in
[the upstream Stockfish.js project](https://github.com/nmrugg/stockfish.js)
and [Stockfish itself](https://github.com/official-stockfish/Stockfish).
The engine is kept in a separate Web Worker and served as a local asset.


## Dedicated Game Review and captured material

Selecting **Open Game Review**, clicking a SAN move, or using a history arrow
opens a **separate game review page** at `/?review=<game-id>`. The game stays on
the same site, with a clear **Back to game** control. A direct review link also
loads the existing server session. Because games are in-memory, review links
stop working if the Render free instance restarts or the session is deleted.

The review page keeps the chessboard and **SAN notation** together with move
navigation, evaluation graph, move feedback, and a short list of mistakes.
Stockfish alternatives are also shown in SAN (e.g. `Nf3`, `O-O`, `a8=Q+`)
using [chess.js](https://github.com/jhlywa/chess.js) strictly for formatting;
the Java backend remains the authority on actual gameplay.

Both the game board and review board display **captured opponent pieces beneath
each player's name**, sorted by type. A `+N` indicator denotes the player's
current material lead (pawns=1, knights/bishops=3, rooks=5, queens=9).
Captured pieces are reconstructed from the stored move/FEN history, so
en-passant captures and promotions are handled without false capture counts.

## Saved Games (browser-only) & PGN

[Versioned IndexedDB migration, safe backup/restore, 2,000-game cap and data-integrity tests](docs/storage/README.md).


As the free Render web service sleeps and its in-memory game sessions disappear,
PlySense now automatically saves game states containing moves (and finished
zero-move games) into the browser's **IndexedDB game library**. Open **My Games** to
review up to 2,000 stored games (rendered in paginated batches), including
last update, result, difficulty, and moves.

Saved snapshots are **review-only**: opening one does not resume a game on the
Java server. Even after Render restarts or expires the game ID, you can review
the board and moves or analyze them with the local Stockfish worker, entirely
from a snapshot. Direct review URLs prefer the locally saved snapshot and do
not require the original server session to exist.

Each saved game and the dedicated Review screen can **Download PGN**, containing
standard SAN move text, players, result, date, and initial FEN for custom
starting positions. Use **Download library backup** for a complete versioned JSON
file containing games, training progress and durable cached evaluations;
**Restore JSON backup** adds missing records without overwriting existing ones.
Local browser storage does not synchronize across devices, can be disabled or cleared, and is not a
substitute for a future server-side database. When storage fails, the app warns
rather than promising the match was saved.

No sign-in, new services, subscriptions, or third-party infrastructure are
required for this phase.


## Decision Lab — learn from your own decisions

The site's purpose is **playing, reflecting, and remembering**. A generic engine score shows what
happened; Decision Lab turns your *own* imprecise moves into repeatable practice.

1. Play a game and open **Game Review**. Start **Analyze game** to run local Stockfish analysis.
2. Choose **Add N decisions to Decision Lab** after analysis identifies your own inaccuracies,
   mistakes or blunders. Identical game/move pairs do not create duplicate cards.
3. Open **Decision Lab** from the navigation. Choose a move on an interactive board without
   seeing the engine's recommendation. Optionally write your plan first.
4. Stockfish Lite evaluates the original position, your new attempt and the move you originally
   played at the same depth. Compare approximate evaluation losses and the engine's suggested SAN.
5. The attempt and note stay in local storage; successfully recalled positions reappear after
   1, 3, 7, 14 and then 30 days. Unsuccessful attempts reset the interval to 1 day.\n   Practicing ahead of schedule is allowed but never inflates the recall streak.

**Limits and transparency:** This is not a guaranteed chess tutor. Depth-10 judgments are
approximate; equivalent good moves are accepted within a 0.60-pawn tolerance. Analysis runs in
a disposable browser Web Worker. Only game-derived positions are added, and at most 180
training cards are retained. No paid LLM requests, tracking, account, backend database or
cross-device synchronization are required. Clearing browser storage erases the training deck.
The system deliberately does not show the engine's answer before a user commits a move.



## Adaptive Decision Lab and training progress

When an analyzed game reveals one of the objectively verified patterns in
**My Patterns**, new Decision Lab cards are tagged with that evidence. Opening
Decision Lab also reconciles **existing** cards against locally cached pattern
reports. This leaves their due dates, recall streaks, written plans, and
lifetime attempt counters intact. Unverified guesses are not turned into tags.

A missed-mate-in-one card is checked directly against legal checkmate on
the board when the player attempts it, rather than requiring unreliable
mate-versus-centipawn comparisons or another Stockfish search.

Scheduling is **deterministic, not a learned model**. A card without verified
tags uses the original 1/3/7/14/30-day successful-recall intervals. When a
tagged weakness recurs across **two or more distinct saved games**, successes
shorten its next interval (75% of the base schedule for two games; 60% for
three or more, rounded to a minimum of one day). A miss resets the streak and
returns the decision tomorrow. Among decisions already due, prior failures
take priority, followed by weaknesses found in several distinct games. The
scheduler never brings future-due cards forward or counts early practice
toward a streak.

The **Training progress** section reports retained recorded attempts, attempts and
successful outcomes in the past 30 days, distinct positions practiced, and
exercise accuracy for each verified theme. The counts are based on actual
successful/unsuccessful practice events—not inferred game ratings or fabricated
training effectiveness. Each card stores up to 40 detailed attempts to avoid
unbounded browser-local storage growth, while keeping its total lifetime
attempts counter. Historical cards created before this upgrade are still
available with their streaks and due dates, but earlier individual outcomes
cannot be reconstructed and therefore are excluded from the new dashboard.

All data remains in the existing browser-local Decision Lab key
(`plyforge-decision-lab-v1`) for backward compatibility. No new account,
analytics service, cloud backend, or remote engine requests are involved.
**An improved exercise success rate does not establish improved chess
performance**; comparing actual future game outcomes will require a separate
longitudinal study with sufficient sample sizes.

## Personal Mistake Patterns — evidence across games

**My Patterns** (`?insights=1`) groups repeatable tactical evidence across saved games,
not just a list of Stockfish scores. Import PGNs or play games, open each game's **Review**
and run **Analyze game**, then select **My Patterns** in the top navigation.

The first version uses three narrowly verifiable categories:

- **Missed mate in one:** the cached deeper engine move is legal checkmate, while
  the move played did not checkmate. The actual board proves this; no invented
  centipawn loss is attached to mate-vs-centipawn transitions.
- **Missed free material:** a confirmed (depth-16 on both sides) mistake or
  blunder where Stockfish preferred capturing an unprotected knight, bishop,
  rook, or queen, with no legal immediate recapture.
- **Exposed major piece:** a confirmed mistake or blunder after moving a rook
  or queen into a legal capture by a cheaper opponent piece that Stockfish
  selects as its best reply, with no legal immediate recapture.

The material rules also require an estimated evaluation loss of **at least
140 centipawns**. They inspect legal moves with `chess.js`, not SAN keywords.
Each finding links back to the **exact move in Game Review** and includes
the alternative SAN, evidence explanation, source game, and score when valid.
The report distinguishes number of *occurrences* from number of *distinct
games*: multiple examples in one game aren't a recurring cross-game trend.

This feature deliberately **does not** label ambiguous concepts such as
"bad strategy", "weak king safety", or "missed tactics" from evaluation loss
alone. Coverage shows how many saved games had a complete depth-10 scan,
how many decisions had usable grades, and how many still need verification.
A missing label does not mean no mistakes were made.

For privacy and performance, the dashboard reads the **existing versioned
IndexedDB Stockfish cache in read-only batches**, rather than running new
engine analysis, uploading positions, or duplicating analysis data. Clearing
browser data removes the underlying games/evaluations. The IndexedDB game
library holds up to 2,000 saved games; PGN parsing still previews a maximum
of 50 games per batch.

## Import games from other chess platforms (PGN)

PlySense does not require you to play chess here to improve. In **My Games → Import PGN**:

1. Export a standard `.pgn` from Chess.com, Lichess or another chess site.
2. Select one or more local PGN files, or paste the PGN text. Preview every parsed game;
   invalid games are reported individually without blocking valid games.
3. Choose which side **you** played in each game (an optional player-name match suggests
   White or Black). The choice controls the review orientation and which mistakes become
   Decision Lab practice cards.
4. Import the games into the same browser-local archive. Open **Review**, run the local
   Stockfish analysis and then add your own mistakes to Decision Lab. Games do not need
   a Java server session.
5. Export the imported game back to PGN with its original player names, event, date, site,
   result, mainline SAN, and any custom starting FEN.

The importer uses the existing **chess.js 1.4** library to validate each move and rebuild
the move/FEN history; the Java backend still handles live PlySense games. Imported outcomes
are represented without assuming a player resigned. Re-importing the same source match is
deduplicated using its starting position, full UCI mainline and available source identity
(game URL, otherwise player/date/event tags). Distinct matches with the same moves can coexist.
Existing saved games are never deleted to make space during import.

**Limits:** Standard-chess PGNs only (not Chess960), up to 50 games per preview, 500
half-moves per game, 1,000,000 characters per file/text input, and 50 total browser-saved
games. Import keeps the mainline, not variations, comments or NAG annotations. These limits
protect low-memory devices and browser storage. Clear space or import a smaller batch if
necessary. PGN data stays in your browser; it is not uploaded to Render or an external API.
Imported games are read-only snapshots, and browser data can still be lost if cleared.
