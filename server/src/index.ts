import { WebSocketServer, WebSocket } from 'ws';
import {
  MessageType,
  ClientMessage,
  GamePhase,
} from '../../shared/protocol';
import { LobbyManager } from './lobby-manager';
import { loadWordList, loadComboList } from './game-logic';
import { parseMessage, sendMessage } from './messages';

const PORT = parseInt(process.env.PORT || '8080', 10);

// Initialize word lists
console.log('Loading word lists...');
if (!loadWordList('sonad4.txt')) {
  console.error('Failed to load word list. Exiting.');
  process.exit(1);
}
if (!loadComboList('kombinatsioonid4.txt')) {
  console.error('Failed to load combo list. Exiting.');
  process.exit(1);
}

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });
const lobbyManager = new LobbyManager();

console.log(`Sona Mang server listening on port ${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  const playerId = lobbyManager.registerClient(ws);
  console.log(`Client connected: ${playerId}`);

  ws.on('message', (data: Buffer) => {
    const message = parseMessage(data.toString());
    if (!message) {
      sendMessage(ws, { type: MessageType.ERROR, message: 'Invalid message' });
      return;
    }

    handleMessage(ws, message);
  });

  ws.on('close', () => {
    const client = lobbyManager.getClientInfo(ws);
    console.log(`Client disconnected: ${client?.playerId}`);
    lobbyManager.unregisterClient(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function handleMessage(ws: WebSocket, message: ClientMessage): void {
  const client = lobbyManager.getClientInfo(ws);
  if (!client) {
    sendMessage(ws, { type: MessageType.ERROR, message: 'Not registered' });
    return;
  }

  switch (message.type) {
    case MessageType.LIST_GAMES:
      handleListGames(ws);
      break;

    case MessageType.CREATE_GAME:
      handleCreateGame(ws, message.hostName, message.gameName);
      break;

    case MessageType.JOIN_REQUEST:
      handleJoinRequest(ws, message.gameId, message.playerName);
      break;

    case MessageType.PLAYER_READY:
      handlePlayerReady(ws, message.ready);
      break;

    case MessageType.START_GAME_REQUEST:
      handleStartGame(ws);
      break;

    case MessageType.RETURN_TO_LOBBY:
      handleReturnToLobby(ws);
      break;

    case MessageType.TURN_INPUT:
      handleTurnInput(ws, message.input);
      break;

    case MessageType.TURN_SUBMIT:
      handleTurnSubmit(ws, message.word);
      break;

    case MessageType.PING:
      sendMessage(ws, { type: MessageType.PONG });
      break;

    default:
      console.log('Unknown message type:', (message as { type: string }).type);
  }
}

function handleListGames(ws: WebSocket): void {
  const games = lobbyManager.listGames();
  sendMessage(ws, {
    type: MessageType.GAMES_LIST,
    games,
  });
}

function handleCreateGame(ws: WebSocket, hostName: string, gameName: string): void {
  const game = lobbyManager.createGame(ws, hostName, gameName);
  if (!game) {
    sendMessage(ws, {
      type: MessageType.JOIN_REJECT,
      reason: 'Failed to create game',
    });
    return;
  }

  const client = lobbyManager.getClientInfo(ws);
  if (!client) return;

  sendMessage(ws, {
    type: MessageType.JOIN_ACCEPT,
    playerId: client.playerId,
    gameId: game.id,
  });

  sendMessage(ws, {
    type: MessageType.PLAYER_LIST,
    players: game.getPlayersInfo(),
    hostId: game.hostId,
  });
}

function handleJoinRequest(ws: WebSocket, gameId: string, playerName: string): void {
  const result = lobbyManager.joinGame(ws, gameId, playerName);

  if (!result.success) {
    sendMessage(ws, {
      type: MessageType.JOIN_REJECT,
      reason: result.reason || 'Failed to join',
    });
    return;
  }

  const client = lobbyManager.getClientInfo(ws);
  const game = lobbyManager.getGame(gameId);
  if (!client || !game) return;

  sendMessage(ws, {
    type: MessageType.JOIN_ACCEPT,
    playerId: client.playerId,
    gameId: game.id,
  });

  // Broadcast updated player list to all players in game
  const players = game.getPlayersInfo();
  for (const player of game.getPlayersInfo()) {
    const playerData = game.getPlayer(player.id);
    if (playerData) {
      sendMessage(playerData.ws, {
        type: MessageType.PLAYER_LIST,
        players,
        hostId: game.hostId,
      });
    }
  }
}

function handlePlayerReady(ws: WebSocket, ready: boolean): void {
  const client = lobbyManager.getClientInfo(ws);
  if (!client || !client.gameId) return;

  const game = lobbyManager.getGame(client.gameId);
  if (!game) return;

  game.setPlayerReady(client.playerId, ready);
}

function handleStartGame(ws: WebSocket): void {
  const client = lobbyManager.getClientInfo(ws);
  if (!client || !client.gameId) return;

  const game = lobbyManager.getGame(client.gameId);
  if (!game) return;

  // Only host can start
  if (!game.isHost(client.playerId)) return;

  if (game.canStartGame()) {
    game.startGame();
  }
}

function handleReturnToLobby(ws: WebSocket): void {
  const client = lobbyManager.getClientInfo(ws);
  if (!client || !client.gameId) return;

  const game = lobbyManager.getGame(client.gameId);
  if (!game) return;

  // Only allow returning to lobby from GAME_OVER phase
  if (game.phase !== GamePhase.GAME_OVER) return;

  game.returnToLobby();
}

function handleTurnInput(ws: WebSocket, input: string): void {
  const client = lobbyManager.getClientInfo(ws);
  if (!client || !client.gameId) return;

  const game = lobbyManager.getGame(client.gameId);
  if (!game) return;

  game.handleTurnInput(client.playerId, input);
}

function handleTurnSubmit(ws: WebSocket, word: string): void {
  const client = lobbyManager.getClientInfo(ws);
  if (!client || !client.gameId) return;

  const game = lobbyManager.getGame(client.gameId);
  if (!game) return;

  game.handleTurnSubmit(client.playerId, word);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
