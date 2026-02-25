// ============================================================================
// MULTIPLAYER TIC-TAC-TOE - Cloudflare Workers + KV Storage + Queue
// ============================================================================

interface GameState {
  players: { id: string; symbol: string }[];
  board: (string | null)[];
  turn: string;
  winner: string | null;
  gameOver: boolean;
  lastUpdate: number;
  rematchInProgress?: boolean; // Lock to prevent double rematch
}

const QUEUE_KEY = "matchmaking_queue";
const MATCHES_KEY = "player_matches"; // playerId -> gameId mapping
const QUEUED_PLAYERS_KEY = "queued_players"; // playerId -> {timestamp} mapping

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/join") {
      return handleJoin(request, url, env);
    }
    if (url.pathname === "/api/poll") {
      return handlePoll(request, url, env);
    }
    if (url.pathname === "/api/move") {
      return handleMove(request, url, env);
    }
    if (url.pathname === "/api/reset") {
      return handleReset(request, url, env);
    }
    if (url.pathname === "/api/queue") {
      return handleQueue(request, url, env);
    }
    if (url.pathname === "/api/leave-queue") {
      return handleLeaveQueue(request, url, env);
    }
    if (url.pathname === "/api/admin/clear-queue") {
      return handleClearQueue(env);
    }
    if (url.pathname === "/api/admin/reset-all") {
      return handleResetAll(env);
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(getHTML(url.origin), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

async function getGame(gameId: string, env: Env): Promise<GameState> {
  const existing = await env.GAME_STATE.get(gameId, "json");
  if (existing) return existing;

  const newGame: GameState = {
    players: [],
    board: Array(9).fill(null),
    turn: "X",
    winner: null,
    gameOver: false,
    lastUpdate: Date.now(),
  };
  await env.GAME_STATE.put(gameId, JSON.stringify(newGame));
  return newGame;
}

async function saveGame(gameId: string, game: GameState, env: Env) {
  game.lastUpdate = Date.now();
  await env.GAME_STATE.put(gameId, JSON.stringify(game));
}

// Queue management
async function getQueue(env: Env): Promise<string[]> {
  const queue = await env.GAME_STATE.get(QUEUE_KEY, "json");
  return queue || [];
}

async function addToQueue(env: Env, gameId: string) {
  const queue = await getQueue(env);
  if (!queue.includes(gameId)) {
    queue.push(gameId);
    await env.GAME_STATE.put(QUEUE_KEY, JSON.stringify(queue));
  }
}

async function removeFromQueue(env: Env, gameId: string) {
  const queue = await getQueue(env);
  const newQueue = queue.filter(id => id !== gameId);
  await env.GAME_STATE.put(QUEUE_KEY, JSON.stringify(newQueue));
}

async function popFromQueue(env: Env): Promise<string | null> {
  const queue = await getQueue(env);
  if (queue.length === 0) return null;
  const nextGameId = queue.shift()!;
  await env.GAME_STATE.put(QUEUE_KEY, JSON.stringify(queue));
  return nextGameId;
}

// Player to game mapping
async function getPlayerMatch(env: Env, playerId: string): Promise<string | null> {
  const matches = await env.GAME_STATE.get(MATCHES_KEY, "json") as Record<string, string> | null;
  return matches?.[playerId] || null;
}

async function setPlayerMatch(env: Env, playerId: string, gameId: string) {
  const matches = (await env.GAME_STATE.get(MATCHES_KEY, "json") as Record<string, string>) || {};
  matches[playerId] = gameId;
  await env.GAME_STATE.put(MATCHES_KEY, JSON.stringify(matches));
}

async function clearPlayerMatch(env: Env, playerId: string) {
  const matches = (await env.GAME_STATE.get(MATCHES_KEY, "json") as Record<string, string>) || {};
  delete matches[playerId];
  await env.GAME_STATE.put(MATCHES_KEY, JSON.stringify(matches));
}

// Track queued players (for session persistence)
async function getQueuedPlayers(env: Env): Promise<Record<string, number>> {
  return (await env.GAME_STATE.get(QUEUED_PLAYERS_KEY, "json")) || {};
}

async function setQueuedPlayer(env: Env, playerId: string) {
  const queued = await getQueuedPlayers(env);
  queued[playerId] = Date.now();
  await env.GAME_STATE.put(QUEUED_PLAYERS_KEY, JSON.stringify(queued));
}

async function removeQueuedPlayer(env: Env, playerId: string) {
  const queued = await getQueuedPlayers(env);
  delete queued[playerId];
  await env.GAME_STATE.put(QUEUED_PLAYERS_KEY, JSON.stringify(queued));
}

async function handleJoin(request: Request, url: URL, env: Env): Promise<Response> {
  const gameId = url.searchParams.get("game") || "default";
  const playerId = url.searchParams.get("playerId");

  // If playerId provided, check for existing session
  if (playerId) {
    // Check if player has a pending match
    const matchedGameId = await getPlayerMatch(env, playerId);
    if (matchedGameId) {
      const game = await env.GAME_STATE.get(matchedGameId, "json") as GameState | null;
      if (game) {
        await clearPlayerMatch(env, playerId);
        const player = game.players.find(p => p.id === playerId);
        return Response.json({
          playerId,
          symbol: player?.symbol || null,
          state: sanitizeState(game),
          inQueue: false,
          newGameId: matchedGameId,
        });
      }
    }
    
    // Check if player is in the queue - if so, re-add to queue (refresh queue position)
    const queuedPlayers = await getQueuedPlayers(env);
    if (queuedPlayers[playerId]) {
      // Player was in queue, re-add them (removes stale position, adds fresh)
      const queue = await getQueue(env);
      // Remove if exists, then add
      const newQueue = queue.filter(id => id !== playerId);
      newQueue.push(playerId);
      await env.GAME_STATE.put(QUEUE_KEY, JSON.stringify(newQueue));
      await setQueuedPlayer(env, playerId);
      
      return Response.json({
        playerId,
        symbol: null,
        state: null,
        inQueue: true,
        queuePosition: newQueue.length,
      });
    }
    
    // Check if player is already in this game
    const game = await env.GAME_STATE.get(gameId, "json") as GameState | null;
    if (game && game.players.find(p => p.id === playerId)) {
      return Response.json({
        playerId,
        symbol: game.players.find(p => p.id === playerId)!.symbol,
        state: sanitizeState(game),
        inQueue: false,
      });
    }
  }

  const game = await getGame(gameId, env);

  // Check if game has room
  if (game.players.length < 2) {
    let playerSymbol: string | null = null;
    if (game.players.length === 0) playerSymbol = "X";
    else if (game.players.length === 1) playerSymbol = "O";

    const newPlayerId = crypto.randomUUID().slice(0, 8);
    game.players.push({ id: newPlayerId, symbol: playerSymbol! });
    await saveGame(gameId, game, env);

    return Response.json({
      playerId: newPlayerId,
      symbol: playerSymbol,
      state: sanitizeState(game),
      inQueue: false,
    });
  }

  // Game full - add to queue
  // Use provided playerId or generate new one
  const queuePlayerId = playerId || crypto.randomUUID().slice(0, 8);
  await addToQueue(env, queuePlayerId);
  await setQueuedPlayer(env, queuePlayerId);

  return Response.json({
    playerId: queuePlayerId,
    symbol: null,
    state: null,
    inQueue: true,
    queuePosition: (await getQueue(env)).indexOf(queuePlayerId) + 1,
  });
}

async function handlePoll(request: Request, url: URL, env: Env): Promise<Response> {
  const gameId = url.searchParams.get("game") || "default";
  const playerId = url.searchParams.get("playerId") || "";
  const since = parseInt(url.searchParams.get("since") || "0");

  // Check if in queue
  const queue = await getQueue(env);
  if (queue.includes(playerId)) {
    const position = queue.indexOf(playerId) + 1;
    return Response.json({
      inQueue: true,
      queuePosition: position,
    });
  }

  const game = await env.GAME_STATE.get(gameId, "json") as GameState | null;
  if (!game) {
    return Response.json({ state: null });
  }

  if (game.lastUpdate > since) {
    return Response.json({ state: sanitizeState(game), inQueue: false });
  }

  return Response.json({ state: sanitizeState(game), inQueue: false });
}

async function handleMove(request: Request, url: URL, env: Env): Promise<Response> {
  const gameId = url.searchParams.get("game") || "default";
  const playerId = url.searchParams.get("playerId") || "";
  const index = parseInt(url.searchParams.get("index") || "-1");

  const game = await env.GAME_STATE.get(gameId, "json") as GameState | null;
  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 400 });
  }

  const player = game.players.find(p => p.id === playerId);
  if (!player) {
    return Response.json({ error: "Player not found" }, { status: 400 });
  }

  if (game.gameOver) {
    return Response.json({ error: "Game over" }, { status: 400 });
  }

  if (player.symbol !== game.turn) {
    return Response.json({ error: "Not your turn" }, { status: 400 });
  }

  if (index < 0 || index > 8 || game.board[index] !== null) {
    return Response.json({ error: "Invalid move" }, { status: 400 });
  }

  game.board[index] = player.symbol;
  game.turn = player.symbol === "X" ? "O" : "X";

  const winner = checkWinner(game.board);
  if (winner) {
    game.winner = winner;
    game.gameOver = true;
  } else if (!game.board.includes(null)) {
    game.winner = "draw";
    game.gameOver = true;
  }

  await saveGame(gameId, game, env);
  return Response.json({ state: sanitizeState(game) });
}

