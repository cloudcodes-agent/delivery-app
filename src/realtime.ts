import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(base = import.meta.env.VITE_API_BASE || 'http://localhost:3000') {
  if (socket) return socket;
  socket = io(base, { transports: ['websocket'] });
  return socket;
}
