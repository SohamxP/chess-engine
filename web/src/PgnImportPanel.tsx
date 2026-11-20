import { useState, type ChangeEvent } from 'react';
import { MAX_PGN_CHARS, MAX_PGN_GAMES, parsePgnBatch,
  type ParsedPgn, type PgnImportResult, type PgnParseError, type PgnSelection } from './pgnImport';

export interface PgnImportCommit extends PgnImportResult {
  saved: boolean;
}

function chooseSide(parsed: ParsedPgn, playerName: string): boolean {
  const name = playerName.trim().toLocaleLowerCase();
  if (name && parsed.source.black.toLocaleLowerCase() === name) return false;
  return true;
}

export function PgnImportPanel({ onImport }: {
  onImport: (choices: PgnSelection[]) => PgnImportCommit;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [previews, setPreviews] = useState<ParsedPgn[]>([]);
  const [errors, setErrors] = useState<PgnParseError[]>([]);
  const [sides, setSides] = useState<boolean[]>([]);
  const [included, setIncluded] = useState<boolean[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function showBatch(games: ParsedPgn[], failures: PgnParseError[]) {
    setPreviews(games);
    setErrors(failures);
    setSides(games.map(game => chooseSide(game, playerName)));
    setIncluded(games.map(() => true));
    setMessage(null);
  }

  function previewText() {
    const result = parsePgnBatch(text);
    showBatch(result.games, result.errors);
  }

  async function openFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setLoading(true);
    setMessage(null);
    try {
      if (files.some(file => file.size > MAX_PGN_CHARS * 2)) {
        throw new Error('A selected file is too large. Import a smaller PGN export (1 MB of text per file).');
      }
      const contents = await Promise.all(files.map(file => file.text()));
      if (contents.some(content => content.length > MAX_PGN_CHARS)) {
        throw new Error('A selected file exceeds the 1,000,000-character limit.');
      }
      const all: ParsedPgn[] = [];
      const failures: PgnParseError[] = [];
      for (const content of contents) {
        const result = parsePgnBatch(content);
        const offset = all.length + failures.length;
        all.push(...result.games);
        failures.push(...result.errors.map(error => ({ ...error, number: error.number + offset })));
      }
      if (all.length > MAX_PGN_GAMES) {
        throw new Error('Choose a smaller batch: at most 50 games can be previewed at once.');
      }
      showBatch(all, failures);
    } catch (caught) {
      showBatch([], []);
      setMessage(caught instanceof Error ? caught.message : 'Could not read the PGN files.');
    } finally {
      setLoading(false);
    }
  }

  function importSelected() {
    const selections: PgnSelection[] = previews.flatMap((parsed, index) =>
      included[index] ? [{ parsed, humanWhite: sides[index] }] : []);
    if (!selections.length) return;
    const outcome = onImport(selections);
    if (!outcome.saved) {
      setMessage('Nothing was saved. Browser storage may be blocked or full. Export or remove old games and try again.');
      return;
    }
    const counts = [
      outcome.imported + ' imported',
      outcome.duplicates + ' already saved',
      outcome.full + ' skipped (50-game archive limit)',
      outcome.collisions + ' skipped (ID conflict)',
    ];
    setMessage(counts.join(' · ') + '.');
    setPreviews([]);
    setErrors([]);
    setSides([]);
    setIncluded([]);
  }

  return (
    <section className="panel pgn-import-panel" aria-label="Import PGN">
      <div className="pgn-import-heading">
        <div>
          <h2>Bring your games to PlySense</h2>
          <p>Import PGNs from Chess.com, Lichess or another standard chess source. No account connection needed.</p>
        </div>
        <button type="button" className="btn-secondary" aria-expanded={open}
          onClick={() => setOpen(current => !current)}>
          {open ? 'Close importer' : 'Import PGN'}
        </button>
      </div>
      {open && (
        <div className="pgn-import-content">
          <div className="pgn-import-fields">
            <label htmlFor="pgn-player-name">Your player name (optional)</label>
            <input id="pgn-player-name" type="text" maxLength={150}
              value={playerName} onChange={event => setPlayerName(event.target.value)}
              placeholder="Used to select White or Black automatically" />
            <p className="review-description">If the name matches a PGN player exactly, that side is selected when you preview. You can always change sides per game.</p>
          </div>
          <div className="pgn-import-inputs">
            <div className="pgn-import-fields">
              <label htmlFor="pgn-upload">Choose PGN files</label>
              <input id="pgn-upload" type="file" accept=".pgn,.txt,text/plain,application/x-chess-pgn"
                multiple disabled={loading} onChange={event => void openFiles(event)} />
              <p className="review-description">Multiple files and multi-game exports supported. Limit: 50 games per preview, 500 half-moves per game.</p>
            </div>
            <div className="pgn-import-fields">
              <label htmlFor="pgn-paste">Or paste PGN text</label>
              <textarea id="pgn-paste" rows={6} value={text}
                onChange={event => setText(event.target.value)}
                maxLength={MAX_PGN_CHARS + 1} placeholder={'[White "YourName"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0'} />
              <button type="button" className="btn-secondary" disabled={!text.trim() || loading}
                onClick={previewText}>Preview pasted games</button>
            </div>
          </div>
          {loading && <p role="status">Reading PGN files locally…</p>}
          {message && <p className="pgn-import-message" role="status">{message}</p>}
          {errors.length > 0 && (
            <div className="pgn-import-errors" role="alert">
              <strong>{errors.length} game{errors.length === 1 ? '' : 's'} could not be imported</strong>
              <ul>{errors.slice(0, 10).map((error, index) =>
                <li key={index}>Game {error.number}: {error.message}</li>)}</ul>
              {errors.length > 10 && <p>And {errors.length - 10} more errors. Split the batch to inspect each failure.</p>}
            </div>
          )}
          {previews.length > 0 && (
            <section className="pgn-preview" aria-label="PGN import preview">
              <div className="pgn-preview-heading">
                <h3>Review {previews.length} parsed game{previews.length === 1 ? '' : 's'}</h3>
                <span>{included.filter(Boolean).length} selected</span>
              </div>
              <div className="pgn-preview-list">
                {previews.map((parsed, index) => (
                  <article className="pgn-preview-card" key={index}>
                    <label className="pgn-preview-include">
                      <input type="checkbox" checked={included[index]}
                        onChange={event => setIncluded(current => current.map((value, i) =>
                          i === index ? event.target.checked : value))} />
                      <strong>{parsed.source.white} vs. {parsed.source.black}</strong>
                    </label>
                    <p>{parsed.source.event} · {parsed.source.date} · {parsed.game.moveHistory.length} half-moves</p>
                    <label className="pgn-preview-side">
                      I played as
                      <select value={sides[index] ? 'white' : 'black'}
                        onChange={event => setSides(current => current.map((value, i) =>
                          i === index ? event.target.value === 'white' : value))}>
                        <option value="white">White — {parsed.source.white}</option>
                        <option value="black">Black — {parsed.source.black}</option>
                      </select>
                    </label>
                  </article>
                ))}
              </div>
              <button type="button" className="btn-primary pgn-import-commit"
                disabled={!included.some(Boolean)} onClick={importSelected}>
                Import {included.filter(Boolean).length} selected game{included.filter(Boolean).length === 1 ? '' : 's'}
              </button>
            </section>
          )}
          <p className="review-license">Only the mainline is imported. Comments and variations are not retained; PGN results, players, dates and starting positions are preserved. Existing games are never deleted to make room for an import.</p>
        </div>
      )}
    </section>
  );
}
