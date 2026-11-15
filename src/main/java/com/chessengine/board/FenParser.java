
package com.chessengine.board;

public final class FenParser {

    private static final String PIECES = "prnbqkPRNBQK";

    private FenParser() {
    }

    public static Board parse(String fen) {
        if (fen == null || fen.isBlank()) {
            throw new IllegalArgumentException("FEN cannot be empty");
        }

        String[] fields = fen.trim().split("\\s+");

        // A full FEN contains six fields.
        if (fields.length != 6) {
            throw new IllegalArgumentException(
                "FEN must contain exactly six fields"
            );
        }

        String[] ranks = fields[0].split("/", -1);

        if (ranks.length != 8) {
            throw new IllegalArgumentException(
                "FEN must contain exactly eight ranks"
            );
        }

        char[][] position = new char[8][8];

        for (int row = 0; row < 8; row++) {
            int col = 0;

            for (char symbol : ranks[row].toCharArray()) {

                if (symbol >= '1' && symbol <= '8') {
                    int emptySquares = symbol - '0';

                    if (col + emptySquares > 8) {
                        throw new IllegalArgumentException(
                            "Too many squares in rank " + (8 - row)
                        );
                    }

                    for (int i = 0; i < emptySquares; i++) {
                        position[row][col++] = '.';
                    }

                } else if (PIECES.indexOf(symbol) >= 0) {
                    if (col >= 8) {
                        throw new IllegalArgumentException(
                            "Too many squares in rank " + (8 - row)
                        );
                    }

                    position[row][col++] = symbol;

                } else {
                    throw new IllegalArgumentException(
                        "Invalid FEN piece: " + symbol
                    );
                }
            }

            if (col != 8) {
                throw new IllegalArgumentException(
                    "Rank " + (8 - row) +
                    " must contain exactly eight squares"
                );
            }
        }

        if (!fields[1].equals("w") && !fields[1].equals("b")) {
            throw new IllegalArgumentException(
                "Invalid active color"
            );
        }

        // Validate the remaining metadata fields.
        if (!fields[2].matches("-|[KQkq]{1,4}")) {
            throw new IllegalArgumentException(
                "Invalid castling rights"
            );
        }

        if (!fields[3].matches("-|[a-h][36]")) {
            throw new IllegalArgumentException(
                "Invalid en passant square"
            );
        }

        try {
            int halfmoveClock = Integer.parseInt(fields[4]);
            int fullmoveNumber = Integer.parseInt(fields[5]);

            if (halfmoveClock < 0 || fullmoveNumber < 1) {
                throw new IllegalArgumentException(
                    "Invalid move counters"
                );
            }
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(
                "Invalid move counters", exception
            );
        }

        return Board.fromPosition(position);
    }
}
