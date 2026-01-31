import { WebSocket } from 'ws';
import { GameInfo } from '../../shared/protocol';
import { GameSession } from './game-session';
interface ClientInfo {
    ws: WebSocket;
    playerId: string;
    gameId: string | null;
}
export declare class LobbyManager {
    private games;
    private clients;
    registerClient(ws: WebSocket): string;
    unregisterClient(ws: WebSocket): void;
    getClientInfo(ws: WebSocket): ClientInfo | undefined;
    createGame(ws: WebSocket, hostName: string, gameName: string): GameSession | null;
    joinGame(ws: WebSocket, gameId: string, playerName: string): {
        success: boolean;
        reason?: string;
    };
    leaveGame(ws: WebSocket): void;
    getGame(gameId: string): GameSession | undefined;
    getGameForClient(ws: WebSocket): GameSession | undefined;
    listGames(): GameInfo[];
    startGame(ws: WebSocket): boolean;
}
export {};
//# sourceMappingURL=lobby-manager.d.ts.map