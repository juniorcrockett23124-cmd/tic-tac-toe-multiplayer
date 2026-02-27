// ============================================================================
// MULTIPLAYER TIC-TAC-TOE - Cloudflare Workers + KV Storage + WebSocket
// ============================================================================

interface Player {
  id: string;
  symbol: string;
  username?: string;
  clientId?: string;
}

interface GameState {
  players: Player[];
  board: (string | null)[];
  turn: string;
  winner: string | null;
  gameOver: boolean;
  lastUpdate: number;
  rematchInProgress?: boolean;
  lastStarter?: string;
}

interface Session {
  clientId: string;
  username: string;
  playerId: string;
  symbol: string | null;
  gameId: string | null;
  inQueue: boolean;
  connected: boolean;
}

interface Client {
  id: string;
  session: Session;
  ws: WebSocket;
}

// Cloudflare Workers Environment binding
interface Env {
  GAME_STATE: KVNamespace;
}

const QUEUE_KEY = "matchmaking_queue";
const SESSIONS_KEY = "active_sessions";

// In-memory client tracking (for WebSocket connections)
const clients = new Map<string, Client>();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      return handleWebSocket(request, env);
    }

    // Serve HTML for root
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(getHTML(), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ============================================================================
// HTML TEMPLATE - Inlined for deployment
// ============================================================================
function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Multiplayer Tic-Tac-Toe</title>
  <script>window.WORKER_URL = 'https://tic-tac-toe-v3.juniorcrockett23124-cmd.workers.dev';</script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #fff; padding: 20px; }
    h1 { margin-bottom: 10px; }
    .status { margin-bottom: 20px; font-size: 1.2rem; }
    .board { display: grid; grid-template-columns: repeat(3, 100px); gap: 10px; margin-bottom: 20px; }
    .cell { width: 100px; height: 100px; background: #0f3460; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 3rem; font-weight: bold; cursor: pointer; transition: all 0.2s; }
    .cell:hover:not(.taken) { background: #1a4a7a; }
    .cell.taken { cursor: not-allowed; }
    .cell.winner { background: #00d26a; }
    .cell.X { color: #00d4ff; }
    .cell.O { color: #ff6b6b; }
    .controls { display: flex; gap: 10px; margin-bottom: 15px; }
    button { padding: 12px 24px; font-size: 1rem; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
    .btn-primary { background: #00d4ff; color: #1a1a2e; }
    .btn-primary:hover { background: #00b8e6; }
    .btn-secondary { background: #4a5568; color: white; }
    .btn-reset { background: #e94560; color: white; }
    .info { margin-top: 20px; color: #888; font-size: 0.9rem; }
    .connected { color: #00d26a; }
    .disconnected { color: #e94560; }
    .reconnecting { color: #f6e05e; }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-overlay.hidden { display: none; }
    .modal { background: #1a1a2e; padding: 30px; border-radius: 15px; text-align: center; max-width: 400px; width: 90%; }
    .modal h2 { margin-bottom: 20px; }
    .modal input { width: 100%; padding: 12px; font-size: 1rem; border: 2px solid #0f3460; border-radius: 8px; background: #0f3460; color: white; margin-bottom: 15px; }
    .modal input:focus { outline: none; border-color: #00d4ff; }
    .modal .error { color: #e94560; font-size: 0.9rem; margin-bottom: 10px; }
    .modal .error.hidden { display: none; }
    .stats-panel { position: fixed; top: 20px; right: 20px; background: #0f3460; padding: 15px; border-radius: 10px; font-size: 0.9rem; text-align: left; }
    .stats-panel h3 { margin-bottom: 10px; font-size: 1rem; }
    .stats-panel .stat { margin: 5px 0; }
    .stats-panel .wins { color: #00d26a; }
    .stats-panel .losses { color: #e94560; }
    .stats-panel .ties { color: #f6e05e; }
    .screen { display: none; }
    .screen.active { display: block; }
    .connection-banner { position: fixed; top: 0; left: 0; right: 0; padding: 10px; text-align: center; font-weight: bold; }
    .connection-banner.connecting { background: #f6e05e; color: #1a1a2e; }
    .connection-banner.disconnected { background: #e94560; color: white; }
    .connection-banner.hidden { display: none; }
    .players-info { margin: 15px 0; padding: 10px; background: #0f3460; border-radius: 8px; }
    .players-info .player { margin: 5px 0; }
    .players-info .player .symbol { font-weight: bold; margin-right: 10px; }
    .players-info .player.X .symbol { color: #00d4ff; }
    .players-info .player.O .symbol { color: #ff6b6b; }
    .turn-indicator { padding: 10px 20px; border-radius: 20px; margin-bottom: 15px; font-weight: bold; }
    .turn-indicator.my-turn { background: #00d26a; color: #1a1a2e; }
    .turn-indicator.their-turn { background: #4a5568; }
    .result-banner { padding: 20px; border-radius: 10px; margin-bottom: 20px; font-size: 1.5rem; font-weight: bold; }
    .result-banner.win { background: #00d26a; color: #1a1a2e; }
    .result-banner.lose { background: #e94560; }
    .result-banner.draw { background: #f6e05e; color: #1a1a2e; }
    .result-banner.hidden { display: none; }
    @media (max-width: 400px) { .board { grid-template-columns: repeat(3, 80px); } .cell { width: 80px; height: 80px; font-size: 2.5rem; } }
  </style>
</head>
<body>
  <div class="connection-banner connecting hidden" id="connectionBanner">Connecting...</div>
  <div class="stats-panel" id="statsPanel" style="display: none;">
    <h3>📊 Your Stats</h3>
    <div class="stat wins">Wins: <span id="statWins">0</span></div>
    <div class="stat losses">Losses: <span id="statLosses">0</span></div>
    <div class="stat ties">Ties: <span id="statTies">0</span></div>
    <div class="stat">Games: <span id="statGames">0</span></div>
    <div class="stat" style="margin-top: 10px;"><button id="resetStatsBtn" style="padding: 5px 10px; font-size: 0.7rem; background: #4a5568; color: white; border: none; border-radius: 4px; cursor: pointer;">Reset</button></div>
  </div>
  <div class="modal-overlay hidden" id="usernameModal">
    <div class="modal">
      <h2>👋 Welcome!</h2>
      <p style="margin-bottom: 15px; color: #888;">Enter your username to play</p>
      <div class="error hidden" id="usernameError"></div>
      <input type="text" id="usernameInput" placeholder="Username" maxlength="20" autocomplete="off">
      <button class="btn-primary" id="usernameSubmit" style="width: 100%;">Let's Play!</button>
    </div>
  </div>
  <div class="screen screen-loading active" id="loadingScreen">
    <h1>Tic-Tac-Toe</h1>
    <p class="status">Connecting to server...</p>
  </div>
  <div class="screen screen-lobby" id="lobbyScreen">
    <h1>Tic-Tac-Toe</h1>
    <p style="margin-bottom: 20px;">Hello, <span id="lobbyUsername" style="color: #00d4ff; font-weight: bold;">Player</span>!</p>
    <div class="controls"><button class="btn-primary" id="findMatchBtn">Find Match</button></div>
    <p id="queueStatus" style="color: #888; margin-top: 10px;"></p>
  </div>
  <div class="screen screen-game" id="gameScreen">
    <h1>Tic-Tac-Toe</h1>
    <div class="players-info" id="playersInfo">
      <div class="player X"><span class="symbol">X:</span><span class="name">Waiting...</span></div>
      <div class="player O"><span class="symbol">O:</span><span class="name">Waiting...</span></div>
    </div>
    <div class="turn-indicator their-turn" id="turnIndicator">Waiting for opponent...</div>
    <div class="result-banner hidden" id="resultBanner"></div>
    <div class="board" id="board"></div>
    <div class="controls">
      <button class="btn-secondary" id="rematchBtn" style="display: none;">Rematch</button>
      <button class="btn-secondary" id="findNewBtn" style="display: none;">Find New Game</button>
      <button class="btn-reset" id="leaveBtn">Leave Game</button>
    </div>
  </div>
  <div class="info">
    <span id="connectionStatus" class="disconnected">Disconnected</span> | You are: <span id="mySymbol">-</span>
  </div>
  <script>
    const Storage = { KEYS: { CLIENT_ID: 'ttt_clientId', USERNAME: 'ttt_username', STATS: 'ttt_stats' }, getClientId() { let clientId = localStorage.getItem(this.KEYS.CLIENT_ID); if (!clientId) { clientId = 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem(this.KEYS.CLIENT_ID, clientId); } return clientId; }, getUsername() { return localStorage.getItem(this.KEYS.USERNAME) || null; }, setUsername(name) { const trimmed = name.trim().slice(0, 20); if (trimmed.length < 1) return false; localStorage.setItem(this.KEYS.USERNAME, trimmed); return true; }, clearUsername() { localStorage.removeItem(this.KEYS.USERNAME); }, getStats() { const stats = localStorage.getItem(this.KEYS.STATS); if (stats) return JSON.parse(stats); return { wins: 0, losses: 0, ties: 0, games: 0 }; }, updateStats(result) { const stats = this.getStats(); stats.games++; if (result === 'win') stats.wins++; else if (result === 'loss') stats.losses++; else if (result === 'tie') stats.ties++; localStorage.setItem(this.KEYS.STATS, JSON.stringify(stats)); this.renderStats(); }, resetStats() { localStorage.setItem(this.KEYS.STATS, JSON.stringify({ wins: 0, losses: 0, ties: 0, games: 0 })); this.renderStats(); }, renderStats() { const stats = this.getStats(); document.getElementById('statWins').textContent = stats.wins; document.getElementById('statLosses').textContent = stats.losses; document.getElementById('statTies').textContent = stats.ties; document.getElementById('statGames').textContent = stats.games; } };
    const AppState = { screen: 'loading', connection: 'disconnected', clientId: null, username: null, playerId: null, symbol: null, gameState: null, inQueue: false, queuePosition: 0, lastGameResult: null, elements: {}, init() { this.clientId = Storage.getClientId(); this.username = Storage.getUsername(); this.cacheElements(); Storage.renderStats(); }, cacheElements() { this.elements = { connectionBanner: document.getElementById('connectionBanner'), connectionStatus: document.getElementById('connectionStatus'), usernameModal: document.getElementById('usernameModal'), usernameInput: document.getElementById('usernameInput'), usernameError: document.getElementById('usernameError'), usernameSubmit: document.getElementById('usernameSubmit'), loadingScreen: document.getElementById('loadingScreen'), lobbyScreen: document.getElementById('lobbyScreen'), gameScreen: document.getElementById('gameScreen'), lobbyUsername: document.getElementById('lobbyUsername'), findMatchBtn: document.getElementById('findMatchBtn'), queueStatus: document.getElementById('queueStatus'), playersInfo: document.getElementById('playersInfo'), turnIndicator: document.getElementById('turnIndicator'), resultBanner: document.getElementById('resultBanner'), board: document.getElementById('board'), rematchBtn: document.getElementById('rematchBtn'), findNewBtn: document.getElementById('findNewBtn'), leaveBtn: document.getElementById('leaveBtn'), mySymbol: document.getElementById('mySymbol'), statsPanel: document.getElementById('statsPanel'), resetStatsBtn: document.getElementById('resetStatsBtn') }; }, showScreen(screenName) { this.screen = screenName; this.elements.loadingScreen.classList.remove('active'); this.elements.lobbyScreen.classList.remove('active'); this.elements.gameScreen.classList.remove('active'); if (screenName === 'loading') this.elements.loadingScreen.classList.add('active'); else if (screenName === 'lobby') this.elements.lobbyScreen.classList.add('active'); else if (screenName === 'game') this.elements.gameScreen.classList.add('active'); this.elements.statsPanel.style.display = (screenName === 'lobby' || screenName === 'game') ? 'block' : 'none'; }, setConnection(status) { this.connection = status; this.elements.connectionBanner.classList.remove('hidden', 'connecting', 'disconnected'); this.elements.connectionStatus.classList.remove('connected', 'disconnected', 'reconnecting'); if (status === 'connecting') { this.elements.connectionBanner.classList.add('connecting'); this.elements.connectionBanner.textContent = 'Connecting...'; this.elements.connectionStatus.textContent = 'Connecting...'; this.elements.connectionStatus.classList.add('reconnecting'); } else if (status === 'connected') { this.elements.connectionBanner.classList.add('hidden'); this.elements.connectionStatus.textContent = 'Connected'; this.elements.connectionStatus.classList.add('connected'); } else { this.elements.connectionBanner.classList.add('disconnected'); this.elements.connectionBanner.textContent = 'Disconnected - Reconnecting...'; this.elements.connectionStatus.textContent = 'Disconnected'; this.elements.connectionStatus.classList.add('disconnected'); } }, updateLobby() { this.elements.lobbyUsername.textContent = this.username || 'Player'; if (this.inQueue) { this.elements.findMatchBtn.textContent = 'Cancel'; this.elements.queueStatus.textContent = 'In queue... Position: #' + this.queuePosition; } else { this.elements.findMatchBtn.textContent = 'Find Match'; this.elements.queueStatus.textContent = ''; } }, updateGame() { if (!this.gameState) return; const { board, turn, winner, gameOver, players } = this.gameState; const playerX = players?.find(p => p.symbol === 'X'); const playerO = players?.find(p => p.symbol === 'O'); this.elements.playersInfo.innerHTML = '<div class="player X"><span class="symbol">X:</span><span class="name">' + (playerX?.username || (playerX?.id === this.playerId ? (this.username || 'You') : 'Waiting...')) + '</span></div><div class="player O"><span class="symbol">O:</span><span class="name">' + (playerO?.username || (playerO?.id === this.playerId ? (this.username || 'You') : 'Waiting...')) + '</span></div>'; const isMyTurn = turn === this.symbol; this.elements.turnIndicator.classList.remove('my-turn', 'their-turn'); if (!gameOver) { this.elements.turnIndicator.classList.add(isMyTurn ? 'my-turn' : 'their-turn'); this.elements.turnIndicator.textContent = isMyTurn ? '🎯 Your turn!' : 'Waiting for ' + turn + '...'; } if (gameOver) { this.elements.resultBanner.classList.remove('hidden', 'win', 'lose', 'draw'); if (winner === 'draw') { this.elements.resultBanner.classList.add('draw'); this.elements.resultBanner.textContent = "🤝 It's a draw!"; if (this.lastGameResult !== 'tie') { this.lastGameResult = 'tie'; Storage.updateStats('tie'); } } else if (winner === this.symbol) { this.elements.resultBanner.classList.add('win'); this.elements.resultBanner.textContent = '🎉 You win!'; if (this.lastGameResult !== 'win') { this.lastGameResult = 'win'; Storage.updateStats('win'); } } else { this.elements.resultBanner.classList.add('lose'); this.elements.resultBanner.textContent = '💀 You lose!'; if (this.lastGameResult !== 'loss') { this.lastGameResult = 'loss'; Storage.updateStats('loss'); } } this.elements.rematchBtn.style.display = 'inline-block'; this.elements.findNewBtn.style.display = 'inline-block'; } else { this.elements.resultBanner.classList.add('hidden'); this.elements.rematchBtn.style.display = 'none'; this.elements.findNewBtn.style.display = 'none'; this.lastGameResult = null; } const cells = this.elements.board.querySelectorAll('.cell'); cells.forEach((cell, i) => { const val = board[i]; cell.textContent = val || ''; cell.className = 'cell' + (val ? ' taken ' + val : ''); cell.classList.toggle('winner', winner && board[i] === winner); }); this.elements.mySymbol.textContent = this.symbol || '-'; } };
    let ws = null, reconnectAttempts = 0, MAX_RECONNECT_ATTEMPTS = 10, RECONNECT_BASE_DELAY = 1000;
    function getWorkerUrl() { return window.WORKER_URL || location.origin; }
    function connect() { AppState.setConnection('connecting'); const wsUrl = getWorkerUrl().replace(/^http/, 'ws') + '/ws?clientId=' + AppState.clientId; console.log('Connecting to:', wsUrl); ws = new WebSocket(wsUrl); ws.onopen = () => { console.log('WebSocket connected'); reconnectAttempts = 0; AppState.setConnection('connected'); send({ type: 'handshake', clientId: AppState.clientId, username: AppState.username }); }; ws.onmessage = (event) => { const data = JSON.parse(event.data); handleMessage(data); }; ws.onclose = () => { console.log('WebSocket closed'); AppState.setConnection('disconnected'); attemptReconnect(); }; ws.onerror = (error) => { console.error('WebSocket error:', error); }; }
    function attemptReconnect() { if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) { console.log('Max reconnect attempts reached'); return; } reconnectAttempts++; const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1), 30000); console.log('Reconnecting in ' + delay + 'ms (attempt ' + reconnectAttempts + ')'); setTimeout(connect, delay); }
    function send(message) { if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(message)); } }
    function handleMessage(data) { console.log('Received:', data.type, data); switch (data.type) { case 'welcome': AppState.playerId = data.playerId; AppState.symbol = data.symbol; AppState.gameState = data.state; AppState.inQueue = data.inQueue || false; if (AppState.inQueue) { AppState.showScreen('lobby'); AppState.updateLobby(); } else if (AppState.gameState) { AppState.showScreen('game'); AppState.updateGame(); } else { AppState.showScreen('lobby'); AppState.updateLobby(); } break; case 'state': AppState.gameState = { ...data, players: AppState.gameState?.players || [] }; AppState.updateGame(); break; case 'queue_update': AppState.inQueue = data.inQueue; AppState.queuePosition = data.position || 0; AppState.updateLobby(); break; case 'game_start': AppState.symbol = data.symbol; AppState.gameState = data.state; AppState.inQueue = false; AppState.showScreen('game'); AppState.updateGame(); break; case 'match_ended': if (AppState.gameState) { AppState.gameState.gameOver = true; AppState.gameState.winner = data.winner; AppState.updateGame(); } break; case 'error': console.error('Server error:', data.message); alert(data.message); break; case 'username_required': AppState.showScreen('loading'); showUsernameModal(); break; case 'username_accepted': AppState.username = data.username; Storage.setUsername(data.username); AppState.updateLobby(); break; case 'opponent_left': case 'opponent_disconnected': alert(data.message); break; } }
    function showUsernameModal() { AppState.elements.usernameModal.classList.remove('hidden'); AppState.elements.usernameInput.value = AppState.username || ''; AppState.elements.usernameInput.focus(); }
    function hideUsernameModal() { AppState.elements.usernameModal.classList.add('hidden'); }
    function submitUsername() { const username = AppState.elements.usernameInput.value.trim(); const errorEl = AppState.elements.usernameError; if (username.length < 1) { errorEl.textContent = 'Username is required'; errorEl.classList.remove('hidden'); return; } if (username.length > 20) { errorEl.textContent = 'Username must be 20 characters or less'; errorEl.classList.remove('hidden'); return; } const profanity = ['fuck', 'shit', 'ass', 'damn', 'bitch', 'crap']; if (profanity.some(word => username.toLowerCase().includes(word))) { errorEl.textContent = 'Please choose a family-friendly username'; errorEl.classList.remove('hidden'); return; } errorEl.classList.add('hidden'); AppState.username = username; Storage.setUsername(username); hideUsernameModal(); send({ type: 'set_username', username: username, clientId: AppState.clientId }); AppState.showScreen('lobby'); AppState.updateLobby(); }
    function findMatch() { if (AppState.inQueue) { send({ type: 'leave_queue', clientId: AppState.clientId }); AppState.inQueue = false; AppState.updateLobby(); } else { send({ type: 'find_match', clientId: AppState.clientId, username: AppState.username }); AppState.inQueue = true; AppState.queuePosition = 0; AppState.updateLobby(); } }
    function makeMove(index) { if (!AppState.gameState || AppState.gameState.gameOver) return; if (AppState.gameState.turn !== AppState.symbol) return; if (AppState.gameState.board[index]) return; send({ type: 'move', index: index, clientId: AppState.clientId }); }
    function rematch() { send({ type: 'rematch', clientId: AppState.clientId }); }
    function findNewGame() { AppState.gameState = null; AppState.symbol = null; AppState.lastGameResult = null; send({ type: 'find_match', clientId: AppState.clientId, username: AppState.username }); AppState.inQueue = true; AppState.queuePosition = 0; AppState.updateLobby(); AppState.showScreen('lobby'); }
    function leaveGame() { send({ type: 'leave_game', clientId: AppState.clientId }); AppState.gameState = null; AppState.symbol = null; AppState.lastGameResult = null; AppState.showScreen('lobby'); AppState.updateLobby(); }
    function init() { AppState.init(); for (let i = 0; i < 9; i++) { const cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.index = i; cell.addEventListener('click', () => makeMove(i)); AppState.elements.board.appendChild(cell); } AppState.elements.usernameSubmit.addEventListener('click', submitUsername); AppState.elements.usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitUsername(); }); AppState.elements.findMatchBtn.addEventListener('click', findMatch); AppState.elements.rematchBtn.addEventListener('click', rematch); AppState.elements.findNewBtn.addEventListener('click', findNewGame); AppState.elements.leaveBtn.addEventListener('click', leaveGame); AppState.elements.resetStatsBtn.addEventListener('click', () => { if (confirm('Reset all stats?')) Storage.resetStats(); }); if (!AppState.username) { showUsernameModal(); AppState.showScreen('loading'); } else { AppState.showScreen('lobby'); AppState.updateLobby(); } connect(); }
    init();
  </script>
</body>
</html>`;
}

// ============================================================================
// WEBSOCKET HANDLER
// ============================================================================
async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId") || crypto.randomUUID();
  
  // Create WebSocket pair
  const pair = new WebSocketPair();
  const clientWs = pair[1];
  const serverWs = pair[0];

  // Create session for this client
  const session: Session = {
    clientId,
    username: "",
    playerId: "",
    symbol: null,
    gameId: null,
    inQueue: false,
    connected: true,
  };

  // Try to restore existing session
  const existingSession = await getSession(env, clientId);
  if (existingSession) {
    session.username = existingSession.username;
    session.playerId = existingSession.playerId;
    session.symbol = existingSession.symbol;
    session.gameId = existingSession.gameId;
    session.inQueue = existingSession.inQueue;
    
    // Check if game still exists
    if (session.gameId) {
      const game = await getGame(session.gameId, env);
      if (game?.gameOver) {
        session.gameId = null;
        session.symbol = null;
      }
    }
  }

  // Register client
  const client: Client = {
    id: clientId,
    session,
    ws: clientWs,
  };
  clients.set(clientId, client);

  // Handle messages
  clientWs.addEventListener("message", async (event) => {
    try {
      const data = JSON.parse(event.data as string);
      await handleClientMessage(client, data, env);
    } catch (e) {
      console.error("Error handling message:", e);
    }
  });

  // Handle close
  clientWs.addEventListener("close", async () => {
    console.log(`Client ${clientId} disconnected`);
    clients.delete(clientId);
    session.connected = false;
    await saveSession(env, clientId, session);
    
    // Notify opponent
    if (session.gameId) {
      const game = await getGame(session.gameId, env);
      if (game) {
        const opponentClientId = game.players.find(p => p.clientId !== clientId)?.clientId;
        if (opponentClientId && clients.has(opponentClientId)) {
          clients.get(opponentClientId)!.ws.send(JSON.stringify({
            type: "opponent_disconnected",
            message: "Opponent disconnected. Waiting for reconnect...",
          }));
        }
      }
    }
  });

  // Send welcome
  clientWs.send(JSON.stringify({
    type: "welcome",
    playerId: session.playerId,
    symbol: session.symbol,
    state: session.gameId ? await getGameState(session.gameId, env) : null,
    inQueue: session.inQueue,
    username: session.username,
    resumed: !!existingSession,
  }));

  return new Response(null, { status: 101, webSocket: serverWs });
}

async function handleClientMessage(client: Client, data: any, env: Env) {
  const { session, ws } = client;
  
  switch (data.type) {
    case "handshake":
      if (data.clientId) session.clientId = data.clientId;
      if (data.username && !session.username) {
        session.username = data.username;
        await saveSession(env, session.clientId, session);
      }
      break;
      
    case "set_username":
      session.username = (data.username || "").slice(0, 20).trim();
      if (session.username.length < 1) {
        ws.send(JSON.stringify({ type: "error", message: "Username required" }));
        return;
      }
      await saveSession(env, session.clientId, session);
      ws.send(JSON.stringify({ type: "username_accepted", username: session.username }));
      break;
      
    case "find_match":
      session.username = session.username || data.username || "Anonymous";
      await findMatchForClient(client, env);
      break;
      
    case "leave_queue":
      await leaveQueue(client, env);
      break;
      
    case "move":
      if (session.gameId) await processMove(client, data.index, env);
      break;
      
    case "rematch":
      if (session.gameId) await requestRematch(client, env);
      break;
      
    case "leave_game":
      await leaveGame(client, env);
      break;
      
    case "accept_rematch":
      if (session.gameId) await startRematch(client, env);
      break;
      
    case "decline_rematch":
      if (session.gameId) await declineRematch(client, env);
      break;
  }
}

// ============================================================================
// MATCHMAKING
// ============================================================================
async function findMatchForClient(client: Client, env: Env) {
  const { session, ws } = client;
  const queue = await getQueue(env);

  // Remove self from queue first (avoid duplicates)
  const filteredQueue = queue.filter(id => id !== session.clientId);

  if (filteredQueue.length > 0) {
    const opponentClientId = filteredQueue[0];

    // Create game
    const gameId =
      "game_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);

    const game: GameState = {
      players: [
        {
          id: generatePlayerId(),
          symbol: "X",
          clientId: opponentClientId,
        },
        {
          id: generatePlayerId(),
          symbol: "O",
          clientId: session.clientId,
        },
      ],
      board: Array(9).fill(null),
      turn: "X",
      winner: null,
      gameOver: false,
      lastUpdate: Date.now(),
    };

    await saveGame(gameId, game, env);

    // Update sessions in KV
    const opponentSession = await getSession(env, opponentClientId);

    if (opponentSession) {
      opponentSession.gameId = gameId;
      opponentSession.symbol = "X";
      opponentSession.inQueue = false;
      await saveSession(env, opponentClientId, opponentSession);
    }

    session.gameId = gameId;
    session.symbol = "O";
    session.inQueue = false;
    await saveSession(env, session.clientId, session);

    // Remove opponent from queue
    await removeFromQueue(env, opponentClientId);

    // Notify current player
    ws.send(
      JSON.stringify({
        type: "game_start",
        symbol: "O",
        state: await getGameState(gameId, env),
      })
    );

    // If opponent is connected on THIS isolate, notify
    const opponentClient = clients.get(opponentClientId);
    if (opponentClient) {
      opponentClient.ws.send(
        JSON.stringify({
          type: "game_start",
          symbol: "X",
          state: await getGameState(gameId, env),
        })
      );
    }

  } else {
    // No opponent → add to queue
    await addToQueue(env, session.clientId);
    session.inQueue = true;
    await saveSession(env, session.clientId, session);

    ws.send(
      JSON.stringify({
        type: "queue_update",
        inQueue: true,
        position: (await getQueue(env)).indexOf(session.clientId) + 1,
      })
    );
  }
}

async function leaveQueue(client: Client, env: Env) {
  const { session, ws } = client;
  await removeFromQueue(env, session.clientId);
  session.inQueue = false;
  await saveSession(env, session.clientId, session);
  
  ws.send(JSON.stringify({
    type: "queue_update",
    inQueue: false,
    position: 0,
  }));
}

// ============================================================================
// GAME LOGIC
// ============================================================================
async function processMove(client: Client, index: number, env: Env) {
  const { session, ws } = client;
  if (!session.gameId) return;
  
  const game = await getGame(session.gameId, env);
  if (!game) return;
  
  const player = game.players.find(p => p.clientId === session.clientId);
  if (!player) return;
  
  if (game.gameOver) return;
  if (player.symbol !== game.turn) return;
  if (index < 0 || index > 8 || game.board[index] !== null) return;
  
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
  
  await saveGame(session.gameId, game, env);
  await broadcastGameState(session.gameId, env);
}

async function requestRematch(client: Client, env: Env) {
  const { session, ws } = client;
  if (!session.gameId) return;
  
  const game = await getGame(session.gameId, env);
  if (!game || !game.gameOver) return;
  
  const opponentClientId = game.players.find(p => p.clientId !== session.clientId)?.clientId;
  const opponentClient = opponentClientId ? clients.get(opponentClientId) : null;
  
  if (opponentClient) {
    opponentClient.ws.send(JSON.stringify({
      type: "rematch_request",
      from: session.username,
    }));
  }
  
  ws.send(JSON.stringify({
    type: "rematch_pending",
    message: "Waiting for opponent...",
  }));
}

async function startRematch(client: Client, env: Env) {
  const { session, ws } = client;
  if (!session.gameId) return;
  
  const game = await getGame(session.gameId, env);
  if (!game || !game.gameOver) return;
  
  const opponentClientId = game.players.find(p => p.clientId !== session.clientId)?.clientId;
  
  // Create new game
  const newGameId = "game_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  const newGame: GameState = {
    players: [
      { id: game.players[0].id, symbol: "O", clientId: game.players[0].clientId, username: game.players[0].username },
      { id: game.players[1].id, symbol: "X", clientId: game.players[1].clientId, username: game.players[1].username },
    ],
    board: Array(9).fill(null),
    turn: "X",
    winner: null,
    gameOver: false,
    lastUpdate: Date.now(),
  };
  
  await saveGame(newGameId, newGame, env);
  
  // Update sessions
  session.gameId = newGameId;
  await saveSession(env, session.clientId, session);
  
  // Notify both players
  ws.send(JSON.stringify({
    type: "game_start",
    symbol: session.symbol === "X" ? "O" : "X",
    state: await getGameState(newGameId, env),
  }));
  
  if (opponentClientId && clients.has(opponentClientId)) {
    const opponent = clients.get(opponentClientId)!;
    opponent.session.gameId = newGameId;
    await saveSession(env, opponent.session.clientId, opponent.session);
    opponent.ws.send(JSON.stringify({
      type: "game_start",
      symbol: opponent.session.symbol === "X" ? "O" : "X",
      state: await getGameState(newGameId, env),
    }));
  }
}

async function declineRematch(client: Client, env: Env) {
  const { session, ws } = client;
  if (!session.gameId) return;
  
  const game = await getGame(session.gameId, env);
  if (!game) return;
  
  const opponentClientId = game.players.find(p => p.clientId !== session.clientId)?.clientId;
  
  session.gameId = null;
  session.symbol = null;
  await saveSession(env, session.clientId, session);
  
  ws.send(JSON.stringify({
    type: "left_game",
    state: null,
  }));
  
  if (opponentClientId && clients.has(opponentClientId)) {
    const opponent = clients.get(opponentClientId)!;
    opponent.session.gameId = null;
    opponent.session.symbol = null;
    await saveSession(env, opponent.session.clientId, opponent.session);
    opponent.ws.send(JSON.stringify({
      type: "left_game",
      state: null,
    }));
  }
}

async function leaveGame(client: Client, env: Env) {
  const { session, ws } = client;
  
  if (session.gameId) {
    const game = await getGame(session.gameId, env);
    if (game) {
      const opponentClientId = game.players.find(p => p.clientId !== session.clientId)?.clientId;
      if (opponentClientId && clients.has(opponentClientId)) {
        clients.get(opponentClientId)!.ws.send(JSON.stringify({
          type: "opponent_left",
          message: "Opponent left the game",
        }));
      }
    }
  }
  
  session.gameId = null;
  session.symbol = null;
  session.inQueue = false;
  await saveSession(env, session.clientId, session);
  
  ws.send(JSON.stringify({
    type: "left_game",
    state: null,
  }));
}

async function broadcastGameState(gameId: string, env: Env) {
  const game = await getGame(gameId, env);
  if (!game) return;
  
  const state = await getGameState(gameId, env);
  
  for (const player of game.players) {
    if (player.clientId && clients.has(player.clientId)) {
      clients.get(player.clientId)!.ws.send(JSON.stringify({
        type: "state",
        ...state,
      }));
    }
  }
  
  if (game.gameOver) {
    for (const player of game.players) {
      if (player.clientId && clients.has(player.clientId)) {
        clients.get(player.clientId)!.ws.send(JSON.stringify({
          type: "match_ended",
          winner: game.winner,
        }));
      }
    }
  }
}

function checkWinner(board: (string | null)[]): string | null {
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

// ============================================================================
// STORAGE HELPERS
// ============================================================================
async function getGame(gameId: string, env: Env): Promise<GameState | null> {
  return await env.GAME_STATE.get(gameId, "json") as GameState | null;
}

async function saveGame(gameId: string, game: GameState, env: Env) {
  game.lastUpdate = Date.now();
  await env.GAME_STATE.put(gameId, JSON.stringify(game));
}

async function getGameState(gameId: string, env: Env) {
  const game = await getGame(gameId, env);
  if (!game) return null;
  
  return {
    board: game.board,
    turn: game.turn,
    winner: game.winner,
    gameOver: game.gameOver,
    players: game.players.map(p => ({
      id: p.id,
      symbol: p.symbol,
      username: p.username,
    })),
  };
}

async function getQueue(env: Env): Promise<string[]> {
  const queue = await env.GAME_STATE.get("matchmaking_queue", "json");
  return queue || [];
}

async function addToQueue(env: Env, clientId: string) {
  const queue = await getQueue(env);
  if (!queue.includes(clientId)) {
    queue.push(clientId);
    await env.GAME_STATE.put("matchmaking_queue", JSON.stringify(queue));
  }
}

async function removeFromQueue(env: Env, clientId: string) {
  const queue = await getQueue(env);
  const newQueue = queue.filter(id => id !== clientId);
  await env.GAME_STATE.put("matchmaking_queue", JSON.stringify(newQueue));
}

async function getSession(env: Env, clientId: string): Promise<Session | null> {
  const sessions = await env.GAME_STATE.get("active_sessions", "json") as Record<string, Session> | null;
  return sessions?.[clientId] || null;
}

async function saveSession(env: Env, clientId: string, session: Session) {
  const sessions = (await env.GAME_STATE.get("active_sessions", "json")) as Record<string, Session> || {};
  sessions[clientId] = session;
  await env.GAME_STATE.put("active_sessions", JSON.stringify(sessions));
}

function generatePlayerId(): string {
  return "p_" + Math.random().toString(36).slice(2, 10);
}
