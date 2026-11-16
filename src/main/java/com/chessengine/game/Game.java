package com.chessengine.game;

import com.chessengine.board.Board;
import com.chessengine.board.FenParser;
import com.chessengine.board.Move;
import com.chessengine.rules.AttackDetector;
import com.chessengine.rules.LegalMoveGenerator;
import com.chessengine.rules.MoveGenerator;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Owns one chess position and its repetition history.
 *
 * <p>{@link #makeMove(Move)} is kept as an analysis-friendly legal-move API:
 * callers may keep exploring a position even after an automatic draw. Use
 * {@link #playMove(Move)} for games that must stop on a terminal result.
 */
public class Game {
    private final Board board;
    private final MoveGenerator moveGenerator = new MoveGenerator();
    private final LegalMoveGenerator legalMoveGenerator = new LegalMoveGenerator();
    private final AttackDetector attackDetector = new AttackDetector();
    private final Map<String, Integer> positionCounts = new HashMap<>();
    private GameStatus claimedDraw;

    public Game() {
        this.board = new Board();
        recordPosition();
    }

    public Game(String fen) {
        this.board = FenParser.parse(fen);
        recordPosition();
    }

    /**
     * A fully independent snapshot including repetition counts and draw claims.
     * Useful for game-tree search without altering the actual game.
     */
    public Game copy() {
        Game snapshot = new Game(board.copy(), positionCounts, claimedDraw);
        return snapshot;
    }

    private Game(Board board, Map<String, Integer> history, GameStatus claimedDraw) {
        this.board = board;
        this.positionCounts.putAll(history);
        this.claimedDraw = claimedDraw;
    }

    /**
     * Exact search identity including all repetition counts. Two identical FEN
     * positions may not be interchangeable if they were reached by different
     * move histories, because repetition adjudication can then differ.
     */
    public String getSearchKey() {
        StringBuilder key = new StringBuilder(board.toFen()).append('|');
        positionCounts.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(entry -> key.append(entry.getKey())
                        .append('=').append(entry.getValue()).append(';'));
        if (claimedDraw != null) key.append("claimed=").append(claimedDraw);
        return key.toString();
    }

    public Board getBoard() { return board.copy(); }
    public String toFen() { return board.toFen(); }
    public boolean isWhiteToMove() { return board.isWhiteToMove(); }
    public boolean isInCheck() { return attackDetector.isKingInCheck(board, isWhiteToMove()); }

    public List<Move> getLegalMoves(int row, int col) {
        if (!moveGenerator.isInsideBoard(row, col)) return List.of();
        char piece = board.getPiece(row, col);
        if (piece == '.' || Character.isUpperCase(piece) != isWhiteToMove()) return List.of();
        return legalMoveGenerator.generateLegalMoves(board, row, col);
    }

    /** Lists all legal moves for the side to move. Useful for AI search. */
    public List<Move> getAllLegalMoves() {
        List<Move> result = new ArrayList<>();
        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) {
                result.addAll(getLegalMoves(row, col));
            }
        }
        return List.copyOf(result);
    }

    /**
     * Moves one piece legally but permits analysis to continue after an
     * automatically drawn position. A claimed draw always stops this game.
     */
    public boolean makeMove(Move move) {
        if (claimedDraw != null || move == null
                || !moveGenerator.isInsideBoard(move.getFromRow(), move.getFromCol())
                || !moveGenerator.isInsideBoard(move.getToRow(), move.getToCol())) return false;
        char piece = board.getPiece(move.getFromRow(), move.getFromCol());
        if (piece == '.' || Character.isUpperCase(piece) != isWhiteToMove()) return false;
        if (!legalMoveGenerator.isLegalMove(board, move)) return false;
        board.makeMove(move);
        recordPosition();
        return true;
    }

    /** Plays a move only when the game is still in progress. */
    public boolean playMove(Move move) {
        if (getStatus() != GameStatus.IN_PROGRESS) return false;
        return makeMove(move);
    }

    /**
     * Returns the current position's result, with mate/stalemate taking
     * precedence over automatic repetition and seventy-five-move draws.
     */
    public GameStatus getStatus() {
        if (claimedDraw != null) return claimedDraw;
        if (getAllLegalMoves().isEmpty()) {
            return isInCheck() ? GameStatus.CHECKMATE : GameStatus.STALEMATE;
        }
        if (hasInsufficientMaterial()) return GameStatus.DRAW_INSUFFICIENT_MATERIAL;
        if (board.getHalfmoveClock() >= 150) return GameStatus.DRAW_SEVENTY_FIVE_MOVE_RULE;
        if (getCurrentPositionCount() >= 5) return GameStatus.DRAW_FIVEFOLD_REPETITION;
        return GameStatus.IN_PROGRESS;
    }

    public boolean isGameOver() { return getStatus().isTerminal(); }

    /** The side to move is checkmated; the other side has won. */
    public boolean didWhiteWin() {
        return getStatus() == GameStatus.CHECKMATE && !isWhiteToMove();
    }

    /** The side to move is checkmated; the other side has won. */
    public boolean didBlackWin() {
        return getStatus() == GameStatus.CHECKMATE && isWhiteToMove();
    }

    public int getCurrentPositionCount() {
        return positionCounts.getOrDefault(repetitionKey(), 0);
    }

    /** Three occurrences permit a claim; five occurrences end the game automatically. */
    public boolean canClaimThreefoldRepetition() {
        return getStatus() == GameStatus.IN_PROGRESS && getCurrentPositionCount() >= 3;
    }

    /** Fifty moves by both players without a capture or pawn move permit a claim. */
    public boolean canClaimFiftyMoveRule() {
        return getStatus() == GameStatus.IN_PROGRESS && board.getHalfmoveClock() >= 100;
    }

    /** Claims a draw in the current position (not an anticipated future position). */
    public boolean claimDraw(DrawClaim claim) {
        if (claim == null || getStatus() != GameStatus.IN_PROGRESS) return false;
        switch (claim) {
            case THREEFOLD_REPETITION:
                if (getCurrentPositionCount() < 3) return false;
                claimedDraw = GameStatus.DRAW_THREEFOLD_REPETITION;
                return true;
            case FIFTY_MOVE_RULE:
                if (board.getHalfmoveClock() < 100) return false;
                claimedDraw = GameStatus.DRAW_FIFTY_MOVE_RULE;
                return true;
            default:
                return false;
        }
    }

    /**
     * A conservative dead-position detector. Known dead material sets are
     * K-K, K-B-K, K-N-K and K-B-K-B with same-colored bishops. We deliberately
     * do not mark K-N-N-K as dead: a cooperative mate is possible.
     */
    private boolean hasInsufficientMaterial() {
        int minors = 0;
        int whiteBishops = 0;
        int blackBishops = 0;
        int bishopSquareColor = -1;
        boolean sameBishopColor = true;
        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) {
                char piece = board.getPiece(row, col);
                switch (Character.toLowerCase(piece)) {
                    case '.', 'k': break;
                    case 'n': minors++; break;
                    case 'b':
                        minors++;
                        if (Character.isUpperCase(piece)) whiteBishops++;
                        else blackBishops++;
                        int color = (row + col) & 1;
                        if (bishopSquareColor != -1 && bishopSquareColor != color) sameBishopColor = false;
                        bishopSquareColor = color;
                        break;
                    default: return false;
                }
            }
        }
        if (minors <= 1) return true;
        return minors == 2 && whiteBishops == 1 && blackBishops == 1 && sameBishopColor;
    }

    private void recordPosition() {
        positionCounts.merge(repetitionKey(), 1, Integer::sum);
    }

    /**
     * FIDE position identity: piece placement, side, castling rights and the
     * availability of a legal en passant capture. Half/fullmove clocks do not
     * distinguish repeated positions. FEN's ep field can contain a target even
     * when no actual en passant capture is legal, so we normalize it here.
     */
    private String repetitionKey() {
        String[] fen = board.toFen().split(" ");
        String enPassant = "-";
        int epRow = board.getEnPassantRow();
        int epCol = board.getEnPassantCol();
        if (epRow >= 0 && epCol >= 0) {
            int fromRow = epRow + (board.isWhiteToMove() ? 1 : -1);
            char pawn = board.isWhiteToMove() ? 'P' : 'p';
            for (int delta : new int[]{-1, 1}) {
                int fromCol = epCol + delta;
                if (moveGenerator.isInsideBoard(fromRow, fromCol)
                        && board.getPiece(fromRow, fromCol) == pawn
                        && legalMoveGenerator.isLegalMove(board,
                                new Move(fromRow, fromCol, epRow, epCol))) {
                    enPassant = fen[3];
                    break;
                }
            }
        }
        return fen[0] + ' ' + fen[1] + ' ' + fen[2] + ' ' + enPassant;
    }
}
