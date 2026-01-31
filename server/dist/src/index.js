"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const protocol_1 = require("../../shared/protocol");
const lobby_manager_1 = require("./lobby-manager");
const game_logic_1 = require("./game-logic");
const messages_1 = require("./messages");
const PORT = parseInt(process.env.PORT || '8080', 10);
// Initialize word lists
console.log('Loading word lists...');
if (!(0, game_logic_1.loadWordList)('sonad4.txt')) {
    console.error('Failed to load word list. Exiting.');
    process.exit(1);
}
if (!(0, game_logic_1.loadComboList)('kombinatsioonid4.txt')) {
    console.error('Failed to load combo list. Exiting.');
    process.exit(1);
}
// Create WebSocket server
const wss = new ws_1.WebSocketServer({ port: PORT });
const lobbyManager = new lobby_manager_1.LobbyManager();
console.log(`Sona Mang server listening on port ${PORT}`);
wss.on('connection', (ws) => {
    const playerId = lobbyManager.registerClient(ws);
    console.log(`Client connected: ${playerId}`);
    ws.on('message', (data) => {
        const message = (0, messages_1.parseMessage)(data.toString());
        if (!message) {
            (0, messages_1.sendMessage)(ws, { type: protocol_1.MessageType.ERROR, message: 'Invalid message' });
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
function handleMessage(ws, message) {
    const client = lobbyManager.getClientInfo(ws);
    if (!client) {
        (0, messages_1.sendMessage)(ws, { type: protocol_1.MessageType.ERROR, message: 'Not registered' });
        return;
    }
    switch (message.type) {
        case protocol_1.MessageType.LIST_GAMES:
            handleListGames(ws);
            break;
        case protocol_1.MessageType.CREATE_GAME:
            handleCreateGame(ws, message.hostName, message.gameName);
            break;
        case protocol_1.MessageType.JOIN_REQUEST:
            handleJoinRequest(ws, message.gameId, message.playerName);
            break;
        case protocol_1.MessageType.PLAYER_READY:
            handlePlayerReady(ws, message.ready);
            break;
        case protocol_1.MessageType.TURN_INPUT:
            handleTurnInput(ws, message.input);
            break;
        case protocol_1.MessageType.TURN_SUBMIT:
            handleTurnSubmit(ws, message.word);
            break;
        case protocol_1.MessageType.PING:
            (0, messages_1.sendMessage)(ws, { type: protocol_1.MessageType.PONG });
            break;
        default:
            console.log('Unknown message type:', message.type);
    }
}
function handleListGames(ws) {
    const games = lobbyManager.listGames();
    (0, messages_1.sendMessage)(ws, {
        type: protocol_1.MessageType.GAMES_LIST,
        games,
    });
}
function handleCreateGame(ws, hostName, gameName) {
    const game = lobbyManager.createGame(ws, hostName, gameName);
    if (!game) {
        (0, messages_1.sendMessage)(ws, {
            type: protocol_1.MessageType.JOIN_REJECT,
            reason: 'Failed to create game',
        });
        return;
    }
    const client = lobbyManager.getClientInfo(ws);
    if (!client)
        return;
    (0, messages_1.sendMessage)(ws, {
        type: protocol_1.MessageType.JOIN_ACCEPT,
        playerId: client.playerId,
        gameId: game.id,
    });
    (0, messages_1.sendMessage)(ws, {
        type: protocol_1.MessageType.PLAYER_LIST,
        players: game.getPlayersInfo(),
        hostId: game.hostId,
    });
}
function handleJoinRequest(ws, gameId, playerName) {
    const result = lobbyManager.joinGame(ws, gameId, playerName);
    if (!result.success) {
        (0, messages_1.sendMessage)(ws, {
            type: protocol_1.MessageType.JOIN_REJECT,
            reason: result.reason || 'Failed to join',
        });
        return;
    }
    const client = lobbyManager.getClientInfo(ws);
    const game = lobbyManager.getGame(gameId);
    if (!client || !game)
        return;
    (0, messages_1.sendMessage)(ws, {
        type: protocol_1.MessageType.JOIN_ACCEPT,
        playerId: client.playerId,
        gameId: game.id,
    });
    // Broadcast updated player list to all players in game
    const players = game.getPlayersInfo();
    for (const player of game.getPlayersInfo()) {
        const playerData = game.getPlayer(player.id);
        if (playerData) {
            (0, messages_1.sendMessage)(playerData.ws, {
                type: protocol_1.MessageType.PLAYER_LIST,
                players,
                hostId: game.hostId,
            });
        }
    }
}
function handlePlayerReady(ws, ready) {
    const client = lobbyManager.getClientInfo(ws);
    if (!client || !client.gameId)
        return;
    const game = lobbyManager.getGame(client.gameId);
    if (!game)
        return;
    game.setPlayerReady(client.playerId, ready);
    // If ready and host, check if game can start
    if (ready && game.isHost(client.playerId) && game.canStartGame()) {
        game.startGame();
    }
}
function handleTurnInput(ws, input) {
    const client = lobbyManager.getClientInfo(ws);
    if (!client || !client.gameId)
        return;
    const game = lobbyManager.getGame(client.gameId);
    if (!game)
        return;
    game.handleTurnInput(client.playerId, input);
}
function handleTurnSubmit(ws, word) {
    const client = lobbyManager.getClientInfo(ws);
    if (!client || !client.gameId)
        return;
    const game = lobbyManager.getGame(client.gameId);
    if (!game)
        return;
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
//# sourceMappingURL=index.js.map