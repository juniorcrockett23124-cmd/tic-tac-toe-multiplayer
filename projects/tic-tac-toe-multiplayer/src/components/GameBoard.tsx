import { GameState, Player } from '../types/game';

interface GameBoardProps {
  gameState: GameState;
  playerId: string | null;
  currentPlayer: Player | null;
  onMove: (position: number) => void;
  onNextGame: () => void;
}

export function GameBoard({ gameState, playerId, currentPlayer, onMove, onNextGame }: GameBoardProps) {
  const isMyTurn = currentPlayer?.symbol === gameState.currentTurn && gameState.status === 'playing';
  const canMakeMove = (position: number) => {
    return isMyTurn && !gameState.board[position] && gameState.status === 'playing';
  };

  const getStatusText = () => {
    if (gameState.status === 'waiting') {
      return 'Waiting for players...';
    }
    if (gameState.status === 'finished') {
      const winnerName = gameState.winner?.username || 'Unknown';
      if (gameState.winner?.id === playerId) {
        return '🎉 You won!';
      }
      return `${winnerName} wins!`;
    }
    if (gameState.status === 'draw') {
      return "🤝 It's a draw!";
    }
    if (isMyTurn) {
      return "Your turn";
    }
    const opponent = gameState.players.find(p => p?.id !== playerId);
    return `Waiting for ${opponent?.username || 'opponent'}...`;
  };

  const getCellClass = (index: number) => {
    const classes = ['cell'];
    if (gameState.board[index]) {
      classes.push(gameState.board[index]!.toLowerCase());
    }
    if (gameState.winningCells?.includes(index)) {
      classes.push('winner');
    }
    return classes.join(' ');
  };

  const isWinner = gameState.status === 'finished' && gameState.winner?.id === playerId;
  const isDraw = gameState.status === 'draw';
  const canStartNext = isWinner || (isDraw && currentPlayer?.symbol);

  return (
    <div className="game-board-wrapper">
      <div className="status-bar">
        <div className={`status-text ${isMyTurn ? 'your-turn' : 'waiting'}`}>
          {getStatusText()}
        </div>
        {gameState.status === 'playing' && (
          <div className="turn-indicator">
            <div className={`turn-indicator-dot ${gameState.currentTurn === 'X' ? '' : 'o'}`} />
            <span>{gameState.currentTurn}'s turn</span>
          </div>
        )}
      </div>

      <div className="board">
        {gameState.board.map((cell, index) => (
          <button
            key={index}
            className={getCellClass(index)}
            onClick={() => canMakeMove(index) && onMove(index)}
            disabled={!canMakeMove(index)}
          >
            {cell}
          </button>
        ))}
      </div>

      {(gameState.status === 'finished' || gameState.status === 'draw') && canStartNext && (
        <div className="next-game-container">
          <button className="btn btn-next-game" onClick={onNextGame}>
            {isWinner ? 'Winner! Start Next Game →' : 'Start Next Game →'}
          </button>
        </div>
      )}
    </div>
  );
}
