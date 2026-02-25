import { DurableObject } from "cloudflare:workers";

// ============================================================================
// DURABLE OBJECT: Game State Manager
// ============================================================================
export class Game implements DurableObject {
  constructor(readonly ctx: DurableObjectState, env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade for players
    if (url.pathname === "/ws") {
      return this.handleWebSocket(request);
    }

    // Serve the HTML with the worker URL injected
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(this.getHTML(url.origin), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not Found", { status: 404 });
  }

  private getHTML(origin: string): string {
    const workerUrl = origin.startsWith("http") ? origin : `https://${origin}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Multiplayer Tic-Tac-Toe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      padding: 20px;
    }
    h1 { margin-bottom: 10px; }
    .status { margin-bottom: 20px; font-size: 1.2rem; }
    .board {
      display: grid;
      grid-template-columns: repeat(3, 100px);
      gap: 10px;
      margin-bottom: 20px;
    }
    .cell {
      width: 100px;
      height: 100px;
      background: #0f3460;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3rem;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
    }
    .cell:hover:not(.taken) { background: #1a4a7a; }
    .cell.taken { cursor: not-allowed; }
    .cell.winner { background: #00d26a; }
    .cell.X { color: #00d4ff; }
    .cell.O { color: #ff6b6b; }
    .controls { display: flex; gap: 10px; }
    button {
      padding: 12px 24px;
      font-size: 1rem;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-reset { background: #e94560; color: white; }
    .btn-reset:hover { background: #ff6b8a; }
    .info { margin-top: 20px; color: #888; font-size: 0.9rem; }
    .connected { color: #00d26a; }
    .disconnected { color: #e94560; }
  </style>
</head>
<body>
  <h1>Tic-Tac-Toe</h1>
  <div class="status" id="status">
    <span class="disconnected">Connecting...</span>
  </div>
  <div class="board" id="board"></div>
  <div class="controls">
    <button class="btn-reset" id="resetBtn">New Game</button>
  </div>
  <div class="info">
    <span id="connectionStatus" class="disconnected">Disconnected</span> | 
    You are: <span id="mySymbol">-</span>
  </div>

  <script>
    const BOARD_URL = '${workerUrl}';
    let ws = null;
    let myPlayerId = null;
    let mySymbol = null;
    let gameState = { board: Array(9).fill(null), turn: 'X', winner: null, gameOver: false };

    const boardEl = document.getElementById('board');
    const statusEl = document.getElementById('status');
    const mySymbolEl = document.getElementById('mySymbol');
    const connectionStatusEl = document.getElementById('connectionStatus');
    const resetBtn = document.getElementById('resetBtn');

    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = i;
      cell.addEventListener('click', () => makeMove(i));
      boardEl.appendChild(cell);
    }

    function connect() {
      const wsUrl = BOARD_URL.replace('https://', 'wss://') + '/ws';
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        connectionStatusEl.textContent = 'Connected';
        connectionStatusEl.className = 'connected';
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'welcome') {
          myPlayerId = data.playerId;
          mySymbol = data.symbol;
          mySymbolEl.textContent = data.symbol;
          gameState = data.state;
          render();
        }
        
        if (data.type === 'state') {
          gameState = {
            board: data.board,
            turn: data.turn,
            winner: data.winner,
            gameOver: data.gameOver
          };
          render();
        }

        if (data.type === 'error') {
          alert(data.message);
        }
      };

      ws.onclose = () => {
        connectionStatusEl.textContent = 'Disconnected';
        connectionStatusEl.className = 'disconnected';
        setTimeout(connect, 3000);
      };
    }

    function makeMove(index) {
      if (!gameState.board[index] && !gameState.gameOver && gameState.turn === mySymbol) {
        ws.send(JSON.stringify({ type: 'move', index }));
      }
    }

    function reset() {
      ws.send(JSON.stringify({ type: 'reset' }));
    }

    function render() {
      const cells = document.querySelectorAll('.cell');
      cells.forEach((cell, i) => {
        const val = gameState.board[i];
        cell.textContent = val || '';
        cell.className = 'cell' + (val ? ' taken ' + val : '');
        cell.classList.toggle('winner', gameState.winner && gameState.board[i] === gameState.winner);
      });

      if (gameState.gameOver) {
        if (gameState.winner === 'draw') {
          statusEl.textContent = "It's a draw!";
        } else if (gameState.winner === mySymbol) {
          statusEl.textContent = '🎉 You win!';
        } else if (gameState.winner) {
          statusEl.textContent = gameState.winner + ' wins!';
        }
      } else {
        const isMyTurn = gameState.turn === mySymbol;
        statusEl.textContent = isMyTurn ? 'Your turn' : 'Waiting for ' + gameState.turn + '...';
      }
    }

    resetBtn.addEventListener('click', reset);
    connect();
  </script>
</body>
</html>`;
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const playerId = crypto.randomUUID().slice(0, 8);

    let state = await this.ctx.storage.get<any>("state");
    if (!state) {
      state = {
        players: [],
        board: Array(9).fill(null),
        turn: "X",
        winner: null,
        gameOver: false,
      };
    }

    const playerSymbol = state.players.length === 0 ? "X" : "O";
    const player = { id: playerId, symbol: playerSymbol, ws: server as any };
    state.players.push(player);

    await this.ctx.storage.put("state", state);

    server.send(JSON.stringify({
      type: "welcome",
      playerId,
      symbol: playerSymbol,
      state: this.sanitizeState(state),
    }));

    this.broadcastState(state);

    server.addEventListener("message", async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        await this.handleMessage(player, data);
      } catch (e) {
        console.error("Message error:", e);
      }
    });

