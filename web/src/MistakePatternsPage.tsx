import { useEffect, useState } from 'react';
import type { ArchivedGame } from './archive';
import { loadPatternReport, PATTERN_CATALOG, type PatternKind,
  type PatternReport } from './mistakePatterns';

export function MistakePatternsPage({ games, onReview, onGames, onLab, onBack }: {
  games: ArchivedGame[];
  onReview: (gameId: string, ply: number) => void;
  onGames: () => void;
  onLab: () => void;
  onBack: () => void;
}) {
  const [report, setReport] = useState<PatternReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<PatternKind[]>([]);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setFailure(null);
    setReport(null);
    void loadPatternReport(games, abort.signal, current => {
      if (!abort.signal.aborted) setReport(current);
    }).then(result => {
      if (!abort.signal.aborted) setReport(result);
    }).catch(error => {
      if (!abort.signal.aborted) {
        setFailure(error instanceof Error ? error.message : 'Could not read saved analysis.');
      }
    }).finally(() => {
      if (!abort.signal.aborted) setLoading(false);
    });
    return () => abort.abort();
  }, [games]);

  const findings = report?.groups.filter(group => group.occurrences > 0) ?? [];
  const allComplete = report?.processedGames === games.length;

  return (
    <main className="main-content insights-page">
      <header className="review-page-heading insights-heading">
        <div>
          <button type="button" className="review-back" onClick={onBack}>← Back to game</button>
          <h1>Personal Mistake Patterns</h1>
          <p>Evidence from your saved games, not guesses from an evaluation bar.</p>
        </div>
        <div className="insights-actions">
          <button type="button" className="btn-secondary" onClick={onGames}>My Games</button>
          <button type="button" className="btn-secondary" onClick={onLab}>Decision Lab</button>
        </div>
      </header>

      <section className="panel insights-coverage" aria-label="Pattern analysis coverage">
        <div className="insights-section-heading">
          <div>
            <h2>Analysis coverage</h2>
            <p>Only positions already evaluated in this browser are considered. Opening this page never runs Stockfish automatically.</p>
          </div>
          {loading && <span className="insights-working" role="status">
            Checking {report?.processedGames ?? 0} / {games.length} saved games…
          </span>}
        </div>
        {failure && <p role="alert" className="error-message">{failure}</p>}
        <div className="insights-stats">
          <div><strong>{report?.fullyScannedGames ?? 0} / {games.length}</strong><span>Games fully scanned</span></div>
          <div><strong>{report?.gradedDecisions ?? 0}</strong><span>Moves with usable scores</span></div>
          <div><strong>{report?.confirmedErrors ?? 0}</strong><span>Classified inaccuracies or worse</span></div>
          <div><strong>{report?.unverifiedDecisions ?? 0}</strong><span>Decisions awaiting deeper analysis</span></div>
        </div>
        {games.length > 0 && <progress className="insights-coverage-progress"
          value={report?.processedGames ?? 0} max={games.length}
          aria-label="Games checked for pattern evidence" />}
        <p className="insights-note">
          A game may contain incomplete analysis. Counts reflect only cached results;
          partial verification can hide genuine patterns. These are evidence-based themes,
          not a claim about your overall chess ability.
        </p>
      </section>

      {games.length === 0 ? (
        <section className="panel insights-empty">
          <h2>Start with a game</h2>
          <p>Import a PGN from Chess.com or Lichess, or play a game here, to begin finding patterns.</p>
          <button type="button" className="btn-primary" onClick={onGames}>Open My Games</button>
        </section>
      ) : !loading && allComplete && findings.length === 0 ? (
        <section className="panel insights-empty">
          <h2>No supported patterns found yet</h2>
          <p>{report?.fullyScannedGames === 0
            ? 'There are no fully analyzed games yet. Open My Games, select Review, and run Analyze game.'
            : 'Your cached analysis does not contain enough verified, board-supported evidence for these specific patterns. This does not mean you made no mistakes.'}</p>
          <button type="button" className="btn-primary" onClick={onGames}>Review saved games</button>
        </section>
      ) : null}

      {findings.length > 0 && <div className="insights-catalog">
        {findings.map(group => {
          const theme = PATTERN_CATALOG[group.kind];
          const showAll = expanded.includes(group.kind);
          const visible = showAll ? group.evidence : group.evidence.slice(0, 5);
          return (
            <section key={group.kind} className="panel insights-pattern" aria-label={theme.title}>
              <div className="insights-pattern-heading">
                <div>
                  <h2>{theme.title}</h2>
                  <p>{theme.description}</p>
                </div>
                <div className="insights-pattern-count">
                  <strong>{group.occurrences}</strong>
                  <span>{group.games} distinct game{group.games === 1 ? '' : 's'}</span>
                </div>
              </div>
              <p className="insights-practice">
                <strong>{group.games >= 2 ? 'Recurring pattern' : 'Evidence from one game'}.</strong>
                {' '}{theme.practice}
              </p>
              <div className="insights-evidence-list">
                {visible.map(event => (
                  <article className="insights-evidence" key={event.id}>
                    <div className="insights-evidence-details">
                      <strong>{event.number} {event.moveSan}</strong>
                      <span>{event.gameTitle}</span>
                      <p>{event.explanation}</p>
                      <small>Suggested: {event.betterSan ?? 'See review'}
                        {event.lossCp !== null
                          ? ' · Verified eval loss: ' + (event.lossCp / 100).toFixed(2) + ' pawns'
                          : ' · Checkmate verified by legal moves'}
                      </small>
                    </div>
                    <button type="button" className="btn-secondary" onClick={() =>
                      onReview(event.gameId, event.ply)}>Review position</button>
                  </article>
                ))}
              </div>
              {group.evidence.length > 5 && <button type="button"
                className="btn-secondary insights-more" onClick={() => setExpanded(current =>
                  showAll ? current.filter(key => key !== group.kind) : [...current, group.kind])}>
                {showAll ? 'Show fewer' : 'Show all ' + group.occurrences + ' examples'}
              </button>}
            </section>
          );
        })}
      </div>}

      <section className="insights-method">
        <h2>How these patterns are determined</h2>
        <p>Missed mate in one is checked by playing the suggested legal move and verifying checkmate. Material patterns require a confirmed evaluation loss of at least 1.40 pawns, legal captures, and no immediate legal recapture. At most three narrow patterns are currently identified; other tactical or strategic mistakes remain unclassified.</p>
        <p>One decision can match more than one theme. Multiple examples from one game are not called a recurring pattern across games. No account, cloud upload, or paid analysis API is used.</p>
      </section>
    </main>
  );
}
