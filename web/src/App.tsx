import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api } from './api';
import {
  glyphs, isLightSquare, kingSquare, moveNotation,
  parseFen, squareOrder, statusLabel, type GameState, type LegalMove,
} from './chess';

const levelNames = ['Easy', 'Medium', 'Hard'];
const promotionPieces = ['Q', 'R', 'B', 'N'];

// Pacing affects presentation only; the Java search is never artificially slowed.
const MIN_ENGINE_RESPONSE_MS = 700;
const PIECE_TRAVEL_MS = 420;

type PieceMotion = { from: string; to: string; piece: string };
const pause = (duration: number): Promise<void> =>
  new Promise(resolve => window.setTimeout(resolve, duration));

function ChessBoard({ game, busy, motion, onMove }: {
  game: GameState;
  busy: boolean;
  motion: PieceMotion | null;
  onMove: (move: LegalMove) => void;
}) {
  const board = useMemo(() => parseFen(game.fen), [game.fen]);
  const squares = useMemo(() => squareOrder(game.humanWhite), [game.humanWhite]);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotionChoices, setPromotionChoices] = useState<LegalMove[]>([]);
  const eligible = !busy && !game.aiTurn && game.status === 'IN_PROGRESS';
  const checkedKing = game.inCheck ? kingSquare(board, game.whiteToMove) : null;
  const possible = game.legalMoves.filter(move => move.from === selected);
  const targets = new Set(possible.map(move => move.to));
  // Indices follow the current board orientation, so movement also works
  // when the human plays Black and the board is reversed.
  const fromIndex = motion ? squares.indexOf(motion.from) : -1;
  const toIndex = motion ? squares.indexOf(motion.to) : -1;
  const flightStyle = motion && fromIndex >= 0 && toIndex >= 0 ? {
    left: `${(fromIndex % 8) * 12.5}%`,
    top: `${Math.floor(fromIndex / 8) * 12.5}%`,
    '--flight-x': `${((toIndex % 8) - (fromIndex % 8)) * 100}%`,
    '--flight-y': `${(Math.floor(toIndex / 8) - Math.floor(fromIndex / 8)) * 100}%`,
  } as CSSProperties : undefined;

  useEffect(() => {
    setSelected(null);
    setPromotionChoices([]);
  }, [game.fen, game.id]);

  function selectSquare(square: string) {
    if (!eligible || promotionChoices.length) return;
    const mover = board[square];
    const ownPiece = mover && ((mover === mover.toUpperCase()) === game.humanWhite);
    if (selected === square) { setSelected(null); return; }
    if (ownPiece) { setSelected(square); return; }
    const choices = possible.filter(move => move.to === square);
    if (choices.length > 1) { setPromotionChoices(choices); return; }
    if (choices.length === 1) { onMove(choices[0]); setSelected(null); }
    else setSelected(null);
  }

  return (
    <div className="board-frame">
      <div className="board" role="group" aria-label="Interactive chess board">
        {squares.map((square, idx) => {
          const piece = board[square];
          const last = game.lastMove?.from === square || game.lastMove?.to === square;
          const target = targets.has(square);
          const fileIndex = idx % 8;
          const rankIndex = Math.floor(idx / 8);
          const labelRank = fileIndex === 0;
          const labelFile = rankIndex === 7;
          return (
            <button key={square} type="button"
              className={[
                'square', isLightSquare(square) ? 'light' : 'dark',
                last ? 'last-move' : '', selected === square ? 'selected' : '',
                checkedKing === square ? 'checked' : '',
              ].filter(Boolean).join(' ')}
              aria-label={`${square}${piece ? ` ${piece === piece.toUpperCase() ? 'white' : 'black'} ${piece.toLowerCase()}` : ' empty'}${target ? ', legal destination' : ''}`}
              aria-pressed={selected === square}
              disabled={!eligible}
              onClick={() => selectSquare(square)}>
              {labelRank && <span className="rank-label">{square[1]}</span>}
              {piece && <span aria-hidden="true" className={`piece ${piece === piece.toUpperCase() ? 'white-piece' : 'black-piece'} ${motion?.to === square ? 'motion-destination' : ''}`}>{glyphs[piece]}</span>}
              {target && <span className={piece ? 'capture-ring' : 'destination-dot'} aria-hidden="true" />}
              {labelFile && <span className="file-label">{square[0]}</span>}
            </button>
          );
        })}
        {flightStyle && motion && (
          <div aria-hidden="true"
            className={`piece-flight ${motion.piece === motion.piece.toUpperCase() ? 'white-piece' : 'black-piece'}`}
            style={flightStyle}>
            {glyphs[motion.piece]}
          </div>
        )}
      </div>
      {promotionChoices.length > 0 && (
        <div className="promotion-cover" role="dialog" aria-label="Choose promotion piece" aria-modal="true">
          <div className="promotion-card">
            <h3>Promote your pawn</h3>
            <p>Choose your new piece.</p>
            <div className="promotion-options">
              {promotionPieces.map(piece => {
                const choice = promotionChoices.find(move => move.promotion === piece);
                return <button key={piece} type="button" disabled={!choice} onClick={() => {
                  if (choice) { setPromotionChoices([]); onMove(choice); }
                }} aria-label={`Promote to ${piece}`}>
                  {glyphs[game.humanWhite ? piece : piece.toLowerCase()]}
                </button>;
              })}
            </div>
            <button type="button" className="link-button" onClick={() => setPromotionChoices([])}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniLogo() {
  return <div className="logo-symbol" aria-hidden="true">♞</div>;
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [playAsWhite, setPlayAsWhite] = useState(true);
  const [difficulty, setDifficulty] = useState(2);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [motion, setMotion] = useState<PieceMotion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const historyEnd = useRef<HTMLDivElement>(null);

  async function replyFromEngine(current: GameState) {
    if (!current.aiTurn) return;
    setThinking(true);
    try {
      // Calculate concurrently with a short readable pause. If search takes
      // longer, we present the result as soon as it is ready.
      const [response] = await Promise.all([
        api.ai(current.id),
        pause(MIN_ENGINE_RESPONSE_MS),
      ]);
      const last = response.lastMove;
      const movingPiece = last ? parseFen(current.fen)[last.from] : undefined;
      if (last && movingPiece) {
        setMotion({ from: last.from, to: last.to, piece: movingPiece });
      }
      setGame(response);
      if (last && movingPiece) {
        await pause(PIECE_TRAVEL_MS);
        setMotion(null);
      }
    } finally {
      setThinking(false);
    }
  }

  async function newGame(white: boolean, level: number, oldId?: string) {
    setMotion(null);
    setBusy(true);
    setError(null);
    try {
      const response = await api.create(white, level);
      setGame(response);
      if (oldId) void api.close(oldId).catch(() => undefined);
      await replyFromEngine(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start game.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    void newGame(true, 2);
  }, []);

  useEffect(() => { historyEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [game?.moveHistory.length]);

  async function makeMove(move: LegalMove) {
    if (!game || busy || game.aiTurn) return;
    setBusy(true);
    setError(null);
    try {
      const played = await api.move(game.id, move);
      setGame(played);
      await replyFromEngine(played);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Move failed.');
    } finally { setBusy(false); }
  }

  async function undo() {
    if (!game || busy) return;
    setBusy(true);
    setError(null);
    try { setGame(await api.undo(game.id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Undo failed.'); }
    finally { setBusy(false); }
  }

  async function claim(type: 'THREEFOLD_REPETITION' | 'FIFTY_MOVE_RULE') {
    if (!game || busy) return;
    setBusy(true);
    setError(null);
    try { setGame(await api.claim(game.id, type)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Draw claim failed.'); }
    finally { setBusy(false); }
  }

  const movePairs = useMemo(() => {
    const rows: { white?: string; black?: string; number: number }[] = [];
    for (const move of game?.moveHistory ?? []) {
      const number = Math.ceil(move.ply / 2);
      let pair = rows.find(row => row.number === number);
      if (!pair) { pair = { number }; rows.push(pair); }
      if (move.white) pair.white = move.uci;
      else pair.black = move.uci;
    }
    return rows;
  }, [game?.moveHistory]);

  const status = game ? statusLabel(game) : 'Connecting to engine';

  return <div className="app-shell">
    <header className="topbar">
      <a href="/" className="brand" aria-label="OpenFile Chess home" onClick={event => event.preventDefault()}>
        <MiniLogo />
        <span>OPENFILE <strong>CHESS</strong></span>
      </a>
      <span className="topbar-caption">JAVA ENGINE <span className="topbar-separator">/</span> REACT BOARD</span>
      <span className="live-pill"><span className="live-dot" /> LOCAL MATCH</span>
    </header>

    <main className="main-content">
      <div className="intro">
        <div className="eyebrow"><span className="line-accent" /> ENGINE LAB / 01</div>
        <h1>Make your <em>move.</em></h1>
        <p>Outthink the machine. A real chess engine, built from first principles.</p>
      </div>

      <div className="play-layout">
        <section className="board-column" aria-label="Chess match">
          <div className="player-strip opponent-strip">
            <div className="avatar engine-avatar">♞</div>
            <div className="player-details"><strong>OpenFile Engine</strong><span>Java · Alpha-beta search</span></div>
            <span className="player-badge">CPU</span>
          </div>

          {game ? <ChessBoard game={game} busy={busy} motion={motion} onMove={move => void makeMove(move)} /> :
            <div className="board-placeholder"><span>♜</span><p>Connecting to the engine...</p></div>}

          <div className="player-strip human-strip">
            <div className="avatar human-avatar">♙</div>
            <div className="player-details"><strong>You</strong><span>Playing {game?.humanWhite ? 'White' : 'Black'}</span></div>
            <span className="player-badge human-badge">HUMAN</span>
          </div>
          <div className="board-footnote"><span>CLICK A PIECE, THEN A HIGHLIGHTED SQUARE</span><span>ENGINE v1.1</span></div>
        </section>

        <aside className="sidebar" aria-label="Match controls">
          <section className="panel status-panel">
            <div className="panel-heading"><span>MATCH STATUS</span><span className="signal-icon">● ● ●</span></div>
            <div className={`status-headline ${game?.status !== 'IN_PROGRESS' ? 'game-ended' : ''}`}>
              <span className={`status-orb ${thinking ? 'orb-thinking' : ''}`} />
              <strong>{thinking ? 'Engine calculating...' : status}</strong>
            </div>
            <p className="status-description">
              {thinking ? 'Analyzing possible continuations.' : game?.status === 'IN_PROGRESS'
                ? `You are playing ${game.humanWhite ? 'White' : 'Black'}. ${game.inCheck ? 'Your king is under attack.' : 'Your next decision matters.'}`
                : game ? 'The match has ended. Start another to play again.' : 'Starting your game.'}
            </p>
            {error && <div className="error-message" role="alert">{error}</div>}
            <div className="action-row">
              <button type="button" className="btn-primary" disabled={busy}
                onClick={() => void newGame(playAsWhite, difficulty, game?.id)}>
                <span>↻</span> New match
              </button>
              <button type="button" className="btn-secondary" disabled={busy || !game?.canUndo}
                onClick={() => void undo()} title="Undo the last player move and computer reply">↶ Undo</button>
            </div>
            {game?.aiTurn && !busy && <button type="button" className="retry-button" onClick={() => {
              setBusy(true); setError(null);
              void replyFromEngine(game).catch(caught => setError(caught instanceof Error ? caught.message : 'AI move failed.'))
                .finally(() => setBusy(false));
            }}>Retry engine move</button>}
            {game?.canClaimThreefold && <button type="button" className="retry-button" disabled={busy} onClick={() => void claim('THREEFOLD_REPETITION')}>Claim draw by repetition</button>}
            {game?.canClaimFifty && <button type="button" className="retry-button" disabled={busy} onClick={() => void claim('FIFTY_MOVE_RULE')}>Claim draw by 50-move rule</button>}
          </section>

          <section className="panel setup-panel">
            <div className="panel-heading"><span>YOUR NEXT MATCH</span><span className="panel-index">01 / CONFIGURE</span></div>
            <h2>Game settings</h2>
            <label className="control-caption">PLAY AS</label>
            <div className="choice-grid">
              <button type="button" className={`choice ${playAsWhite ? 'active' : ''}`} onClick={() => setPlayAsWhite(true)} aria-pressed={playAsWhite}>
                <span className="color-chip white-chip" /> White
              </button>
              <button type="button" className={`choice ${!playAsWhite ? 'active' : ''}`} onClick={() => setPlayAsWhite(false)} aria-pressed={!playAsWhite}>
                <span className="color-chip black-chip" /> Black
              </button>
            </div>
            <label className="control-caption">ENGINE DIFFICULTY</label>
            <div className="difficulty-choices">
              {levelNames.map((level, index) => <button type="button" key={level} className={difficulty === index + 1 ? 'active' : ''}
                aria-pressed={difficulty === index + 1} onClick={() => setDifficulty(index + 1)}>{level}</button>)}
            </div>
            <p className="setting-note">Changes apply when you start a new match. Higher levels search more moves.</p>
          </section>

          <section className="panel moves-panel">
            <div className="panel-heading"><span>MOVE RECORD</span><span className="move-count">{game?.moveHistory.length ?? 0} MOVES</span></div>
            <div className="move-table-head"><span>TURN</span><span>WHITE</span><span>BLACK</span></div>
            <div className="move-list">
              {movePairs.length ? movePairs.map(pair => <div className="move-pair" key={pair.number}>
                <span className="move-number">{String(pair.number).padStart(2, '0')}</span>
                <span>{pair.white ? moveNotation(pair.white) : '—'}</span>
                <span>{pair.black ? moveNotation(pair.black) : '—'}</span>
              </div>) : <div className="no-moves">The board is set. Your story starts with move one.</div>}
              <div ref={historyEnd} />
            </div>
          </section>

          <section className="engine-info">
            <div><span className="info-icon">⌁</span><strong>Under the hood</strong></div>
            <p>Java 25 engine · minimax / negamax · alpha-beta pruning · transposition tables · quiescence search</p>
            {game?.aiStats && <div className="engine-stats"><span>LAST SEARCH</span><strong>{game.aiStats.nodesVisited.toLocaleString()} nodes</strong><span>DEPTH</span><strong>{game.aiStats.depth} ply</strong></div>}
          </section>
        </aside>
      </div>
    </main>
    <footer className="site-footer"><span>OPENFILE CHESS ENGINE</span><span>BUILT WITH JAVA + REACT</span><span>EVERY MOVE COUNTS.</span></footer>
  </div>;
}