    server.addEventListener("close", async () => {
      await this.handleDisconnect(player);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleMessage(player: any, data: any) {
    let state = await this.ctx.storage.get<any>("state");
    if (!state || state.gameOver) return;

    if (data.type === "move") {
      const { index } = data;

      if (state.turn !== player.symbol) {
        player.ws.send(JSON.stringify({ type: "error", message: "Not your turn" }));
        return;
      }

      if (state.board[index] !== null) {
        player.ws.send(JSON.stringify({ type: "error", message: "Invalid move" }));
        return;
      }

      state.board[index] = player.symbol;
      state.turn = player.symbol === "X" ? "O" : "X";

      const winner = this.checkWinner(state.board);
      if (winner) {
        state.winner = winner;
        state.gameOver = true;
      } else if (!state.board.includes(null)) {
        state.winner = "draw";
        state.gameOver = true;
      }

      await this.ctx.storage.put("state", state);
      this.broadcastState(state);
    }

    if (data.type === "reset") {
      state = {
        players: state.players,
        board: Array(9).fill(null),
        turn: "X",
        winner: null,
        gameOver: false,
      };
      await this.ctx.storage.put("state", state);
      this.broadcastState(state);
    }
  }

  private async handleDisconnect(player: any) {
    let state = await this.ctx.storage.get<any>("state");
    if (!state) return;

    state.players = state.players.filter((p: any) => p.id !== player.id);
    await this.ctx.storage.put("state", state);

    this.broadcastState(state);
  }

  private broadcastState(state: any) {
    const sanitized = this.sanitizeState(state);
    const message = JSON.stringify({ type: "state", ...sanitized });

    for (const player of state.players) {
      try {
        player.ws.send(message);
      } catch (e) {}
    }
  }

  private sanitizeState(state: any) {
    return {
      players: state.players.map((p: any) => ({ id: p.id, symbol: p.symbol })),
      board: state.board,
      turn: state.turn,
      winner: state.winner,
      gameOver: state.gameOver,
    };
  }

  private checkWinner(board: string[]): string | null {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];

    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  }
}

// ============================================================================
// MAIN WORKER
// ============================================================================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const doId = env.GAME.idFromName("tic-tac-toe-global");
      const stub = env.GAME.get(doId);
      return stub.fetch(request);
    }

    // Serve HTML from root
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const doId = env.GAME.idFromName("tic-tac-toe-global");
      const stub = env.GAME.get(doId);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};

interface Env {
  GAME: DurableObjectNamespace;
}
