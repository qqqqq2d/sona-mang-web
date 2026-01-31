import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  MessageType,
  GamePhase,
  GameInfo,
  MAX_PLAYERS,
} from '../../shared/protocol';
import { GameSession } from './game-session';
import { sendMessage } from './messages';

interface ClientInfo {
  ws: WebSocket;
  playerId: string;
  gameId: string | null;
}

export class LobbyManager {
  private games: Map<string, GameSession> = new Map();
  private clients: Map<WebSocket, ClientInfo> = new Map();

  registerClient(ws: WebSocket): string {
    const playerId = uuidv4();
    this.clients.set(ws, {
      ws,
      playerId,
      gameId: null,
    });
    return playerId;
  }

  unregisterClient(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (!client) return;

    // Remove from game if in one
    if (client.gameId) {
      const game = this.games.get(client.gameId);
      if (game) {
        game.removePlayer(client.playerId);

        // Clean up empty games
        if (game.isEmpty()) {
          game.cleanup();
          this.games.delete(client.gameId);
          console.log(`Game ${game.name} (${client.gameId}) removed - empty`);
        }
      }
    }

    this.clients.delete(ws);
  }

  getClientInfo(ws: WebSocket): ClientInfo | undefined {
    return this.clients.get(ws);
  }

  createGame(ws: WebSocket, hostName: string, gameName: string): GameSession | null {
    const client = this.clients.get(ws);
    if (!client) return null;

    // Create new game
    const gameId = uuidv4().slice(0, 8); // Short ID
    const game = new GameSession(gameId, gameName, client.playerId);

    // Add host as first player
    const player = game.addPlayer(client.playerId, hostName, ws);
    if (!player) return null;

    client.gameId = gameId;
    this.games.set(gameId, game);

    console.log(`Game "${gameName}" (${gameId}) created by ${hostName}`);
    return game;
  }

  joinGame(ws: WebSocket, gameId: string, playerName: string): { success: boolean; reason?: string } {
    const client = this.clients.get(ws);
    if (!client) {
      return { success: false, reason: 'Not registered' };
    }

    const game = this.games.get(gameId);
    if (!game) {
      return { success: false, reason: 'Game not found' };
    }

    if (game.phase !== GamePhase.LOBBY) {
      return { success: false, reason: 'Game already started' };
    }

    if (game.playerCount >= MAX_PLAYERS) {
      return { success: false, reason: 'Game is full' };
    }

    const player = game.addPlayer(client.playerId, playerName, ws);
    if (!player) {
      return { success: false, reason: 'Failed to join' };
    }

    client.gameId = gameId;
    console.log(`${playerName} joined game ${game.name} (${gameId})`);
    return { success: true };
  }

  leaveGame(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (!client || !client.gameId) return;

    const game = this.games.get(client.gameId);
    if (game) {
      game.removePlayer(client.playerId);

      if (game.isEmpty()) {
        game.cleanup();
        this.games.delete(client.gameId);
        console.log(`Game ${game.name} (${client.gameId}) removed - empty`);
      }
    }

    client.gameId = null;
  }

  getGame(gameId: string): GameSession | undefined {
    return this.games.get(gameId);
  }

  getGameForClient(ws: WebSocket): GameSession | undefined {
    const client = this.clients.get(ws);
    if (!client || !client.gameId) return undefined;
    return this.games.get(client.gameId);
  }

  listGames(): GameInfo[] {
    const gameList: GameInfo[] = [];

    for (const game of this.games.values()) {
      // Only show games in lobby phase that can be joined
      if (game.phase !== GamePhase.LOBBY) continue;

      const players = game.getPlayersInfo();
      const host = players.find(p => p.isHost);

      gameList.push({
        id: game.id,
        name: game.name,
        hostName: host?.name || 'Unknown',
        playerCount: game.playerCount,
        maxPlayers: MAX_PLAYERS,
        phase: game.phase,
      });
    }

    return gameList;
  }

  startGame(ws: WebSocket): boolean {
    const game = this.getGameForClient(ws);
    if (!game) return false;

    const client = this.clients.get(ws);
    if (!client) return false;

    // Only host can start
    if (!game.isHost(client.playerId)) return false;

    return game.startGame();
  }
}
