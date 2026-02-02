import {
  PlayerInfo,
  PlayerState,
  GamePhase,
  GameInfo,
  FailedComboInfo,
  DEFAULT_LIVES,
  DEFAULT_TURN_DURATION,
} from './protocol';

export enum ClientPhase {
  MAIN_MENU = 'MAIN_MENU',
  SERVER_CONNECT = 'SERVER_CONNECT',
  CONNECTING = 'CONNECTING',
  LOBBY_CREATE = 'LOBBY_CREATE',
  LOBBY_JOIN = 'LOBBY_JOIN',
  LOBBY_WAITING = 'LOBBY_WAITING',
  PLAYING = 'PLAYING',
  SPECTATING = 'SPECTATING',
  GAME_OVER = 'GAME_OVER',
  DISCONNECTED = 'DISCONNECTED',
}

export interface GameState {
  // Client state
  phase: ClientPhase;
  connected: boolean;

  // Player info
  playerId: string;
  playerName: string;
  gameId: string;
  isHost: boolean;

  // Server input
  serverAddress: string;
  gameName: string;

  // Players
  players: PlayerInfo[];
  hostId: string;

  // Game state
  currentCombo: string;
  currentTurnPlayerId: string;
  prevTurnPlayerId: string;
  localInput: string;
  turnTimer: number;
  turnDuration: number;
  prevTurnTimer: number;
  lastTickSecond: number;

  // Visual effects
  wrongAnswerFlash: boolean;
  wrongAnswerOpacity: number;
  wrongAnswerOpacityUp: boolean;
  correctAnswerFlash: boolean;
  correctAnswerOpacity: number;
  timeoutFlash: boolean;
  timeoutOpacity: number;
  timeoutOpacityUp: boolean;

  // Sound triggers
  pendingCorrectSound: boolean;
  pendingWrongSound: boolean;
  pendingTurnOverSound: boolean;

  // Timer tick flash
  timerTickFlash: boolean;
  timerTickFlashOpacity: number;

  // Menu state
  menuSelectedIndex: number;
  inputFocus: number;
  prevSelectedIndex: number;
  menuTransitionTime: number;
  menuPressedIndex: number; // Which menu item is being touched (-1 for none)
  menuHoveredIndex: number; // Which menu item is being hovered (-1 for none)
  menuHighlightOpacity: number[]; // Highlight opacity for each menu item
  pressedButton: string | null; // Which button is being touched (by name)
  hoveredButton: string | null; // Which button is being hovered (by name)
  buttonHighlightOpacity: { [key: string]: number }; // Highlight opacity for each button

  // Animation
  animTime: number;

  // Lobby
  gamesList: GameInfo[];
  joiningGame: boolean;

  // Game over
  failedCombos: FailedComboInfo[];
  showFailedCombos: boolean;
  failedCombosScrollY: number;

  // View transition (between PLAYING and SPECTATING)
  viewTransitionOpacity: number;
  viewTransitionFadingOut: boolean;
  viewTransitionActive: boolean;
  previousGamePhase: ClientPhase | null;
  pendingPhase: ClientPhase | null;
  renderPhase: ClientPhase | null;
  displayCombo: string;
}

export function createInitialState(): GameState {
  return {
    phase: ClientPhase.MAIN_MENU,
    connected: false,

    playerId: '',
    playerName: 'Player',
    gameId: '',
    isHost: false,

    serverAddress: 'localhost:8080',
    gameName: 'My Game',

    players: [],
    hostId: '',

    currentCombo: '',
    currentTurnPlayerId: '',
    prevTurnPlayerId: '',
    localInput: '',
    turnTimer: DEFAULT_TURN_DURATION,
    turnDuration: DEFAULT_TURN_DURATION,
    prevTurnTimer: DEFAULT_TURN_DURATION,
    lastTickSecond: -1,

    wrongAnswerFlash: false,
    wrongAnswerOpacity: 0,
    wrongAnswerOpacityUp: true,
    correctAnswerFlash: false,
    correctAnswerOpacity: 0,
    timeoutFlash: false,
    timeoutOpacity: 0,
    timeoutOpacityUp: true,

    pendingCorrectSound: false,
    pendingWrongSound: false,
    pendingTurnOverSound: false,

    timerTickFlash: false,
    timerTickFlashOpacity: 0,

    menuSelectedIndex: 0,
    inputFocus: 0,
    prevSelectedIndex: -1,
    menuTransitionTime: 0,
    menuPressedIndex: -1,
    menuHoveredIndex: -1,
    menuHighlightOpacity: [0, 0],
    pressedButton: null,
    hoveredButton: null,
    buttonHighlightOpacity: {},

    animTime: 0,

    gamesList: [],
    joiningGame: false,

    failedCombos: [],
    showFailedCombos: false,
    failedCombosScrollY: 0,

    viewTransitionOpacity: 0,
    viewTransitionFadingOut: false,
    viewTransitionActive: false,
    previousGamePhase: null,
    pendingPhase: null,
    renderPhase: null,
    displayCombo: '',
  };
}

export function getLocalPlayer(state: GameState): PlayerInfo | undefined {
  return state.players.find(p => p.id === state.playerId);
}

export function getCurrentTurnPlayer(state: GameState): PlayerInfo | undefined {
  return state.players.find(p => p.id === state.currentTurnPlayerId);
}

export function isMyTurn(state: GameState): boolean {
  const local = getLocalPlayer(state);
  return !!local && local.id === state.currentTurnPlayerId && local.state === PlayerState.ALIVE;
}

export function isLocalPlayerAlive(state: GameState): boolean {
  const local = getLocalPlayer(state);
  return !!local && local.state === PlayerState.ALIVE;
}

export function getAlivePlayers(state: GameState): PlayerInfo[] {
  return state.players.filter(p => p.state === PlayerState.ALIVE);
}

export function getReadyCount(state: GameState): number {
  return state.players.filter(p => p.state === PlayerState.READY).length;
}

export function resetGameState(state: GameState): void {
  state.currentCombo = '';
  state.currentTurnPlayerId = '';
  state.localInput = '';
  state.turnTimer = state.turnDuration;
  state.wrongAnswerFlash = false;
  state.wrongAnswerOpacity = 0;
  state.wrongAnswerOpacityUp = true;
  state.correctAnswerFlash = false;
  state.correctAnswerOpacity = 0;
  state.timeoutFlash = false;
  state.timeoutOpacity = 0;
  state.timeoutOpacityUp = true;
}
