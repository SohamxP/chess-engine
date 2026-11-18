# PlyForge — Java Chess Engine + Decision Lab

A full-stack human-versus-engine chess game. The **Java 25 chess engine** owns
all move legality, game termination, position evaluation, and AI search. A
**React 19 / TypeScript / Vite** frontend displays the board, valid destinations,
move history and match settings. Spring Boot exposes the engine over a REST API.

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
3. Review the proposed service (`openfile-chess`) and **Free** plan before approving.
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
docker build -t openfile-chess .
docker run --rm -p 10000:10000 openfile-chess
# Visit http://localhost:10000
```

## Game Review (Stockfish Lite)

The optional **Review game** panel analyzes a completed or in-progress game
move-by-move in the browser using the **Stockfish 19 Lite single-threaded
WebAssembly** engine (fixed depth 10). Analysis runs locally in a Web Worker,
not on the Spring Boot service, and starts only when you request it.

It provides an evaluation graph (from White's point of view), approximate move
grades, and a recommended alternative for clearly problematic moves. The
thresholds are heuristic, and **depth-10 evaluations are estimates, not
authoritative chess assessments**. Long games analyze at most the first 120
half-moves, with progress and a cancel option. Ending an analysis early retains
the portion already evaluated. Review calculations are not persisted across reloads, but game snapshots can be saved for read-only replay in this browser.

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

As the free Render web service sleeps and its in-memory game sessions disappear,
PlyForge now automatically saves game states containing moves (and finished
zero-move games) into the **same browser's local storage**. Open **My Games** to
see the latest 50 snapshots, their last update, result, difficulty, and moves.

Saved snapshots are **review-only**: opening one does not resume a game on the
Java server. Even after Render restarts or expires the game ID, you can review
the board and moves or analyze them with the local Stockfish worker, entirely
from a snapshot. Direct review URLs prefer the locally saved snapshot and do
not require the original server session to exist.

Each saved game and the dedicated Review screen can **Download PGN**, containing
standard SAN move text, players, result, date, and initial FEN for custom
starting positions. A PGN file is the portable backup. Local browser storage
does not synchronize across devices, can be disabled or cleared, and is not a
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
   1, 3, 7, 14 and then 30 days. Unsuccessful attempts reset the interval to 1 day.

**Limits and transparency:** This is not a guaranteed chess tutor. Depth-10 judgments are
approximate; equivalent good moves are accepted within a 0.60-pawn tolerance. Analysis runs in
a disposable browser Web Worker. Only game-derived positions are added, and at most 180
training cards are retained. No paid LLM requests, tracking, account, backend database or
cross-device synchronization are required. Clearing browser storage erases the training deck.
The system deliberately does not show the engine's answer before a user commits a move.

