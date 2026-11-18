import { capturedGlyph, capturedMaterial } from './captures';
import type { GameState } from './chess';

export function PlayerStrip({ game, player, ply, thinking = false, label }: {
  game: GameState;
  player: 'human' | 'computer';
  ply: number;
  thinking?: boolean;
  label?: string;
}) {
  const human = player === 'human';
  const white = human ? game.humanWhite : !game.humanWhite;
  const side = white ? 'White' : 'Black';
  const displayName = label ?? (human ? 'You' : 'Computer');
  const material = capturedMaterial(game, ply);
  const taken = white ? material.byWhite : material.byBlack;
  const lead = white ? material.advantage : -material.advantage;

  return (
    <div className={'player-strip ' + (human ? 'human-strip' : 'opponent-strip')}>
      <div className={'avatar ' + (human ? 'human-avatar' : 'engine-avatar')} aria-hidden="true">
        {human ? '♙' : '♞'}
      </div>
      <div className="player-details">
        <strong>{displayName}</strong>
        <span>{label ? side + ' · PGN import'
          : human ? 'Playing ' + side : side + ' · Java chess engine'}</span>
        {taken.length > 0 && (
          <div className="captured-pieces" aria-label={
            displayName + ' captured ' + taken.length + ' pieces'
          }>
            {taken.map((piece, index) => (
              <span key={index} aria-hidden="true"
                className={'captured-piece ' + (piece === piece.toUpperCase() ? 'white-piece' : 'black-piece')}>
                {capturedGlyph(piece)}
              </span>
            ))}
            {lead > 0 && <span className="material-lead">+{lead}</span>}
          </div>
        )}
        {taken.length === 0 && lead > 0 && (
          <span className="material-lead" aria-label={'Material advantage +' + lead}>+{lead}</span>
        )}
      </div>
      <span className="player-badge">{thinking ? 'Thinking…' : side}</span>
    </div>
  );
}
