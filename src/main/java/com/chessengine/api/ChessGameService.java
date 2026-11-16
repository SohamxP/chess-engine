package com.chessengine.api;

import com.chessengine.ai.ChessAI;
import com.chessengine.ai.SearchResult;
import com.chessengine.board.Move;
import com.chessengine.game.DrawClaim;
import com.chessengine.game.Game;
import com.chessengine.game.GameStatus;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/** In-memory single-player game sessions. The Java engine is authoritative. */
@Service
public class ChessGameService {
    private final Map<UUID, Session> sessions = new ConcurrentHashMap<>();
    private final ChessAI engine = new ChessAI();

    private static final class Session {
        final UUID id = UUID.randomUUID();
        final boolean humanWhite;
        final int depth;
        final Deque<Snapshot> history = new ArrayDeque<>();
        Game game = new Game();
        List<GameView.MoveEntry> moves = new ArrayList<>();
        GameView.AiStats aiStats;

        Session(boolean humanWhite, int depth) {
            this.humanWhite = humanWhite;
            this.depth = depth;
        }
    }

    /** Each snapshot is captured before exactly one ply. */
    private record Snapshot(Game game, List<GameView.MoveEntry> moves,
                            GameView.AiStats aiStats, boolean aiMove) { }

    public GameView create(Boolean playAsWhite, Integer searchDepth) {
        boolean white = playAsWhite == null || playAsWhite;
        int depth = searchDepth == null ? 2 : searchDepth;
        if (depth < 1 || depth > 3) {
            throw new IllegalArgumentException("Difficulty must be between 1 and 3.");
        }
        Session session = new Session(white, depth);
        sessions.put(session.id, session);
        return view(session);
    }

    public GameView get(UUID id) {
        Session session = find(id);
        synchronized (session) { return view(session); }
    }

    public GameView humanMove(UUID id, String from, String to, String promotion) {
        Session session = find(id);
        synchronized (session) {
            if (session.game.getStatus() != GameStatus.IN_PROGRESS) {
                throw new IllegalStateException("This game has already finished.");
            }
            if (session.game.isWhiteToMove() != session.humanWhite) {
                throw new IllegalStateException("It is the computer's turn.");
            }
            Move move = parseMove(from, to, promotion);
            if (!session.game.getAllLegalMoves().contains(move)) {
                // No explicit promotion means queen, matching the engine's makeMove API.
                if (move.getPromotion() == '\0') {
                    Move queen = new Move(move.getFromRow(), move.getFromCol(),
                            move.getToRow(), move.getToCol(), 'Q');
                    if (session.game.getAllLegalMoves().contains(queen)) move = queen;
                    else throw new IllegalArgumentException("Illegal move.");
                } else throw new IllegalArgumentException("Illegal move.");
            }
            recordBefore(session, false);
            if (!session.game.playMove(move)) throw new IllegalStateException("Move rejected by the engine.");
            addMove(session, move, false);
            return view(session);
        }
    }

    public GameView aiMove(UUID id) {
        Session session = find(id);
        synchronized (session) {
            if (session.game.getStatus() != GameStatus.IN_PROGRESS) {
                throw new IllegalStateException("This game has already finished.");
            }
            if (session.game.isWhiteToMove() == session.humanWhite) {
                throw new IllegalStateException("It is the player's turn.");
            }
            SearchResult result = engine.search(session.game, session.depth);
            Move move = result.bestMove();
            if (move == null) throw new IllegalStateException("No legal move was returned.");
            recordBefore(session, true);
            if (!session.game.playMove(move)) throw new IllegalStateException("AI move rejected by the engine.");
            session.aiStats = GameView.AiStats.of(result);
            addMove(session, move, true);
            return view(session);
        }
    }

    public GameView undo(UUID id) {
        Session session = find(id);
        synchronized (session) {
            if (session.history.stream().noneMatch(snapshot -> !snapshot.aiMove())) {
                throw new IllegalStateException("No player move to undo.");
            }
            Snapshot snapshot;
            do {
                snapshot = session.history.pop();
                session.game = snapshot.game().copy();
                session.moves = new ArrayList<>(snapshot.moves());
                session.aiStats = snapshot.aiStats();
            } while (snapshot.aiMove());
            return view(session);
        }
    }

    public GameView claimDraw(UUID id, DrawClaim claim) {
        Session session = find(id);
        synchronized (session) {
            if (session.game.isWhiteToMove() != session.humanWhite) {
                throw new IllegalStateException("Draw claims are only allowed on your turn.");
            }
            if (!session.game.claimDraw(claim)) {
                throw new IllegalArgumentException("This draw claim is not currently available.");
            }
            return view(session);
        }
    }

    public void delete(UUID id) {
        if (sessions.remove(id) == null) throw new NoSuchElementException("Game not found.");
    }

    private Session find(UUID id) {
        Session session = sessions.get(id);
        if (session == null) throw new NoSuchElementException("Game not found.");
        return session;
    }

    private static void recordBefore(Session session, boolean aiMove) {
        session.history.push(new Snapshot(session.game.copy(), List.copyOf(session.moves),
                session.aiStats, aiMove));
    }

    private static void addMove(Session session, Move move, boolean aiMove) {
        boolean white = !session.game.isWhiteToMove(); // the mover
        session.moves.add(new GameView.MoveEntry(session.moves.size() + 1, white, aiMove,
                GameView.MoveView.of(move).uci()));
    }

    private static Move parseMove(String from, String to, String promotion) {
        int[] src = parseSquare(from);
        int[] dst = parseSquare(to);
        char piece = '\0';
        if (promotion != null && !promotion.isBlank()) {
            if (promotion.length() != 1) throw new IllegalArgumentException("Invalid promotion.");
            piece = Character.toUpperCase(promotion.charAt(0));
        }
        return new Move(src[0], src[1], dst[0], dst[1], piece);
    }

    private static int[] parseSquare(String square) {
        if (square == null || !square.matches("[a-h][1-8]")) {
            throw new IllegalArgumentException("Squares must use coordinates such as e2 and e4.");
        }
        return new int[]{8 - (square.charAt(1) - '0'), square.charAt(0) - 'a'};
    }

    private static GameView view(Session session) {
        Game game = session.game;
        GameStatus status = game.getStatus();
        boolean aiTurn = status == GameStatus.IN_PROGRESS
                && game.isWhiteToMove() != session.humanWhite;
        List<GameView.MoveView> legal = status == GameStatus.IN_PROGRESS && !aiTurn
                ? game.getAllLegalMoves().stream().map(GameView.MoveView::of).toList()
                : List.of();
        GameView.MoveView last = null;
        if (!session.moves.isEmpty()) {
            String uci = session.moves.get(session.moves.size() - 1).uci();
            last = new GameView.MoveView(uci.substring(0, 2), uci.substring(2, 4),
                    uci.length() == 5 ? uci.substring(4).toUpperCase() : null);
        }
        return new GameView(session.id, game.toFen(), status.name(),
                game.isWhiteToMove(), game.isInCheck(), session.humanWhite, session.depth,
                aiTurn, session.history.stream().anyMatch(snapshot -> !snapshot.aiMove()),
                game.canClaimThreefoldRepetition() && !aiTurn,
                game.canClaimFiftyMoveRule() && !aiTurn,
                legal, List.copyOf(session.moves), last, session.aiStats);
    }
}
