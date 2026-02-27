// Game Types
export type PlayerSymbol = 'X' | 'O';
export type CellValue = PlayerSymbol | null;
export type GameStatus = 'waiting' | 'playing' | 'finished' | 'draw';

export interface Player {
  id: string;
  username: string;
  symbol: PlayerSymbol | null;
  isConnected: boolean;
}

export interface GameState {
  board: CellValue[];
  currentTurn: PlayerSymbol;
  status: GameStatus;
  winner: Player | null;
  players: [Player | null, Player | null];
  queue: Player[];
  winningCells: number[] | null;
}

export interface UserStats {
  username: string;
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
}

// WebSocket Message Types
export type MessageType = 
  | 'join'
  | 'joined'
  | 'game_state'
  | 'move'
  | 'make_move'
  | 'error'
  | 'player_disconnected'
  | 'next_game'
  | 'queue_update'
  | 'ping'
  | 'pong';

export interface BaseMessage {
  type: MessageType;
}

export interface JoinMessage extends BaseMessage {
  type: 'join';
  username: string;
}

export interface JoinedMessage extends BaseMessage {
  type: 'joined';
  playerId: string;
  symbol: PlayerSymbol | null;
}

export interface GameStateMessage extends BaseMessage {
  type: 'game_state';
  state: GameState;
  yourPlayerId: string;
}

export interface MoveMessage extends BaseMessage {
  type: 'move';
  position: number;
}

export interface MakeMoveMessage extends BaseMessage {
  type: 'make_move';
  position: number;
  playerId: string;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  message: string;
}

export interface PlayerDisconnectedMessage extends BaseMessage {
  type: 'player_disconnected';
  playerId: string;
}

export interface NextGameMessage extends BaseMessage {
  type: 'next_game';
}

export interface QueueUpdateMessage extends BaseMessage {
  type: 'queue_update';
  queue: Player[];
}

export type WebSocketMessage =
  | JoinMessage
  | JoinedMessage
  | GameStateMessage
  | MoveMessage
  | MakeMoveMessage
  | ErrorMessage
  | PlayerDisconnectedMessage
  | NextGameMessage
  | QueueUpdateMessage
  | { type: 'ping' }
  | { type: 'pong' };
