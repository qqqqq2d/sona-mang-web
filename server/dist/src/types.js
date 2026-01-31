"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlayer = createPlayer;
exports.createGameState = createGameState;
const protocol_1 = require("../../shared/protocol");
function createPlayer(id, name, ws, isHost = false) {
    return {
        id,
        name,
        state: protocol_1.PlayerState.CONNECTED,
        lives: protocol_1.DEFAULT_LIVES,
        score: 0,
        isHost,
        currentInput: '',
        ws,
    };
}
function createGameState(id, name, hostId) {
    return {
        id,
        name,
        phase: protocol_1.GamePhase.LOBBY,
        players: new Map(),
        hostId,
        currentCombo: '',
        currentTurnPlayerId: '',
        turnTimer: 0,
        turnDuration: 10,
        usedWords: new Set(),
        turnTimerHandle: null,
    };
}
//# sourceMappingURL=types.js.map