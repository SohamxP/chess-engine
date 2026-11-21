import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { analyzePositions, REVIEW_DEPTH } from './analysis';
import { glyphs, isLightSquare, parseFen, squareOrder } from './chess';
import { duePracticeCards, recurringThemeCounts, trainingProgress, type PracticeCard } from './practice';
import { PATTERN_CATALOG, type PatternKind } from './mistakePatterns';
import { gradeMove, uciToSan } from './review';

interface Attempt {
  fen: string;
  san: string;
  uci: string;
  grade: string;
  lossCp: number | null;
  originalLossCp: number | null;
  bestSan: string | null;
  success: boolean | null;
  saved: boolean;
  tracked: boolean;
  previousPlan: string;
  objectiveMate: boolean;
}

const pieceName: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

function decisionLabel(card: PracticeCard): string {
  const moveNumber = Number(card.fen.split(' ')[5]);
  return (Number.isInteger(moveNumber) && moveNumber > 0 ? moveNumber : Math.ceil(card.ply / 2)) +
    (card.white ? '.' : '…');
}

function dueLabel(iso: string): string {
  const next = new Date(iso);
  return Number.isNaN(next.getTime()) ? 'Unknown' :
    next.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function DecisionLabPage({ cards, onRecord, onDelete, onBack, error, analyzedGameCounts }: {
  cards: PracticeCard[];
  onRecord: (id: string, success: boolean, plan: string) => boolean;
  onDelete: (id: string) => void;
  onBack: () => void;
  error: string | null;
  analyzedGameCounts?: Map<PatternKind, number>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<{ from: string; to: string; promotion: string }[]>([]);
  const [plan, setPlan] = useState('');
  const [attemptFen, setAttemptFen] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [checking, setChecking] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const due = duePracticeCards(cards, new Date(), analyzedGameCounts);
  const insights = useMemo(() => trainingProgress(cards), [cards]);
  const recurring = useMemo(() => recurringThemeCounts(cards, analyzedGameCounts),
    [cards, analyzedGameCounts]);
  const card = activeId === null ? due[0] : cards.find(item => item.id === activeId);
  const nextDue = due.find(item => item.id !== card?.id);
  const chess = useMemo(() => card ? new Chess(card.fen) : null, [card?.fen]);
  const legalMoves = useMemo(() => chess?.moves({ verbose: true }) ?? [], [chess]);
  const options = legalMoves.filter(move => move.from === selected);
  const targets = new Set<string>(options.map(move => move.to));
  const pieces = useMemo(() => card ? parseFen(attemptFen ?? card.fen) : {}, [card?.fen, attemptFen]);
  const squares = squareOrder(card?.white ?? true);

  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    setSelected(null);
    setPromotions([]);
    setPlan('');
    setAttemptFen(null);
    setAttempt(null);
    setChecking(false);
    setWorkError(null);
    setConfirmRemove(null);
  }, [card?.id]);

  useEffect(() => () => controller.current?.abort(), []);

  async function submitMove(from: string, to: string, promotion?: string) {
    if (!card || checking || attempt || attemptFen) return;
    const position = new Chess(card.fen);
    let move;
    try {
      move = position.move({ from, to, ...(promotion ? { promotion } : {}) });
      if (!move) return;
    } catch {
      setWorkError('That move is not legal from this position.');
      return;
    }
    const uci = from + to + (promotion ?? '');
    setActiveId(card.id); // Keep the result visible after the card is rescheduled.
    setSelected(null);
    setPromotions([]);
    setAttemptFen(position.fen());
    setChecking(true);
    setWorkError(null);

    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    try {
      const original = new Chess(card.fen);
      original.move({
        from: card.originalUci.slice(0, 2),
        to: card.originalUci.slice(2, 4),
        ...(card.originalUci.length === 5 ? { promotion: card.originalUci[4] } : {}),
      });
      // Mate-in-one is a board-level fact. Do not require noisy mate/cp
      // Stockfish comparisons to mark a successfully solved mate exercise.
      if (card.patterns?.includes('missed-mate-one')) {
        const winningMove = new Chess(card.fen).moves({ verbose: true }).find(candidate => {
          const probe = new Chess(card.fen);
          probe.move(candidate);
          return probe.isCheckmate();
        });
        if (winningMove) {
          const success = position.isCheckmate();
          const tracked = Date.parse(card.dueAt) <= Date.now();
          const saved = tracked ? onRecord(card.id, success, plan) : false;
          setAttempt({
            fen: position.fen(), san: move.san, uci, grade: success ? 'Best' : 'Mistake',
            lossCp: null, originalLossCp: null, bestSan: winningMove.san,
            success, saved, tracked, previousPlan: card.lastPlan, objectiveMate: true,
          });
          return;
        }
      }
      // Evaluate all three positions at identical settings in one local worker.
      const [before, candidate, previous] = await analyzePositions(
        [card.fen, position.fen(), original.fen()], abort.signal,
      );
      if (abort.signal.aborted) return;
      const played = gradeMove(before, candidate, { white: card.white, uci });
      const old = gradeMove(before, previous, { white: card.white, uci: card.originalUci });
      // A verified forced-mate outcome is meaningful without a fabricated
      // centipawn loss. It can still be practiced and scheduled.
      const reliable = played.grade !== 'Unrated' &&
        (played.lossCp !== null || (before.mate !== null && candidate.mate !== null));
      const success = reliable
        ? (before.bestMove?.toLowerCase() === uci.toLowerCase() ||
          (played.lossCp !== null ? played.lossCp <= 60 : played.grade !== 'Blunder'))
        : null;
      // Rehearsals ahead of schedule are useful, but must not inflate recall streaks.
      const tracked = Date.parse(card.dueAt) <= Date.now();
      const saved = success === null || !tracked ? false : onRecord(card.id, success, plan);
      setAttempt({
        fen: position.fen(), san: move.san, uci,
        grade: played.grade, lossCp: played.lossCp,
        originalLossCp: old.lossCp,
        bestSan: before.bestMove ? uciToSan(card.fen, before.bestMove) : null,
        success, saved, tracked, previousPlan: card.lastPlan, objectiveMate: false,
      });
    } catch (caught) {
      if (!abort.signal.aborted) {
        setWorkError(caught instanceof Error ? caught.message : 'Local analysis failed.');
      }
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setChecking(false);
      }
    }
  }

  function chooseSquare(square: string) {
    if (!card || !chess || attemptFen || checking || promotions.length) return;
    const piece = chess.get(square as Parameters<Chess['get']>[0]);
    if (piece && piece.color === chess.turn()) {
      setSelected(selected === square ? null : square);
      return;
    }
    const choices = options.filter(move => move.to === square);
    if (choices.length === 0) { setSelected(null); return; }
    if (choices.some(move => move.promotion)) {
      setPromotions(choices.filter(move => move.promotion)
        .map(move => ({ from: move.from, to: move.to, promotion: move.promotion! })));
    } else {
      void submitMove(choices[0].from, choices[0].to);
    }
  }

  function focusCard(id: string) {
    if (card?.id === id) {
      controller.current?.abort();
      controller.current = null;
      setSelected(null);
      setPromotions([]);
      setPlan('');
      setAttemptFen(null);
      setAttempt(null);
      setChecking(false);
      setWorkError(null);
    }
    setActiveId(id);
  }

  function goToNext() {
    setActiveId(nextDue?.id ?? '');
  }

  return (
    <main className="main-content decision-lab-page">
      <header className="review-page-heading">
        <div>
          <button className="review-back" type="button" onClick={onBack}>← Back to game</button>
          <h1>Decision Lab</h1>
          <p>Study decisions from your own games. Think first, test your move, then revisit it later.</p>
        </div>
        <div className="lab-stats" aria-label="Practice progress">
          <div><strong>{due.length}</strong><span>Due now</span></div>
          <div><strong>{cards.length}</strong><span>Saved decisions</span></div>
          <div><strong>{cards.filter(item => item.streak >= 3).length}</strong><span>3+ recalls</span></div>
        </div>
      </header>
      {error && <div role="alert" className="error-message">{error}</div>}
      <div className="archive-notice">
        <strong>A private training notebook, not an engine guessing contest</strong>
        <p>The best move stays hidden until you commit to a legal move. Comparing moves runs Stockfish locally at depth {REVIEW_DEPTH}; scores are estimates, not definitive judgments. Practice notes and review dates stay in this browser.</p>
      </div>
      <section className="panel lab-dashboard" aria-label="Training dashboard">
        <div className="panel-heading"><h2>Training progress</h2>
          <span className="lab-eyebrow">Recorded practice, not chess rating</span></div>
        <div className="lab-progress-stats">
          <div><strong>{insights.totalAttempts}</strong><span>Recorded attempts</span></div>
          <div><strong>{insights.last30Days}</strong><span>Last 30 days</span></div>
          <div><strong>{insights.last30Days
            ? Math.round(insights.correctLast30Days / insights.last30Days * 100) + '%'
            : '—'}</strong>
            <span>Last 30 days success · {insights.correctLast30Days}/{insights.last30Days}</span></div>
          <div><strong>{insights.practicedPositions}</strong><span>Positions practiced since update</span></div>
        </div>
        <div className="lab-pattern-progress">
          <h3>Practice by detected pattern</h3>
          {insights.themes.filter(theme => theme.cards > 0 || theme.attempts > 0).length === 0 ? (
            <p className="review-description">No verified tactical patterns are attached yet.
              Analyze your saved games and open My Patterns to see which classifications are supported.</p>
          ) : (
            insights.themes.filter(theme => theme.cards > 0 || theme.attempts > 0).map(theme => (
              <div className="lab-pattern-row" key={theme.kind}>
                <div>
                  <strong>{PATTERN_CATALOG[theme.kind].title}</strong>
                  <span>{theme.cards} positions · {theme.games} games</span>
                </div>
                <div>
                  <strong>{theme.attempts
                    ? Math.round(theme.successes / theme.attempts * 100) + '%'
                    : '—'}</strong>
                  <span>{theme.successes}/{theme.attempts} recorded successes</span>
                </div>
              </div>
            ))
          )}
        </div>
        <p className="review-description">Only due, reliably scored attempts completed since this
          update appear in these figures. Older total attempts and streaks are preserved, but their
          historical outcomes cannot be reconstructed. This measures exercise performance,
          not improvement in actual game results.</p>
      </section>
      {!card ? (
        <section className="panel lab-empty">
          <h2>{cards.length ? 'You are caught up.' : 'Your practice deck is empty.'}</h2>
          <p>{cards.length
            ? 'No decisions are due. You can revisit any saved position below, or come back when another review is due.'
            : 'Play a game, open Game Review, analyze it, and add the mistakes you want to revisit.'}</p>
          <button type="button" className="btn-primary" onClick={onBack}>Back to game</button>
        </section>
      ) : (
        <div className="lab-layout">
          <section className="lab-board-column" aria-label="Practice position">
            <div className="lab-situation">
              <span className="lab-eyebrow">Decision · Move {decisionLabel(card)}</span>
              <strong>{card.white ? 'White' : 'Black'} to move</strong>
              <span>What would you play differently?</span>
              {(card.patterns?.length ?? 0) > 0 && <div className="lab-tags">
                {card.patterns?.map(kind => <span key={kind}>{PATTERN_CATALOG[kind].title}</span>)}
              </div>}
              {(card.patterns ?? []).some(kind => (recurring.get(kind) ?? 0) >= 2) &&
                <small className="lab-priority-note">Priority practice: this theme appears in multiple saved games.</small>}
            </div>
            <div className="board-frame">
              <div className="board" role="group" aria-label="Decision Lab chess board" data-testid="decision-lab-board">
                {squares.map((square, index) => {
                  const piece = pieces[square];
                  const target = !attemptFen && targets.has(square);
                  return (
                    <button key={square} type="button" data-square={square}
                      className={['square', isLightSquare(square) ? 'light' : 'dark',
                        selected === square ? 'selected' : ''].filter(Boolean).join(' ')}
                      disabled={Boolean(attemptFen || checking || promotions.length)}
                      aria-pressed={selected === square}
                      aria-label={square + (piece ?
                        ' ' + (piece === piece.toUpperCase() ? 'white ' : 'black ') + pieceName[piece.toLowerCase()] :
                        ' empty') + (target ? ', legal destination' : '')}
                      onClick={() => chooseSquare(square)}>
                      {index % 8 === 0 && <span className="rank-label">{square[1]}</span>}
                      {piece && <span aria-hidden="true"
                        className={'piece ' + (piece === piece.toUpperCase() ? 'white-piece' : 'black-piece')}>
                        {glyphs[piece]}
                      </span>}
                      {target && <span aria-hidden="true" className={piece ? 'capture-ring' : 'destination-dot'} />}
                      {index >= 56 && <span className="file-label">{square[0]}</span>}
                    </button>
                  );
                })}
              </div>
              {promotions.length > 0 && (
                <div className="promotion-cover" role="dialog" aria-modal="true" aria-label="Choose promotion piece">
                  <div className="promotion-card">
                    <h2>Promote pawn</h2>
                    <div className="promotion-options">
                      {['q', 'r', 'b', 'n'].map(piece => {
                        const selectedMove = promotions.find(choice => choice.promotion === piece);
                        return <button type="button" key={piece} disabled={!selectedMove}
                          aria-label={'Promote to ' + piece}
                          onClick={() => { if (selectedMove) void submitMove(selectedMove.from, selectedMove.to, piece); }}>
                          {glyphs[card.white ? piece.toUpperCase() : piece]}
                        </button>;
                      })}
                    </div>
                    <button type="button" className="link-button" onClick={() => setPromotions([])}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <p className="board-footnote">Select a piece and a highlighted square. Your move cannot alter the original game.</p>
          </section>
          <aside className="lab-sidebar">
            <section className="panel">
              <div className="panel-heading"><h2>Before the engine</h2><span className="lab-eyebrow">Step 1</span></div>
              <label htmlFor="lab-plan" className="lab-label">What is your plan in this position?</label>
              <textarea id="lab-plan" rows={3} maxLength={500} value={plan}
                disabled={Boolean(attemptFen)} onChange={event => setPlan(event.target.value)}
                placeholder="For example: improve my worst piece, attack a pinned defender…" />
              <p className="review-description">Write a reason, not just a move. Optional, but useful when you revisit the position.</p>
              {checking && <p className="lab-thinking" role="status">Comparing your move and the original with local Stockfish…</p>}
              {workError && <div className="error-message" role="alert">{workError}</div>}
              {workError && attemptFen && !checking && !attempt && (
                <button type="button" className="btn-secondary" onClick={() => {
                  setAttemptFen(null);
                  setSelected(null);
                  setWorkError(null);
                }}>Reset position and try again</button>
              )}
              {!attemptFen && <p className="lab-prompt">Now make your move on the board. Engine hints are hidden.</p>}
            </section>
            {attempt && (
              <section className="panel lab-result" aria-label="Decision feedback">
                <div className="panel-heading"><h2>Your decision</h2><span className="lab-eyebrow">Step 2</span></div>
                <div className="lab-verdict">
                  <strong>{attempt.san}</strong>
                  <span>{attempt.success === null ? 'Not rated'
                    : attempt.objectiveMate
                      ? attempt.success ? 'Checkmate found' : 'Mate in one missed'
                      : attempt.success ? 'Solid alternative at this depth' : 'Worth revisiting'}</span>
                </div>
                <div className="lab-comparison">
                  <div><span>Your new move</span><strong>{attempt.lossCp === null ? '—' : (attempt.lossCp / 100).toFixed(2) + ' pawns lost'}</strong></div>
                  <div><span>Your original move ({card.originalSan})</span><strong>{attempt.originalLossCp === null ? '—' : (attempt.originalLossCp / 100).toFixed(2) + ' pawns lost'}</strong></div>
                  <div><span>{attempt.objectiveMate ? 'Legal checkmate' : 'Engine suggestion'}</span>
                    <strong>{attempt.bestSan ?? 'Unavailable'}</strong></div>
                </div>
                <div className="lab-reflection">
                  <strong>Compare your reasoning</strong>
                  <p>This attempt: {plan.trim() || 'No written plan.'}</p>
                  {attempt.previousPlan && <p>Last time: {attempt.previousPlan}</p>}
                </div>
                {attempt.uci === card.originalUci && <p>You repeated the move you originally played. Try identifying a different idea when this position returns.</p>}
                {attempt.objectiveMate && <p>This mate-in-one attempt was checked from legal
                  board moves. No approximate engine score was needed.</p>}
                {attempt.success === null
                  ? <p>Analysis could not score this reliably, so the practice schedule was not changed.</p>
                  : <p>{attempt.objectiveMate
                    ? attempt.success
                      ? 'You found a legal checkmate. It will return according to your recall streak and this theme\'s recurrence.'
                      : 'You missed the immediate checkmate. This position will return tomorrow.'
                    : attempt.success
                      ? 'You found a move close to the engine recommendation. The next review depends on your recall streak and whether this verified theme recurs across games.'
                      : 'The engine sees a stronger continuation. This decision returns tomorrow; repeated misses also increase its practice priority.'}</p>}
                {attempt.success !== null && !attempt.tracked &&
                  <p>This was early practice. It did not change your recall streak or review date.</p>}
                {attempt.success !== null && attempt.tracked && !attempt.saved &&
                  <div className="error-message" role="alert">The result could not be saved in this browser.</div>}
                {attempt.success !== null && (attempt.saved || !attempt.tracked) &&
                  <p className="lab-due-note">Next review: {dueLabel(cards.find(item => item.id === card.id)?.dueAt ?? card.dueAt)}</p>}
                <button type="button" className="btn-primary" onClick={goToNext}>
                  {nextDue ? 'Next due decision' : 'Finish session'}
                </button>
              </section>
            )}
          </aside>
        </div>
      )}
      {cards.length > 0 && (
        <section className="panel lab-library" aria-label="Your decision library">
          <div className="panel-heading"><h2>Decision library</h2><span>{cards.length} saved</span></div>
          <p className="review-description">Review a position ahead of schedule, or remove one you no longer want to practice.</p>
          <div className="lab-library-list">
            {cards.slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map(item => (
              <div className="lab-library-row" key={item.id}>
                <div>
                  <strong>Move {decisionLabel(item)} · {item.white ? 'White' : 'Black'}</strong>
                  <span>{Date.parse(item.dueAt) <= Date.now() ? 'Due now' : 'Due ' + dueLabel(item.dueAt)} · {item.attempts} attempts · {item.streak} recalls</span>
                  {(item.patterns?.length ?? 0) > 0 && <span className="lab-library-patterns">
                    {item.patterns?.map(kind => PATTERN_CATALOG[kind].title).join(' · ')}
                  </span>}
                </div>
                <div className="lab-library-actions">
                  <button type="button" className="btn-secondary" onClick={() => focusCard(item.id)}>Practice</button>
                  {confirmRemove === item.id ? (
                    <>
                      <button type="button" className="archive-confirm-delete" onClick={() => {
                        if (activeId === item.id) setActiveId('');
                        onDelete(item.id);
                        setConfirmRemove(null);
                      }}>Confirm remove</button>
                      <button type="button" className="archive-remove" onClick={() => setConfirmRemove(null)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className="archive-remove" onClick={() => setConfirmRemove(item.id)}>Remove</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
