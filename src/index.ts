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

    return new Response("Not Found", { status: 404 });
  },
};

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
  
  const waitingClientId = queue.find(id => id !== session.clientId);
  
  if (waitingClientId && clients.has(waitingClientId)) {
    const opponentClient = clients.get(waitingClientId)!;
    
    const gameId = "game_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    const game: GameState = {
      players: [
        { id: opponentClient.session.playerId || generatePlayerId(), symbol: "X", clientId: waitingClientId, username: opponentClient.session.username },
        { id: session.playerId || generatePlayerId(), symbol: "O", clientId: session.clientId, username: session.username },
      ],
      board: Array(9).fill(null),
      turn: "X",
      winner: null,
      gameOver: false,
      lastUpdate: Date.now(),
    };
    
    if (!session.playerId) session.playerId = game.players[1].id;
    if (!opponentClient.session.playerId) opponentClient.session.playerId = game.players[0].id;
    
    await saveGame(gameId, game, env);
    
    session.gameId = gameId;
    session.inQueue = false;
    session.symbol = "O";
    opponentClient.session.gameId = gameId;
    opponentClient.session.inQueue = false;
    opponentClient.session.symbol = "X";
    
    await removeFromQueue(env, waitingClientId);
    await saveSession(env, session.clientId, session);
    await saveSession(env, opponentClient.session.clientId, opponentClient.session);
    
    ws.send(JSON.stringify({
      type: "game_start",
      symbol: "O",
      state: await getGameState(gameId, env),
    }));
    
    opponentClient.ws.send(JSON.stringify({
      type: "game_start",
      symbol: "X",
      state: await getGameState(gameId, env),
    }));
    
  } else {
    await addToQueue(env, session.clientId);
    session.inQueue = true;
    await saveSession(env, session.clientId, session);
    
    ws.send(JSON.stringify({
      type: "queue_update",
      inQueue: true,
      position: (await getQueue(env)).indexOf(session.clientId) + 1,
    }));
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
