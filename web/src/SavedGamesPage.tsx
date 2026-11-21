import { useState, type ChangeEvent } from 'react';
import { MAX_BACKUP_BYTES, type RestoreSummary } from './gameLibrary';
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

export function SavedGamesPage({
  games, onReview, onDelete, onBack, onImport, onBackup, onRestore, ready, error,
}: {
  games: ArchivedGame[];
  onReview: (item: ArchivedGame) => void;
  onDelete: (id: string) => Promise<void>;
  onBack: () => void;
  onImport: (choices: PgnSelection[]) => Promise<PgnImportCommit>;
  onBackup: () => Promise<void>;
  onRestore: (json: string) => Promise<RestoreSummary>;
  ready: boolean;
  error: string | null;
}) {
  const [visible, setVisible] = useState(24);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function backup() {
    if (working) return;
    setWorking(true);
    setMessage(null);
    try {
      await onBackup();
      setMessage('Backup downloaded. Keep the JSON file somewhere safe.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Backup could not be exported.');
    } finally { setWorking(false); }
  }

  async function restore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || working) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setMessage('This backup exceeds the 50 MB import limit. Nothing was restored.');
      return;
    }
    setWorking(true);
    setMessage(null);
    try {
      const data = await onRestore(await file.text());
      setMessage(data.gamesImported + ' games, ' + data.cardsImported +
        ' training cards and ' + data.evaluationsImported +
        ' cached evaluations restored · ' + data.gamesSkipped +
        ' games already present or beyond library capacity.');
      setVisible(Math.max(24, Math.min(data.games.length, 72)));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Backup could not be restored.');
    } finally { setWorking(false); }
  }

  return (
    <main className="main-content saved-games-page">
      <header className="review-page-heading">
        <div>
          <button type="button" className="review-back" onClick={onBack}>← Back to game</button>
          <h1>My Games</h1>
          <p>Review your games from PlySense or import games played elsewhere.</p>
        </div>
        <span className="archive-total">{ready ? games.length + ' saved' : 'Loading library…'}</span>
      </header>
      <div className="archive-notice">
        <strong>Saved on this device</strong>
        <p>Your move history stays in this browser when the Render server sleeps or restarts.
          Matches cannot be resumed from these snapshots, and they are not synced between devices.
          Clearing browser data or using private browsing may erase them.
          Download a complete JSON backup to preserve games, Decision Lab progress, and cached analysis.</p>
      </div>
      {error && <div role="alert" className="error-message">{error}</div>}
      <section className="panel library-tools" aria-label="Library backup and restore">
        <div>
          <h2>Back up your library</h2>
          <p>Saved locally in IndexedDB (up to 2,000 games). Export a portable JSON backup
            containing your games, training cards, and cached analysis. Restore only
            adds missing records; it never overwrites existing games or practice results.</p>
        </div>
        <div className="library-tools-actions">
          <button type="button" className="btn-secondary" disabled={!ready || working}
            onClick={() => void backup()}>Download library backup</button>
          <label className="library-restore-label">
            Restore JSON backup
            <input aria-label="Restore JSON backup" type="file" accept=".json,application/json"
              disabled={!ready || working} onChange={event => void restore(event)} />
          </label>
        </div>
        {message && <p className="library-message" role="status">{message}</p>}
        <p className="review-license">Restoring is additive and retains existing data. If your
          browser blocks storage mid-restore, some imported records may remain; the error
          explains what completed. Keep your original backup file.</p>
      </section>
      {ready && <PgnImportPanel onImport={onImport} />}
      {!ready && !error && <p role="status">Opening your saved game library…</p>}
      {ready && (games.length ? (
        <>
          <div className="archive-grid">
            {games.slice(0, visible).map(item => (
              <ArchivedGameCard key={item.id} item={item} onReview={onReview}
                onDelete={id => { void onDelete(id); }} />
            ))}
          </div>
          {visible < games.length && <button type="button" className="btn-secondary library-show-more"
            onClick={() => setVisible(value => value + 24)}>
            Show more games ({games.length - visible} remaining)
          </button>}
        </>
      ) : (
        <section className="panel archive-empty">
          <h2>No saved games yet</h2>
          <p>Play a match or import a PGN from another chess website to start building your own decision library.</p>
          <button className="btn-primary" type="button" onClick={onBack}>Play chess</button>
        </section>
      ))}
    </main>
  );
}
