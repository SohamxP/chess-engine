package com.chessengine.game;

/** Outcome of the current position under standard chess rules. */
public enum GameStatus {
    IN_PROGRESS,
    CHECKMATE,
    STALEMATE,
    DRAW_INSUFFICIENT_MATERIAL,
    DRAW_THREEFOLD_REPETITION,
    DRAW_FIVEFOLD_REPETITION,
    DRAW_FIFTY_MOVE_RULE,
    DRAW_SEVENTY_FIVE_MOVE_RULE;

    public boolean isTerminal() {
        return this != IN_PROGRESS;
    }
}
