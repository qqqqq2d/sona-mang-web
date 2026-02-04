"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LobbyManager = void 0;
const uuid_1 = require("uuid");
const protocol_1 = require("../../shared/protocol");
const game_session_1 = require("./game-session");
class LobbyManager {
    constructor() {
        this.games = new Map();
        this.clients = new Map();
    }
    registerClient(ws) {
        const playerId = (0, uuid_1.v4)();
        this.clients.set(ws, {
            ws,
            playerId,
            gameId: null,
        });
        return playerId;
    }
    unregisterClient(ws) {
        const client = this.clients.get(ws);
        if (!client)
            return;
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
    getClientInfo(ws) {
        return this.clients.get(ws);
    }
    createGame(ws, hostName, gameName) {
        const client = this.clients.get(ws);
        if (!client)
            return null;
        // Create new game
        const gameId = (0, uuid_1.v4)().slice(0, 8); // Short ID
        const game = new game_session_1.GameSession(gameId, gameName, client.playerId);
        // Add host as first player
        const player = game.addPlayer(client.playerId, hostName, ws);
        if (!player)
            return null;
        client.gameId = gameId;
        this.games.set(gameId, game);
        console.log(`Game "${gameName}" (${gameId}) created by ${hostName}`);
        return game;
    }
    joinGame(ws, gameId, playerName) {
        const client = this.clients.get(ws);
        if (!client) {
            return { success: false, reason: 'Not registered' };
        }
        const game = this.games.get(gameId);
        if (!game) {
            return { success: false, reason: 'Game not found' };
        }
        if (game.phase !== protocol_1.GamePhase.LOBBY && game.phase !== protocol_1.GamePhase.GAME_OVER) {
            return { success: false, reason: 'Game already started' };
        }
        if (game.playerCount >= protocol_1.MAX_PLAYERS) {
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
    leaveGame(ws) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId)
            return;
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
    getGame(gameId) {
        return this.games.get(gameId);
    }
    getGameForClient(ws) {
        const client = this.clients.get(ws);
        if (!client || !client.gameId)
            return undefined;
        return this.games.get(client.gameId);
    }
    listGames() {
        const gameList = [];
        for (const game of this.games.values()) {
            // Only show games in lobby or game over phase that can be joined
            if (game.phase !== protocol_1.GamePhase.LOBBY && game.phase !== protocol_1.GamePhase.GAME_OVER)
                continue;
            const players = game.getPlayersInfo();
            const host = players.find(p => p.isHost);
            gameList.push({
                id: game.id,
                name: game.name,
                hostName: host?.name || 'Unknown',
                playerCount: game.playerCount,
                maxPlayers: protocol_1.MAX_PLAYERS,
                phase: game.phase,
            });
        }
        return gameList;
    }
    startGame(ws) {
        const game = this.getGameForClient(ws);
        if (!game)
            return false;
        const client = this.clients.get(ws);
        if (!client)
            return false;
        // Only host can start
        if (!game.isHost(client.playerId))
            return false;
        return game.startGame();
    }
}
exports.LobbyManager = LobbyManager;
//# sourceMappingURL=lobby-manager.js.map