import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage, GameState, Player } from '../types/game';

const WS_URL = (import.meta as any).env?.VITE_WS_URL || 'wss://tic-tac-toe-v4.dcagent.workers.dev/websocket';

interface UseWebSocketReturn {
  connected: boolean;
  gameState: GameState | null;
  playerId: string | null;
  currentPlayer: Player | null;
  isInQueue: boolean;
  queuePosition: number;
  connect: (username: string) => void;
  disconnect: () => void;
  sendMove: (position: number) => void;
  requestNextGame: () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const ws = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usernameRef = useRef<string>('');

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback((username: string) => {
    usernameRef.current = username;
    disconnect();

    const websocket = new WebSocket(WS_URL);
    ws.current = websocket;

    websocket.onopen = () => {
      setConnected(true);
      // Send join message
      websocket.send(JSON.stringify({
        type: 'join',
        username,
      }));

      // Start ping interval
      pingIntervalRef.current = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    websocket.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    websocket.onclose = () => {
      setConnected(false);
      // Attempt reconnection after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        if (usernameRef.current) {
          connect(usernameRef.current);
        }
      }, 3000);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [disconnect]);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'joined':
        setPlayerId(message.playerId);
        break;
      case 'game_state':
        setGameState(message.state);
        if (message.yourPlayerId) {
          setPlayerId(message.yourPlayerId);
        }
        break;
      case 'error':
        console.error('Server error:', message.message);
        break;
      case 'pong':
        // Connection is alive
        break;
    }
  }, []);

  const sendMove = useCallback((position: number) => {
    if (ws.current?.readyState === WebSocket.OPEN && playerId) {
      ws.current.send(JSON.stringify({
        type: 'move',
        position,
      }));
    }
  }, [playerId]);

  const requestNextGame = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'next_game',
      }));
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const currentPlayer = gameState?.players.find(p => p?.id === playerId) || null;
  const isInQueue = gameState?.queue.some(p => p.id === playerId) ?? false;
  const queuePosition = gameState?.queue.findIndex(p => p.id === playerId) ?? -1;

  return {
    connected,
    gameState,
    playerId,
    currentPlayer,
    isInQueue,
    queuePosition: queuePosition >= 0 ? queuePosition + 1 : 0,
    connect,
    disconnect,
    sendMove,
    requestNextGame,
  };
}
