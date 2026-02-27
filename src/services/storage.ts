import { UserStats } from '../types/game';

const STORAGE_KEY = 'tictactoe_user';
const STATS_KEY = 'tictactoe_stats';

export const storage = {
  getUsername(): string | null {
    return localStorage.getItem(STORAGE_KEY);
  },

  setUsername(username: string): void {
    localStorage.setItem(STORAGE_KEY, username);
  },

  getStats(): UserStats {
    const saved = localStorage.getItem(STATS_KEY);
    const username = this.getUsername() || 'Unknown';
    
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        username: parsed.username || username,
        wins: parsed.wins || 0,
        losses: parsed.losses || 0,
        draws: parsed.draws || 0,
        totalGames: parsed.totalGames || 0,
      };
    }
    
    return {
      username,
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
    };
  },

  saveStats(stats: UserStats): void {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  },

  recordWin(): UserStats {
    const stats = this.getStats();
    stats.wins++;
    stats.totalGames++;
    this.saveStats(stats);
    return stats;
  },

  recordLoss(): UserStats {
    const stats = this.getStats();
    stats.losses++;
    stats.totalGames++;
    this.saveStats(stats);
    return stats;
  },

  recordDraw(): UserStats {
    const stats = this.getStats();
    stats.draws++;
    stats.totalGames++;
    this.saveStats(stats);
    return stats;
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STATS_KEY);
  },
};
