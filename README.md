# Java Chess Engine

An educational chess engine built in Java. The project supports legal moves,
all standard special moves, game termination, and a first-generation AI
built with **negamax, alpha-beta pruning, iterative deepening, and tactical quiescence search**.

## Features

- Legal move generation with king safety, castling, en passant, and promotion.
- Checkmate, stalemate, repetition and move-count draw rules.
- FEN import/export and complete game state tracking.
- AI evaluation using material values and piece placement.
- Deterministic move selection with capture and promotion ordering.
- Iterative deepening reuses a transposition table across search depths.
- Tactical quiescence explores captures, promotions, and check evasions.
- Transposition entries account for repetition history, not just FEN.
- Benchmarkable alpha-beta pruning versus unpruned minimax.
- Java 25, Maven, JUnit 5, and GitHub Actions.

## Use the AI

    import com.chessengine.ai.ChessAI;
    import com.chessengine.ai.SearchResult;
    import com.chessengine.game.Game;

    Game game = new Game();
    ChessAI ai = new ChessAI();

    SearchResult result = ai.search(game, 3);
    System.out.println("Best move: " + result.bestMove());
    System.out.println("Score (centipawns): " + result.scoreCentipawns());
    System.out.println("Nodes visited: " + result.nodesVisited());
    System.out.println("Alpha-beta cutoffs: " + result.alphaBetaCutoffs());
    System.out.println("Transposition hits: " + result.transpositionHits());
    System.out.println("Quiescence nodes: " + result.quiescenceNodes());

    if (result.bestMove() != null) {
        game.playMove(result.bestMove());
    }

The returned move uses the engine's row/column coordinates and an optional
promotion piece. A null best move means the game has ended.

Search scores are expressed from the **side-to-move perspective**, whereas
PositionEvaluator.evaluate(Board) is positive for White. Checkmate scores
are +/-100000 adjusted for mate distance. Claimable draws are not claimed
automatically.

## Tests

    mvn clean verify

The GitHub Actions workflow runs on PRs and feature branches.

## Current limitations

This is a foundational AI, not yet a competitive tournament engine. It uses
fixed maximum-depth search with iterative deepening and a limited tactical
quiescence extension. It has no time management, opening book, or graphical UI.
The history-aware transposition key prioritizes correctness over memory
usage. Deeper searches remain exponentially expensive; next stages can add
time control, a UI, and further search optimizations.
