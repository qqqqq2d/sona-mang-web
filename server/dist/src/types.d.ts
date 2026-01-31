import { WebSocket } from 'ws';
import { PlayerState, GamePhase } from '../../shared/protocol';
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
    currentCombo: string;
    currentTurnPlayerId: string;
    turnTimer: number;
    turnDuration: number;
    usedWords: Set<string>;
    turnTimerHandle: NodeJS.Timeout | null;
}
export declare function createPlayer(id: string, name: string, ws: WebSocket, isHost?: boolean): Player;
export declare function createGameState(id: string, name: string, hostId: string): GameState;
//# sourceMappingURL=types.d.ts.map