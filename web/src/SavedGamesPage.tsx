import { useState } from 'react';
import { downloadPgn, type ArchivedGame } from './archive';
import { resultScore, statusLabel } from './chess';
import { PgnImportPanel, type PgnImportCommit } from './PgnImportPanel';
import type { PgnSelection } from './pgnImport';

function ArchivedGameCard({ item, onReview, onDelete }: {
  item: ArchivedGame;
  onReview: (item: ArchivedGame) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { game } = item;
  const date = new Date(item.savedAt);
  const when = Number.isNaN(date.getTime()) ? 'Unknown date' :
    date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const score = resultScore(game);
  return (
    <article className="panel archive-game-card">
      <div className="archive-card-heading">
        <div>
          <span className="archive-date">{when}</span>
          <h2>{item.source
            ? item.source.white + ' vs. ' + item.source.black
            : 'You vs. Computer'}</h2>
        </div>
        <span className={'archive-status ' + (score ? 'archive-finished' : '')}>
          {score ?? 'Unfinished'}
        </span>
      </div>
      <p className="archive-result">{statusLabel(game)} · {item.source ? 'Reviewing' : 'Playing'} {game.humanWhite ? 'White' : 'Black'}</p>
      <p className="archive-moves">{game.moveHistory.length} half-moves · {item.source
        ? 'PGN import · ' + item.source.event + ' · ' + item.source.date
        : 'Level ' + game.depth}</p>
      <div className="archive-card-actions">
        <button className="btn-primary" type="button" onClick={() => onReview(item)}>Review</button>
        <button className="btn-secondary" type="button" onClick={() => downloadPgn(game, item.savedAt, item.source)}>
          Download PGN
        </button>
        {confirmDelete ? (
          <button className="archive-confirm-delete" type="button" onClick={() => onDelete(item.id)}>
            Confirm delete
          </button>
        ) : (
          <button className="archive-remove" type="button" onClick={() => setConfirmDelete(true)}>Remove</button>
        )}
        {confirmDelete && <button type="button" className="archive-remove"
          onClick={() => setConfirmDelete(false)}>Cancel</button>}
      </div>
    </article>
  );
}

export function SavedGamesPage({ games, onReview, onDelete, onBack, onImport, error }: {
  games: ArchivedGame[];
  onReview: (item: ArchivedGame) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  onImport: (choices: PgnSelection[]) => PgnImportCommit;
  error: string | null;
}) {
  return (
    <main className="main-content saved-games-page">
      <header className="review-page-heading">
        <div>
          <button type="button" className="review-back" onClick={onBack}>← Back to game</button>
          <h1>My Games</h1>
          <p>Review your games from PlyForge or import games played elsewhere.</p>
        </div>
        <span className="archive-total">{games.length} saved</span>
      </header>
      <div className="archive-notice">
        <strong>Saved on this device</strong>
        <p>Your move history stays in this browser when the Render server sleeps or restarts.
          Matches cannot be resumed from these snapshots, and they are not synced between devices.
          Clearing browser data or using private browsing may erase them. Download PGN for a backup.</p>
      </div>
      {error && <div role="alert" className="error-message">{error}</div>}
      <PgnImportPanel onImport={onImport} />
      {games.length ? (
        <div className="archive-grid">
          {games.map(item => (
            <ArchivedGameCard key={item.id} item={item} onReview={onReview} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <section className="panel archive-empty">
          <h2>No saved games yet</h2>
          <p>Play a match or import a PGN from another chess website to start building your own decision library.</p>
          <button className="btn-primary" type="button" onClick={onBack}>Play chess</button>
        </section>
      )}
    </main>
  );
}
