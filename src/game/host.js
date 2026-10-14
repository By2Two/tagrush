import { SPAWNS } from './map.js';
import { MODES, DEFAULT_MODE_ID } from './modes.js';

export const MAX_PLAYERS = 12;
export const ROUNDS_PER_MATCH = 6;

const ROUND_SECONDS = 150;
const BREAK_SECONDS = 8;
const TAG_RANGE = 4.5;
const TAG_IMMUNITY_MS = 2500;
const TAG_STUN_MS = 1200;
const ROUND_START_STUN_MS = 2000;
const FUSE_MIN_SECONDS = 9;
const FUSE_MAX_SECONDS = 22;
const FUSE_GRACE_MS = 2500;
const POTATO_PASS_IMMUNITY_MS = 1500;
const POTATO_PASS_STUN_MS = 400;
const AFTER_EXPLOSION_PAUSE_MS = 2800;
const IDLE_TIMEOUT_MS = 15000;
const SNAPSHOT_INTERVAL_MS = 50;
const CLOCK_INTERVAL_MS = 1000;
const MAX_NAME_LENGTH = 16;
const MOVEMENT_STATE_COUNT = 6;

const toFiniteNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const roundToHundredths = (value) => Math.round(value * 100) / 100;

const publicInfo = (player) => ({
  id: player.id,
  name: player.name,
  colorIndex: player.colorIndex,
  score: player.score,
  wins: player.wins,
});

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];

export class RoomHost {
  constructor({ onRosterChange, onEmpty } = {}) {
    this.onRosterChange = onRosterChange;
    this.onEmpty = onEmpty;
    this.players = new Map();
    this.nextPlayerId = 1;
    this.itPlayerId = null;
    this.phase = 'lobby';
    this.remainingSeconds = 0;
    this.modeId = DEFAULT_MODE_ID;
    this.roundNumber = 0;
    this.hostId = null;
    this.leftPlayers = [];
    this.fuse = null;
    this.nextEventAt = 0;
    this.eliminationOrder = [];
    this.snapshotTimer = setInterval(() => {
      this.stepPotato();
      this.broadcastSnapshot();
    }, SNAPSHOT_INTERVAL_MS);
    this.clockTimer = setInterval(() => this.tickClock(), CLOCK_INTERVAL_MS);
  }

  stop() {
    clearInterval(this.snapshotTimer);
    clearInterval(this.clockTimer);
    this.players.clear();
  }

  roster() {
    return [...this.players.values()].map(({ id, name, colorIndex }) => ({ id, name, colorIndex }));
  }

  broadcast(message, exceptPlayer = null) {
    for (const player of this.players.values()) {
      if (player !== exceptPlayer) {
        player.sendMessage(message);
      }
    }
  }

  scoresById() {
    return Object.fromEntries([...this.players.values()].map((player) => [player.id, player.score]));
  }

  winsById() {
    return Object.fromEntries([...this.players.values()].map((player) => [player.id, player.wins]));
  }

  isPotatoMode() {
    return this.modeId === 'potato';
  }

  alivePlayers() {
    return [...this.players.values()].filter((player) => player.alive);
  }

  potatoSnapshot() {
    const potatoPhase = this.phase === 'play' || this.phase === 'break';
    if (!this.isPotatoMode() || !potatoPhase) {
      return { eliminatedIds: [], fuse: null };
    }
    return {
      eliminatedIds: [...this.players.values()].filter((player) => !player.alive).map((player) => player.id),
      fuse: this.fuse
        ? { remainingSeconds: Math.max(0, (this.fuse.endsAt - Date.now()) / 1000), totalSeconds: this.fuse.totalSeconds }
        : null,
    };
  }

  matchState() {
    return {
      phase: this.phase,
      remainingSeconds: this.remainingSeconds,
      itPlayerId: this.itPlayerId,
      roundNumber: this.roundNumber,
      totalRounds: ROUNDS_PER_MATCH,
      modeId: this.modeId,
      hostId: this.hostId,
      ...this.potatoSnapshot(),
    };
  }

  tickMessage() {
    return { type: 'tick', ...this.matchState(), scores: this.scoresById(), wins: this.winsById() };
  }

