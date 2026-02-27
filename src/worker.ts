export interface Env {
  TICTACTOE_GAME: DurableObjectNamespace;
}

// Game state types
type PlayerSymbol = 'X' | 'O';
type CellValue = PlayerSymbol | null;
type GameStatus = 'waiting' | 'playing' | 'finished' | 'draw';

interface Player {
  id: string;
  username: string;
  symbol: PlayerSymbol | null;
  isConnected: boolean;
  ws: WebSocket | null;
}

interface GameState {
  board: CellValue[];
  currentTurn: PlayerSymbol;
  status: GameStatus;
  winner: Player | null;
  players: [Player | null, Player | null];
  queue: Player[];
  winningCells: number[] | null;
}

export class TicTacToeGame {
  private state: DurableObjectState;
  private env: Env;
  private gameState: GameState = {
    board: Array(9).fill(null),
    currentTurn: 'X',
    status: 'waiting',
    winner: null,
    players: [null, null],
    queue: [],
    winningCells: null,
  };
  private connections: Map<string, WebSocket> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // API endpoints
    if (url.pathname === '/api/status') {
      return new Response(
        JSON.stringify({
          activePlayers: this.gameState.players.filter((p) => p !== null).length,
          queueLength: this.gameState.queue.length,
          status: this.gameState.status,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // WebSocket upgrade
    if (url.pathname === '/websocket') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 400 });
      }

      const [client, server] = Object.values(new WebSocketPair());
      const clientId = crypto.randomUUID();

      await this.handleWebSocket(server, clientId);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleWebSocket(ws: WebSocket, clientId: string): Promise<void> {
    ws.accept();
    this.connections.set(clientId, ws);

    ws.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data);
        await this.handleMessage(clientId, message);
      } catch (err) {
        console.error('Error handling message:', err);
        this.sendToClient(clientId, { type: 'error', message: 'Invalid message format' });
      }
    });

    ws.addEventListener('close', () => {
      this.handleDisconnect(clientId);
    });

    ws.addEventListener('error', () => {
      this.handleDisconnect(clientId);
    });

    // Send initial state
    this.sendToClient(clientId, {
      type: 'game_state',
      state: this.sanitizeGameState(),
    });
  }

  private async handleMessage(clientId: string, message: any): Promise<void> {
    switch (message.type) {
      case 'join':
        await this.handleJoin(clientId, message.username || 'Player');
        break;
      case 'move':
        await this.handleMove(clientId, message.position);
        break;
      case 'next_game':
        await this.handleNextGame(clientId);
        break;
      case 'ping':
        this.sendToClient(clientId, { type: 'pong' });
        break;
    }
  }

  private async handleJoin(clientId: string, username: string): Promise<void> {
    const ws = this.connections.get(clientId);
    if (!ws) return;

    // Check if already in game or queue
    const existingPlayer = this.findPlayer(clientId);
    if (existingPlayer) {
      existingPlayer.isConnected = true;
      existingPlayer.ws = ws;
      this.sendToClient(clientId, { type: 'joined', playerId: clientId });
      this.broadcastGameState();
      return;
    }

    const newPlayer: Player = {
      id: clientId,
      username: username.substring(0, 20),
      symbol: null,
      isConnected: true,
      ws: ws,
    };

    // Try to add to game
    if (!this.gameState.players[0]) {
      newPlayer.symbol = 'X';
      this.gameState.players[0] = newPlayer;
      if (this.gameState.players[1]) {
        this.gameState.status = 'playing';
      }
    } else if (!this.gameState.players[1]) {
      newPlayer.symbol = 'O';
      this.gameState.players[1] = newPlayer;
      this.gameState.status = 'playing';
    } else {
      // Add to queue
      this.gameState.queue.push(newPlayer);
    }

    this.sendToClient(clientId, { type: 'joined', playerId: clientId });
    this.broadcastGameState();
  }

  private async handleMove(clientId: string, position: number): Promise<void> {
    const player = this.findPlayer(clientId);
    if (!player || !player.symbol) {
      this.sendToClient(clientId, { type: 'error', message: 'Not in game' });
      return;
    }

    if (this.gameState.status !== 'playing') {
      this.sendToClient(clientId, { type: 'error', message: 'Game not active' });
      return;
    }

    if (this.gameState.currentTurn !== player.symbol) {
      this.sendToClient(clientId, { type: 'error', message: 'Not your turn' });
      return;
    }

    if (position < 0 || position >= 9 || this.gameState.board[position] !== null) {
      this.sendToClient(clientId, { type: 'error', message: 'Invalid move' });
      return;
    }

    // Make move
    this.gameState.board[position] = player.symbol;

    // Check for winner
    const winningLine = this.getWinningLine();
    if (winningLine) {
      this.gameState.status = 'finished';
      this.gameState.winner = player;
      this.gameState.winningCells = winningLine;
    } else if (this.gameState.board.every((cell) => cell !== null)) {
      this.gameState.status = 'draw';
    } else {
      this.gameState.currentTurn = this.gameState.currentTurn === 'X' ? 'O' : 'X';
    }

    this.broadcastGameState();
  }

  private async handleNextGame(clientId: string): Promise<void> {
    const player = this.findPlayer(clientId);
    if (!player || !player.symbol) {
      this.sendToClient(clientId, { type: 'error', message: 'Not in game' });
      return;
    }

    // Reset game but keep players
    this.gameState.board = Array(9).fill(null);
    this.gameState.currentTurn = 'X';
    this.gameState.status = 'playing';
    this.gameState.winner = null;
    this.gameState.winningCells = null;

    // Process queue if there's one
    while (this.gameState.queue.length > 0 && this.gameState.players.some((p) => p === null)) {
      const nextInQueue = this.gameState.queue.shift()!;
      const emptySlot = this.gameState.players[0] === null ? 0 : 1;
      nextInQueue.symbol = emptySlot === 0 ? 'X' : 'O';
      this.gameState.players[emptySlot] = nextInQueue;
      this.connections.set(nextInQueue.id, nextInQueue.ws!);
    }

    if (this.gameState.players[0] && this.gameState.players[1]) {
      this.gameState.status = 'playing';
    }

    this.broadcastGameState();
  }

  private handleDisconnect(clientId: string): void {
    this.connections.delete(clientId);
    const player = this.findPlayer(clientId);
    if (player) {
      player.isConnected = false;
      player.ws = null;
    }
    this.broadcastGameState();
  }

  private findPlayer(clientId: string): Player | null {
    const inGame = this.gameState.players.find((p) => p?.id === clientId);
    if (inGame) return inGame;
    const inQueue = this.gameState.queue.find((p) => p.id === clientId);
    return inQueue || null;
  }

  private getWinningLine(): number[] | null {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];

    for (const line of lines) {
      const [a, b, c] = line;
      const board = this.gameState.board;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return line;
      }
    }
    return null;
  }

  private sanitizeGameState() {
    return {
      ...this.gameState,
      players: this.gameState.players.map((p) =>
        p
          ? {
              id: p.id,
              username: p.username,
              symbol: p.symbol,
              isConnected: p.isConnected,
            }
          : null
      ),
      queue: this.gameState.queue.map((p) => ({
        id: p.id,
        username: p.username,
        symbol: p.symbol,
        isConnected: p.isConnected,
      })),
    };
  }

  private sendToClient(clientId: string, message: any): void {
    const ws = this.connections.get(clientId);
    if (ws?.readyState === WebSocket.READY_STATE_OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch {
        // Ignore send errors
      }
    }
  }

  private broadcastGameState(): void {
    const state = this.sanitizeGameState();
    const message = JSON.stringify({
      type: 'game_state',
      state,
    });
    for (const [, ws] of this.connections) {
      try {
        ws.send(message);
      } catch {
        // Ignore closed connections
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/websocket')) {
      const id = env.TICTACTOE_GAME.idFromName('global');
      const game = env.TICTACTOE_GAME.get(id);
      return game.fetch(request);
    }
    return new Response('Tic-Tac-Toe WebSocket Server', { status: 200 });
  },
};