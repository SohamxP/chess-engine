import { describe, expect, it } from 'vitest';
import { ARCHIVE_KEY, MAX_ARCHIVED_GAMES, archiveGame, pgnForGame, readArchive, removeArchivedGame,
  upsertArchivedGame, writeArchive, type ArchivedGame } from './archive';
import { startingFen, type GameState, type MoveEntry } from './chess';

const move = (ply: number, san: string, uci: string, fen = startingFen): MoveEntry =>
  ({ ply, white: ply % 2 === 1, ai: false, san, uci, fen });
const game = (id = 'game-1', status = 'IN_PROGRESS'): GameState => ({
  id, fen: startingFen, initialFen: startingFen,
  status, whiteToMove: true, inCheck: false, humanWhite: true, depth: 2,
  aiTurn: false, canUndo: true, canClaimThreefold: false, canClaimFifty: false,
  legalMoves: [], lastMove: null, aiStats: null,
  moveHistory: [move(1, 'e4', 'e2e4'), move(2, 'e5', 'e7e5'),
    move(3, 'Nf3', 'g1f3'), move(4, 'Nc6', 'b8c6')],
});
class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  get length() { return this.data.size; }
}

describe('local game archive', () => {
  it('deduplicates snapshots and retains the newest 50', () => {
    let items: ArchivedGame[] = [];
    for (let i = 0; i < MAX_ARCHIVED_GAMES + 7; i++) {
      items = upsertArchivedGame(items, game('game-' + i), new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString());
    }
    expect(items).toHaveLength(MAX_ARCHIVED_GAMES);
    expect(items[0].id).toBe('game-56');
    expect(items.at(-1)?.id).toBe('game-7');
    const update = game('game-10', 'CHECKMATE');
    items = upsertArchivedGame(items, update, '2026-11-19T00:00:00.000Z');
    expect(items).toHaveLength(MAX_ARCHIVED_GAMES);
    expect(items[0].game.status).toBe('CHECKMATE');
    expect(items.filter(item => item.id === 'game-10')).toHaveLength(1);
  });

  it('persists move snapshots in the same browser and allows removal', () => {
    const storage = new MemoryStorage() as Storage;
    expect(archiveGame(game(), storage, new Date('2026-11-17T03:00:00Z')).saved).toBe(true);
    expect(readArchive(storage)[0].game.moveHistory).toHaveLength(4);
    expect(archiveGame(game('game-1', 'WHITE_RESIGNED'), storage).games).toHaveLength(1);
    expect(readArchive(storage)[0].game.status).toBe('WHITE_RESIGNED');
    expect(removeArchivedGame('game-1', storage)).toEqual({ games: [], saved: true });
    expect(readArchive(storage)).toHaveLength(0);
  });

  it('does not clutter history with brand-new empty games', () => {
    const storage = new MemoryStorage() as Storage;
    const empty = { ...game(), moveHistory: [] };
    expect(archiveGame(empty, storage).games).toEqual([]);
    expect(readArchive(storage)).toEqual([]);
    expect(upsertArchivedGame([], empty, new Date().toISOString())).toEqual([]);
  });

  it('rejects invalid or blocked browser storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(ARCHIVE_KEY, '{invalid JSON');
    expect(readArchive(storage)).toEqual([]);
    expect(writeArchive([], { setItem() { throw new Error('QuotaExceededError'); } })).toBe(false);
    const blocked = new MemoryStorage();
    blocked.setItem = () => { throw new Error('blocked'); };
    expect(archiveGame(game(), blocked as Storage).saved).toBe(false);
  });

  it('isolates malformed browser snapshots without losing valid saved games', () => {
    const storage = new MemoryStorage();
    const savedAt = '2026-11-20T11:00:00.000Z';
    const good = { id: 'good', savedAt, game: game('good') };
    const brokenFen = { id: 'broken-fen', savedAt,
      game: { ...game('broken-fen'), initialFen: 'not a FEN' } };
    const brokenMove = { id: 'bad-move', savedAt,
      game: { ...game('bad-move'), moveHistory: [
        { ...game('bad-move').moveHistory[0], uci: 'malformed' },
      ] } };
    const brokenPly = { id: 'bad-ply', savedAt,
      game: { ...game('bad-ply'), moveHistory: [
        { ...game('bad-ply').moveHistory[0], ply: 12 },
      ] } };
    const brokenTime = { ...good, id: 'bad-time',
      savedAt: 'not a timestamp', game: game('bad-time') };
    storage.setItem(ARCHIVE_KEY, JSON.stringify([
      brokenFen, brokenMove, brokenPly, brokenTime,
      good, good, { ...good, id: 'mismatched' },
    ]));
    expect(readArchive(storage)).toEqual([good]);
    expect(storage.getItem(ARCHIVE_KEY)).toContain('broken-fen');
    // Reading should not silently rewrite a damaged archive; only a
    // separate explicit save operation may replace persisted bytes.
  });

  it('prefers the newest valid duplicate rather than stale browser ordering', () => {
    const storage = new MemoryStorage();
    const earlier = { id: 'g', savedAt: '2026-11-18T00:00:00Z', game: game('g') };
    const later = { id: 'g', savedAt: '2026-11-20T00:00:00Z',
      game: game('g', 'WHITE_RESIGNED') };
    storage.setItem(ARCHIVE_KEY, JSON.stringify([earlier, later]));
    expect(readArchive(storage)).toEqual([later]);
  });

  it('exports legal SAN, player colors, result, and black-to-move custom FEN', () => {
    const match = game('last', 'CHECKMATE');
    match.whiteToMove = false;
    expect(pgnForGame(match, '2026-11-17T22:05:00Z')).toContain('[Result "1-0"]');
    expect(pgnForGame(match, '2026-11-17T22:05:00Z')).toContain('1. e4 e5 2. Nf3 Nc6 1-0');
    expect(pgnForGame({ ...match, humanWhite: false, status: 'IN_PROGRESS' }, '2026-11-17')).toContain('[Black "You"]');
    expect(pgnForGame({ ...match, humanWhite: false, status: 'IN_PROGRESS' }, '2026-11-17')).toContain('Nc6 *');
    const start = '4k3/8/8/8/8/8/8/4K3 b - - 0 12';
    expect(pgnForGame({ ...game(), initialFen: start, moveHistory: [move(1, 'Kd7', 'e8d7')] }, '2026-11-17'))
      .toContain('[FEN "' + start + '"]');
    expect(pgnForGame({ ...game(), initialFen: start, moveHistory: [move(1, 'Kd7', 'e8d7')] }, '2026-11-17'))
      .toContain('12... Kd7 *');
  });
});
