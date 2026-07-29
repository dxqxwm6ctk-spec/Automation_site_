/**
 * Socket.io client singleton.
 *
 * Connects to the API server's socket.io endpoint at /api/socket.io (same
 * origin, path matches the server's { path: "/api/socket.io" } config).
 * autoConnect: false so the socket only goes live when the first caller
 * calls connect(), keeping idle pages from holding an open connection.
 */
import { io, type Socket } from "socket.io-client";

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (!_socket) {
    _socket = io({
      path: "/api/socket.io",
      autoConnect: false,
      reconnectionAttempts: 5,
      transports: ["websocket", "polling"],
    });
  }
  return _socket;
}
