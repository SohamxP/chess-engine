import type { ReactNode } from 'react';
import { PlayerStrip } from './PlayerStrip';
import type { PgnSource } from './archive';
import { frameAtPly, resultScore, type GameState } from './chess';
import { analysisSummary, buildReviewedMoves, formatEvaluation, numericEvaluation, uciToSan, type PositionEvaluation } from './review';
import { REVIEW_DEPTH, REVIEW_CONFIRM_DEPTH, type AnalysisProgress } from './analysis';

export interface ReviewState {
  gameId: string;
  positions: PositionEvaluation[];
  total: number;
  running: boolean;
  error: string | null;
  progress?: AnalysisProgress;
}

export function GameReviewPage({ game, board, ply, review, onSelect, onBack, onAnalyze, onStop, onDownload, onBuildPractice, source, isArchived = false }: {
  game: GameState;
  board: ReactNode;
  ply: number;
  review: ReviewState | null;
  onSelect: (ply: number) => void;
  onBack: () => void;
  onAnalyze: () => void;
  onStop: () => void;
  onDownload: () => void;
  onBuildPractice: () => void;
  source?: PgnSource;
  isArchived?: boolean;
}) {
  const count = game.moveHistory.length;
  const reviewed = review && review.gameId === game.id
    ? buildReviewedMoves(game.moveHistory, review.positions) : [];
  const selected = reviewed.find(item => item.move.ply === ply);
  const summary = analysisSummary(reviewed, game.humanWhite);
  const misses = reviewed.filter(item => item.move.white === game.humanWhite
    && ['Blunder', 'Mistake', 'Inaccuracy'].includes(item.grade));
  const beforeFen = selected ? frameAtPly(game, selected.move.ply - 1).fen : game.initialFen;
  const betterSan = selected?.betterMove ? uciToSan(beforeFen, selected.betterMove) : null;
  const positionDepth = review && ply > 0 && ply < review.positions.length
    ? Math.min(review.positions[ply - 1]?.depth ?? 0, review.positions[ply]?.depth ?? 0)
    : review?.positions[0]?.depth ?? REVIEW_DEPTH;
  // The PGN may begin at move 12 with Black to move. Use the FEN's fullmove
  // counter instead of assuming every game begins at White's first move.
  const fullMoveAt = (movePly: number): number => {
    const before = frameAtPly(game, movePly - 1).fen;
    const number = Number(before.split(' ')[5]);
    return Number.isInteger(number) && number > 0 ? number : Math.ceil(movePly / 2);
  };

  const points = review?.positions.map((value, index) => {
    const score = numericEvaluation(value);
    if (score === null) return null;
    return { x: 8 + 304 * index / Math.max(1, review.total - 1),
      y: 50 - Math.atan(score / 260) * 27 };
  }).filter((point): point is { x: number; y: number } => point !== null) ?? [];
  const graph = points.map((p, i) =>
    (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');

  const rows: { num: number; white?: (typeof game.moveHistory)[number]; black?: (typeof game.moveHistory)[number] }[] = [];
  for (const move of game.moveHistory) {
    const num = fullMoveAt(move.ply);
    let row = rows.find(item => item.num === num);
    if (!row) { row = { num }; rows.push(row); }
    if (move.white) row.white = move;
    else row.black = move;
  }

  return (
    <main className="main-content review-content">
      <header className="review-page-heading">
        <div>
          <button className="review-back" type="button" onClick={onBack}>← Back to game</button>
          <h1>Game Review</h1>
          <p>Walk through your game, understand each move, and find opportunities to improve.</p>
        </div>
        <div className="review-heading-actions">
          <button className="btn-secondary" type="button" onClick={onDownload}>Download PGN</button>
          <div className="review-result">
            <span>{source ? source.white + ' vs. ' + source.black : 'Human vs. computer'}</span>
              <strong>{resultScore(game) ?? (source ? 'Result unknown' : 'In progress')}</strong>
          </div>
        </div>
      </header>
      {isArchived && (
        <div className="archive-review-note" role="note">
          {source
            ? 'Imported PGN — read-only, saved on this device. Replay, analyze, and turn your decisions into practice.'
            : 'This is a saved snapshot on this device. You can replay or analyze it, but cannot resume the original server game after its session expires.'}
        </div>
      )}
      <div className="review-layout">
        <section className="review-board-column" aria-label="Review board">
          <PlayerStrip game={game} player="computer" ply={ply}
            label={source ? (game.humanWhite ? source.black : source.white) : undefined} />
          {board}
          <PlayerStrip game={game} player="human" ply={ply}
            label={source ? (game.humanWhite ? source.white : source.black) : undefined} />
          <nav className="review-playback" aria-label="Move review controls">
            <button type="button" aria-label="First position"
              disabled={ply === 0} onClick={() => onSelect(0)}>⟪</button>
            <button type="button" aria-label="Previous move"
              disabled={ply === 0} onClick={() => onSelect(ply - 1)}>←</button>
            <span aria-live="polite">{ply === 0 ? 'Starting position' : 'Move ' + ply + ' of ' + count}</span>
            <button type="button" aria-label="Next move"
              disabled={ply >= count} onClick={() => onSelect(ply + 1)}>→</button>
            <button type="button" aria-label="Last position"
              disabled={ply >= count} onClick={() => onSelect(count)}>⟫</button>
          </nav>
          <p className="review-board-hint">Select a move in the notation list, or use ← → on your keyboard.</p>
        </section>
        <aside className="review-sidebar" aria-label="Review details">
          <section className="panel review-insight-card" aria-label="Selected move analysis">
            <div className="panel-heading"><h2>Move feedback</h2>
              <span className="review-engine">Depth {positionDepth}</span></div>
            {ply === 0 ? (
              <div className="review-feedback-empty">
                <strong>Starting position</strong>
                <p>Choose a move from the notation list to inspect it.</p>
              </div>
            ) : (
              <div className="review-feedback">
                <div className="review-feedback-heading">
                  <strong>{fullMoveAt(ply)}{game.moveHistory[ply - 1].white ? '. ' : '… '}{game.moveHistory[ply - 1].san}</strong>
                  {selected && <span className={'review-grade grade-' + selected.grade.toLowerCase()}>{selected.grade}</span>}
                </div>
                {selected ? (
                  <>
                    <p>{selected.grade === 'Best' ? 'Matches the engine’s preferred move.'
                      : selected.grade === 'Good' ? 'No major error detected at this depth.'
                      : selected.grade === 'Unrated' ? (
                          selected.pendingVerification
                            ? 'Possible mistake detected at quick depth. Deeper verification is pending.'
                            : 'The engine did not provide comparable scores to classify this move reliably.'
                        )
                      : 'The engine found a potentially stronger alternative.'}</p>
                    {betterSan && <div className="review-better-move">Suggested: <strong>{betterSan}</strong></div>}
                    {selected.lossCp !== null && selected.grade !== 'Best' && (
                      <p>Estimated loss: {(selected.lossCp / 100).toFixed(2)} pawns.</p>
                    )}
                    {selected.grade === 'Blunder' && selected.lossCp === null && (
                      <p>The forced-mate outcome changed. No pawn-equivalent loss is claimed.</p>
                    )}
                    {selected.grade !== 'Unrated' && positionDepth < REVIEW_CONFIRM_DEPTH && (
                      <p className="review-description">Quick-depth assessment; finer errors may be missed.</p>
                    )}
                  </>
                ) : <p>Analyze your game to see an evaluation of this move.</p>}
              </div>
            )}
          </section>

          <section className="panel review-analysis-card" aria-label="Engine evaluation">
            <div className="panel-heading"><h2>Evaluation</h2><span className="review-engine">Stockfish Lite · Local</span></div>
            <div className="review-actions">
              {!review ? (
                <button type="button" className="btn-primary" disabled={!count} onClick={onAnalyze}>Analyze game</button>
              ) : review.running ? (
                <button type="button" className="btn-secondary" onClick={onStop}>Stop analysis</button>
              ) : (
                <button type="button" className="btn-secondary" disabled={!count} onClick={onAnalyze}>
                  {review.error ? 'Resume analysis'
                    : (review.progress?.pending ?? 0) > 0 ? 'Continue verification' : 'Analyze again (cached)'}
                </button>
              )}
            </div>
            {!count && <p className="review-description">Play some moves before analyzing.</p>}
            {review && (
              <>
                <p className="review-progress" role="status">
                  {review.running
                    ? review.progress?.phase === 'verify'
                      ? 'Verifying ' + (review.progress?.verified ?? 0) + ' of ' +
                        (review.progress?.suspects ?? 0) + ' suspicious moves…'
                      : 'Analyzed ' + (review.progress?.scanned ?? review.positions.length) +
                        ' of ' + review.total + ' positions…'
                    : review.error ?? 'Analyzed ' + review.positions.length + ' positions.'}
                </p>
                {review.running && <progress className="review-progress-bar"
                  value={review.progress?.scanned ?? review.positions.length} max={review.total} />}
                {(review.progress?.cached ?? 0) > 0 && <p className="review-description">
                  Reused {review.progress?.cached} cached evaluations from this browser.
                </p>}
                {!review.running && (review.progress?.pending ?? 0) > 0 && (
                  <p className="review-description" role="note">
                    {review.progress?.pending} candidate moves still need deeper verification.
                    Select Continue verification to finish them in another device-friendly pass.
                    Unverified possible mistakes are not added to Decision Lab.
                  </p>
                )}
                {count > 120 && <p className="review-description">
                  Analyzing all {count} half-moves. Long games can take several passes to verify.
                </p>}
                {review.positions.length > 0 && (
                  <>
                    <div className="review-chart" aria-label="Evaluation graph">
                      <div className="review-chart-heading">
                        <span>Evaluation over time</span><strong>{formatEvaluation(review.positions[ply])}</strong>
                      </div>
                      <svg viewBox="0 0 320 100" role="img" width="100%" aria-label="Evaluation graph; higher favors White, lower favors Black">
                        <line x1="8" x2="312" y1="50" y2="50" stroke="#cbd3c8" strokeDasharray="3 4" />
                        <path d={graph} stroke="#476b50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        {ply < review.positions.length && (
                          <line x1={8 + 304 * ply / Math.max(1, review.total - 1)}
                            x2={8 + 304 * ply / Math.max(1, review.total - 1)}
                            y1="4" y2="96" stroke="#738378" strokeDasharray="3 3" />
                        )}
                      </svg>
                      <div className="review-chart-legend"><span>Black advantage ↓</span><span>White advantage ↑</span></div>
                    </div>
                    <div className="review-summary" aria-label="Your move classifications">
                      <div><strong>{summary.blunders}</strong><span>Blunders</span></div>
                      <div><strong>{summary.mistakes}</strong><span>Mistakes</span></div>
                      <div><strong>{summary.inaccuracies}</strong><span>Inaccuracies</span></div>
                    </div>
                  </>
                )}
              </>
            )}
            <p className="review-license">
              Initial depth {REVIEW_DEPTH}; potential errors rechecked at depth {REVIEW_CONFIRM_DEPTH}.
              Only confirmed classifications can become practice cards. Scores remain approximate,
              and repeated analysis reuses a bounded local cache. Engine:
              {' '}<a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">Stockfish.js</a> (GPLv3), running on your device.
            </p>
          </section>

          <section className="panel review-notation-card" aria-label="Review notation">
            <div className="panel-heading"><h2>Moves</h2><span className="move-count">{count} MOVES</span></div>
            <div className="move-table-head"><span>Move</span><span>White</span><span>Black</span></div>
            <div className="move-list review-notation-list" aria-label="Review move history">
              {rows.length ? rows.map(row => (
                <div key={row.num} className="move-pair">
                  <span className="move-number">{row.num}.</span>
                  {(['white', 'black'] as const).map(side => {
                    const move = row[side];
                    if (!move) return <span key={side}>—</span>;
                    const grade = reviewed.find(item => item.move.ply === move.ply)?.grade;
                    return <button key={side} type="button" aria-label={'View position after move ' + move.ply + ': ' + move.san}
                      aria-pressed={ply === move.ply}
                      className={'move-entry ' + (ply === move.ply ? 'review-selected ' : '')
                        + (grade ? 'notation-' + grade.toLowerCase() : '')}
                      onClick={() => onSelect(move.ply)}>{move.san}</button>;
                  })}
                </div>
              )) : <p className="no-moves">Moves will appear here after a game.</p>}
            </div>
          </section>

          {review && !review.running && misses.length > 0 && (
            <section className="panel review-practice" aria-label="Decision Lab">
              <div className="panel-heading"><h2>Turn mistakes into practice</h2></div>
              <p className="review-description">Revisit your own decisions without seeing the best move first. Compare alternatives and return later using a spaced review schedule.</p>
              <button type="button" className="btn-primary" onClick={onBuildPractice}>
                Add {misses.length} decision{misses.length === 1 ? '' : 's'} to Decision Lab
              </button>
              <p className="review-license">Existing training cards keep their progress; repeated imports are ignored.</p>
            </section>
          )}

          {review && reviewed.length > 0 && (
            <section className="panel review-mistakes" aria-label="Moves to revisit">
              <div className="panel-heading"><h2>Moves to revisit</h2></div>
              {misses.length ? <div className="review-flagged-list">
                {misses.slice(0, 15).map(item => (
                  <button type="button" key={item.move.ply} className={ply === item.move.ply ? 'active' : ''}
                    onClick={() => onSelect(item.move.ply)}>
                    {fullMoveAt(item.move.ply)}{item.move.white ? '. ' : '… '}{item.move.san}
                    <span>{item.grade}</span>
                  </button>
                ))}
              </div> : <p className="review-description">No significant errors in the analyzed moves so far.</p>}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
