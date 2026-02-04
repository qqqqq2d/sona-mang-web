import { WebSocket } from 'ws';
import { GamePhase, PlayerInfo } from '../../shared/protocol';
import { Player } from './types';
export declare class GameSession {
    private state;
    private tickInterval;
    private turnStartTime;
    constructor(id: string, name: string, hostId: string);
    get id(): string;
    get name(): string;
    get phase(): GamePhase;
    get hostId(): string;
    get playerCount(): number;
    getPlayersInfo(): PlayerInfo[];
    addPlayer(id: string, name: string, ws: WebSocket): Player | null;
    removePlayer(playerId: string): void;
    setPlayerReady(playerId: string, ready: boolean): void;
    canStartGame(): boolean;
    startGame(): boolean;
    private startTurnTimer;
    private stopTurnTimer;
    handleTurnInput(playerId: string, input: string): void;
    handleTurnSubmit(playerId: string, word: string): void;
    private handleTimeout;
    private processTurnResult;
    private advanceToNextPlayer;
    private checkWinCondition;
    private endGame;
    returnToLobby(): void;
    setComboChangePerRound(enabled: boolean): void;
    get comboChangePerRound(): boolean;
    private broadcastPlayerList;
    isEmpty(): boolean;
    getPlayer(playerId: string): Player | undefined;
    isHost(playerId: string): boolean;
    cleanup(): void;
}
//# sourceMappingURL=game-session.d.ts.map