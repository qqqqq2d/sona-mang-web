"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMessage = parseMessage;
exports.sendMessage = sendMessage;
exports.broadcastMessage = broadcastMessage;
exports.broadcastToGame = broadcastToGame;
const ws_1 = require("ws");
const protocol_1 = require("../../shared/protocol");
function parseMessage(data) {
    try {
        const msg = JSON.parse(data);
        if (!msg.type || !Object.values(protocol_1.MessageType).includes(msg.type)) {
            console.error('Invalid message type:', msg.type);
            return null;
        }
        return msg;
    }
    catch (e) {
        console.error('Failed to parse message:', e);
        return null;
    }
}
function sendMessage(ws, message) {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}
function broadcastMessage(clients, message) {
    const data = JSON.stringify(message);
    for (const ws of clients) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(data);
        }
    }
}
function broadcastToGame(players, message) {
    const data = JSON.stringify(message);
    for (const player of players.values()) {
        if (player.ws.readyState === ws_1.WebSocket.OPEN) {
            player.ws.send(data);
        }
    }
}
//# sourceMappingURL=messages.js.map