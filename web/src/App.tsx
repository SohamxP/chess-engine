import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { api } from './api';
import { downloadPgn, type ArchivedGame } from './archive';
import { type PgnSelection } from './pgnImport';
import { deleteLibraryGame, exportGameLibraryBackup, importLibraryPgn, loadGameLibrary,
  restoreGameLibraryBackup, saveGameSnapshot, type RestoreSummary } from './gameLibrary';
import type { PgnImportCommit } from './PgnImportPanel';
import { SavedGamesPage } from './SavedGamesPage';
import { DecisionLabPage } from './DecisionLabPage';
import { loadPatternReport, type PatternKind } from './mistakePatterns';
import { MistakePatternsPage } from './MistakePatternsPage';
import {
  attachPatternEvidence, duePracticeCards, makePracticeCards, readPracticeCards,
  recordPracticeAttempt, removePracticeCard, writePracticeCards, type PracticeCard,
} from './practice';
import { analyzeGame } from './analysis';
import { GameReviewPage, type ReviewState } from './GameReviewPage';
import { PlayerStrip } from './PlayerStrip';
import {
  frameAtPly, glyphs, isLightSquare, kingSquare, parseFen, resultScore,
  squareOrder, statusLabel, type GameState, type LegalMove,
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
  const [onReview, setOnReview] = useState(
    () => new URLSearchParams(window.location.search).has('review'));
  const [onGames, setOnGames] = useState(
    () => new URLSearchParams(window.location.search).has('games'));
  const [onLab, setOnLab] = useState(
    () => new URLSearchParams(window.location.search).has('lab'));
  const [onInsights, setOnInsights] = useState(
    () => new URLSearchParams(window.location.search).has('insights'));
  const [practiceCards, setPracticeCards] = useState<PracticeCard[]>(() => readPracticeCards());
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [analyzedGameCounts, setAnalyzedGameCounts] = useState<Map<PatternKind, number>>(new Map());
  const [archivedGame, setArchivedGame] = useState<GameState | null>(null);
  const [reviewReturn, setReviewReturn] = useState<'game' | 'games' | 'insights'>('game');
  const [savedGames, setSavedGames] = useState<ArchivedGame[]>([]);
  const [libraryReady, setLibraryReady] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [initialReviewError, setInitialReviewError] = useState<string | null>(null);
  const reviewController = useRef<AbortController | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);

  function openReview(ply = 0) {
    if (!game || busy) return;
    setArchivedGame(null);
    setReviewReturn('game');
    setOnGames(false);
    setOnLab(false);
    setOnInsights(false);
    setReviewPly(Math.max(0, Math.min(game.moveHistory.length, ply)));
    setDismissedResult(game.id + ':' + game.status + ':' + game.moveHistory.length);
    if (!onReview) {
      window.history.pushState({}, '', '?review=' + encodeURIComponent(game.id));
    }
    setOnReview(true);
    window.scrollTo(0, 0);
  }

  function openSavedReview(item: ArchivedGame, ply = item.game.moveHistory.length) {
    clearReview();
    setArchivedGame(item.game);
    setReviewReturn('games');
    setReviewPly(Math.max(0, Math.min(item.game.moveHistory.length, ply)));
    setInitialReviewError(null);
    window.history.pushState({}, '', '?review=' + encodeURIComponent(item.id));
    setOnGames(false);
    setOnLab(false);
    setOnInsights(false);
    setOnReview(true);
    window.scrollTo(0, 0);
  }

  function openLab() {
    if (reviewController.current) stopReview();
    setReviewPly(null);
    setArchivedGame(null);
    window.history.pushState({}, '', '?lab=1');
    setOnGames(false);
    setOnReview(false);
    setOnInsights(false);
    setOnLab(true);
    window.scrollTo(0, 0);
  }

  // Reconcile legacy training cards with verified cross-game evidence from
  // cached local analysis. Never change the user's streak, due date or notes.
  // Reading storage after the async scan prevents overwriting an attempt made
  // while the scan was running.
  useEffect(() => {
    if (!onLab) return;
    const controller = new AbortController();
    setAnalyzedGameCounts(new Map());
    if (!libraryReady) return;
    void loadPatternReport(savedGames, controller.signal).then(report => {
      if (controller.signal.aborted) return;
      setAnalyzedGameCounts(new Map(report.groups.map(group => [group.kind, group.games])));
      const evidence = report.groups.flatMap(group => group.evidence);
      if (!evidence.length) return;
      const current = readPracticeCards();
      const tagged = attachPatternEvidence(current, evidence);
      if (tagged.every((card, i) => card === current[i])) return;
      if (writePracticeCards(tagged)) {
        setPracticeCards(tagged);
        setPracticeError(null);
      } else {
        setPracticeError('Could not save detected training patterns. Browser storage may be full.');
      }
    }).catch(() => {
      // An unavailable analysis cache is not a training failure.
    });
    return () => controller.abort();
  }, [onLab, libraryReady, savedGames]);

  function returnFromLab() {
    window.history.replaceState({}, '', window.location.pathname);
    setOnLab(false);
    if (!game) void newGame(true, 2);
    window.scrollTo(0, 0);
  }

  function recordLabAttempt(id: string, success: boolean, plan: string): boolean {
    // Storage is authoritative: asynchronous pattern reconciliation may have
    // updated card metadata since the previous React render.
    const current = readPracticeCards();
    const next = recordPracticeAttempt(current, id, success, plan, new Date(), analyzedGameCounts);
    if (next.every((item, index) => item === current[index])) return false;
    const ok = writePracticeCards(next);
    if (ok) {
      setPracticeCards(next);
      setPracticeError(null);
    } else {
      setPracticeError('Practice progress could not be saved. Check browser storage settings.');
    }
    return ok;
  }

  function deletePractice(id: string) {
    const next = removePracticeCard(practiceCards, id);
    if (writePracticeCards(next)) {
      setPracticeCards(next);
      setPracticeError(null);
    } else {
      setPracticeError('This decision could not be removed from browser storage.');
    }
  }

  function buildDecisionDeck() {
    const target = archivedGame ?? game;
    if (!target || !review?.positions.length) return;
    const { cards } = makePracticeCards(target, review.positions, practiceCards);
    if (!writePracticeCards(cards)) {
      setPracticeError('Decision Lab could not save your positions. Browser storage may be blocked or full.');
    } else {
      setPracticeCards(cards);
      setPracticeError(null);
    }
    openLab();
  }

  function openGames() {
    if (reviewController.current) stopReview();
    setReviewPly(null);
    setArchivedGame(null);
    window.history.pushState({}, '', '?games=1');
    setOnReview(false);
    setOnLab(false);
    setOnInsights(false);
    setOnGames(true);
    window.scrollTo(0, 0);
  }

  function openInsights() {
    if (reviewController.current) stopReview();
    setReviewPly(null);
    setArchivedGame(null);
    window.history.pushState({}, '', '?insights=1');
    setOnReview(false);
    setOnGames(false);
    setOnLab(false);
    setOnInsights(true);
    window.scrollTo(0, 0);
  }

  function returnFromInsights() {
    window.history.replaceState({}, '', window.location.pathname);
    setOnInsights(false);
    if (!game) void newGame(true, 2);
    window.scrollTo(0, 0);
  }

  function openInsightReview(gameId: string, ply: number) {
    const stored = savedGames.find(entry => entry.id === gameId);
    if (stored) {
      openSavedReview(stored, ply);
      setReviewReturn('insights');
    } else {
      openGames();
    }
  }

  function returnToGame() {
    if (reviewController.current) stopReview();
    const backToInsights = reviewReturn === 'insights';
    const backToGames = !backToInsights && (reviewReturn === 'games' || !game);
    window.history.replaceState({}, '',
      backToInsights ? '?insights=1' : backToGames ? '?games=1' : window.location.pathname);
    setOnReview(false);
    setOnLab(false);
    setOnInsights(backToInsights);
    setOnGames(backToGames);
    setArchivedGame(null);
    setReviewPly(null);
    window.scrollTo(0, 0);
  }

  function returnFromGames() {
    window.history.replaceState({}, '', window.location.pathname);
    setOnGames(false);
    window.scrollTo(0, 0);
    if (!game) void newGame(true, 2);
  }

  async function importPgnGames(choices: PgnSelection[]): Promise<PgnImportCommit> {
    try {
      const result = await importLibraryPgn(choices);
      setSavedGames(result.games);
      setArchiveError(null);
      return { ...result, saved: true };
    } catch (caught) {
      setArchiveError(caught instanceof Error ? caught.message : 'Could not save imported games.');
      return { games: savedGames, saved: false, imported: 0,
        duplicates: 0, full: 0, collisions: 0 };
    }
  }

  async function deleteSavedGame(id: string): Promise<void> {
    try {
      setSavedGames(await deleteLibraryGame(id));
      setArchiveError(null);
    } catch (caught) {
      setArchiveError(caught instanceof Error ? caught.message : 'Could not remove this game.');
    }
  }

  async function downloadLibraryBackup(): Promise<void> {
    const text = await exportGameLibraryBackup();
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = 'plysense-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function restoreLibrary(text: string): Promise<RestoreSummary> {
    try {
      const result = await restoreGameLibraryBackup(text);
      setSavedGames(result.games);
      setPracticeCards(readPracticeCards());
      setArchiveError(null);
      return result;
    } catch (caught) {
      // A partial restore may have committed valid game records. Reflect them.
      try { setSavedGames(await loadGameLibrary()); } catch { /* Keep last known view. */ }
      const message = caught instanceof Error ? caught.message : 'Could not restore backup.';
      setArchiveError(message);
      throw new Error(message);
    }
  }

  function clearReview() {
    reviewController.current?.abort();
    reviewController.current = null;
    setReview(null);
  }

  function stopReview() {
    reviewController.current?.abort();
    reviewController.current = null;
    setReview(current => current ? {
      ...current, running: false,
      error: 'Analysis stopped. Resume to reuse locally cached positions.',
    } : null);
  }

  async function startReview() {
    const target = archivedGame ?? game;
    if (!target || busy || target.moveHistory.length === 0) return;
    reviewController.current?.abort();
    const controller = new AbortController();
    reviewController.current = controller;
    const total = target.moveHistory.length + 1;
    setReview(previous => ({
      gameId: target.id,
      positions: previous?.gameId === target.id ? previous.positions : [],
      progress: previous?.gameId === target.id ? previous.progress : undefined,
      total, running: true, error: null,
    }));
    setReviewPly(0);
    try {
      const positions = await analyzeGame(target, controller.signal, (partial, count, progress) => {
        if (!controller.signal.aborted) {
          setReview({ gameId: target.id, positions: partial, progress,
            total: count, running: true, error: null });
        }
      });
      if (!controller.signal.aborted) {
        setReview(previous => previous?.gameId === target.id
          ? { ...previous, positions, total, running: false, error: null } : previous);
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
    // Do not save until the legacy archive migration has committed. Library
    // writes are serialized with imports/deletions, preventing lost updates.
    if (!libraryReady || !game ||
        (game.moveHistory.length === 0 && game.status === 'IN_PROGRESS')) return;
    let active = true;
    void saveGameSnapshot(game).then(games => {
      if (active) {
        setSavedGames(games);
        setArchiveError(null);
      }
    }).catch(caught => {
      if (active) setArchiveError(caught instanceof Error ? caught.message :
        'Could not save this game to IndexedDB. Download its PGN for safekeeping.');
    });
    return () => { active = false; };
  }, [game, libraryReady]);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('review');
    // Start a playable game without blocking on local library initialization.
    if (!gameId && !params.has('games') && !params.has('lab') && !params.has('insights')) {
      void newGame(true, 2);
    }
    void loadGameLibrary().then(items => {
      if (!active) return;
      setSavedGames(items);
      setLibraryReady(true);
      if (!gameId) return;
      const local = items.find(item => item.id === gameId);
      if (local) {
        setArchivedGame(local.game);
        setReviewReturn('games');
        setReviewPly(0);
        return;
      }
      setBusy(true);
      void api.get(gameId).then(response => {
        if (!active) return;
        setGame(response);
        setPlayAsWhite(response.humanWhite);
        setDifficulty(response.depth);
        setReviewPly(0);
      }).catch(caught => {
        if (active) setInitialReviewError(caught instanceof Error ?
          caught.message : 'Game could not be loaded.');
      }).finally(() => { if (active) setBusy(false); });
    }).catch(caught => {
      if (active) {
        setArchiveError(caught instanceof Error ? caught.message :
          'IndexedDB is unavailable. Your legacy game data has not been deleted.');
        setInitialReviewError('Saved game library could not be opened.');
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function handleNavigation() {
      const params = new URLSearchParams(window.location.search);
      const gameId = params.get('review');
      if (reviewController.current) {
        reviewController.current.abort();
        reviewController.current = null;
        setReview(current => current?.running
          ? { ...current, running: false, error: 'Analysis stopped.' } : current);
      }
      if (params.has('insights')) {
        setOnInsights(true);
        setOnLab(false);
        setOnGames(false);
        setOnReview(false);
        setArchivedGame(null);
        setReviewPly(null);
        return;
      }
      setOnInsights(false);
      if (params.has('lab')) {
        setOnLab(true);
        setOnGames(false);
        setOnReview(false);
        setArchivedGame(null);
        setReviewPly(null);
        return;
      }
      setOnLab(false);
      if (params.has('games')) {
        setOnGames(true);
        setOnReview(false);
        setArchivedGame(null);
        setReviewPly(null);
        return;
      }
      setOnGames(false);
      if (!gameId) {
        setOnReview(false);
        setArchivedGame(null);
        setReviewPly(null);
        if (!game) void newGame(true, 2);
        return;
      }
      setOnReview(true);
      setReviewPly(0);
      const saved = savedGames.find(item => item.id === gameId);
      if (saved) {
        setArchivedGame(saved.game);
        setReviewReturn('games');
      } else if (game?.id === gameId) {
        setArchivedGame(null);
        setReviewReturn('game');
      } else {
        setArchivedGame(null);
        void api.get(gameId).then(response => {
          setGame(response);
          setPlayAsWhite(response.humanWhite);
          setDifficulty(response.depth);
        }).catch(caught => {
          setInitialReviewError(caught instanceof Error ? caught.message : 'Game could not be loaded.');
        });
      }
    }
    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, [game?.id, savedGames]);

  useEffect(() => {
    // Keep history scrolling inside its own panel. scrollIntoView on a child
    // used to scroll the entire mobile page away from the chess board.
    if (reviewPly === null && historyList.current && game?.moveHistory.length) {
      historyList.current.scrollTop = historyList.current.scrollHeight;
    }
  }, [game?.moveHistory.length, reviewPly]);

  useEffect(() => {
    const count = (onReview ? (archivedGame ?? game) : game)?.moveHistory.length ?? 0;
    function handleArrow(event: KeyboardEvent) {
      const left = event.key === 'ArrowLeft' || event.code === 'ArrowLeft';
      const right = event.key === 'ArrowRight' || event.code === 'ArrowRight';
      if ((!left && !right) || event.altKey || event.ctrlKey || event.metaKey
          || onLab || onGames || count === 0 || busy
          || document.querySelector('[aria-label="Choose promotion piece"]')
          || document.querySelector('[aria-label="Confirm resignation"]')) return;
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (element?.isContentEditable
          || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName ?? '')) return;
      event.preventDefault();
      if (!onReview) {
        openReview(left ? Math.max(0, count - 1) : count);
      } else {
        setReviewPly(current => Math.max(0, Math.min(count, (current ?? count) + (left ? -1 : 1))));
      }
    }
    window.addEventListener('keydown', handleArrow, { capture: true });
    return () => window.removeEventListener('keydown', handleArrow, { capture: true });
  }, [game?.id, game?.status, game?.moveHistory.length, archivedGame?.id, archivedGame?.moveHistory.length, busy, onReview, onLab, onGames]);

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

  const activeReviewGame = archivedGame ?? game;
  const status = game
    ? reviewPly !== null
      ? 'Reviewing move ' + reviewPly + ' of ' + game.moveHistory.length
      : statusLabel(game)
    : 'Connecting to engine';
  const score = game ? resultScore(game) : null;
  const resultKey = game ? game.id + ':' + game.status + ':' + game.moveHistory.length : null;
  const showResult = Boolean(score && !onReview && !onGames && !onLab && !onInsights && resultKey !== dismissedResult && !busy && !motion && reviewPly === null);
  const humanSide = game?.humanWhite ? 'White' : 'Black';
  const dueCount = duePracticeCards(practiceCards).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="logo-symbol" aria-hidden="true">♞</span>
            <span><strong>PlySense</strong></span></div>
          <span className="topbar-caption">Play. Reflect. Improve.</span>
          <button type="button" className="topbar-games" onClick={openGames}>
            My Games {savedGames.length > 0 ? '(' + savedGames.length + ')' : ''}
          </button>
          <button type="button" className="topbar-games" onClick={openInsights}>
            My Patterns
          </button>
          <button type="button" className="topbar-games" onClick={openLab}>
            Decision Lab {dueCount > 0 ? '(' + dueCount + ' due)' : ''}
          </button>
          <a className="source-link" href="https://github.com/SohamxP/chess-engine"
            target="_blank" rel="noreferrer">View source <span aria-hidden="true">↗</span></a>
        </div>
      </header>

      {onInsights ? (
        <MistakePatternsPage games={savedGames}
          onReview={openInsightReview} onGames={openGames}
          onLab={openLab} onBack={returnFromInsights} />
      ) : onLab ? (
        <DecisionLabPage cards={practiceCards} onRecord={recordLabAttempt}
          onDelete={deletePractice} onBack={returnFromLab}
          analyzedGameCounts={analyzedGameCounts} error={practiceError} />
      ) : onGames ? (
        <SavedGamesPage games={savedGames} onReview={openSavedReview}
          onDelete={deleteSavedGame} onBack={returnFromGames} onImport={importPgnGames}
          onBackup={downloadLibraryBackup} onRestore={restoreLibrary}
          ready={libraryReady} error={archiveError} />
      ) : onReview ? (
        activeReviewGame ? <GameReviewPage game={activeReviewGame}
          ply={reviewPly ?? activeReviewGame.moveHistory.length}
          review={review} onSelect={setReviewPly} onBack={returnToGame}
          isArchived={archivedGame !== null}
          source={savedGames.find(item => item.id === activeReviewGame.id)?.source}
          onDownload={() => {
            const snapshot = savedGames.find(item => item.id === activeReviewGame.id);
            downloadPgn(activeReviewGame, snapshot?.savedAt, snapshot?.source);
          }}
          onAnalyze={() => void startReview()} onStop={stopReview}
          onBuildPractice={buildDecisionDeck}
          board={<ChessBoard game={activeReviewGame} busy={true} motion={null}
            reviewPly={reviewPly ?? activeReviewGame.moveHistory.length} onMove={() => undefined} />} />
          : <main className="main-content">
              <div className="panel">
                <h1>Game review unavailable</h1>
                <p>{initialReviewError ?? 'Loading this game…'}</p>
                <button type="button" className="btn-primary" onClick={openGames}>
                  Open My Games
                </button>
                <button type="button" className="btn-secondary" onClick={() => {
                  window.history.replaceState({}, '', window.location.pathname);
                  setOnReview(false);
                  void newGame(true, 2);
                }}>Start a new game</button>
              </div>
            </main>
      ) : (
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
            {game && <PlayerStrip game={game} player="computer"
              ply={game.moveHistory.length} thinking={Boolean(game.aiTurn && thinking)} />}

            {game ? (
              <ChessBoard game={game} busy={busy}
                motion={motion} reviewPly={null} onMove={move => void makeMove(move)} />
            ) : (
              <div className="board-placeholder">Loading your board…</div>
            )}

            {game && <PlayerStrip game={game} player="human"
              ply={game.moveHistory.length} />}
            <p className="board-footnote">
              'Click or drag a piece to move. Open Game Review to inspect past positions.'
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
                {thinking ? 'The computer is choosing its next move.' :
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
              <p className="history-help">Select a move to open the dedicated review page.</p>
              <button type="button" className="btn-secondary review-open-button"
                disabled={!game?.moveHistory.length || busy}
                onClick={() => openReview(0)}>Open Game Review</button>
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
                          onClick={() => openReview(pair.white!.ply)}>{pair.white.san}</button>
                      : <span>—</span>}
                    {pair.black
                      ? <button type="button" className={'move-entry ' +
                          (reviewPly === pair.black.ply ? 'review-selected' : '')}
                          aria-pressed={reviewPly === pair.black.ply}
                          aria-label={'View position after move ' + pair.black.ply + ': ' + pair.black.san}
                          onClick={() => openReview(pair.black!.ply)}>{pair.black.san}</button>
                      : <span>—</span>}
                  </div>
                )) : <div className="no-moves">Moves will appear here as you play.</div>}
              </div>
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
      )}

      <footer className="site-footer">
        <span>PlySense</span><span>Built with Java and React</span>
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
                openReview(0);
                void startReview();
              }}>
              Analyze game
            </button>
            <button type="button" className="btn-secondary"
              onClick={() => openReview(game.moveHistory.length)}>
              Review board
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