async function handleReset(request: Request, url: URL, env: Env): Promise<Response> {
  const gameId = url.searchParams.get("game") || "default";
  const playerId = url.searchParams.get("playerId") || "";

  const game = await env.GAME_STATE.get(gameId, "json") as GameState | null;
  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 400 });
  }

  const player = game.players.find(p => p.id === playerId);
  if (!player) {
    return Response.json({ error: "Player not found" }, { status: 400 });
  }

  // Check if game is over (winner or draw)
  if (!game.gameOver) {
    return Response.json({ error: "Game not over" }, { status: 400 });
  }

  // Check if a rematch is already in progress
  if (game.rematchInProgress) {
    return Response.json({ error: "Rematch already in progress" }, { status: 400 });
  }

  const isDraw = game.winner === "draw";
  const isWinner = game.winner === player.symbol;

  // Only winner or either player on draw can take action
  if (!isWinner && !isDraw) {
    return Response.json({ error: "Only winner or players in draw can start new game" }, { status: 400 });
  }

  // Mark as rematch in progress to prevent double-processing
  game.rematchInProgress = true;
  await saveGame(gameId, game, env);

  // Check if this is a queue request or rematch
  const action = url.searchParams.get("action") || "rematch";

  // Check queue for next opponents
  const queue = await getQueue(env);

  // If 2+ in queue and action is queue, match first 2 to start their own game
  if (action === "queue" && queue.length >= 2) {
    const player1Id = queue.shift()!;
    const player2Id = queue.shift()!;
    await env.GAME_STATE.put(QUEUE_KEY, JSON.stringify(queue));

    // Create new game for the queued players
    const newGameId = crypto.randomUUID().slice(0, 8);
    const newGame: GameState = {
      players: [
        { id: player1Id, symbol: "X" },
        { id: player2Id, symbol: "O" },
      ],
      board: Array(9).fill(null),
      turn: "X",
      winner: null,
      gameOver: false,
      lastUpdate: Date.now(),
    };
    await env.GAME_STATE.put(newGameId, JSON.stringify(newGame));

    // Register matches so players can find this game
    await setPlayerMatch(env, player1Id, newGameId);
    await setPlayerMatch(env, player2Id, newGameId);
    await removeQueuedPlayer(env, player1Id);
    await removeQueuedPlayer(env, player2Id);

    // Restart current game for winner with remaining player (if any)
    const remainingPlayers = game.players.filter(p => p.symbol !== game.winner);
    if (remainingPlayers.length > 0) {
      const loser = remainingPlayers[0];
      game.board = Array(9).fill(null);
      game.turn = "X";
      game.winner = null;
      game.gameOver = false;
      game.rematchInProgress = false;
      await saveGame(gameId, game, env);
    } else {
      // No remaining player, delete the old game
      await env.GAME_STATE.delete(gameId);
    }

    return Response.json({
      state: sanitizeState(game),
      newGameId: gameId,
      message: "Queue matched 2 players! Your game restarted.",
    });
  }

  // If only 1 in queue, match winner with that player
  if (queue.length === 1) {
    const nextPlayerId = queue.shift()!;
    await env.GAME_STATE.put(QUEUE_KEY, JSON.stringify(queue));

    // Clear old game and create new one with winner + queued player
    const winner = game.players.find(p => p.symbol === game.winner)!;
    
    // Create new game
    const newGame: GameState = {
      players: [
        { id: winner.id, symbol: "X" },
        { id: nextPlayerId, symbol: "O" },
      ],
      board: Array(9).fill(null),
      turn: "X",
      winner: null,
      gameOver: false,
      lastUpdate: Date.now(),
    };
    
    // Save new game
    const newGameId = crypto.randomUUID().slice(0, 8);
    await env.GAME_STATE.put(newGameId, JSON.stringify(newGame));
    
    // Clear the old game
    await env.GAME_STATE.delete(gameId);

    // Register match so queued player can find this game
    await setPlayerMatch(env, nextPlayerId, newGameId);
    await removeQueuedPlayer(env, nextPlayerId);

    return Response.json({
      state: sanitizeState(newGame),
      newGameId: newGameId,
      message: "Matched with queued player!",
    });
  }

  // No queue available - handle based on action
  if (action === "queue") {
    return Response.json({
      state: sanitizeState(game),
      message: "No players in queue. Use Rematch to play again!",
    });
  }

  // Default: rematch - restart with current players (randomize who starts)
  const rematchStarter = Math.random() > 0.5 ? "X" : "O";
  const players = game.players.map(p => ({
    id: p.id,
    symbol: p.id === playerId ? rematchStarter : (rematchStarter === "X" ? "O" : "X")
  }));
  
  game.players = players;
  game.board = Array(9).fill(null);
  game.turn = "X";
  game.winner = null;
  game.gameOver = false;
  game.rematchInProgress = false;
  await saveGame(gameId, game, env);

  return Response.json({
    state: sanitizeState(game),
    newGameId: gameId,
    message: "Rematch! " + rematchStarter + " starts",
  });
}

