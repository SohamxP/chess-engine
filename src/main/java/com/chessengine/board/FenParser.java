package com.chessengine.board;

public final class FenParser {
    private static final String PIECES = "prnbqkPRNBQK";
    private FenParser() {}

    public static Board parse(String fen) {
        if (fen == null || fen.isBlank()) throw new IllegalArgumentException("FEN cannot be empty");
        String[] fields = fen.trim().split("\\s+");
        if (fields.length != 6) throw new IllegalArgumentException("FEN must contain six fields");
        String[] ranks = fields[0].split("/", -1);
        if (ranks.length != 8) throw new IllegalArgumentException("FEN must contain eight ranks");
        char[][] squares = new char[8][8];
        for (int r = 0; r < 8; r++) {
            int c = 0;
            for (char token : ranks[r].toCharArray()) {
                if (token >= '1' && token <= '8') {
                    int count = token - '0';
                    if (c + count > 8) throw new IllegalArgumentException("Too many squares in rank");
                    for (int i = 0; i < count; i++) squares[r][c++] = '.';
                } else if (PIECES.indexOf(token) >= 0) {
                    if (c >= 8) throw new IllegalArgumentException("Too many squares in rank");
                    squares[r][c++] = token;
                } else throw new IllegalArgumentException("Invalid piece: " + token);
            }
            if (c != 8) throw new IllegalArgumentException("Rank must have eight squares");
        }
        if (!fields[1].equals("w") && !fields[1].equals("b")) throw new IllegalArgumentException("Invalid turn");
        if (!fields[2].matches("-|K?Q?k?q?")) throw new IllegalArgumentException("Invalid castling rights");
        if (!fields[3].matches("-|[a-h][36]")) throw new IllegalArgumentException("Invalid en passant square");
        int halfmove, fullmove;
        try {
            halfmove = Integer.parseInt(fields[4]);
            fullmove = Integer.parseInt(fields[5]);
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("Invalid move counters", exception);
        }
        if (halfmove < 0 || fullmove < 1) throw new IllegalArgumentException("Invalid move counters");
        int epRow = -1, epCol = -1;
        if (!fields[3].equals("-")) {
            epCol = fields[3].charAt(0) - 'a';
            epRow = '8' - fields[3].charAt(1);
        }
        Board board = Board.fromPosition(squares);
        board.setFenState(fields[1].equals("w"), fields[2], epRow, epCol, halfmove, fullmove);
        return board;
    }
}
