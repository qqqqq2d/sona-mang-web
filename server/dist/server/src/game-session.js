"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameSession = void 0;
const protocol_1 = require("../../shared/protocol");
const types_1 = require("./types");
const game_logic_1 = require("./game-logic");
const messages_1 = require("./messages");
class GameSession {
    constructor(id, name, hostId) {
        this.tickInterval = null;
        this.state = {
            id,
            name,
            phase: protocol_1.GamePhase.LOBBY,
            players: new Map(),
            hostId,
            currentCombo: '',
            currentTurnPlayerId: '',
            turnTimer: protocol_1.DEFAULT_TURN_DURATION,
            turnDuration: protocol_1.DEFAULT_TURN_DURATION,
            usedWords: new Set(),
            turnTimerHandle: null,
        };
    }
    get id() {
        return this.state.id;
    }
    get name() {
        return this.state.name;
    }
    get phase() {
        return this.state.phase;
    }
    get hostId() {
        return this.state.hostId;
    }
    get playerCount() {
        return this.state.players.size;
    }
    getPlayersInfo() {
        return Array.from(this.state.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            state: p.state,
            lives: p.lives,
            score: p.score,
            isHost: p.isHost,
            currentInput: p.currentInput,
        }));
    }
    addPlayer(id, name, ws) {
        if (this.state.players.size >= protocol_1.MAX_PLAYERS) {
            return null;
        }
        if (this.state.phase !== protocol_1.GamePhase.LOBBY) {
            return null;
        }
        const isHost = this.state.players.size === 0;
        const player = (0, types_1.createPlayer)(id, name, ws, isHost);
        this.state.players.set(id, player);
        if (isHost) {
            this.state.hostId = id;
        }
        return player;
    }
    removePlayer(playerId) {
        const player = this.state.players.get(playerId);
        if (!player)
            return;
        this.state.players.delete(playerId);
        // If host left, assign new host
        if (player.isHost && this.state.players.size > 0) {
            const newHost = this.state.players.values().next().value;
            if (newHost) {
                newHost.isHost = true;
                this.state.hostId = newHost.id;
            }
        }
        // If game is in progress and it was current turn player
        if (this.state.phase === protocol_1.GamePhase.PLAYING) {
            if (this.state.currentTurnPlayerId === playerId) {
                this.advanceToNextPlayer();
            }
            this.checkWinCondition();
        }
        // Broadcast updated player list
        this.broadcastPlayerList();
    }
    setPlayerReady(playerId, ready) {
        const player = this.state.players.get(playerId);
        if (!player)
            return;
        player.state = ready ? protocol_1.PlayerState.READY : protocol_1.PlayerState.CONNECTED;
        this.broadcastPlayerList();
    }
    canStartGame() {
        let readyCount = 0;
        for (const player of this.state.players.values()) {
            if (player.state === protocol_1.PlayerState.READY) {
                readyCount++;
            }
        }
        return readyCount >= protocol_1.MIN_PLAYERS;
    }
    startGame() {
        if (!this.canStartGame()) {
            return false;
        }
        // Set all ready players to ALIVE
        for (const player of this.state.players.values()) {
            if (player.state === protocol_1.PlayerState.READY) {
                player.state = protocol_1.PlayerState.ALIVE;
                player.lives = protocol_1.DEFAULT_LIVES;
                player.score = 0;
                player.currentInput = '';
            }
        }
        // Reset game state
        this.state.usedWords.clear();
        this.state.phase = protocol_1.GamePhase.PLAYING;
        this.state.currentCombo = (0, game_logic_1.generateNewCombo)();
        this.state.turnTimer = this.state.turnDuration;
        // Set first alive player as current turn
        for (const player of this.state.players.values()) {
            if (player.state === protocol_1.PlayerState.ALIVE) {
                this.state.currentTurnPlayerId = player.id;
                break;
            }
        }
        // Broadcast game start
        (0, messages_1.broadcastToGame)(this.state.players, {
            type: protocol_1.MessageType.GAME_START,
            firstPlayerId: this.state.currentTurnPlayerId,
            turnDuration: this.state.turnDuration,
            combo: this.state.currentCombo,
        });
        // Start turn timer
        this.startTurnTimer();
        return true;
    }
    startTurnTimer() {
        this.stopTurnTimer();
        this.state.turnTimer = this.state.turnDuration;
        // Tick every 100ms for smooth countdown
        this.tickInterval = setInterval(() => {
            this.state.turnTimer -= 0.1;
            if (this.state.turnTimer <= 0) {
                this.handleTimeout();
            }
        }, 100);
    }
    stopTurnTimer() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
    }
    handleTurnInput(playerId, input) {
        if (this.state.phase !== protocol_1.GamePhase.PLAYING)
            return;
        if (playerId !== this.state.currentTurnPlayerId)
            return;
        const player = this.state.players.get(playerId);
        if (!player || player.state !== protocol_1.PlayerState.ALIVE)
            return;
        player.currentInput = input;
        // Broadcast to other players
        (0, messages_1.broadcastToGame)(this.state.players, {
            type: protocol_1.MessageType.TURN_INPUT,
            playerId,
            input,
        });
    }
    handleTurnSubmit(playerId, word) {
        if (this.state.phase !== protocol_1.GamePhase.PLAYING)
            return;
        if (playerId !== this.state.currentTurnPlayerId)
            return;
        const player = this.state.players.get(playerId);
        if (!player || player.state !== protocol_1.PlayerState.ALIVE)
            return;
        const result = (0, game_logic_1.validateWord)(word, this.state.currentCombo, this.state.usedWords);
        this.processTurnResult(player, result, word);
    }
    handleTimeout() {
        const player = this.state.players.get(this.state.currentTurnPlayerId);
        if (player) {
            this.processTurnResult(player, protocol_1.TurnResult.TIMEOUT, '');
        }
    }
    processTurnResult(player, result, word) {
        switch (result) {
            case protocol_1.TurnResult.CORRECT:
                this.stopTurnTimer();
                player.score++;
                this.state.usedWords.add(word.toUpperCase());
                player.currentInput = '';
                this.state.currentCombo = (0, game_logic_1.generateNewCombo)();
                this.advanceToNextPlayer();
                break;
            case protocol_1.TurnResult.WRONG:
            case protocol_1.TurnResult.ALREADY_USED:
                // Don't lose life on wrong answer, just notify and let them try again
                // Timer continues counting down (don't restart) to match C++ behavior
                (0, messages_1.broadcastToGame)(this.state.players, {
                    type: protocol_1.MessageType.TURN_RESULT,
                    playerId: player.id,
                    result,
                    nextPlayerId: player.id, // Same player continues
                    newCombo: this.state.currentCombo,
                    word,
                });
                return; // Don't broadcast another result, don't stop/restart timer
            case protocol_1.TurnResult.TIMEOUT:
                this.stopTurnTimer();
                player.lives--;
                if (player.lives <= 0) {
                    player.state = protocol_1.PlayerState.ELIMINATED;
                    (0, messages_1.broadcastToGame)(this.state.players, {
                        type: protocol_1.MessageType.PLAYER_ELIMINATED,
                        playerId: player.id,
                    });
                }
                player.currentInput = '';
                this.state.currentCombo = (0, game_logic_1.generateNewCombo)();
                this.advanceToNextPlayer();
                break;
        }
        // Broadcast player update
        (0, messages_1.broadcastToGame)(this.state.players, {
            type: protocol_1.MessageType.PLAYER_UPDATE,
            playerId: player.id,
            lives: player.lives,
            score: player.score,
            state: player.state,
        });
        // Broadcast turn result
        (0, messages_1.broadcastToGame)(this.state.players, {
            type: protocol_1.MessageType.TURN_RESULT,
            playerId: player.id,
            result,
            nextPlayerId: this.state.currentTurnPlayerId,
            newCombo: this.state.currentCombo,
            word,
        });
        // Check win condition
        if (this.checkWinCondition()) {
            return;
        }
        // Start next turn timer
        this.startTurnTimer();
    }
    advanceToNextPlayer() {
        const playerIds = Array.from(this.state.players.keys());
        if (playerIds.length === 0)
            return;
        const currentIndex = playerIds.indexOf(this.state.currentTurnPlayerId);
        let nextIndex = (currentIndex + 1) % playerIds.length;
        let attempts = 0;
        while (attempts < playerIds.length) {
            const nextPlayerId = playerIds[nextIndex];
            const nextPlayer = this.state.players.get(nextPlayerId);
            if (nextPlayer && nextPlayer.state === protocol_1.PlayerState.ALIVE) {
                this.state.currentTurnPlayerId = nextPlayerId;
                this.state.turnTimer = this.state.turnDuration;
                // Clear their input
                nextPlayer.currentInput = '';
                return;
            }
            nextIndex = (nextIndex + 1) % playerIds.length;
            attempts++;
        }
    }
    checkWinCondition() {
        let aliveCount = 0;
        let lastAlivePlayer = null;
        for (const player of this.state.players.values()) {
            if (player.state === protocol_1.PlayerState.ALIVE) {
                aliveCount++;
                lastAlivePlayer = player;
            }
        }
        // Single player: game over when eliminated
        if (this.state.players.size === 1 && aliveCount === 0) {
            this.endGame(null);
            return true;
        }
        // Multiplayer: game over when 1 or fewer remain
        if (this.state.players.size > 1 && aliveCount <= 1) {
            this.endGame(lastAlivePlayer?.id || null);
            return true;
        }
        return false;
    }
    endGame(winnerId) {
        this.stopTurnTimer();
        this.state.phase = protocol_1.GamePhase.GAME_OVER;
        (0, messages_1.broadcastToGame)(this.state.players, {
            type: protocol_1.MessageType.GAME_OVER,
            winnerId,
        });
    }
    returnToLobby() {
        this.stopTurnTimer();
        this.state.phase = protocol_1.GamePhase.LOBBY;
        this.state.usedWords.clear();
        this.state.currentCombo = '';
        this.state.currentTurnPlayerId = '';
        for (const player of this.state.players.values()) {
            player.state = protocol_1.PlayerState.CONNECTED;
            player.lives = protocol_1.DEFAULT_LIVES;
            player.score = 0;
            player.currentInput = '';
        }
        this.broadcastPlayerList();
    }
    broadcastPlayerList() {
        (0, messages_1.broadcastToGame)(this.state.players, {
            type: protocol_1.MessageType.PLAYER_LIST,
            players: this.getPlayersInfo(),
            hostId: this.state.hostId,
        });
    }
    isEmpty() {
        return this.state.players.size === 0;
    }
    getPlayer(playerId) {
        return this.state.players.get(playerId);
    }
    isHost(playerId) {
        return this.state.hostId === playerId;
    }
    cleanup() {
        this.stopTurnTimer();
    }
}
exports.GameSession = GameSession;
//# sourceMappingURL=game-session.js.map