import { WebSocket } from 'ws';
import { ServerMessage, ClientMessage } from '../../shared/protocol';
export declare function parseMessage(data: string): ClientMessage | null;
export declare function sendMessage(ws: WebSocket, message: ServerMessage): void;
export declare function broadcastMessage(clients: WebSocket[], message: ServerMessage): void;
export declare function broadcastToGame(players: Map<string, {
    ws: WebSocket;
}>, message: ServerMessage): void;
//# sourceMappingURL=messages.d.ts.map