async function handleQueue(request: Request, url: URL, env: Env): Promise<Response> {
  const playerId = url.searchParams.get("playerId") || "";

  if (!playerId) {
    return Response.json({ error: "Player ID required" }, { status: 400 });
  }

  await addToQueue(env, playerId);
  const queue = await getQueue(env);

  return Response.json({
    inQueue: true,
    queuePosition: queue.indexOf(playerId) + 1,
    queueLength: queue.length,
  });
}

async function handleLeaveQueue(request: Request, url: URL, env: Env): Promise<Response> {
  const playerId = url.searchParams.get("playerId") || "";

  if (!playerId) {
    return Response.json({ error: "Player ID required" }, { status: 400 });
  }

  await removeFromQueue(env, playerId);

  return Response.json({
    inQueue: false,
    message: "Left queue",
  });
}

async function handleClearQueue(env: Env): Promise<Response> {
  await env.GAME_STATE.delete(QUEUE_KEY);
  await env.GAME_STATE.delete(QUEUED_PLAYERS_KEY);
  await env.GAME_STATE.delete(MATCHES_KEY);
  return Response.json({
    success: true,
    message: "Queue cleared",
  });
}

async function handleResetAll(env: Env): Promise<Response> {
  await env.GAME_STATE.delete(QUEUE_KEY);
  await env.GAME_STATE.delete(QUEUED_PLAYERS_KEY);
  await env.GAME_STATE.delete(MATCHES_KEY);
  await env.GAME_STATE.delete("default");
  return Response.json({
    success: true,
    message: "All cleared",
  });
}

