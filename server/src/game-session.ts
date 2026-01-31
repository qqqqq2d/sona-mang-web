import { WebSocket } from 'ws';
import {
  PlayerState,
  GamePhase,
  TurnResult,
  MessageType,
  PlayerInfo,
  DEFAULT_LIVES,
  DEFAULT_TURN_DURATION,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from '../../shared/protocol';
import { GameState, Player, createPlayer } from './types';
import { generateNewCombo, validateWord, getRandomWordsForCombo } from './game-logic';
import { broadcastToGame, sendMessage } from './messages';

export class GameSession {
  private state: GameState;
  private tickInterval: NodeJS.Timeout | null = null;
  private turnStartTime: number = 0;

  constructor(id: string, name: string, hostId: string) {
    this.state = {
      id,
      name,
      phase: GamePhase.LOBBY,
      players: new Map(),
      hostId,
      currentCombo: '',
      currentTurnPlayerId: '',
      turnTimer: DEFAULT_TURN_DURATION,
      turnDuration: DEFAULT_TURN_DURATION,
      usedWords: new Set(),
      turnTimerHandle: null,
      comboChangePerRound: true,
      roundStartPlayerId: '',
      failedCombos: new Set(),
    };
  }

  get id(): string {
    return this.state.id;
  }

  get name(): string {
    return this.state.name;
  }

  get phase(): GamePhase {
    return this.state.phase;
  }

  get hostId(): string {
    return this.state.hostId;
  }

  get playerCount(): number {
    return this.state.players.size;
  }

  getPlayersInfo(): PlayerInfo[] {
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

  addPlayer(id: string, name: string, ws: WebSocket): Player | null {
    if (this.state.players.size >= MAX_PLAYERS) {
      return null;
    }
    if (this.state.phase !== GamePhase.LOBBY) {
      return null;
    }

    const isHost = this.state.players.size === 0;
    const player = createPlayer(id, name, ws, isHost);
    this.state.players.set(id, player);

    if (isHost) {
      this.state.hostId = id;
    }

    return player;
  }

  removePlayer(playerId: string): void {
    const player = this.state.players.get(playerId);
    if (!player) return;

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
    if (this.state.phase === GamePhase.PLAYING) {
      if (this.state.currentTurnPlayerId === playerId) {
        this.advanceToNextPlayer();
      }
      this.checkWinCondition();
    }

    // Broadcast updated player list
    this.broadcastPlayerList();
  }

  setPlayerReady(playerId: string, ready: boolean): void {
    const player = this.state.players.get(playerId);
    if (!player) return;

    player.state = ready ? PlayerState.READY : PlayerState.CONNECTED;
    this.broadcastPlayerList();
  }

  canStartGame(): boolean {
    let readyCount = 0;
    for (const player of this.state.players.values()) {
      if (player.state === PlayerState.READY) {
        readyCount++;
      }
    }
    return readyCount >= MIN_PLAYERS;
  }

  startGame(): boolean {
    if (!this.canStartGame()) {
      return false;
    }

    // Set all ready players to ALIVE
    for (const player of this.state.players.values()) {
      if (player.state === PlayerState.READY) {
        player.state = PlayerState.ALIVE;
        player.lives = DEFAULT_LIVES;
        player.score = 0;
        player.currentInput = '';
      }
    }

    // Reset game state
    this.state.usedWords.clear();
    this.state.failedCombos.clear();
    this.state.phase = GamePhase.PLAYING;
    this.state.currentCombo = generateNewCombo();
    this.state.turnTimer = this.state.turnDuration;

    // Set first alive player as current turn
    for (const player of this.state.players.values()) {
      if (player.state === PlayerState.ALIVE) {
        this.state.currentTurnPlayerId = player.id;
        this.state.roundStartPlayerId = player.id;
        break;
      }
    }

    // Broadcast game start
    broadcastToGame(this.state.players, {
      type: MessageType.GAME_START,
      firstPlayerId: this.state.currentTurnPlayerId,
      turnDuration: this.state.turnDuration,
      combo: this.state.currentCombo,
    });

    // Start turn timer
    this.startTurnTimer();

    return true;
  }

  private startTurnTimer(): void {
    this.stopTurnTimer();

    this.turnStartTime = Date.now();
    this.state.turnTimer = this.state.turnDuration;

    // Broadcast turn start so clients sync their timers
    broadcastToGame(this.state.players, {
      type: MessageType.TURN_START,
      playerId: this.state.currentTurnPlayerId,
      duration: this.state.turnDuration,
    });

    // Tick every 100ms, use timestamps to avoid drift
    this.tickInterval = setInterval(() => {
      const elapsed = (Date.now() - this.turnStartTime) / 1000;
      this.state.turnTimer = this.state.turnDuration - elapsed;

      if (this.state.turnTimer <= 0) {
        this.handleTimeout();
      }
    }, 100);
  }

  private stopTurnTimer(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  handleTurnInput(playerId: string, input: string): void {
    if (this.state.phase !== GamePhase.PLAYING) return;
    if (playerId !== this.state.currentTurnPlayerId) return;

    const player = this.state.players.get(playerId);
    if (!player || player.state !== PlayerState.ALIVE) return;

    player.currentInput = input;

    // Broadcast to other players
    broadcastToGame(this.state.players, {
      type: MessageType.TURN_INPUT,
      playerId,
      input,
    });
  }

  handleTurnSubmit(playerId: string, word: string): void {
    if (this.state.phase !== GamePhase.PLAYING) return;
    if (playerId !== this.state.currentTurnPlayerId) return;

    const player = this.state.players.get(playerId);
    if (!player || player.state !== PlayerState.ALIVE) return;

    const result = validateWord(word, this.state.currentCombo, this.state.usedWords);

    // Handle wrong answers without stopping the timer
    if (result === TurnResult.WRONG || result === TurnResult.ALREADY_USED) {
      const elapsed = (Date.now() - this.turnStartTime) / 1000;
      const remaining = Math.max(0, this.state.turnDuration - elapsed);
      broadcastToGame(this.state.players, {
        type: MessageType.TURN_RESULT,
        playerId: player.id,
        result,
        nextPlayerId: player.id,
        newCombo: this.state.currentCombo,
        word,
        remainingTime: remaining,
      });
      return;
    }

    this.processTurnResult(player, result, word);
  }

  private handleTimeout(): void {
    this.stopTurnTimer();  // Stop immediately to prevent multiple triggers
    const player = this.state.players.get(this.state.currentTurnPlayerId);
    if (player) {
      this.processTurnResult(player, TurnResult.TIMEOUT, '');
    }
  }

  private processTurnResult(player: Player, result: TurnResult, word: string): void {
    this.stopTurnTimer();

    switch (result) {
      case TurnResult.CORRECT:
        player.score++;
        this.state.usedWords.add(word.toUpperCase());
        player.currentInput = '';
        this.advanceToNextPlayer(true);
        break;

      case TurnResult.TIMEOUT:
        // Track the failed combo
        this.state.failedCombos.add(this.state.currentCombo);
        player.lives--;
        if (player.lives <= 0) {
          player.state = PlayerState.ELIMINATED;
          broadcastToGame(this.state.players, {
            type: MessageType.PLAYER_ELIMINATED,
            playerId: player.id,
          });
        }
        player.currentInput = '';
        this.advanceToNextPlayer(false);  // Keep same combo on failure
        break;
    }

    // Broadcast player update
    broadcastToGame(this.state.players, {
      type: MessageType.PLAYER_UPDATE,
      playerId: player.id,
      lives: player.lives,
      score: player.score,
      state: player.state,
    });

    // Broadcast turn result
    broadcastToGame(this.state.players, {
      type: MessageType.TURN_RESULT,
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

  private advanceToNextPlayer(mayChangeCombo: boolean = false): void {
    const playerIds = Array.from(this.state.players.keys());
    if (playerIds.length === 0) return;

    const currentIndex = playerIds.indexOf(this.state.currentTurnPlayerId);
    let nextIndex = (currentIndex + 1) % playerIds.length;
    let attempts = 0;

    while (attempts < playerIds.length) {
      const nextPlayerId = playerIds[nextIndex];
      const nextPlayer = this.state.players.get(nextPlayerId);

      if (nextPlayer && nextPlayer.state === PlayerState.ALIVE) {
        // Check if round start player is still alive
        const roundStartPlayer = this.state.players.get(this.state.roundStartPlayerId);
        if (!roundStartPlayer || roundStartPlayer.state !== PlayerState.ALIVE) {
          // Round start player eliminated, update to next alive player
          this.state.roundStartPlayerId = nextPlayerId;
        }

        // Check if everyone has had a turn with current combo
        const everyoneTriedCombo = nextPlayerId === this.state.roundStartPlayerId;

        // Handle combo change:
        // - forceChange (correct answer): always change combo
        // - timeout: only change if everyone has had a turn with this combo
        if (mayChangeCombo || everyoneTriedCombo) {
          this.state.currentCombo = generateNewCombo();
          this.state.roundStartPlayerId = nextPlayerId;
        }

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

  private checkWinCondition(): boolean {
    let aliveCount = 0;
    let lastAlivePlayer: Player | null = null;

    for (const player of this.state.players.values()) {
      if (player.state === PlayerState.ALIVE) {
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

  private endGame(winnerId: string | null): void {
    this.stopTurnTimer();
    this.state.phase = GamePhase.GAME_OVER;

    // Build failed combos with example words
    const failedCombosWithWords: { combo: string; exampleWords: string[] }[] = [];
    for (const combo of this.state.failedCombos) {
      failedCombosWithWords.push({
        combo,
        exampleWords: getRandomWordsForCombo(combo, 3),
      });
    }

    broadcastToGame(this.state.players, {
      type: MessageType.GAME_OVER,
      winnerId,
      failedCombos: failedCombosWithWords,
    });
  }

  returnToLobby(): void {
    this.stopTurnTimer();
    this.state.phase = GamePhase.LOBBY;
    this.state.usedWords.clear();
    this.state.currentCombo = '';
    this.state.currentTurnPlayerId = '';
    this.state.roundStartPlayerId = '';

    for (const player of this.state.players.values()) {
      player.state = PlayerState.CONNECTED;
      player.lives = DEFAULT_LIVES;
      player.score = 0;
      player.currentInput = '';
    }

    this.broadcastPlayerList();
  }

  setComboChangePerRound(enabled: boolean): void {
    this.state.comboChangePerRound = enabled;
  }

  get comboChangePerRound(): boolean {
    return this.state.comboChangePerRound;
  }

  private broadcastPlayerList(): void {
    broadcastToGame(this.state.players, {
      type: MessageType.PLAYER_LIST,
      players: this.getPlayersInfo(),
      hostId: this.state.hostId,
    });
  }

  isEmpty(): boolean {
    return this.state.players.size === 0;
  }

  getPlayer(playerId: string): Player | undefined {
    return this.state.players.get(playerId);
  }

  isHost(playerId: string): boolean {
    return this.state.hostId === playerId;
  }

  cleanup(): void {
    this.stopTurnTimer();
  }
}
