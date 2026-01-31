import { WebSocket } from 'ws';
import {
  PlayerState,
  GamePhase,
  DEFAULT_LIVES,
} from '../../shared/protocol';

export interface Player {
  id: string;
  name: string;
  state: PlayerState;
  lives: number;
  score: number;
  isHost: boolean;
  currentInput: string;
  ws: WebSocket;
}

export interface GameState {
  id: string;
  name: string;
  phase: GamePhase;
  players: Map<string, Player>;
  hostId: string;

  // Game state
  currentCombo: string;
  currentTurnPlayerId: string;
  turnTimer: number;
  turnDuration: number;
  usedWords: Set<string>;

  // Game rules
  comboChangePerRound: boolean;  // If true, combo only changes after everyone has had a turn
  roundStartPlayerId: string;    // Track who started the current round

  // Turn timer handle
  turnTimerHandle: NodeJS.Timeout | null;

  // Track combos that players failed (timed out on)
  failedCombos: Set<string>;
}

export function createPlayer(
  id: string,
  name: string,
  ws: WebSocket,
  isHost: boolean = false
): Player {
  return {
    id,
    name,
    state: PlayerState.CONNECTED,
    lives: DEFAULT_LIVES,
    score: 0,
    isHost,
    currentInput: '',
    ws,
  };
}

export function createGameState(
  id: string,
  name: string,
  hostId: string
): GameState {
  return {
    id,
    name,
    phase: GamePhase.LOBBY,
    players: new Map(),
    hostId,
    currentCombo: '',
    currentTurnPlayerId: '',
    turnTimer: 0,
    turnDuration: 10,
    usedWords: new Set(),
    turnTimerHandle: null,
    comboChangePerRound: false,
    roundStartPlayerId: '',
    failedCombos: new Set(),
  };
}
