import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { api } from './api';
import { analyzeGame, MAX_REVIEW_PLIES, REVIEW_DEPTH } from './analysis';
import {
  analysisSummary, buildReviewedMoves, formatEvaluation, numericEvaluation,
  type PositionEvaluation,
} from './review';
import {
  frameAtPly, glyphs, isLightSquare, kingSquare, moveNotation, parseFen, resultScore,
  squareOrder, statusLabel, stepHistory, type GameState, type LegalMove,
} from './chess';

const levels = ['Easy', 'Medium', 'Hard'];
const promotions = ['Q', 'R', 'B', 'N'];
const MIN_ENGINE_RESPONSE_MS = 700;
const PIECE_TRAVEL_MS = 420;

type PieceMotion = { from: string; to: string; piece: string };

const delay = (ms: number): Promise<void> =>
  new Promise(resolve => window.setTimeout(resolve, ms));

type DragSession = {
  from: string; piece: string; pointerId: number;
  x: number; y: number; active: boolean;
};

function ChessBoard({ game, busy, motion, reviewPly, onMove }: {
  game: GameState;
  busy: boolean;
  motion: PieceMotion | null;
  reviewPly: number | null;
  onMove: (move: LegalMove) => void;
}) {
  const frame = useMemo(() => frameAtPly(game, reviewPly), [game, reviewPly]);
  const board = useMemo(() => parseFen(frame.fen), [frame.fen]);
  const squares = useMemo(() => squareOrder(game.humanWhite), [game.humanWhite]);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotionChoices, setPromotionChoices] = useState<LegalMove[]>([]);
  const [dragVisual, setDragVisual] = useState<{
    from: string; piece: string; x: number; y: number; hover: string | null;
  } | null>(null);
  const dragSession = useRef<DragSession | null>(null);
  const skipClick = useRef(false);

  const canPlay = !busy && reviewPly === null && !game.aiTurn && game.status === 'IN_PROGRESS';
  const checkedKing = frame.inCheck
    ? kingSquare(board, frame.fen.split(' ')[1] === 'w') : null;
  const possible = game.legalMoves.filter(move => move.from === selected);
  const targets = new Set(possible.map(move => move.to));

  // The board retains the pre-move position during travel. Captured pieces
  // remain visible on their squares until the attacking piece actually lands.
  const fromIndex = motion ? squares.indexOf(motion.from) : -1;
  const toIndex = motion ? squares.indexOf(motion.to) : -1;
  const flightStyle = motion && fromIndex !== -1 && toIndex !== -1 ? {
    left: String((fromIndex % 8) * 12.5) + '%',
    top: String(Math.floor(fromIndex / 8) * 12.5) + '%',
    '--flight-x': String(((toIndex % 8) - (fromIndex % 8)) * 100) + '%',
    '--flight-y': String((Math.floor(toIndex / 8) - Math.floor(fromIndex / 8)) * 100) + '%',
  } as CSSProperties : undefined;

  useEffect(() => {
    setSelected(null);
    setPromotionChoices([]);
  }, [game.fen, game.id, reviewPly]);

  function selectSquare(square: string) {
    if (!canPlay || promotionChoices.length) return;
    const piece = board[square];
    const ownPiece = piece && (piece === piece.toUpperCase()) === game.humanWhite;
    if (selected === square) {
      setSelected(null);
      return;
    }
    if (ownPiece) {
      setSelected(square);
      return;
    }
    const choices = possible.filter(move => move.to === square);
    if (choices.length > 1) setPromotionChoices(choices);
    else if (choices.length === 1) {
      setSelected(null);
      onMove(choices[0]);
    } else setSelected(null);
  }

  function squareUnderPointer(x: number, y: number): string | null {
    const candidate = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-square]');
    return candidate?.dataset.square ?? null;
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, square: string) {
    if (!canPlay || promotionChoices.length || event.button !== 0) return;
    const piece = board[square];
    if (!piece || (piece === piece.toUpperCase()) !== game.humanWhite) return;
    dragSession.current = {
      from: square, piece, pointerId: event.pointerId,
      x: event.clientX, y: event.clientY, active: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragSession.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && Math.hypot(
      event.clientX - drag.x, event.clientY - drag.y,
    ) < 8) return;
    drag.active = true;
    setSelected(drag.from);
    setDragVisual({
      from: drag.from, piece: drag.piece,
      x: event.clientX, y: event.clientY,
      hover: squareUnderPointer(event.clientX, event.clientY),
    });
  }

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragSession.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragSession.current = null;
    if (!drag.active) return; // A normal tap/click remains supported.
    event.preventDefault();
    skipClick.current = true;
    window.setTimeout(() => { skipClick.current = false; }, 0);
    setDragVisual(null);
    const destination = squareUnderPointer(event.clientX, event.clientY);
    const choices = game.legalMoves.filter(move =>
      move.from === drag.from && move.to === destination);
    if (choices.length > 1) {
      setPromotionChoices(choices);
    } else if (choices.length === 1) {
      setSelected(null);
      onMove(choices[0]);
    } else {
      setSelected(null);
    }
  }

  function cancelDrag() {
    dragSession.current = null;
    setDragVisual(null);
    setSelected(null);
  }

  return (
    <div className="board-frame">
      <div className="board" role="group" aria-label="Interactive chess board"
        data-moving-to={motion?.to ?? ''} data-review-ply={reviewPly ?? 'live'}>
        {squares.map((square, index) => {
          const piece = board[square];
          const target = targets.has(square);
          const last = frame.lastMove?.from === square || frame.lastMove?.to === square;
          return (
            <button key={square} type="button" data-square={square}
              className={[
                'square', isLightSquare(square) ? 'light' : 'dark',
                last ? 'last-move' : '',
                selected === square ? 'selected' : '',
                checkedKing === square ? 'checked' : '',
                dragVisual?.from === square ? 'drag-source' : '',
                dragVisual?.hover === square && targets.has(square) ? 'drag-over' : '',
              ].filter(Boolean).join(' ')}
              aria-label={square + (piece
                ? ' ' + (piece === piece.toUpperCase() ? 'white' : 'black') + ' ' + piece.toLowerCase()
                : ' empty') + (target ? ', legal destination' : '')}
              aria-pressed={selected === square}
              disabled={!canPlay}
              onPointerDown={event => beginDrag(event, square)}
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              onPointerCancel={cancelDrag}
              onClick={() => {
                if (skipClick.current) { skipClick.current = false; return; }
                selectSquare(square);
              }}>
              {index % 8 === 0 && <span className="rank-label">{square[1]}</span>}
              {piece && <span aria-hidden="true"
                className={[
                  'piece', piece === piece.toUpperCase() ? 'white-piece' : 'black-piece',
                  motion?.from === square ? 'motion-source' : '',
                ].filter(Boolean).join(' ')}>
                {glyphs[piece]}
              </span>}
              {target && <span aria-hidden="true"
                className={piece ? 'capture-ring' : 'destination-dot'} />}
              {index >= 56 && <span className="file-label">{square[0]}</span>}
            </button>
          );
        })}
        {flightStyle && motion && (
          <div className={'piece-flight ' +
            (motion.piece === motion.piece.toUpperCase() ? 'white-piece' : 'black-piece')}
            style={flightStyle} aria-hidden="true">
            {glyphs[motion.piece]}
          </div>
        )}
      </div>
      {dragVisual && (
        <div className={'drag-ghost ' +
          (dragVisual.piece === dragVisual.piece.toUpperCase()
            ? 'white-piece' : 'black-piece')}
          aria-hidden="true"
          style={{ left: dragVisual.x, top: dragVisual.y }}>
          {glyphs[dragVisual.piece]}
        </div>
      )}
      {promotionChoices.length > 0 && (
        <div className="promotion-cover" role="dialog"
          aria-label="Choose promotion piece" aria-modal="true">
          <div className="promotion-card">
            <h2>Promote pawn</h2>
            <p>Choose the piece to promote to.</p>
            <div className="promotion-options">
              {promotions.map(piece => {
                const choice = promotionChoices.find(move => move.promotion === piece);
                return (
                  <button key={piece} type="button" disabled={!choice}
                    aria-label={'Promote to ' + piece}
                    onClick={() => {
                      if (choice) {
                        setPromotionChoices([]);
                        onMove(choice);
                      }
                    }}>
                    {glyphs[game.humanWhite ? piece : piece.toLowerCase()]}
                  </button>
                );
              })}
            </div>
            <button type="button" className="link-button"
              onClick={() => setPromotionChoices([])}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [playAsWhite, setPlayAsWhite] = useState(true);
  const [difficulty, setDifficulty] = useState(2);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [motion, setMotion] = useState<PieceMotion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [dismissedResult, setDismissedResult] = useState<string | null>(null);
  // null follows the live match; 0 is the starting position; N is after ply N.
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const mounted = useRef(false);
  const historyList = useRef<HTMLDivElement>(null);
  const reviewController = useRef<AbortController | null>(null);
  const [review, setReview] = useState<{
    gameId: string;
    positions: PositionEvaluation[];
    total: number;
    running: boolean;
    error: string | null;
  } | null>(null);

  function clearReview() {
    reviewController.current?.abort();
    reviewController.current = null;
    setReview(null);
  }

  function stopReview() {
    reviewController.current?.abort();
    reviewController.current = null;
    setReview(current => current ? {
      ...current, running: false, error: 'Analysis stopped. Partial results are shown.',
    } : null);
  }

  async function startReview() {
    if (!game || busy || game.moveHistory.length === 0) return;
    reviewController.current?.abort();
    const controller = new AbortController();
    reviewController.current = controller;
    const target = game;
    const total = Math.min(target.moveHistory.length, MAX_REVIEW_PLIES) + 1;
    setReview({ gameId: target.id, positions: [], total, running: true, error: null });
    setReviewPly(0);
    try {
      const positions = await analyzeGame(target, controller.signal, (partial, count) => {
        if (!controller.signal.aborted) {
          setReview({ gameId: target.id, positions: partial, total: count, running: true, error: null });
        }
      });
      if (!controller.signal.aborted) {
        setReview({ gameId: target.id, positions, total, running: false, error: null });
      }
    } catch (caught) {
      if (!controller.signal.aborted) {
        setReview(previous => previous?.gameId === target.id ? {
          ...previous, running: false,
          error: caught instanceof Error ? caught.message : 'Game analysis failed.',
        } : previous);
      }
    } finally {
      if (reviewController.current === controller) reviewController.current = null;
    }
  }

  async function showMove(before: GameState, after: GameState) {
    const move = after.lastMove;
    const piece = move ? parseFen(before.fen)[move.from] : undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (piece && move && !reduced) {
      setMotion({ from: move.from, to: move.to, piece });
      // Keep the old board visible for the entire flight. A capture resolves
      // at the same moment as arrival, never before the attacker gets there.
      await delay(PIECE_TRAVEL_MS);
      setMotion(null);
    }
    setGame(after);
  }

  async function replyFromEngine(current: GameState) {
    if (!current.aiTurn) return;
    setThinking(true);
    try {
      const [response] = await Promise.all([
        api.ai(current.id),
        delay(MIN_ENGINE_RESPONSE_MS),
      ]);
      await showMove(current, response);
    } finally {
      setThinking(false);
    }
  }

  async function newGame(white: boolean, depth: number, oldId?: string) {
    clearReview();
    setBusy(true);
    setError(null);
    setNotice(null);
    setConfirmResign(false);
    setMotion(null);
    setDismissedResult(null);
    setReviewPly(null);
    try {
      const response = await api.create(white, depth);
      setGame(response);
      if (oldId) void api.close(oldId).catch(() => undefined);
      await replyFromEngine(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the game.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    void newGame(true, 2);
  }, []);

  useEffect(() => {
    // Keep history scrolling inside its own panel. scrollIntoView on a child
    // used to scroll the entire mobile page away from the chess board.
    if (reviewPly === null && historyList.current && game?.moveHistory.length) {
      historyList.current.scrollTop = historyList.current.scrollHeight;
    }
  }, [game?.moveHistory.length, reviewPly]);

  useEffect(() => {
    const moveCount = game?.moveHistory.length ?? 0;
    function handleArrow(event: KeyboardEvent) {
      const left = event.key === 'ArrowLeft' || event.code === 'ArrowLeft';
      const right = event.key === 'ArrowRight' || event.code === 'ArrowRight';
      if ((!left && !right) || event.altKey || event.ctrlKey || event.metaKey
          || moveCount === 0 || document.querySelector('[aria-label="Choose promotion piece"]')
          || document.querySelector('[aria-label="Confirm resignation"]')) return;
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (element?.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName ?? '')) return;
      // Result popups used to silently block both arrow keys. A navigation
      // keystroke now dismisses the popup and opens read-only history.
      event.preventDefault();
      if (game?.status !== 'IN_PROGRESS') {
        setDismissedResult(game!.id + ':' + game!.status + ':' + moveCount);
      }
      setReviewPly(cursor => stepHistory(cursor, moveCount, left ? -1 : 1));
    }
    // Capture lets shortcuts work even when a move-list button has focus.
    window.addEventListener('keydown', handleArrow, { capture: true });
    return () => window.removeEventListener('keydown', handleArrow, { capture: true });
  }, [game?.id, game?.status, game?.moveHistory.length]);

  async function makeMove(move: LegalMove) {
    if (!game || busy || game.aiTurn) return;
    clearReview();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const after = await api.move(game.id, move);
      await showMove(game, after);
      await replyFromEngine(after);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Move failed.');
    } finally {
      setBusy(false);
    }
  }

  async function resign() {
    if (!game || busy || game.status !== 'IN_PROGRESS') return;
    setConfirmResign(false);
    setBusy(true);
    setError(null);
    setNotice(null);
    setReviewPly(null);
    try {
      setGame(await api.resign(game.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not resign.');
    } finally {
      setBusy(false);
    }
  }

  async function offerDraw() {
    if (!game || busy || game.status !== 'IN_PROGRESS' || game.aiTurn) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setReviewPly(null);
    try {
      const offer = await api.offerDraw(game.id);
      setGame(offer.game);
      setNotice(offer.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not offer a draw.');
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!game || busy) return;
    clearReview();
    setBusy(true);
    setError(null);
    setDismissedResult(null);
    setReviewPly(null);
    try {
      setGame(await api.undo(game.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Undo failed.');
    } finally {
      setBusy(false);
    }
  }

  async function claim(type: 'THREEFOLD_REPETITION' | 'FIFTY_MOVE_RULE') {
    if (!game || busy) return;
    setBusy(true);
    setError(null);
    try {
      setGame(await api.claim(game.id, type));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Draw claim failed.');
    } finally {
      setBusy(false);
    }
  }

  const movePairs = useMemo(() => {
    const rows: { white?: { san: string; ply: number }; black?: { san: string; ply: number }; number: number }[] = [];
    for (const move of game?.moveHistory ?? []) {
      const number = Math.ceil(move.ply / 2);
      let pair = rows.find(row => row.number === number);
      if (!pair) {
        pair = { number };
        rows.push(pair);
      }
      if (move.white) pair.white = { san: move.san, ply: move.ply };
      else pair.black = { san: move.san, ply: move.ply };
    }
    return rows;
  }, [game?.moveHistory]);

  const reviewedMoves = review && review.gameId === game?.id && game
    ? buildReviewedMoves(game.moveHistory, review.positions) : [];
  const summary = game ? analysisSummary(reviewedMoves, game.humanWhite) : {
    blunders: 0, mistakes: 0, inaccuracies: 0,
  };
  const activeReviewPly = reviewPly ?? game?.moveHistory.length ?? 0;
  const selectedReview = reviewedMoves.find(item => item.move.ply === activeReviewPly);
  const flaggedMoves = reviewedMoves.filter(item =>
    item.move.white === game?.humanWhite &&
    (item.grade === 'Blunder' || item.grade === 'Mistake' || item.grade === 'Inaccuracy'));
  const chartPoints = review?.positions.map((position, index) => {
    const score = numericEvaluation(position);
    if (score === null) return null;
    return {
      x: 8 + 304 * index / Math.max(1, review.total - 1),
      y: 50 - Math.atan(score / 260) * 27,
    };
  }).filter((point): point is { x: number; y: number } => point !== null) ?? [];
  const chartPath = chartPoints.map((point, index) =>
    (index ? 'L' : 'M') + point.x.toFixed(1) + ' ' + point.y.toFixed(1)).join(' ');

  const status = game
    ? reviewPly !== null
      ? 'Reviewing move ' + reviewPly + ' of ' + game.moveHistory.length
      : statusLabel(game)
    : 'Connecting to engine';
  const score = game ? resultScore(game) : null;
  const resultKey = game ? game.id + ':' + game.status + ':' + game.moveHistory.length : null;
  const showResult = Boolean(score && resultKey !== dismissedResult && !busy && !motion && reviewPly === null);
  const engineSide = game?.humanWhite ? 'Black' : 'White';
  const humanSide = game?.humanWhite ? 'White' : 'Black';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="logo-symbol" aria-hidden="true">♞</span>
            <span>OpenFile <strong>Chess</strong></span></div>
          <span className="topbar-caption">Play against the computer</span>
          <a className="source-link" href="https://github.com/SohamxP/chess-engine"
            target="_blank" rel="noreferrer">View source <span aria-hidden="true">↗</span></a>
        </div>
      </header>

      <main className="main-content">
        <div className="intro">
          <div>
            <h1>Play chess</h1>
            <p>A simple board, your moves, and an engine on the other side.</p>
          </div>
          <span className="match-kind">Human vs. computer</span>
        </div>

        <div className="play-layout">
          <section className="board-column" aria-label="Chess match">
            <div className="player-strip opponent-strip">
              <div className="avatar engine-avatar" aria-hidden="true">♞</div>
              <div className="player-details">
                <strong>Computer</strong>
                <span>{engineSide} · Java chess engine</span>
              </div>
              <span className="player-badge">{game?.aiTurn && thinking ? 'Thinking…' : engineSide}</span>
            </div>

            {game ? (
              <ChessBoard game={game} busy={busy}
                motion={reviewPly === null ? motion : null}
                reviewPly={reviewPly} onMove={move => void makeMove(move)} />
            ) : (
              <div className="board-placeholder">Loading your board…</div>
            )}

            <div className="player-strip human-strip">
              <div className="avatar human-avatar" aria-hidden="true">♙</div>
              <div className="player-details">
                <strong>You</strong><span>Playing {humanSide}</span>
              </div>
              <span className="player-badge">{humanSide}</span>
            </div>
            <p className="board-footnote">
              {reviewPly === null
                ? 'Click or drag a piece to move. Use ← → to review moves.'
                : 'Reviewing a past position. Return to live to continue playing.'}
            </p>
          </section>

          <aside className="sidebar" aria-label="Match controls">
            <section className="panel status-panel">
              <div className="panel-heading"><h2>Game</h2><span className="session-label">Local game</span></div>
              <div className={'status-headline ' + (game?.status !== 'IN_PROGRESS' ? 'game-ended' : '')}>
                <span className={'status-orb ' + (thinking ? 'orb-thinking' : '')} />
                <strong>{thinking ? 'Engine calculating...' : status}</strong>
              </div>
              <p className="status-description">
                {reviewPly !== null
                  ? 'Use the arrow keys or the move list to step through the game.'
                  : thinking ? 'The computer is choosing its next move.' :
                    game?.status === 'IN_PROGRESS' ? 'You are playing ' + humanSide + '.' :
                      game ? 'The game is finished. You can review it or play again.' :
                        'Starting your match.'}
              </p>
              {error && <div className="error-message" role="alert">{error}</div>}
              {notice && <div className="game-notice" role="status">{notice}</div>}
              <div className="action-row">
                <button type="button" className="btn-primary" disabled={busy}
                  onClick={() => void newGame(playAsWhite, difficulty, game?.id)}>
                  New match
                </button>
                <button type="button" className="btn-secondary"
                  disabled={busy || !game?.canUndo}
                  onClick={() => void undo()}>Undo</button>
              </div>
              {game?.status === 'IN_PROGRESS' && (
                <div className="result-actions">
                  <button type="button" className="btn-secondary" disabled={busy || game.aiTurn}
                    onClick={() => void offerDraw()}>Offer draw</button>
                  <button type="button" className="btn-secondary resign-action" disabled={busy}
                    onClick={() => setConfirmResign(true)}>Resign</button>
                </div>
              )}
              {game?.aiTurn && !busy && (
                <button type="button" className="retry-button"
                  onClick={() => {
                    setBusy(true);
                    setError(null);
                    void replyFromEngine(game)
                      .catch(caught => setError(caught instanceof Error
                        ? caught.message : 'AI move failed.'))
                      .finally(() => setBusy(false));
                  }}>Retry engine move</button>
              )}
              {game?.canClaimThreefold && <button type="button"
                className="retry-button" disabled={busy}
                onClick={() => void claim('THREEFOLD_REPETITION')}>Claim draw by repetition</button>}
              {game?.canClaimFifty && <button type="button"
                className="retry-button" disabled={busy}
                onClick={() => void claim('FIFTY_MOVE_RULE')}>Claim draw by 50-move rule</button>}
            </section>

            <section className="panel setup-panel">
              <div className="panel-heading"><h2>Next game</h2></div>
              <div className="control-caption">Play as</div>
              <div className="choice-grid" role="group" aria-label="Play as">
                <button type="button" className={'choice ' + (playAsWhite ? 'active' : '')}
                  onClick={() => setPlayAsWhite(true)} aria-pressed={playAsWhite}>
                  <span className="color-chip white-chip" /> White
                </button>
                <button type="button" className={'choice ' + (!playAsWhite ? 'active' : '')}
                  onClick={() => setPlayAsWhite(false)} aria-pressed={!playAsWhite}>
                  <span className="color-chip black-chip" /> Black
                </button>
              </div>
              <div className="control-caption">Difficulty</div>
              <div className="difficulty-choices" role="group" aria-label="Difficulty">
                {levels.map((level, index) => (
                  <button key={level} type="button"
                    className={difficulty === index + 1 ? 'active' : ''}
                    aria-pressed={difficulty === index + 1}
                    onClick={() => setDifficulty(index + 1)}>{level}</button>
                ))}
              </div>
              <p className="setting-note">Settings apply to your next match.</p>
            </section>

            <section className="panel moves-panel">
              <div className="panel-heading"><h2>Moves</h2>
                <span className="move-count">{game?.moveHistory.length ?? 0} MOVES</span></div>
              <p className="history-help">Use the buttons or ← → keys to replay moves.</p>
              <div className="history-navigation" aria-label="Move review controls">
                <button type="button" aria-label="First position"
                  onClick={() => setReviewPly(0)} disabled={!game || game.moveHistory.length === 0}>⟪</button>
                <button type="button" aria-label="Previous move"
                  onClick={() => setReviewPly(cursor => stepHistory(cursor, game?.moveHistory.length ?? 0, -1))}
                  disabled={!game || (reviewPly === 0) || game.moveHistory.length === 0}>←</button>
                <button type="button" aria-label="Next move"
                  onClick={() => setReviewPly(cursor => stepHistory(cursor, game?.moveHistory.length ?? 0, 1))}
                  disabled={!game || reviewPly === null}>→</button>
                <button type="button" aria-label="Return to live position"
                  onClick={() => setReviewPly(null)} disabled={reviewPly === null}>Live</button>
              </div>
              <div className="move-table-head">
                <span>Move</span><span>White</span><span>Black</span>
              </div>
              <div className="move-list" aria-label="Move history" ref={historyList}>
                {movePairs.length ? movePairs.map(pair => (
                  <div className="move-pair" key={pair.number}>
                    <span className="move-number">{pair.number}.</span>
                    {pair.white
                      ? <button type="button" className={'move-entry ' +
                          (reviewPly === pair.white.ply ? 'review-selected' : '')}
                          aria-pressed={reviewPly === pair.white.ply}
                          aria-label={'View position after move ' + pair.white.ply + ': ' + pair.white.san}
                          onClick={() => setReviewPly(pair.white!.ply)}>{pair.white.san}</button>
                      : <span>—</span>}
                    {pair.black
                      ? <button type="button" className={'move-entry ' +
                          (reviewPly === pair.black.ply ? 'review-selected' : '')}
                          aria-pressed={reviewPly === pair.black.ply}
                          aria-label={'View position after move ' + pair.black.ply + ': ' + pair.black.san}
                          onClick={() => setReviewPly(pair.black!.ply)}>{pair.black.san}</button>
                      : <span>—</span>}
                  </div>
                )) : <div className="no-moves">Moves will appear here as you play.</div>}
              </div>
            </section>


            <section className="panel review-panel" aria-label="Game review">
              <div className="panel-heading">
                <h2>Game review</h2><span className="review-engine">Stockfish Lite</span>
              </div>
              <p className="review-description">
                Find mistakes and stronger moves using optional, local browser analysis.
                Evaluations are approximate at depth {REVIEW_DEPTH}.
              </p>
              <div className="review-actions">
                {!review ? (
                  <button type="button" className="btn-primary"
                    disabled={!game?.moveHistory.length || busy}
                    onClick={() => void startReview()}>Analyze game</button>
                ) : review.running ? (
                  <button type="button" className="btn-secondary"
                    onClick={stopReview}>Stop analysis</button>
                ) : (
                  <button type="button" className="btn-secondary"
                    disabled={!game?.moveHistory.length || busy}
                    onClick={() => void startReview()}>Analyze again</button>
                )}
                {review && <button type="button" className="btn-secondary"
                  onClick={() => setReviewPly(null)}>Live board</button>}
              </div>
              {!game?.moveHistory.length && (
                <p className="review-description">Make a move to enable analysis.</p>
              )}
              {review && (
                <>
                  <p className="review-progress" role="status">
                    {review.running
                      ? 'Analyzed ' + review.positions.length + ' of ' + review.total + ' positions…'
                      : review.error ?? ('Analyzed ' + review.positions.length + ' positions.')}
                  </p>
                  {review.running && <progress className="review-progress-bar"
                    value={review.positions.length} max={review.total} />}
                  {game && game.moveHistory.length > MAX_REVIEW_PLIES && (
                    <p className="review-description">
                      Only the first {MAX_REVIEW_PLIES} half-moves are analyzed to limit device load.
                    </p>
                  )}
                  {review.positions.length > 0 && (
                    <>
                      <div className="review-summary">
                        <div><strong>{summary.blunders}</strong><span>Blunders</span></div>
                        <div><strong>{summary.mistakes}</strong><span>Mistakes</span></div>
                        <div><strong>{summary.inaccuracies}</strong><span>Inaccuracies</span></div>
                      </div>
                      <div className="review-chart" aria-label="Evaluation graph">
                        <div className="review-chart-heading">
                          <span>Evaluation by move</span>
                          <strong>{formatEvaluation(review.positions[activeReviewPly])}</strong>
                        </div>
                        <svg viewBox="0 0 320 100" width="100%" role="img"
                          aria-label="Evaluation graph; above the middle favors White, below favors Black">
                          <line x1="8" x2="312" y1="50" y2="50" stroke="#cbd3c8" strokeWidth="1" strokeDasharray="3 4" />
                          <path d={chartPath} fill="none" stroke="#476b50" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round" />
                          {reviewPly !== null && activeReviewPly < review.positions.length && (
                            <line x1={8 + 304 * activeReviewPly / Math.max(1, review.total - 1)}
                              x2={8 + 304 * activeReviewPly / Math.max(1, review.total - 1)}
                              y1="4" y2="96" stroke="#738378" strokeWidth="1" strokeDasharray="3 3" />
                          )}
                        </svg>
                        <div className="review-chart-legend">
                          <span>Black advantage ↓</span><span>White advantage ↑</span>
                        </div>
                      </div>
                      <p className="review-description">
                        Tap a move in the move list or below to inspect its position.
                      </p>
                      {selectedReview && (
                        <div className="review-selected">
                          <div className="review-selected-heading">
                            <strong>
                              {Math.ceil(selectedReview.move.ply / 2)}
                              {selectedReview.move.white ? '. ' : '… '}
                              {selectedReview.move.san}
                            </strong>
                            <span className={'review-grade grade-' + selectedReview.grade.toLowerCase()}>
                              {selectedReview.grade}
                            </span>
                          </div>
                          {selectedReview.betterMove && (
                            <p>Stockfish preferred <strong>{moveNotation(selectedReview.betterMove)}</strong> instead.</p>
                          )}
                          {selectedReview.lossCp !== null && (
                            <p>Estimated loss: {(selectedReview.lossCp / 100).toFixed(2)} pawns.</p>
                          )}
                        </div>
                      )}
                      <div className="review-flagged">
                        <strong>Moves to revisit</strong>
                        {flaggedMoves.length ? (
                          <div className="review-flagged-list">
                            {flaggedMoves.slice(0, 12).map(item => (
                              <button type="button" key={item.move.ply}
                                className={activeReviewPly === item.move.ply ? 'active' : ''}
                                onClick={() => setReviewPly(item.move.ply)}>
                                {Math.ceil(item.move.ply / 2)}
                                {item.move.white ? '. ' : '… '}
                                {item.move.san}
                                <span>{item.grade}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="review-description">
                            No significant errors detected in the analyzed moves so far.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
              <p className="review-license">
                Powered by <a href="https://github.com/nmrugg/stockfish.js"
                  target="_blank" rel="noreferrer">Stockfish.js 19</a> (GPLv3).
                Analysis runs on your device; no additional server analysis load.
              </p>
            </section>

            {game?.aiStats && (
              <section className="engine-info" aria-label="Last search">
                <div className="panel-heading"><h2>Engine details</h2></div>
                <div className="engine-stats">
                  <span>Search depth</span><strong>{game.aiStats.depth} ply</strong>
                  <span>Positions visited</span>
                  <strong>{game.aiStats.nodesVisited.toLocaleString()}</strong>
                </div>
              </section>
            )}
          </aside>
        </div>
      </main>

      <footer className="site-footer">
        <span>OpenFile Chess</span><span>Built with Java and React</span>
      </footer>

      {confirmResign && (
        <div className="result-cover">
          <div className="result-card" role="dialog" aria-modal="true"
            aria-label="Confirm resignation">
            <div className="result-eyebrow">End the game?</div>
            <h2>Resign this match</h2>
            <p>Resigning gives the win to the computer. You cannot take back a resignation.</p>
            <button type="button" className="btn-primary"
              onClick={() => void resign()}>Confirm resignation</button>
            <button type="button" className="btn-secondary"
              onClick={() => setConfirmResign(false)}>Keep playing</button>
          </div>
        </div>
      )}
      {game && score && showResult && (
        <div className="result-cover">
          <div className="result-card" role="dialog" aria-modal="true"
            aria-label="Game result">
            <div className="result-eyebrow">Game finished</div>
            <div className="result-score">{score}</div>
            <h2 id="result-title">{status}</h2>
            <p>The result has been added to this game.</p>
            <button type="button" className="btn-primary"
              onClick={() => void newGame(playAsWhite, difficulty, game.id)}>
              Play again
            </button>
            <button type="button" className="btn-secondary"
              onClick={() => {
                setDismissedResult(resultKey);
                void startReview();
              }}>
              Analyze game
            </button>
            <button type="button" className="btn-secondary"
              onClick={() => setDismissedResult(resultKey)}>
              Review board
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