  pickItPlayerId(excludedId = null) {
    const candidates = this.alivePlayers().filter((player) => player.id !== excludedId);
    return candidates.length ? randomItem(candidates).id : null;
  }

  join(sendMessage, joinMessage, { isHost = false, closeConnection = null } = {}) {
    if (this.players.size >= MAX_PLAYERS) {
      sendMessage({ type: 'full' });
      return null;
    }
    const name =
      String(joinMessage.name || 'Runner')
        .replace(/[^\p{L}\p{N} _.-]/gu, '')
        .slice(0, MAX_NAME_LENGTH) || 'Runner';
    const usedColors = new Set([...this.players.values()].map((player) => player.colorIndex));
    let colorIndex = 0;
    while (usedColors.has(colorIndex)) {
      colorIndex++;
    }
    const player = {
      id: this.nextPlayerId++,
      sendMessage,
      name,
      colorIndex,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      movementState: 0,
      wall: null,
      score: 0,
      wins: 0,
      totalScore: 0,
      immuneUntil: 0,
      stunnedUntil: 0,
      isLocal: isHost,
      closeConnection,
      lastSeenAt: Date.now(),
      alive: !(this.isPotatoMode() && this.phase === 'play'),
    };
    if (isHost || this.hostId === null) {
      this.hostId = player.id;
    }
    sendMessage({
      type: 'welcome',
      playerId: player.id,
      players: [...this.players.values()].map(publicInfo).concat(publicInfo(player)),
      ...this.matchState(),
      spawnIndex: Math.floor(Math.random() * SPAWNS.length),
    });
    this.players.set(player.id, player);
    this.broadcast({ type: 'join', player: publicInfo(player) }, player);
    this.broadcast(this.tickMessage());
    this.onRosterChange?.(this.roster());
    return player;
  }

  leave(player) {
    if (!this.players.delete(player.id)) {
      return;
    }
    const matchInProgress = this.phase === 'play' || this.phase === 'break';
    if (matchInProgress) {
      this.leftPlayers.push({
        id: player.id,
        name: player.name,
        colorIndex: player.colorIndex,
        wins: player.wins,
        totalScore: player.totalScore + player.score,
        left: true,
      });
    }
    this.broadcast({ type: 'leave', playerId: player.id });
    this.onRosterChange?.(this.roster());
    if (this.players.size === 0) {
      this.onEmpty?.();
      return;
    }
    if (this.hostId === player.id) {
      this.hostId = this.players.keys().next().value;
    }
    if (this.players.size < 2 && matchInProgress) {
      this.finishMatch({ forfeit: true });
      return;
    }
    if (this.itPlayerId === player.id) {
      this.itPlayerId = this.pickItPlayerId();
    }
    if (this.isPotatoMode() && this.phase === 'play' && this.alivePlayers().length <= 1) {
      this.fuse = null;
      this.itPlayerId = null;
      this.nextEventAt = Date.now() + AFTER_EXPLOSION_PAUSE_MS;
    }
    this.broadcast(this.tickMessage());
  }

  receive(player, message) {
    player.lastSeenAt = Date.now();
    switch (message.type) {
      case 'state':
        this.updatePlayerState(player, message);
        break;
      case 'tag':
        this.handleTag(player, message.targetId);
        break;
      case 'swing':
        this.broadcast({ type: 'swing', playerId: player.id, side: message.side ? 1 : 0 }, player);
        break;
      case 'ping':
        player.sendMessage({ type: 'pong', sentAt: message.sentAt });
        break;
      case 'startMatch':
        if (player.id === this.hostId && (this.phase === 'lobby' || this.phase === 'podium')) {
          this.startMatch(message.modeId);
        }
        break;
      case 'toLobby':
        if (player.id === this.hostId && this.phase === 'podium') {
          this.phase = 'lobby';
          this.roundNumber = 0;
          this.broadcast(this.tickMessage());
        }
        break;
      default:
        break;
    }
  }

