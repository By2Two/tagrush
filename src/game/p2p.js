import Peer from 'peerjs';
import { RoomHost } from './host.js';

const PEER_ID_PREFIX = 'tagrush-';
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 5;
const CONNECT_TIMEOUT_MS = 15000;
const MAX_ROOM_CODE_ATTEMPTS = 5;
const GOODBYE_DELAY_MS = 250;
const CONNECTION_OPTIONS = { serialization: 'json', reliable: true };

export const normalizeRoomCode = (text) =>
  String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);

const generateRoomCode = () =>
  Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]).join('');

export const buildInviteLink = (roomCode) => {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', roomCode);
  return url.toString();
};

export class HostSession {
  constructor({ onReady, onRosterChange, onError }) {
    this.onReady = onReady;
    this.onError = onError;
    this.roomCode = null;
    this.destroyed = false;
    this.connections = new Set();
    this.room = new RoomHost({ onRosterChange });
    this.openPeer(0);
  }

  openPeer(attempt) {
    const roomCode = generateRoomCode();
    const peer = new Peer(PEER_ID_PREFIX + roomCode);
    this.peer = peer;
    peer.on('open', () => {
      if (this.destroyed) {
        return;
      }
      this.roomCode = roomCode;
      this.onReady?.(roomCode);
    });
    peer.on('connection', (connection) => this.acceptGuest(connection));
    peer.on('error', (error) => {
      if (this.destroyed) {
        return;
      }
      if (error.type === 'unavailable-id' && attempt < MAX_ROOM_CODE_ATTEMPTS) {
        peer.destroy();
        this.openPeer(attempt + 1);
      } else if (!this.roomCode) {
        this.onError?.('Could not reach the matchmaking service. Check your connection and try again.');
      }
    });
    peer.on('disconnected', () => {
      if (!this.destroyed && !peer.destroyed) {
        peer.reconnect();
      }
    });
  }

  acceptGuest(connection) {
    let player = null;
    this.connections.add(connection);
    const dropGuest = () => {
      this.connections.delete(connection);
      if (player) {
        this.room.leave(player);
      }
      player = null;
    };
    connection.on('data', (message) => {
      if (!message || typeof message !== 'object') {
        return;
      }
      if (!player) {
        if (message.type !== 'join') {
          return;
        }
        player = this.room.join(
          (outgoing) => {
            if (connection.open) {
              connection.send(outgoing);
            }
          },
          message,
          { closeConnection: () => connection.close() }
        );
        if (!player) {
          setTimeout(() => connection.close(), 300);
        }
        return;
      }
      if (message.type === 'bye') {
        dropGuest();
        setTimeout(() => connection.close(), GOODBYE_DELAY_MS);
        return;
      }
      this.room.receive(player, message);
    });
    connection.on('close', dropGuest);
    connection.on('error', dropGuest);
  }

  createTransport(handlers) {
    return new LocalTransport(this, handlers);
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.room.broadcast({ type: 'hostLeft' });
    this.room.stop();
    const { connections, peer } = this;
    setTimeout(() => {
      for (const connection of connections) {
        connection.close();
      }
      peer?.destroy();
    }, GOODBYE_DELAY_MS);
  }
}

class LocalTransport {
  constructor(session, handlers) {
    this.session = session;
    this.handlers = handlers;
    this.player = null;
  }

  connect(joinMessage) {
    this.player = this.session.room.join(
      (message) => queueMicrotask(() => this.player && this.handlers.onMessage(message)),
      joinMessage,
      { isHost: true }
    );
    if (this.player) {
      this.handlers.onOpen?.();
    }
  }

  send(message) {
    if (this.player) {
      this.session.room.receive(this.player, message);
    }
  }

  close() {
    this.player = null;
    this.session.destroy();
  }
}

export class GuestTransport {
  constructor(roomCode, handlers) {
    this.roomCode = normalizeRoomCode(roomCode);
    this.handlers = handlers;
    this.connected = false;
    this.closed = false;
  }

  connect(joinMessage) {
    this.connectTimer = setTimeout(() => this.fail(), CONNECT_TIMEOUT_MS);
    this.sayGoodbyeOnPageHide = () => this.send({ type: 'bye' });
    window.addEventListener('pagehide', this.sayGoodbyeOnPageHide);
    this.peer = new Peer();
    this.peer.on('error', () => this.fail());
    this.peer.on('open', () => {
      if (this.closed) {
        return;
      }
      const connection = this.peer.connect(PEER_ID_PREFIX + this.roomCode, CONNECTION_OPTIONS);
      this.connection = connection;
      connection.on('open', () => {
        clearTimeout(this.connectTimer);
        this.connected = true;
        connection.send(joinMessage);
        this.handlers.onOpen?.();
      });
      connection.on('data', (message) => this.handlers.onMessage(message));
      connection.on('close', () => this.fail());
      connection.on('error', () => this.fail());
    });
  }

  fail() {
    if (this.closed) {
      return;
    }
    const wasConnected = this.connected;
    this.close();
    this.handlers.onClose?.(wasConnected);
  }

  send(message) {
    if (this.connected && this.connection?.open) {
      this.connection.send(message);
    }
  }

  close() {
    this.send({ type: 'bye' });
    this.closed = true;
    this.connected = false;
    clearTimeout(this.connectTimer);
    window.removeEventListener('pagehide', this.sayGoodbyeOnPageHide);
    const { connection, peer } = this;
    setTimeout(() => {
      connection?.close();
      peer?.destroy();
    }, GOODBYE_DELAY_MS);
  }
}
