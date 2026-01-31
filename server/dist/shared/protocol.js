"use strict";
// Shared message protocol for Sona Mang
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamePhase = exports.TurnResult = exports.PlayerState = exports.MessageType = exports.DEFAULT_TURN_DURATION = exports.DEFAULT_LIVES = exports.MIN_PLAYERS = exports.MAX_PLAYERS = void 0;
exports.MAX_PLAYERS = 8;
exports.MIN_PLAYERS = 2;
exports.DEFAULT_LIVES = 3;
exports.DEFAULT_TURN_DURATION = 10.0;
var MessageType;
(function (MessageType) {
    // Lobby
    MessageType["JOIN_REQUEST"] = "JOIN_REQUEST";
    MessageType["JOIN_ACCEPT"] = "JOIN_ACCEPT";
    MessageType["JOIN_REJECT"] = "JOIN_REJECT";
    MessageType["PLAYER_LIST"] = "PLAYER_LIST";
    MessageType["PLAYER_READY"] = "PLAYER_READY";
    MessageType["PLAYER_LEFT"] = "PLAYER_LEFT";
    // Game management
    MessageType["CREATE_GAME"] = "CREATE_GAME";
    MessageType["LIST_GAMES"] = "LIST_GAMES";
    MessageType["GAMES_LIST"] = "GAMES_LIST";
    // Game start
    MessageType["START_GAME_REQUEST"] = "START_GAME_REQUEST";
    MessageType["GAME_START"] = "GAME_START";
    MessageType["NEW_COMBO"] = "NEW_COMBO";
    // Turn management
    MessageType["TURN_START"] = "TURN_START";
    MessageType["TURN_INPUT"] = "TURN_INPUT";
    MessageType["TURN_SUBMIT"] = "TURN_SUBMIT";
    MessageType["TURN_RESULT"] = "TURN_RESULT";
    // State updates
    MessageType["PLAYER_UPDATE"] = "PLAYER_UPDATE";
    MessageType["PLAYER_ELIMINATED"] = "PLAYER_ELIMINATED";
    MessageType["GAME_OVER"] = "GAME_OVER";
    // Utility
    MessageType["PING"] = "PING";
    MessageType["PONG"] = "PONG";
    MessageType["ERROR"] = "ERROR";
})(MessageType || (exports.MessageType = MessageType = {}));
var PlayerState;
(function (PlayerState) {
    PlayerState["CONNECTED"] = "CONNECTED";
    PlayerState["READY"] = "READY";
    PlayerState["ALIVE"] = "ALIVE";
    PlayerState["ELIMINATED"] = "ELIMINATED";
    PlayerState["DISCONNECTED"] = "DISCONNECTED";
})(PlayerState || (exports.PlayerState = PlayerState = {}));
var TurnResult;
(function (TurnResult) {
    TurnResult["CORRECT"] = "CORRECT";
    TurnResult["WRONG"] = "WRONG";
    TurnResult["ALREADY_USED"] = "ALREADY_USED";
    TurnResult["TIMEOUT"] = "TIMEOUT";
})(TurnResult || (exports.TurnResult = TurnResult = {}));
var GamePhase;
(function (GamePhase) {
    GamePhase["LOBBY"] = "LOBBY";
    GamePhase["PLAYING"] = "PLAYING";
    GamePhase["GAME_OVER"] = "GAME_OVER";
})(GamePhase || (exports.GamePhase = GamePhase = {}));
//# sourceMappingURL=protocol.js.map