  updatePlayerState(player, message) {
    if (!message.position) {
      return;
    }
    player.position = {
      x: toFiniteNumber(message.position.x),
      y: toFiniteNumber(message.position.y),
      z: toFiniteNumber(message.position.z),
    };
    player.yaw = toFiniteNumber(message.yaw);
    player.pitch = toFiniteNumber(message.pitch);
    player.movementState = Math.max(0, Math.min(MOVEMENT_STATE_COUNT - 1, Math.trunc(toFiniteNumber(message.state))));
    player.wall = message.wall
      ? {
          normalX: roundToHundredths(toFiniteNumber(message.wall.normalX)),
          normalZ: roundToHundredths(toFiniteNumber(message.wall.normalZ)),
        }
      : null;
  }

  startMatch(modeId) {
    if (this.players.size < 2) {
      return;
    }
    if (MODES.some((mode) => mode.id === modeId)) {
      this.modeId = modeId;
    }
    this.roundNumber = 0;
    this.leftPlayers = [];
    for (const player of this.players.values()) {
      player.wins = 0;
      player.totalScore = 0;
    }
    this.startRound();
  }

  startRound() {
    if (this.players.size < 2) {
      this.phase = 'lobby';
      this.itPlayerId = null;
      this.remainingSeconds = 0;
      this.broadcast(this.tickMessage());
      return;
    }
    this.roundNumber++;
    this.phase = 'play';
    this.fuse = null;
    this.nextEventAt = 0;
    this.eliminationOrder = [];
    for (const player of this.players.values()) {
      player.alive = true;
    }
    this.remainingSeconds = ROUND_SECONDS;
    this.itPlayerId = this.pickItPlayerId();
    const shuffledSpawnIndexes = SPAWNS.map((_spawn, index) => index).sort(() => Math.random() - 0.5);
    const spawnIndexByPlayer = {};
    let spawnCursor = 0;
    for (const player of this.players.values()) {
      player.score = 0;
      player.immuneUntil = 0;
      player.stunnedUntil = Date.now() + ROUND_START_STUN_MS;
      spawnIndexByPlayer[player.id] = shuffledSpawnIndexes[spawnCursor++ % shuffledSpawnIndexes.length];
    }
    if (this.isPotatoMode()) {
      this.remainingSeconds = 0;
      this.fuse = this.createFuse(FUSE_GRACE_MS);
    }
    this.broadcast({
      type: 'start',
      itPlayerId: this.itPlayerId,
      spawnIndexByPlayer,
      remainingSeconds: this.remainingSeconds,
      roundNumber: this.roundNumber,
      totalRounds: ROUNDS_PER_MATCH,
      modeId: this.modeId,
      ...this.potatoSnapshot(),
    });
  }

  createFuse(extraMs = 0) {
    const totalSeconds = FUSE_MIN_SECONDS + Math.random() * (FUSE_MAX_SECONDS - FUSE_MIN_SECONDS);
    return { totalSeconds, endsAt: Date.now() + extraMs + totalSeconds * 1000 };
  }

  stepPotato() {
    if (!this.isPotatoMode() || this.phase !== 'play') {
      return;
    }
    const now = Date.now();
    if (this.fuse && now >= this.fuse.endsAt) {
      this.explodePotato();
    } else if (!this.fuse && this.nextEventAt && now >= this.nextEventAt) {
      this.passToNextHolder();
    }
  }

  explodePotato() {
    const holder = this.players.get(this.itPlayerId);
    this.fuse = null;
    this.itPlayerId = null;
    this.nextEventAt = Date.now() + AFTER_EXPLOSION_PAUSE_MS;
    if (holder) {
      holder.alive = false;
      this.eliminationOrder.push(holder.id);
      this.broadcast({ type: 'boom', playerId: holder.id, position: { ...holder.position } });
    }
    this.broadcast(this.tickMessage());
  }

  passToNextHolder() {
    this.nextEventAt = 0;
    const survivors = this.alivePlayers();
    if (survivors.length <= 1) {
      this.endRound();
      return;
    }
    this.itPlayerId = randomItem(survivors).id;
    this.fuse = this.createFuse();
    this.broadcast(this.tickMessage());
  }

