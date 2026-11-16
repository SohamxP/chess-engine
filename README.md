# OpenFile Chess — Java Engine + React

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

Game sessions are **in memory**, and are lost when the Java process restarts, redeploys, or is suspended by free hosting. This project has no accounts, multiplayer, or persistence. AI difficulty changes search depth rather than time
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
