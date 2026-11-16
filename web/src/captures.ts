import { glyphs, parseFen, startingFen, type GameState } from './chess';

export interface CapturedMaterial {
  /** Pieces taken by White (Black pieces), ordered by value. */
  byWhite: string[];
  /** Pieces taken by Black (White pieces), ordered by value. */
  byBlack: string[];
  /** Current material score: positive means White has more remaining material. */
  advantage: number;
}

const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const order = 'qrbnp';

function sortPieces(pieces: string[]): string[] {
  return pieces.sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase()));
}

/** Replay FEN snapshots, not material differences. Promotion is never a capture. */
export function capturedMaterial(game: GameState, ply: number = game.moveHistory.length): CapturedMaterial {
  const count = Math.max(0, Math.min(game.moveHistory.length, ply));
  const byWhite: string[] = [], byBlack: string[] = [];
  let previous = parseFen(game.initialFen || startingFen);

  for (const [index, entry] of game.moveHistory.slice(0, count).entries()) {
    const from = entry.uci.slice(0, 2), to = entry.uci.slice(2, 4);
    const moving = previous[from];
    let captured = previous[to];

    // En passant captures the pawn beside the destination rather than on it.
    if (!captured && moving?.toLowerCase() === 'p' && from[0] !== to[0]) {
      captured = previous[to[0] + from[1]];
    }
    if (captured && captured.toLowerCase() !== 'k'
      && (captured === captured.toUpperCase()) !== entry.white) {
      (entry.white ? byWhite : byBlack).push(captured);
    }
    previous = parseFen(entry.fen || (index === game.moveHistory.length - 1 ? game.fen : game.initialFen || startingFen));
  }

  const board = previous;
  let advantage = 0;
  for (const piece of Object.values(board)) {
    const value = values[piece.toLowerCase()] ?? 0;
    advantage += piece === piece.toUpperCase() ? value : -value;
  }
  return { byWhite: sortPieces(byWhite), byBlack: sortPieces(byBlack), advantage };
}

/** Text glyphs, including VS15 pawns, stay CSS-colorable on iOS. */
export function capturedGlyph(piece: string): string {
  return glyphs[piece] ?? '';
}