  endRound() {
    const players = [...this.players.values()];
    if (this.isPotatoMode()) {
      for (const player of players) {
        player.score = player.alive ? players.length : Math.max(0, this.eliminationOrder.indexOf(player.id));
      }
      this.fuse = null;
      this.nextEventAt = 0;
    }
    const bestScore = Math.max(...players.map((player) => player.score));
    const winners = players.filter((player) => player.score === bestScore);
    for (const winner of winners) {
      winner.wins++;
    }
    for (const player of players) {
      player.totalScore += player.score;
    }
    const ranking = players
      .map((player) => ({ id: player.id, name: player.name, score: player.score }))
      .sort((first, second) => second.score - first.score);
    this.itPlayerId = null;
    const endMessage = {
      type: 'end',
      ranking,
      winnerIds: winners.map((winner) => winner.id),
      wins: this.winsById(),
      final: false,
      roundNumber: this.roundNumber,
    };
    if (this.roundNumber >= ROUNDS_PER_MATCH) {
      this.finishMatch({}, endMessage);
      return;
    }
    this.phase = 'break';
    this.remainingSeconds = BREAK_SECONDS;
    this.broadcast(endMessage);
  }

  finishMatch({ forfeit = false } = {}, roundEndMessage = null) {
    const byWinsThenScore = (first, second) => second.wins - first.wins || second.totalScore - first.totalScore;
    const podium = [...this.players.values()]
      .map((player) => ({
        id: player.id,
        name: player.name,
        colorIndex: player.colorIndex,
        wins: player.wins,
        totalScore: player.totalScore + (roundEndMessage ? 0 : player.score),
      }))
      .sort(byWinsThenScore)
      .concat([...this.leftPlayers].sort(byWinsThenScore));
    this.phase = 'podium';
    this.remainingSeconds = 0;
    this.itPlayerId = null;
    this.broadcast({
      ranking: [],
      winnerIds: [],
      wins: this.winsById(),
      roundNumber: this.roundNumber,
      ...roundEndMessage,
      type: 'end',
      final: true,
      forfeit,
      podium,
    });
    this.broadcast(this.tickMessage());
  }

  handleTag(player, targetId) {
    const potatoMode = this.isPotatoMode();
    if (this.phase !== 'play' || this.itPlayerId !== player.id) {
      return;
    }
    if (potatoMode && (!player.alive || !this.fuse)) {
      return;
    }
    const now = Date.now();
    if (now < player.stunnedUntil) {
      return;
    }
    const target = this.players.get(targetId);
    if (!target || target === player || now < target.immuneUntil) {
      return;
    }
    if (potatoMode && !target.alive) {
      return;
    }
    const distance = Math.hypot(
      player.position.x - target.position.x,
      player.position.y - target.position.y,
      player.position.z - target.position.z
    );
    if (distance > TAG_RANGE) {
      return;
    }
    this.itPlayerId = target.id;
    player.immuneUntil = now + (potatoMode ? POTATO_PASS_IMMUNITY_MS : TAG_IMMUNITY_MS);
    target.stunnedUntil = now + (potatoMode ? POTATO_PASS_STUN_MS : TAG_STUN_MS);
    this.broadcast({ type: 'tag', fromId: player.id, toId: target.id });
  }

  broadcastSnapshot() {
    if (this.players.size < 2) {
      return;
    }
    const players = [...this.players.values()].map((player) => [
      player.id,
      roundToHundredths(player.position.x),
      roundToHundredths(player.position.y),
      roundToHundredths(player.position.z),
      roundToHundredths(player.yaw),
      roundToHundredths(player.pitch),
      player.movementState,
      player.wall,
    ]);
    this.broadcast({ type: 'snapshot', players });
  }

  tickClock() {
    const now = Date.now();
    for (const player of [...this.players.values()]) {
      if (!player.isLocal && now - player.lastSeenAt > IDLE_TIMEOUT_MS) {
        player.closeConnection?.();
        this.leave(player);
      }
    }
    if (this.phase === 'play') {
      if (!this.isPotatoMode()) {
        this.remainingSeconds--;
        for (const player of this.players.values()) {
          if (player.id !== this.itPlayerId) {
            player.score++;
          }
        }
        if (this.remainingSeconds <= 0) {
          this.endRound();
        }
      }
    } else if (this.phase === 'break') {
      this.remainingSeconds--;
      if (this.remainingSeconds <= 0) {
        this.startRound();
      }
    }
    this.broadcast(this.tickMessage());
  }
}
