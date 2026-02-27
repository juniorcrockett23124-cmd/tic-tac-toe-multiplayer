import { Player } from '../types/game';

interface QueuePanelProps {
  queue: Player[];
  playerId: string | null;
}

export function QueuePanel({ queue, playerId }: QueuePanelProps) {
  const myPosition = queue.findIndex(p => p.id === playerId) + 1;

  return (
    <div className="panel">
      <h3 className="panel-title">
        Queue
        <span style={{ 
          float: 'right', 
          background: 'var(--primary)', 
          padding: '0.25rem 0.5rem', 
          borderRadius: '1rem',
          fontSize: '0.75rem'
        }}>
          {queue.length} waiting
        </span>
      </h3>
      
      {queue.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
          No one in queue
        </p>
      ) : (
        <div className="queue-list">
          {queue.map((player, index) => (
            <div key={player.id} className="queue-item">
              <div className={`queue-position ${player.id === playerId ? 'you' : ''}`}>
                {index + 1}
              </div>
              <span style={{ flex: 1 }}>{player.username}</span>
              {!player.isConnected && (
                <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>
                  Offline
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      
      {myPosition > 0 && (
        <p style={{ 
          textAlign: 'center', 
          marginTop: '1rem', 
          padding: '0.75rem', 
          background: 'rgba(99, 102, 241, 0.1)', 
          borderRadius: '0.5rem',
          border: '1px solid var(--primary)',
          color: 'var(--primary)',
          fontWeight: 600 
        }}>
          ⏳ You're #{myPosition} in queue
        </p>
      )}
    </div>
  );
}
