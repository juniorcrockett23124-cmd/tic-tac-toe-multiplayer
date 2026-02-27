import { GameState, Player, PlayerSymbol } from '../types/game';

interface PlayerPanelProps {
  gameState: GameState;
  playerId: string | null;
}

export function PlayerPanel({ gameState, playerId }: PlayerPanelProps) {
  const getPlayerStatus = (player: Player | null, symbol: PlayerSymbol) => {
    if (!player) return 'Waiting...';
    if (!player.isConnected) return 'Disconnected';
    if (gameState.currentTurn === symbol && gameState.status === 'playing') return 'Playing...';
    return 'Connected';
  };

  return (
    <div className="panel">
      <h3 className="panel-title">Current Match</h3>
      <div className="player-list">
        {/* Player X */}
        <div className={`player-item ${gameState.players[0]?.id === playerId ? 'current' : ''}`}>
          <div className="player-avatar x">X</div>
          <div className="player-name">
            {gameState.players[0]?.username || 'Waiting...'}
          </div>
          <div className="player-symbol x">X</div>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
          {getPlayerStatus(gameState.players[0], 'X')}
        </div>

        {/* VS Divider */}
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>
          VS
        </div>

        {/* Player O */}
        <div className={`player-item ${gameState.players[1]?.id === playerId ? 'current' : ''}`}>
          <div className="player-avatar o">O</div>
          <div className="player-name">
            {gameState.players[1]?.username || 'Waiting...'}
          </div>
          <div className="player-symbol o">O</div>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
          {getPlayerStatus(gameState.players[1], 'O')}
        </div>
      </div>

      {/* Connection indicator */}
      <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <div 
            className="connection-dot"
            style={{ 
              background: gameState.players[0]?.isConnected ? 'var(--success)' : 'var(--danger)',
            }}
          />
          <span>Player X: {gameState.players[0]?.isConnected ? 'Online' : 'Offline'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          <div 
            className="connection-dot"
            style={{ 
              background: gameState.players[1]?.isConnected ? 'var(--success)' : 'var(--danger)',
            }}
          />
          <span>Player O: {gameState.players[1]?.isConnected ? 'Online' : 'Offline'}</span>
        </div>
      </div>
    </div>
  );
}
