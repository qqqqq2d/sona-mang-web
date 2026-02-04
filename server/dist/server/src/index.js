"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const http_1 = require("http");
const fs_1 = require("fs");
const path_1 = require("path");
const protocol_1 = require("../../shared/protocol");
const lobby_manager_1 = require("./lobby-manager");
const game_logic_1 = require("./game-logic");
const messages_1 = require("./messages");
const PORT = parseInt(process.env.PORT || '8080', 10);
// Static file serving
// __dirname is server/dist/server/src, so go up 4 levels to reach project root
const STATIC_DIR = (0, path_1.join)(__dirname, '..', '..', '..', '..', 'client', 'dist');
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.ico': 'image/x-icon',
};
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
// Create HTTP server for static files
const server = (0, http_1.createServer)((req, res) => {
    let filePath = (0, path_1.join)(STATIC_DIR, req.url === '/' ? 'index.html' : req.url || '');
    // Security: prevent directory traversal
    if (!filePath.startsWith(STATIC_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    // Check if file exists
    if (!(0, fs_1.existsSync)(filePath) || !(0, fs_1.statSync)(filePath).isFile()) {
        // SPA fallback: serve index.html for non-file routes
        filePath = (0, path_1.join)(STATIC_DIR, 'index.html');
        if (!(0, fs_1.existsSync)(filePath)) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
    }
    const ext = (0, path_1.extname)(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    try {
        const content = (0, fs_1.readFileSync)(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    }
    catch {
        res.writeHead(500);
        res.end('Server error');
    }
});
// Create WebSocket server attached to HTTP server
const wss = new ws_1.WebSocketServer({ server });
const lobbyManager = new lobby_manager_1.LobbyManager();
server.listen(PORT, () => {
    console.log(`Sona Mang server listening on port ${PORT}`);
    console.log(`Static files served from: ${STATIC_DIR}`);
});
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
        case protocol_1.MessageType.START_GAME_REQUEST:
            handleStartGame(ws);
            break;
        case protocol_1.MessageType.RETURN_TO_LOBBY:
            handleReturnToLobby(ws);
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
}
function handleStartGame(ws) {
    const client = lobbyManager.getClientInfo(ws);
    if (!client || !client.gameId)
        return;
    const game = lobbyManager.getGame(client.gameId);
    if (!game)
        return;
    // Only host can start
    if (!game.isHost(client.playerId))
        return;
    if (game.canStartGame()) {
        game.startGame();
    }
}
function handleReturnToLobby(ws) {
    const client = lobbyManager.getClientInfo(ws);
    if (!client || !client.gameId)
        return;
    const game = lobbyManager.getGame(client.gameId);
    if (!game)
        return;
    // Only allow returning to lobby from GAME_OVER phase
    if (game.phase !== protocol_1.GamePhase.GAME_OVER)
        return;
    game.returnToLobby();
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
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
});
//# sourceMappingURL=index.js.map