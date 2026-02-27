import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserStats } from '../types/game';
import { storage } from '../services/storage';

interface GameContextType {
  username: string | null;
  setUsername: (username: string) => void;
  stats: UserStats;
  updateStats: (type: 'win' | 'loss' | 'draw') => void;
  isFirstVisit: boolean;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [username, setUsernameState] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats>(storage.getStats());
  const [isFirstVisit, setIsFirstVisit] = useState(true);

  useEffect(() => {
    const savedUsername = storage.getUsername();
    if (savedUsername) {
      setUsernameState(savedUsername);
      setIsFirstVisit(false);
    }
    setStats(storage.getStats());
  }, []);

  const setUsername = (newUsername: string) => {
    storage.setUsername(newUsername);
    setUsernameState(newUsername);
    setIsFirstVisit(false);
    // Update stats with new username
    const currentStats = storage.getStats();
    currentStats.username = newUsername;
    storage.saveStats(currentStats);
    setStats(currentStats);
  };

  const updateStats = (type: 'win' | 'loss' | 'draw') => {
    let newStats: UserStats;
    switch (type) {
      case 'win':
        newStats = storage.recordWin();
        break;
      case 'loss':
        newStats = storage.recordLoss();
        break;
      case 'draw':
        newStats = storage.recordDraw();
        break;
      default:
        newStats = storage.getStats();
    }
    setStats(newStats);
  };

  return (
    <GameContext.Provider value={{ username, setUsername, stats, updateStats, isFirstVisit }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
