
package com.chessengine.board;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class FenParserTest {

    @Test
    void parsesStartingPosition() {
        Board board = FenParser.parse(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        );

        assertEquals('r', board.getPiece(0, 0));
        assertEquals('k', board.getPiece(0, 4));
        assertEquals('P', board.getPiece(6, 4));
        assertEquals('K', board.getPiece(7, 4));
        assertEquals('.', board.getPiece(4, 4));
    }

    @Test
    void parsesCustomPosition() {
        Board board = FenParser.parse(
            "4k3/8/8/8/4r3/8/4N3/4K3 w - - 0 1"
        );

        assertEquals('k', board.getPiece(0, 4));
        assertEquals('r', board.getPiece(4, 4));
        assertEquals('N', board.getPiece(6, 4));
        assertEquals('K', board.getPiece(7, 4));
    }

    @Test
    void rejectsInvalidRankCount() {
        assertThrows(
            IllegalArgumentException.class,
            () -> FenParser.parse(
                "8/8/8/8/8/8/8 w - - 0 1"
            )
        );
    }

    @Test
    void rejectsInvalidRankWidth() {
        assertThrows(
            IllegalArgumentException.class,
            () -> FenParser.parse(
                "9/8/8/8/8/8/8/8 w - - 0 1"
            )
        );
    }

    @Test
    void rejectsInvalidPiece() {
        assertThrows(
            IllegalArgumentException.class,
            () -> FenParser.parse(
                "4x3/8/8/8/8/8/8/4K3 w - - 0 1"
            )
        );
    }

    @Test
    void rejectsMissingFields() {
        assertThrows(
            IllegalArgumentException.class,
            () -> FenParser.parse(
                "8/8/8/8/8/8/8/8"
            )
        );
    }

    @Test
    void rejectsInvalidActiveColor() {
        assertThrows(
            IllegalArgumentException.class,
            () -> FenParser.parse(
                "8/8/8/8/8/8/8/8 x - - 0 1"
            )
        );
    }

    @Test
    void rejectsInvalidMoveCounters() {
        assertThrows(
            IllegalArgumentException.class,
            () -> FenParser.parse(
                "8/8/8/8/8/8/8/8 w - - -1 0"
            )
        );
    }
}
