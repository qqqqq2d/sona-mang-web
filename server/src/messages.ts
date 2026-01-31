import { WebSocket } from 'ws';
import {
  ServerMessage,
  ClientMessage,
  MessageType,
} from '../../shared/protocol';

export function parseMessage(data: string): ClientMessage | null {
  try {
    const msg = JSON.parse(data);
    if (!msg.type || !Object.values(MessageType).includes(msg.type)) {
      console.error('Invalid message type:', msg.type);
      return null;
    }
    return msg as ClientMessage;
  } catch (e) {
    console.error('Failed to parse message:', e);
    return null;
  }
}

export function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function broadcastMessage(
  clients: WebSocket[],
  message: ServerMessage
): void {
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

export function broadcastToGame(
  players: Map<string, { ws: WebSocket }>,
  message: ServerMessage
): void {
  const data = JSON.stringify(message);
  for (const player of players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  }
}
