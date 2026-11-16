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
When playing Black, the engine makes the opening move first.

The browser sends the human move, displays it immediately, then requests the
engine reply independently. If a reply fails, use **Retry engine move**; the
game remains stored in the Java process.

## REST API

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/games` | New session; `{ "playAsWhite": true, "depth": 2 }` |
| GET | `/api/games/{id}` | Current FEN, legal moves, status, history |
| POST | `/api/games/{id}/moves` | Human move: `{ "from": "e2", "to": "e4" }` |
| POST | `/api/games/{id}/ai` | Compute the engine's reply |
| POST | `/api/games/{id}/undo` | Undo the last human move and AI reply |
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

The **required GitHub Actions `test` job** runs the Java tests and frontend
tests, type-check and production build. No merge should happen until that
check passes on the PR.

## Current limits

Game sessions are **in memory**, and are lost when the Java process restarts.
This project currently has no accounts, multiplayer, persistence, or deployed
production instance. AI difficulty changes search depth rather than time
budget; depth 3 may be slower on some positions. The React development server
requires the Java API to be running separately.

## Under the hood

The Java chess engine implements legal moves, castling, en passant, promotion,
checkmate, stalemate, repetition and move-count draws. AI uses fixed maximum
search depth, iterative deepening, negamax, alpha-beta pruning, quiescence
search, and a history-aware transposition table. Search is deterministic and
does not alter the user's current game.
