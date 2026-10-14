import { WebSocketServer } from 'ws';
import { RoomHost } from '../src/game/host.js';

const PORT = Number(process.env.PORT) || 8080;
const MAX_MESSAGE_BYTES = 4096;
const MAX_ROOM_NAME_LENGTH = 24;
const HEARTBEAT_INTERVAL_MS = 30000;

const webSocketServer = new WebSocketServer({ port: PORT, maxPayload: MAX_MESSAGE_BYTES });
const rooms = new Map();

function getOrCreateRoom(roomName) {
  if (!rooms.has(roomName)) {
    const room = new RoomHost({
      onEmpty: () => {
        room.stop();
        rooms.delete(roomName);
      },
    });
    rooms.set(roomName, room);
  }
  return rooms.get(roomName);
}

webSocketServer.on('connection', (socket) => {
  let room = null;
  let player = null;
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  const sendMessage = (message) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  socket.on('message', (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (!player) {
      if (message.type !== 'join') {
        return;
      }
      room = getOrCreateRoom(String(message.room || 'general').slice(0, MAX_ROOM_NAME_LENGTH) || 'general');
      player = room.join(sendMessage, message);
      if (!player) {
        socket.close();
      }
      return;
    }
    room.receive(player, message);
  });

  socket.on('close', () => {
    if (player && room) {
      room.leave(player);
    }
  });

  socket.on('error', () => {});
});

setInterval(() => {
  for (const socket of webSocketServer.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

console.log(`Tag-Rush server on ws://0.0.0.0:${PORT}`);
