export type Color = 'white' | 'black';

export interface LegalMove {
  from: string;
  to: string;
  promotion: string | null;
}

export interface MoveEntry {
  ply: number;
  white: boolean;
  ai: boolean;
  uci: string;
  san: string;
  fen: string;
}

export interface AiStats {
  depth: number;
  scoreCentipawns: number;
  nodesVisited: number;
  alphaBetaCutoffs: number;
  transpositionHits: number;
  quiescenceNodes: number;
}

export interface GameState {
  id: string;
  fen: string;
  initialFen: string;
  status: string;
  whiteToMove: boolean;
  inCheck: boolean;
  humanWhite: boolean;
  depth: number;
  aiTurn: boolean;
  canUndo: boolean;
  canClaimThreefold: boolean;
  canClaimFifty: boolean;
  legalMoves: LegalMove[];
  moveHistory: MoveEntry[];
  lastMove: LegalMove | null;
  aiStats: AiStats | null;
}

export type BoardMap = Record<string, string>;
export const files = 'abcdefgh';
export const ranks = '87654321';
export const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const glyphs: Record<string, string> = {
  // Use filled glyphs for both sides; CSS makes White ivory and Black charcoal.
  // U+265F defaults to a colored emoji on iOS. VS15 (U+FE0E) forces text
  // presentation, allowing the white/black CSS colors to take effect.
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟\uFE0E',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟\uFE0E',
};

/** Parse only placement; Java remains authoritative for chess legality. */
export function parseFen(fen: string): BoardMap {
  const board: BoardMap = {};
  const rows = fen.split(' ')[0].split('/');
  if (rows.length !== 8) throw new Error('Invalid FEN board');
  rows.forEach((rank, row) => {
    let col = 0;
    for (const cell of rank) {
      if (/^[1-8]$/.test(cell)) {
        col += Number(cell);
      } else if (/^[prnbqkPRNBQK]$/.test(cell)) {
        if (col >= 8) throw new Error('Invalid FEN rank');
        board[`${files[col]}${8 - row}`] = cell;
        col += 1;
      } else {
        throw new Error('Invalid FEN piece');
      }
    }
    if (col !== 8) throw new Error('Invalid FEN rank');
  });
  return board;
}

export function isLightSquare(square: string): boolean {
  const file = files.indexOf(square[0]);
  const rank = Number(square[1]);
  return (file + rank) % 2 === 0;
}

export function squareOrder(whiteAtBottom: boolean): string[] {
  const orderedFiles = whiteAtBottom ? [...files] : [...files].reverse();
  const orderedRanks = whiteAtBottom ? [...ranks] : [...ranks].reverse();
  return orderedRanks.flatMap(rank => orderedFiles.map(file => `${file}${rank}`));
}

export function moveNotation(uci: string): string {
  const normal = `${uci.slice(0, 2)}–${uci.slice(2, 4)}`;
  return uci.length === 5 ? `${normal}=${uci[4].toUpperCase()}` : normal;
}

export function statusLabel(game: GameState): string {
  switch (game.status) {
    case 'IN_PROGRESS':
      return game.aiTurn ? 'The engine is thinking' : game.inCheck ? 'Check — your move' : 'Your move';
    case 'WHITE_RESIGNED': return 'Black wins · White resigned';
    case 'BLACK_RESIGNED': return 'White wins · Black resigned';
    case 'DRAW_AGREEMENT': return 'Draw · By agreement';
    case 'CHECKMATE':
      return `Checkmate · ${game.whiteToMove ? 'Black' : 'White'} wins`;
    case 'STALEMATE': return 'Draw · Stalemate';
    case 'DRAW_INSUFFICIENT_MATERIAL': return 'Draw · Insufficient material';
    case 'DRAW_THREEFOLD_REPETITION': return 'Draw · Threefold repetition';
    case 'DRAW_FIVEFOLD_REPETITION': return 'Draw · Fivefold repetition';
    case 'DRAW_FIFTY_MOVE_RULE': return 'Draw · 50-move rule';
    case 'DRAW_SEVENTY_FIVE_MOVE_RULE': return 'Draw · 75-move rule';
    default: return game.status.replaceAll('_', ' ');
  }
}

export function uciFor(move: LegalMove): string {
  return `${move.from}${move.to}${move.promotion?.toLowerCase() ?? ''}`;
}

export function kingSquare(board: BoardMap, white: boolean): string | null {
  return Object.entries(board).find(([, piece]) => piece === (white ? 'K' : 'k'))?.[0] ?? null;
}

/** Final game scores use the traditional chess result format. */
export function resultScore(game: Pick<GameState, 'status' | 'whiteToMove'>): string | null {
  if (game.status === 'IN_PROGRESS') return null;
  if (game.status === 'WHITE_RESIGNED') return '0-1';
  if (game.status === 'BLACK_RESIGNED') return '1-0';
  if (game.status === 'CHECKMATE') return game.whiteToMove ? '0-1' : '1-0';
  if (game.status === 'DRAW_AGREEMENT' || game.status.startsWith('DRAW_') || game.status === 'STALEMATE') return '1/2-1/2';
  return null;
}

/** A zero-based history cursor: 0 = initial, n = board after ply n.
 * null means "live" and tracks the authoritative game as it advances.
 * The server stores full FEN snapshots, so replay never re-applies moves. */
export function frameAtPly(game: GameState, ply: number | null): {
  fen: string; lastMove: LegalMove | null; inCheck: boolean;
} {
  if (ply === null) return {
    fen: game.fen, lastMove: game.lastMove, inCheck: game.inCheck,
  };
  if (!Number.isInteger(ply) || ply < 0 || ply > game.moveHistory.length)
    throw new RangeError('Move number is outside recorded game history');
  if (ply === 0) return {
    fen: game.initialFen ?? startingFen, lastMove: null, inCheck: false,
  };
  const entry = game.moveHistory[ply - 1];
  const uci = entry.uci;
  return {
    fen: entry.fen,
    lastMove: {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4).toUpperCase() : null,
    },
    inCheck: entry.san.endsWith('+') || entry.san.endsWith('#'),
  };
}

/** Clamps navigation safely when a game gains or loses moves. */
export function stepHistory(cursor: number | null, count: number, delta: -1 | 1): number | null {
  const current = cursor === null ? count : Math.min(cursor, count);
  const next = Math.max(0, Math.min(count, current + delta));
  return next === count ? null : next;
}
