import { GameBoard } from './components/GameBoard';
import { PlayerPanel } from './components/PlayerPanel';
import { QueuePanel } from './components/QueuePanel';
import { UsernameModal } from './components/UsernameModal';
import { Header } from './components/Header';
import { GameProvider, useGame } from './context/GameContext';
import { useWebSocket } from './hooks/useWebSocket';
import { useEffect } from 'react';

function AppContent() {
  const { username, setUsername, stats, updateStats } = useGame();
  const { connected, gameState, playerId, currentPlayer, connect, sendMove, requestNextGame } = useWebSocket();

  useEffect(() => {
    if (username) {
      connect(username);
    }
  }, [username, connect]);

  useEffect(() => {
    if (gameState?.status === 'finished' && gameState.winner) {
      if (gameState.winner.id === playerId) {
        updateStats('win');
      } else {
        updateStats('loss');
      }
    } else if (gameState?.status === 'draw') {
      updateStats('draw');
    }
  }, [gameState?.status, gameState?.winner, playerId, updateStats]);

  if (!username) {
    return <UsernameModal onSubmit={setUsername} />;
  }

  if (!gameState) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh', 
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '3rem', animation: 'spin 1s linear infinite' }}>⏳</div>
        <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
          Connecting to game server...
        </div>
        <div style={{ color: 'var(--text-secondary)' }}>
          {connected ? 'Connected! Waiting for players...' : 'Connecting...'}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header username={username} stats={stats} connected={connected} />
      
      <div className="game-container">
        <aside className="sidebar">
          <PlayerPanel gameState={gameState} playerId={playerId} />
          <QueuePanel queue={gameState.queue} playerId={playerId} />
        </aside>
        
        <main className="game-main">
          <GameBoard 
            gameState={gameState} 
            playerId={playerId} 
            currentPlayer={currentPlayer}
            onMove={sendMove}
            onNextGame={requestNextGame}
          />
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}

export default App;
