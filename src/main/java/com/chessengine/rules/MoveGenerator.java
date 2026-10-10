
package com.chessengine.rules;

import com.chessengine.board.Board;
import com.chessengine.board.Move;

import java.util.Collections;
import java.util.List;

public class MoveGenerator {

    private final PawnMoveGenerator pawn = new PawnMoveGenerator();
    private final KnightMoveGenerator knight = new KnightMoveGenerator();
    private final BishopMoveGenerator bishop = new BishopMoveGenerator();
    private final RookMoveGenerator rook = new RookMoveGenerator();
    private final QueenMoveGenerator queen = new QueenMoveGenerator();
    private final KingMoveGenerator king = new KingMoveGenerator();

    public List<Move> generateMoves(Board board, int row, int col) {

        if (!isInsideBoard(row, col)) {
            return Collections.emptyList();
        }

        char piece = board.getPiece(row, col);

        switch (Character.toLowerCase(piece)) {
            case 'p':
                return pawn.generateMoves(board, row, col);
            case 'n':
                return knight.generateMoves(board, row, col);
            case 'b':
                return bishop.generateMoves(board, row, col);
            case 'r':
                return rook.generateMoves(board, row, col);
            case 'q':
                return queen.generateMoves(board, row, col);
            case 'k':
                return king.generateMoves(board, row, col);
            default:
                return Collections.emptyList();
        }
    }

    public boolean isInsideBoard(int row, int col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }
}
