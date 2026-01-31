// Shared message protocol for Sona Mang

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const DEFAULT_LIVES = 3;
export const DEFAULT_TURN_DURATION = 10.0;

export enum MessageType {
  // Lobby
  JOIN_REQUEST = 'JOIN_REQUEST',
  JOIN_ACCEPT = 'JOIN_ACCEPT',
  JOIN_REJECT = 'JOIN_REJECT',
  PLAYER_LIST = 'PLAYER_LIST',
  PLAYER_READY = 'PLAYER_READY',
  PLAYER_LEFT = 'PLAYER_LEFT',

  // Game management
  CREATE_GAME = 'CREATE_GAME',
  LIST_GAMES = 'LIST_GAMES',
  GAMES_LIST = 'GAMES_LIST',

  // Game start
  START_GAME_REQUEST = 'START_GAME_REQUEST',
  GAME_START = 'GAME_START',
  NEW_COMBO = 'NEW_COMBO',

  // Turn management
  TURN_START = 'TURN_START',
  TURN_INPUT = 'TURN_INPUT',
  TURN_SUBMIT = 'TURN_SUBMIT',
  TURN_RESULT = 'TURN_RESULT',

  // State updates
  PLAYER_UPDATE = 'PLAYER_UPDATE',
  PLAYER_ELIMINATED = 'PLAYER_ELIMINATED',
  GAME_OVER = 'GAME_OVER',

  // Utility
  PING = 'PING',
  PONG = 'PONG',
  ERROR = 'ERROR',
}

export enum PlayerState {
  CONNECTED = 'CONNECTED',
  READY = 'READY',
  ALIVE = 'ALIVE',
  ELIMINATED = 'ELIMINATED',
  DISCONNECTED = 'DISCONNECTED',
}

export enum TurnResult {
  CORRECT = 'CORRECT',
  WRONG = 'WRONG',
  ALREADY_USED = 'ALREADY_USED',
  TIMEOUT = 'TIMEOUT',
}

export enum GamePhase {
  LOBBY = 'LOBBY',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}

export interface PlayerInfo {
  id: string;
  name: string;
  state: PlayerState;
  lives: number;
  score: number;
  isHost: boolean;
  currentInput?: string;
}

export interface GameInfo {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
}

// Client -> Server messages
export interface JoinRequestMessage {
  type: MessageType.JOIN_REQUEST;
  gameId: string;
  playerName: string;
}

export interface CreateGameMessage {
  type: MessageType.CREATE_GAME;
  hostName: string;
  gameName: string;
}

export interface ListGamesMessage {
  type: MessageType.LIST_GAMES;
}

export interface PlayerReadyMessage {
  type: MessageType.PLAYER_READY;
  ready: boolean;
}

export interface TurnInputMessage {
  type: MessageType.TURN_INPUT;
  input: string;
}

export interface TurnSubmitMessage {
  type: MessageType.TURN_SUBMIT;
  word: string;
}

export interface PingMessage {
  type: MessageType.PING;
}

export interface StartGameRequestMessage {
  type: MessageType.START_GAME_REQUEST;
}

// Server -> Client messages
export interface JoinAcceptMessage {
  type: MessageType.JOIN_ACCEPT;
  playerId: string;
  gameId: string;
}

export interface JoinRejectMessage {
  type: MessageType.JOIN_REJECT;
  reason: string;
}

export interface GamesListMessage {
  type: MessageType.GAMES_LIST;
  games: GameInfo[];
}

export interface PlayerListMessage {
  type: MessageType.PLAYER_LIST;
  players: PlayerInfo[];
  hostId: string;
}

export interface PlayerLeftMessage {
  type: MessageType.PLAYER_LEFT;
  playerId: string;
}

export interface GameStartMessage {
  type: MessageType.GAME_START;
  firstPlayerId: string;
  turnDuration: number;
  combo: string;
}

export interface NewComboMessage {
  type: MessageType.NEW_COMBO;
  combo: string;
}

export interface TurnStartMessage {
  type: MessageType.TURN_START;
  playerId: string;
  duration: number;
}

export interface TurnInputBroadcastMessage {
  type: MessageType.TURN_INPUT;
  playerId: string;
  input: string;
}

export interface TurnResultMessage {
  type: MessageType.TURN_RESULT;
  playerId: string;
  result: TurnResult;
  nextPlayerId: string;
  newCombo: string;
  word?: string;
  remainingTime?: number;
}

export interface PlayerUpdateMessage {
  type: MessageType.PLAYER_UPDATE;
  playerId: string;
  lives: number;
  score: number;
  state: PlayerState;
}

export interface PlayerEliminatedMessage {
  type: MessageType.PLAYER_ELIMINATED;
  playerId: string;
}

export interface FailedComboInfo {
  combo: string;
  exampleWords: string[];
}

export interface GameOverMessage {
  type: MessageType.GAME_OVER;
  winnerId: string | null;
  failedCombos?: FailedComboInfo[];
}

export interface PongMessage {
  type: MessageType.PONG;
}

export interface ErrorMessage {
  type: MessageType.ERROR;
  message: string;
}

export type ClientMessage =
  | JoinRequestMessage
  | CreateGameMessage
  | ListGamesMessage
  | PlayerReadyMessage
  | StartGameRequestMessage
  | TurnInputMessage
  | TurnSubmitMessage
  | PingMessage;

export type ServerMessage =
  | JoinAcceptMessage
  | JoinRejectMessage
  | GamesListMessage
  | PlayerListMessage
  | PlayerLeftMessage
  | GameStartMessage
  | NewComboMessage
  | TurnStartMessage
  | TurnInputBroadcastMessage
  | TurnResultMessage
  | PlayerUpdateMessage
  | PlayerEliminatedMessage
  | GameOverMessage
  | PongMessage
  | ErrorMessage;