function sanitizeState(game: GameState) {
  return {
    players: game.players.map(p => ({ id: p.id, symbol: p.symbol })),
    board: game.board,
    turn: game.turn,
    winner: game.winner,
    gameOver: game.gameOver,
  };
}

function checkWinner(board: (string | null)[]): string | null {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function getHTML(origin: string): string {
  const workerUrl = origin.startsWith("http") ? origin : `https://${origin}`;
  const apiBase = workerUrl;
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
    .board { display: grid; grid-template-columns: repeat(3, 100px); gap: 10px; margin-bottom: 20px; }
    .cell {
      width: 100px; height: 100px; background: #0f3460; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 3rem; font-weight: bold; cursor: pointer; transition: all 0.2s;
    }
    .cell:hover:not(.taken) { background: #1a4a7a; }
    .cell.taken { cursor: not-allowed; }
    .cell.winner { background: #00d26a; }
    .cell.X { color: #00d4ff; }
    .cell.O { color: #ff6b6b; }
    .controls { display: flex; gap: 10px; margin-bottom: 20px; }
    button { padding: 12px 24px; font-size: 1rem; border: none; border-radius: 8px; cursor: pointer; }
    .btn-reset { background: #e94560; color: white; }
    .btn-reset:hover { background: #ff6b8a; }
    .btn-queue { background: #00d26a; color: white; }
    .btn-queue:hover { background: #00f57a; }
    .btn-leave { background: #666; color: white; }
    .info { margin-top: 20px; color: #888; font-size: 0.9rem; }
    .error { color: #e94560; margin-bottom: 10px; }
    .queue-status { color: #00d26a; font-size: 1.1rem; margin-bottom: 15px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <h1>Tic-Tac-Toe</h1>
  <div class="error" id="error"></div>
  <div class="queue-status hidden" id="queueStatus"></div>
  <div class="status" id="status">Connecting...</div>
  <div class="board" id="board"></div>
  <div class="controls">
    <button class="btn-reset hidden" id="resetBtn">Rematch</button>
    <button class="btn-queue hidden" id="queueBtn">Find New Match</button>
    <button class="btn-leave hidden" id="leaveBtn">Leave Queue</button>
  </div>
  <div class="info">You are: <span id="mySymbol">-</span></div>

  <script>
    const API_BASE = '${apiBase}';
    const GAME_ID = 'default';
    let myPlayerId = null;
    let mySymbol = null;
    let lastUpdate = 0;
    let inQueue = false;
    let gameState = { board: Array(9).fill(null), turn: 'X', winner: null, gameOver: false };
    let currentGameId = GAME_ID;

    const boardEl = document.getElementById('board');
    const statusEl = document.getElementById('status');
    const mySymbolEl = document.getElementById('mySymbol');
    const errorEl = document.getElementById('error');
    const queueStatusEl = document.getElementById('queueStatus');
    const resetBtn = document.getElementById('resetBtn');
    const queueBtn = document.getElementById('queueBtn');
    const leaveBtn = document.getElementById('leaveBtn');

    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = i;
      cell.addEventListener('click', () => makeMove(i));
      boardEl.appendChild(cell);
    }

    async function join() {
      try {
        const resp = await fetch(API_BASE + '/api/join?game=' + currentGameId + (myPlayerId ? '&playerId=' + myPlayerId : ''));
        const data = await resp.json();
        
        if (data.error) { errorEl.textContent = data.error; return; }
        
        if (data.inQueue) {
          inQueue = true;
          myPlayerId = data.playerId;
          updateQueueUI(data.queuePosition);
          setInterval(poll, 1000);
          return;
        }

        inQueue = false;
        myPlayerId = data.playerId;
        mySymbol = data.symbol;
        mySymbolEl.textContent = data.symbol;
        gameState = data.state;
        lastUpdate = Date.now();
        updateGameUI();
        setInterval(poll, 1000);
      } catch (e) { 
        errorEl.textContent = 'Connection failed. Retrying...'; 
        setTimeout(join, 2000); 
      }
    }

    async function poll() {
      try {
        const resp = await fetch(API_BASE + '/api/poll?game=' + currentGameId + '&playerId=' + myPlayerId + '&since=' + lastUpdate);
        const data = await resp.json();
        
        if (data.inQueue) {
          inQueue = true;
          updateQueueUI(data.queuePosition);
          return;
        }

        if (data.state) {
          // Check if new game started
          if (data.newGameId && data.newGameId !== currentGameId) {
            currentGameId = data.newGameId;
            if (data.message) errorEl.textContent = data.message;
          }
          gameState = data.state;
          
          // Update mySymbol if player list changed (e.g., after rematch)
          const me = gameState.players.find(p => p.id === myPlayerId);
          if (me) {
            mySymbol = me.symbol;
            mySymbolEl.textContent = mySymbol;
          }
          
          lastUpdate = Date.now();
          updateGameUI();
        }
      } catch (e) { console.error('Poll error:', e); }
    }

    async function makeMove(index) {
      if (gameState.board[index] || gameState.gameOver || gameState.turn !== mySymbol) return;
      try {
        const resp = await fetch(API_BASE + '/api/move?game=' + currentGameId + '&playerId=' + myPlayerId + '&index=' + index);
        const data = await resp.json();
        if (data.error) errorEl.textContent = data.error;
      } catch (e) { console.error('Move error:', e); }
    }

    async function reset() {
      try { 
        // Default: rematch
        const resp = await fetch(API_BASE + '/api/reset?game=' + currentGameId + '&playerId=' + myPlayerId + '&action=rematch');
        const data = await resp.json();
        if (data.error) { errorEl.textContent = data.error; return; }
        if (data.newGameId) {
          currentGameId = data.newGameId;
        }
        if (data.message) errorEl.textContent = data.message;
        poll();
      } catch (e) { console.error('Reset error:', e); }
    }

    async function joinQueue() {
      try {
        // Call reset with action=queue to find a new match
        const resp = await fetch(API_BASE + '/api/reset?game=' + currentGameId + '&playerId=' + myPlayerId + '&action=queue');
        const data = await resp.json();
        if (data.error) { errorEl.textContent = data.error; return; }
        if (data.newGameId && data.newGameId !== currentGameId) {
          currentGameId = data.newGameId;
        }
        if (data.message) errorEl.textContent = data.message;
        poll();
      } catch (e) { console.error('Queue error:', e); }
    }

    async function leaveQueue() {
      try {
        await fetch(API_BASE + '/api/leave-queue?playerId=' + myPlayerId);
        inQueue = false;
        join();
      } catch (e) { console.error('Leave queue error:', e); }
    }

    function updateGameUI() {
      // Show/hide buttons based on game state
      // Both rematch and queue buttons show when game is over (winner or draw)
      const showButtons = gameState.gameOver;
      resetBtn.classList.toggle('hidden', !showButtons);
      queueBtn.classList.toggle('hidden', !showButtons);
      leaveBtn.classList.add('hidden');

      // Render board
      const cells = document.querySelectorAll('.cell');
      cells.forEach((cell, i) => {
        const val = gameState.board[i];
        cell.textContent = val || '';
        cell.className = 'cell' + (val ? ' taken ' + val : '');
        cell.classList.toggle('winner', gameState.winner && gameState.board[i] === gameState.winner);
      });
      
      errorEl.textContent = '';
      
      if (gameState.gameOver) {
        if (gameState.winner === 'draw') statusEl.textContent = "It's a draw!";
        else if (gameState.winner === mySymbol) statusEl.textContent = '🎉 You win!';
        else if (gameState.winner) statusEl.textContent = gameState.winner + ' wins!';
      } else {
        statusEl.textContent = gameState.turn === mySymbol ? 'Your turn' : 'Waiting for ' + gameState.turn + '...';
      }
    }

    function updateQueueUI(position) {
      queueStatusEl.classList.remove('hidden');
      queueStatusEl.textContent = 'In queue... Position: ' + position;
      boardEl.classList.add('hidden');
      resetBtn.classList.add('hidden');
      queueBtn.classList.add('hidden');
      leaveBtn.classList.remove('hidden');
      statusEl.textContent = 'Waiting for opponent...';
    }

    resetBtn.addEventListener('click', reset);
    queueBtn.addEventListener('click', joinQueue);
    leaveBtn.addEventListener('click', leaveQueue);
    join();
  </script>
</body>
</html>`;
}

interface Env {
  GAME_STATE: KVNamespace;
}
