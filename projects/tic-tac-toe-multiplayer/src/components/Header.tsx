import { UserStats } from '../types/game';

interface HeaderProps {
  username: string;
  stats: UserStats;
  connected: boolean;
}

export function Header({ username, stats, connected }: HeaderProps) {
  return (
    <header className="header">
      <h1 className="header-title">🎮 Tic-Tac-Toe Live</h1>
      <div className="user-info">
        <div className="username">@{username}</div>
        <div 
          className="connection-dot"
          style={{ 
            background: connected ? 'var(--success)' : 'var(--danger)',
            width: 10,
            height: 10,
            borderRadius: '50%',
          }}
          title={connected ? 'Connected' : 'Disconnected'}
        />
      </div>
      <div className="stats-grid" style={{ marginTop: '0.5rem', width: '100%' }}>
        <div className="stat-item">
          <div className="stat-value">{stats.wins}</div>
          <div className="stat-label">Wins</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{stats.losses}</div>
          <div className="stat-label">Losses</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{stats.draws}</div>
          <div className="stat-label">Draws</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{stats.totalGames}</div>
          <div className="stat-label">Games</div>
        </div>
      </div>
    </header>
  );
}
