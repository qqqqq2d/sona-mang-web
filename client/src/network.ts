import {
  MessageType,
  ClientMessage,
  ServerMessage,
  TurnResult,
  PlayerState,
  DEFAULT_LIVES,
} from './protocol';
import { GameState, ClientPhase, resetGameState } from './state';
import { blurHiddenInput, focusHiddenInput } from './input';

type MessageHandler = (state: GameState, message: ServerMessage) => void;

let ws: WebSocket | null = null;
let messageHandlers: Map<MessageType, MessageHandler> = new Map();
let onConnectCallback: (() => void) | null = null;
let onDisconnectCallback: (() => void) | null = null;
let currentState: GameState | null = null;
let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
const MAX_RETRIES = 3;
const CONNECTION_TIMEOUT_MS = 5000;

export function connect(
  address: string,
  onConnect?: () => void,
  onDisconnect?: () => void
): void {
  if (ws) {
    ws.close();
  }

  if (connectionTimeout) {
    clearTimeout(connectionTimeout);
    connectionTimeout = null;
  }

  onConnectCallback = onConnect || null;
  onDisconnectCallback = onDisconnect || null;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = address.startsWith('ws') ? address : `${protocol}//${address}`;

  console.log(`Connecting to: ${url} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
  ws = new WebSocket(url);

  // Set connection timeout
  connectionTimeout = setTimeout(() => {
    if (ws && ws.readyState === WebSocket.CONNECTING) {
      console.log('Connection timeout, closing...');
      ws.close();
    }
  }, CONNECTION_TIMEOUT_MS);

  ws.onopen = () => {
    console.log('Connected to server');
    retryCount = 0;
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
    if (onConnectCallback) onConnectCallback();
  };

  ws.onclose = () => {
    console.log('Disconnected from server');
    ws = null;
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }

    // Retry if we haven't exceeded max retries
    if (retryCount < MAX_RETRIES && onConnectCallback) {
      retryCount++;
      console.log(`Retrying connection in 1 second...`);
      setTimeout(() => {
        connect(address, onConnectCallback!, onDisconnectCallback!);
      }, 1000);
    } else {
      retryCount = 0;
      if (onDisconnectCallback) onDisconnectCallback();
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    // Close will be called after error, which triggers retry logic
  };

  ws.onmessage = (event) => {
    if (!currentState) return;
    try {
      const message = JSON.parse(event.data) as ServerMessage;
      handleMessage(currentState, message);
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  };
}

export function disconnect(): void {
  // Clear callbacks to prevent any pending connection from changing state
  onConnectCallback = null;
  onDisconnectCallback = null;
  retryCount = 0;
  if (connectionTimeout) {
    clearTimeout(connectionTimeout);
    connectionTimeout = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

export function sendMessage(message: ClientMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function processMessages(state: GameState): void {
  // Store the state reference so the message handler can use it
  currentState = state;
}

function handleMessage(state: GameState, message: ServerMessage): void {
  switch (message.type) {
    case MessageType.JOIN_ACCEPT:
      state.playerId = message.playerId;
      state.gameId = message.gameId;
      state.phase = ClientPhase.LOBBY_WAITING;
      break;

    case MessageType.JOIN_REJECT:
      console.error('Join rejected:', message.reason);
      state.phase = ClientPhase.LOBBY_JOIN;
      break;

    case MessageType.GAMES_LIST:
      state.gamesList = message.games;
      break;

    case MessageType.PLAYER_LIST:
      state.players = message.players;
      state.hostId = message.hostId;
      state.isHost = message.hostId === state.playerId;
      break;

    case MessageType.PLAYER_LEFT:
      state.players = state.players.filter(p => p.id !== message.playerId);
      break;

    case MessageType.GAME_START:
      state.currentTurnPlayerId = message.firstPlayerId;
      state.turnDuration = message.turnDuration;
      state.turnTimer = message.turnDuration;
      state.currentCombo = message.combo;
      state.localInput = '';

      // Set all ready players to ALIVE and reset lives
      for (const p of state.players) {
        if (p.state === PlayerState.READY) {
          p.state = PlayerState.ALIVE;
          p.lives = DEFAULT_LIVES;
          p.score = 0;
        }
      }

      // Determine if playing or spectating
      if (state.currentTurnPlayerId === state.playerId) {
        state.phase = ClientPhase.PLAYING;
        focusHiddenInput();
      } else {
        state.phase = ClientPhase.SPECTATING;
        blurHiddenInput();
      }
      break;

    case MessageType.NEW_COMBO:
      state.currentCombo = message.combo;
      break;

    case MessageType.TURN_START:
      state.currentTurnPlayerId = message.playerId;
      state.turnTimer = message.duration;

      // Switch between playing and spectating
      const local = state.players.find(p => p.id === state.playerId);
      if (local && local.state === PlayerState.ALIVE) {
        if (message.playerId === state.playerId) {
          state.phase = ClientPhase.PLAYING;
          focusHiddenInput();
        } else {
          state.phase = ClientPhase.SPECTATING;
          blurHiddenInput();
        }
      }
      break;

    case MessageType.TURN_INPUT:
      // Update other player's input
      const player = state.players.find(p => p.id === message.playerId);
      if (player) {
        player.currentInput = message.input;
      }
      break;

    case MessageType.TURN_RESULT:
      handleTurnResult(state, message);
      break;

    case MessageType.PLAYER_UPDATE:
      const updatedPlayer = state.players.find(p => p.id === message.playerId);
      if (updatedPlayer) {
        updatedPlayer.lives = message.lives;
        updatedPlayer.score = message.score;
        updatedPlayer.state = message.state;
      }
      break;

    case MessageType.PLAYER_ELIMINATED:
      const eliminated = state.players.find(p => p.id === message.playerId);
      if (eliminated) {
        eliminated.state = PlayerState.ELIMINATED;
      }
      break;

    case MessageType.GAME_OVER:
      state.phase = ClientPhase.GAME_OVER;
      state.failedCombos = message.failedCombos || [];
      state.showFailedCombos = false;
      blurHiddenInput();
      break;

    case MessageType.PONG:
      // Ping/pong for keepalive
      break;

    case MessageType.ERROR:
      console.error('Server error:', message.message);
      break;
  }
}

function handleTurnResult(
  state: GameState,
  message: { playerId: string; result: TurnResult; nextPlayerId: string; newCombo: string; remainingTime?: number }
): void {
  switch (message.result) {
    case TurnResult.CORRECT:
      state.correctAnswerFlash = true;
      state.correctAnswerOpacity = 0.15;
      state.pendingCorrectSound = true;
      state.localInput = '';
      break;

    case TurnResult.WRONG:
    case TurnResult.ALREADY_USED:
      state.wrongAnswerFlash = true;
      state.wrongAnswerOpacity = 0;
      state.wrongAnswerOpacityUp = true;
      state.pendingWrongSound = true;
      // Sync timer with server's remaining time
      if (message.remainingTime !== undefined) {
        state.turnTimer = message.remainingTime;
      }
      // Don't clear input on wrong answer
      return;

    case TurnResult.TIMEOUT:
      // Only show flash and play sound if it was the local player who timed out (matching SDL3)
      if (message.playerId === state.playerId) {
        state.timeoutFlash = true;
        state.timeoutOpacity = 0;
        state.timeoutOpacityUp = true;
        state.pendingWrongSound = true; // SDL3 plays wrongSound on timeout
      }
      state.localInput = '';
      break;
  }

  // Only update turn state when the turn actually changes (CORRECT or TIMEOUT)
  state.currentCombo = message.newCombo;
  state.currentTurnPlayerId = message.nextPlayerId;
  state.turnTimer = state.turnDuration;

  // Update phase based on whose turn it is
  const localPlayer = state.players.find(p => p.id === state.playerId);
  if (localPlayer && localPlayer.state === PlayerState.ALIVE && state.phase !== ClientPhase.GAME_OVER) {
    if (message.nextPlayerId === state.playerId) {
      state.phase = ClientPhase.PLAYING;
      focusHiddenInput();
    } else {
      state.phase = ClientPhase.SPECTATING;
      blurHiddenInput();
    }
  }
}

// API functions
export function createGame(hostName: string, gameName: string): void {
  sendMessage({
    type: MessageType.CREATE_GAME,
    hostName,
    gameName,
  });
}

export function joinGame(gameId: string, playerName: string): void {
  sendMessage({
    type: MessageType.JOIN_REQUEST,
    gameId,
    playerName,
  });
}

export function listGames(): void {
  sendMessage({
    type: MessageType.LIST_GAMES,
  });
}

export function setReady(ready: boolean): void {
  sendMessage({
    type: MessageType.PLAYER_READY,
    ready,
  });
}

export function startGame(): void {
  console.log('network.startGame() called');
  sendMessage({
    type: MessageType.START_GAME_REQUEST,
  });
}

export function sendInput(input: string): void {
  sendMessage({
    type: MessageType.TURN_INPUT,
    input,
  });
}

export function submitWord(word: string): void {
  sendMessage({
    type: MessageType.TURN_SUBMIT,
    word,
  });
}

export function ping(): void {
  sendMessage({
    type: MessageType.PING,
  });
}
