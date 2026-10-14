import * as THREE from 'three';
import { SOLIDS, SPAWNS, PLAYER_COLORS } from './map.js';
import { createPlayer, stepPlayer } from './physics.js';
import { sfx } from './sfx.js';
import { ViewModel } from './viewmodel.js';
import { makePotato } from './potato.js';
import { Ragdoll, Blast } from './ragdoll.js';
import { Avatar, IT_COLOR } from './avatar.js';
import { Minimap } from './minimap.js';
import { buildWorld } from './world.js';

const MOVEMENT_LABELS = ['Running', 'Airborne', 'Wall run', 'Climbing', 'Mantle', 'Sliding'];
const ARENA_LIMIT = 46;
const VOID_DEPTH = -25;
const MAX_PHYSICS_STEP = 0.01;
const MAX_FRAME_TIME = 0.05;
const STATE_SEND_INTERVAL = 0.05;
const HUD_UPDATE_INTERVAL = 0.1;
const PING_INTERVAL_MS = 2000;
const FEED_LIFETIME_MS = 5000;
const FEED_MAX_ENTRIES = 5;
const SWING_COOLDOWN_MS = 260;
const TAG_COOLDOWN_MS = 350;
const TAG_REACH = 3.4;
const TAG_MIN_ALIGNMENT = 0.55;
const MOUSE_RADIANS_PER_PIXEL = 0.0022;
const MAX_PLAUSIBLE_MOUSE_DELTA = 400;
const SHOCKWAVE_RADIUS = 7;
const FUSE_URGENCY_WINDOW_SECONDS = 7;
const HUD_POTATO_MAX_SIZE = 170;
const MAX_ROOM_PLAYERS_MESSAGE = 'Room is full (12 players max).';

const roundTo = (value, decimals) => Number(value.toFixed(decimals));
const colorToCss = (color) => `#${color.toString(16).padStart(6, '0')}`;

export class Game {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.options = options;
    this.settings = { mouseSensitivity: 1, fieldOfView: 90, volume: 0.5, ...options.settings };
    this.sessionKind = options.sessionKind;
    this.stopped = false;
    this.pointerLocked = false;
    this.keepMouseFree = false;
    this.pressedKeys = new Set();
    this.jumpPressedThisFrame = false;
    this.showScoreboard = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcfe6ff);
    this.scene.fog = new THREE.Fog(0xcfe6ff, 45, 170);

    this.camera = new THREE.PerspectiveCamera(this.settings.fieldOfView, 1, 0.03, 400);
    this.camera.rotation.order = 'YXZ';
    this.viewModel = new ViewModel(this.camera);
    this.nextPunchSide = 0;
    this.swingLockedUntil = 0;
    this.tagLockedUntil = 0;

    this.player = createPlayer(SPAWNS[0]);
    this.cameraY = this.player.position.y;
    this.bobTime = 0;
    this.landingDip = 0;
    this.currentFov = this.settings.fieldOfView;
    this.cameraShake = 0;

    this.transport = null;
    this.localPlayerId = this.sessionKind === 'solo' ? 'me' : null;
    this.players = new Map();
    this.remoteAvatars = new Map();
    this.scores = {};
    this.wins = {};
    this.itPlayerId = null;
    this.phase = this.sessionKind === 'solo' ? 'solo' : 'connecting';
    this.remainingSeconds = 0;
    this.roundNumber = 0;
    this.totalRounds = 6;
    this.hostId = null;
    this.gameModeId = 'tag';
    this.ranking = null;
    this.winnerIds = [];
    this.podium = null;
    this.forfeit = false;
    this.eliminatedIds = new Set();
    this.fuse = null;
    this.fuseUrgency = 0;
    this.secondsUntilFuseTick = 0;
    this.showHudPotato = false;
    this.ragdolls = [];
    this.blasts = [];
    this.deathCameraSeconds = 0;
    this.spectatedIndex = 0;
    this.feed = [];
    this.pingMs = 0;
    this.tagFlashCounter = 0;
    this.explosionCounter = 0;
    this.hudTimer = 0;
    this.stateSendTimer = 0;
    this.elapsedSeconds = 0;

    if (this.sessionKind === 'solo') {
      this.players.set('me', { name: options.playerName, color: PLAYER_COLORS[0] });
    }

    this.buildPotatoViews();
    buildWorld(this.scene);
    this.minimap = new Minimap(options.minimapCanvas);
    this.handleResize = this.handleResize.bind(this);
    this.loop = this.loop.bind(this);
  }

  buildPotatoViews() {
    this.heldPotato = makePotato();
    this.heldPotato.group.scale.setScalar(0.55);
    this.heldPotato.group.position.set(0, -0.5, -0.95);
    this.heldPotato.group.visible = false;
    this.camera.add(this.heldPotato.group);

    this.hudScene = new THREE.Scene();
    this.hudScene.add(new THREE.HemisphereLight(0xffffff, 0x8892a0, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(1.5, 2.5, 3);
    this.hudScene.add(keyLight);
    this.hudPotato = makePotato({ withLight: true });
    this.hudPotato.group.scale.setScalar(1.35);
    this.hudScene.add(this.hudPotato.group);
    this.hudCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    this.hudCamera.position.set(0, 0.12, 3.4);
    this.hudCamera.lookAt(0, 0.08, 0);
  }

  isPotatoMode() {
    return this.sessionKind === 'online' && this.gameModeId === 'potato';
  }

  fuseRemainingSeconds() {
    if (!this.fuse) {
      return null;
    }
    return Math.max(0, this.fuse.remainingSeconds - (performance.now() - this.fuse.receivedAt) / 1000);
  }

  isEliminated() {
    const roundInProgress = this.phase === 'play' || this.phase === 'break';
    return this.isPotatoMode() && this.eliminatedIds.has(this.localPlayerId) && roundInProgress;
  }

  isIt() {
    return this.localPlayerId !== null && this.itPlayerId === this.localPlayerId;
  }

  start() {
    window.addEventListener('resize', this.handleResize);
    this.bindInputHandlers();

    sfx.setVolume(this.settings.volume);
    sfx.unlock();
    this.handleResize();
    this.respawn();

    if (this.sessionKind === 'online') {
      this.connect();
    }

    this.lastFrameSeconds = performance.now() / 1000;
    this.animationFrame = requestAnimationFrame(this.loop);
  }

  bindInputHandlers() {
    this.handleKeyDown = (event) => {
      if (event.code === 'Tab') {
        event.preventDefault();
        this.showScoreboard = true;
        this.publishHud();
        return;
      }
      if (!this.pointerLocked) {
        return;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ControlLeft'].includes(event.code)) {
        event.preventDefault();
      }
      if (event.repeat) {
        return;
      }
      this.pressedKeys.add(event.code);
      if (event.code === 'Space') {
        this.jumpPressedThisFrame = true;
      }
      if (event.code === 'KeyR') {
        this.respawn();
      }
    };
    this.handleKeyUp = (event) => {
      if (event.code === 'Tab') {
        this.showScoreboard = false;
        this.publishHud();
      }
      this.pressedKeys.delete(event.code);
    };
    this.handleMouseMove = (event) => {
      if (!this.pointerLocked) {
        return;
      }
      const hugeJump = Math.abs(event.movementX) > MAX_PLAUSIBLE_MOUSE_DELTA || Math.abs(event.movementY) > MAX_PLAUSIBLE_MOUSE_DELTA;
      if (hugeJump) {
        return;
      }
      const sensitivity = MOUSE_RADIANS_PER_PIXEL * this.settings.mouseSensitivity;
      this.player.yaw -= event.movementX * sensitivity;
      this.player.pitch = Math.max(-1.5, Math.min(1.5, this.player.pitch - event.movementY * sensitivity));
      this.viewModel.look(event.movementX, event.movementY);
    };
    this.handleMouseDown = (event) => {
      if (!this.pointerLocked && this.phase === 'lobby' && event.target === this.canvas) {
        this.keepMouseFree = false;
        this.requestPointerLock();
      } else if (this.pointerLocked && event.button === 0) {
        if (this.isEliminated()) {
          this.spectatedIndex++;
        } else {
          this.swing();
        }
      }
    };
    this.handlePointerLockChange = () => {
      const lockedNow = document.pointerLockElement === this.canvas;
      if (lockedNow && this.keepMouseFree) {
        document.exitPointerLock();
        return;
      }
      this.pointerLocked = lockedNow;
      if (!this.pointerLocked) {
        this.pressedKeys.clear();
        this.showScoreboard = false;
      }
      this.options.onPointerLockChange?.(this.pointerLocked);
      this.publishHud();
    };
    this.handleBlur = () => this.pressedKeys.clear();
    this.handleContextMenu = (event) => {
      if (this.pointerLocked) {
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('blur', this.handleBlur);
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('blur', this.handleBlur);
    clearInterval(this.pingTimer);
    this.transport?.close();
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    for (const avatar of this.remoteAvatars.values()) {
      avatar.dispose();
    }
    this.clearEffects();
    this.heldPotato.dispose();
    this.hudPotato.dispose();
    this.viewModel.dispose();
    this.renderer.dispose();
    this.minimap.clear();
  }

  requestPointerLock() {
    sfx.unlock();
    try {
      const request = this.canvas.requestPointerLock();
      if (request && request.catch) {
        request.catch(() => {});
      }
    } catch {
      return;
    }
  }

  lock() {
    this.requestPointerLock();
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    sfx.setVolume(this.settings.volume);
  }

  handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  connect() {
    this.transport = this.options.createTransport({
      onMessage: (message) => this.handleMessage(message),
      onClose: (wasConnected) => {
        if (this.stopped) {
          return;
        }
        this.options.onError?.(
          wasConnected
            ? 'Connection to the host was lost.'
            : 'Could not join the room. Check the code and that the host still has the game open.'
        );
      },
    });
    this.transport.connect({ type: 'join', name: this.options.playerName });
    this.pingTimer = setInterval(() => this.transport?.send({ type: 'ping', sentAt: performance.now() }), PING_INTERVAL_MS);
  }

  addPlayer(info) {
    const color = PLAYER_COLORS[info.colorIndex % PLAYER_COLORS.length];
    this.players.set(info.id, { name: info.name, color });
    this.scores[info.id] = info.score || 0;
    this.wins[info.id] = info.wins || 0;
    if (info.id === this.localPlayerId || this.remoteAvatars.has(info.id)) {
      return;
    }
    const avatar = new Avatar(this.players.get(info.id));
    avatar.group.position.set(0, -50, 0);
    this.scene.add(avatar.group);
    this.remoteAvatars.set(info.id, avatar);
    avatar.group.visible = !this.eliminatedIds.has(info.id);
    avatar.markAsIt(this.itPlayerId === info.id, this.gameModeId === 'potato');
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    delete this.scores[playerId];
    delete this.wins[playerId];
    const avatar = this.remoteAvatars.get(playerId);
    if (avatar) {
      this.scene.remove(avatar.group);
      avatar.dispose();
      this.remoteAvatars.delete(playerId);
    }
  }

  setItPlayer(playerId) {
    this.itPlayerId = playerId;
    for (const [avatarPlayerId, avatar] of this.remoteAvatars) {
      avatar.markAsIt(avatarPlayerId === playerId, this.gameModeId === 'potato');
    }
  }

  pushFeed(text, kind = 'info') {
    this.feed.push({ text, kind, createdAt: performance.now() });
    if (this.feed.length > FEED_MAX_ENTRIES) {
      this.feed.shift();
    }
  }

  nameOf(playerId) {
    return this.players.get(playerId)?.name || '???';
  }

  handleMessage(message) {
    switch (message.type) {
      case 'welcome':
        this.handleWelcome(message);
        break;
      case 'join':
        this.addPlayer(message.player);
        this.pushFeed(`${message.player.name} joined`);
        break;
      case 'leave':
        this.pushFeed(`${this.nameOf(message.playerId)} left`);
        this.removePlayer(message.playerId);
        break;
      case 'snapshot':
        this.applySnapshot(message.players);
        break;
      case 'swing':
        this.remoteAvatars.get(message.playerId)?.punch(message.side);
        break;
      case 'start':
        this.handleRoundStart(message);
        break;
      case 'tick':
        this.handleTick(message);
        break;
      case 'tag':
        this.handleTag(message);
        break;
      case 'boom':
        this.handleExplosion(message);
        break;
      case 'end':
        this.handleRoundEnd(message);
        break;
      case 'hostLeft':
        this.options.onError?.('The host closed the room.');
        break;
      case 'pong':
        this.pingMs = Math.round(performance.now() - message.sentAt);
        break;
      case 'full':
        this.options.onError?.(MAX_ROOM_PLAYERS_MESSAGE);
        break;
      default:
        break;
    }
    this.publishHud();
  }

  handleWelcome(message) {
    this.localPlayerId = message.playerId;
    this.syncMatchState(message);
    this.remainingSeconds = message.remainingSeconds;
    this.itPlayerId = message.itPlayerId;
    for (const info of message.players) {
      this.addPlayer(info);
    }
    this.setItPlayer(message.itPlayerId);
    this.respawn(message.spawnIndex);
  }

  applySnapshot(entries) {
    for (const [playerId, positionX, positionY, positionZ, yaw, pitch, movementState, wall] of entries) {
      const avatar = this.remoteAvatars.get(playerId);
      if (!avatar) {
        continue;
      }
      avatar.target = { x: positionX, y: positionY, z: positionZ, yaw };
      avatar.movementState = movementState;
      avatar.pitch = pitch;
      avatar.wall = wall;
    }
  }

  handleRoundStart(message) {
    this.clearEffects();
    this.gameModeId = message.modeId;
    this.syncPotatoState(message);
    this.setPhase('play');
    if (!this.pointerLocked) {
      this.requestPointerLock();
    }
    this.roundNumber = message.roundNumber;
    this.totalRounds = message.totalRounds;
    this.podium = null;
    this.remainingSeconds = message.remainingSeconds;
    this.ranking = null;
    this.scores = {};
    for (const playerId of this.players.keys()) {
      this.scores[playerId] = 0;
    }
    this.setItPlayer(message.itPlayerId);
    this.respawn(message.spawnIndexByPlayer[this.localPlayerId]);
    const itName = this.nameOf(message.itPlayerId);
    this.pushFeed(
      this.isPotatoMode() ? `Round ${message.roundNumber}: ${itName} has the potato!` : `Round started! ${itName} is IT.`,
      'good'
    );
    sfx.start();
  }

  handleTick(message) {
    this.syncMatchState(message);
    this.remainingSeconds = message.remainingSeconds;
    for (const [playerId, wins] of Object.entries(message.wins)) {
      this.wins[Number(playerId)] = wins;
    }
    for (const [playerId, score] of Object.entries(message.scores)) {
      this.scores[Number(playerId)] = score;
    }
    if (message.itPlayerId !== this.itPlayerId) {
      this.setItPlayer(message.itPlayerId);
    }
  }

  handleTag(message) {
    this.setItPlayer(message.toId);
    const tookIt = message.toId === this.localPlayerId;
    const fromName = this.nameOf(message.fromId);
    const toName = this.nameOf(message.toId);
    if (this.isPotatoMode()) {
      this.pushFeed(`${fromName} passed the potato to ${toName}`, tookIt ? 'bad' : 'info');
      sfx.pass();
      if (tookIt) {
        this.tagFlashCounter++;
      }
      return;
    }
    this.pushFeed(`${fromName} tagged ${toName}`, tookIt ? 'bad' : 'info');
    if (message.fromId === this.localPlayerId) {
      sfx.tag();
    }
    if (tookIt) {
      sfx.gotTagged();
      this.tagFlashCounter++;
    }
  }

  handleRoundEnd(message) {
    this.fuse = null;
    this.setPhase(message.final ? 'podium' : 'break');
    this.ranking = message.ranking;
    this.winnerIds = message.winnerIds;
    this.forfeit = Boolean(message.forfeit);
    this.roundNumber = message.roundNumber;
    for (const [playerId, wins] of Object.entries(message.wins)) {
      this.wins[Number(playerId)] = wins;
    }
    this.podium = message.podium
      ? message.podium.map((entry) => ({
          ...entry,
          colorCss: colorToCss(PLAYER_COLORS[entry.colorIndex % PLAYER_COLORS.length]),
          isLocalPlayer: entry.id === this.localPlayerId,
        }))
      : null;
    this.setItPlayer(null);
  }

  syncMatchState(message) {
    this.setPhase(message.phase);
    this.roundNumber = message.roundNumber;
    this.totalRounds = message.totalRounds;
    this.gameModeId = message.modeId;
    this.hostId = message.hostId;
    this.syncPotatoState(message);
  }

  syncPotatoState(message) {
    this.eliminatedIds = new Set(message.eliminatedIds || []);
    for (const [playerId, avatar] of this.remoteAvatars) {
      avatar.group.visible = !this.eliminatedIds.has(playerId);
    }
    this.fuse = message.fuse
      ? {
          remainingSeconds: message.fuse.remainingSeconds,
          totalSeconds: message.fuse.totalSeconds,
          receivedAt: performance.now(),
        }
      : null;
  }

  clearEffects() {
    for (const ragdoll of this.ragdolls) {
      ragdoll.dispose();
    }
    for (const blast of this.blasts) {
      blast.dispose();
    }
    this.ragdolls = [];
    this.blasts = [];
    this.deathCameraSeconds = 0;
  }

  setPhase(phase) {
    const isMenuPhase = phase === 'lobby' || phase === 'podium';
    if (isMenuPhase && phase !== this.phase) {
      this.keepMouseFree = true;
      if (this.pointerLocked) {
        document.exitPointerLock();
      }
    }
    if (isMenuPhase) {
      this.clearEffects();
    } else {
      this.keepMouseFree = false;
    }
    this.phase = phase;
  }

  startMatch(modeId) {
    this.transport?.send({ type: 'startMatch', modeId });
  }

  returnToLobby() {
    this.transport?.send({ type: 'toLobby' });
  }

  handleExplosion(message) {
    const isLocalPlayer = message.playerId === this.localPlayerId;
    const avatar = this.remoteAvatars.get(message.playerId);
    let position = message.position;
    let yaw = 0;
    if (isLocalPlayer) {
      position = { ...this.player.position };
      yaw = this.player.yaw;
    } else if (avatar) {
      position = { x: avatar.group.position.x, y: avatar.group.position.y, z: avatar.group.position.z };
      yaw = avatar.yaw;
    }
    const color = this.players.get(message.playerId)?.color ?? PLAYER_COLORS[0];
    const heading = Math.random() * Math.PI * 2;
    const launchSpeed = 13 + Math.random() * 6;
    const impulse = {
      x: Math.cos(heading) * launchSpeed,
      y: 12 + Math.random() * 5,
      z: Math.sin(heading) * launchSpeed,
    };
    this.ragdolls.push(new Ragdoll(this.scene, { color, position, yaw, impulse }));
    this.blasts.push(new Blast(this.scene, { x: position.x, y: position.y + 1.1, z: position.z }));
    this.eliminatedIds.add(message.playerId);
    if (avatar) {
      avatar.group.visible = false;
    }
    if (this.itPlayerId === message.playerId) {
      this.setItPlayer(null);
    }

    const cameraPosition = this.camera.position;
    const distance = Math.hypot(
      cameraPosition.x - position.x,
      cameraPosition.y - position.y,
      cameraPosition.z - position.z
    );
    const closeness = Math.max(0, 1 - distance / 40);
    this.cameraShake = Math.max(this.cameraShake, 0.25 + closeness * 1.1);
    if (distance < 22) {
      this.explosionCounter++;
    }
    sfx.boom(0.35 + closeness * 0.65);

    if (isLocalPlayer) {
      this.deathCameraSeconds = 3.2;
      this.pushFeed('You blew up!', 'bad');
      return;
    }
    this.pushFeed(`${this.nameOf(message.playerId)} blew up!`, 'info');
    this.applyShockwave(position);
  }

  applyShockwave(explosionPosition) {
    const player = this.player;
    const offsetX = player.position.x - explosionPosition.x;
    const offsetZ = player.position.z - explosionPosition.z;
    const distance = Math.hypot(offsetX, offsetZ) || 0.01;
    if (distance >= SHOCKWAVE_RADIUS || this.isEliminated() || this.phase !== 'play') {
      return;
    }
    const strength = 1 - distance / SHOCKWAVE_RADIUS;
    player.velocity.x += (offsetX / distance) * 14 * strength;
    player.velocity.z += (offsetZ / distance) * 14 * strength;
    player.velocity.y += 5 * strength;
    player.onGround = false;
  }

  respawn(spawnIndex) {
    const index = spawnIndex ?? Math.floor(Math.random() * SPAWNS.length);
    const spawn = SPAWNS[index % SPAWNS.length];
    const player = this.player;
    player.position = { x: spawn.x, y: spawn.y, z: spawn.z };
    player.velocity = { x: 0, y: 0, z: 0 };
    player.yaw = Math.atan2(spawn.x, spawn.z);
    player.pitch = 0;
    player.crouching = false;
    player.sliding = false;
    player.wall = null;
    player.climbing = false;
    player.mantle = null;
    player.roll = 0;
    this.cameraY = spawn.y;
  }

  swing() {
    const now = performance.now();
    if (now < this.swingLockedUntil) {
      return;
    }
    this.swingLockedUntil = now + SWING_COOLDOWN_MS;
    this.viewModel.punch(this.nextPunchSide);
    this.transport?.send({ type: 'swing', side: this.nextPunchSide });
    this.nextPunchSide ^= 1;
    sfx.swing();
    this.tryTagNearbyPlayer(TAG_REACH, TAG_MIN_ALIGNMENT);
  }

  tryTagNearbyPlayer(reach, minimumAlignment) {
    const canTag =
      this.sessionKind === 'online' && this.isIt() && this.phase === 'play' && this.transport && !this.isEliminated();
    if (!canTag) {
      return;
    }
    const now = performance.now();
    if (now < this.tagLockedUntil) {
      return;
    }
    const position = this.player.position;
    const lookDirection = new THREE.Vector3();
    this.camera.getWorldDirection(lookDirection);
    let bestTargetId = null;
    let bestDistance = Infinity;
    for (const [playerId, avatar] of this.remoteAvatars) {
      if (this.eliminatedIds.has(playerId)) {
        continue;
      }
      const offsetX = avatar.group.position.x - position.x;
      const offsetY = avatar.group.position.y + 0.9 - (position.y + 1.0);
      const offsetZ = avatar.group.position.z - position.z;
      const distance = Math.hypot(offsetX, offsetY, offsetZ);
      if (distance > reach || distance < 0.001) {
        continue;
      }
      const alignment = (offsetX * lookDirection.x + offsetY * lookDirection.y + offsetZ * lookDirection.z) / distance;
      if (alignment < minimumAlignment) {
        continue;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTargetId = playerId;
      }
    }
    if (bestTargetId !== null) {
      this.transport.send({ type: 'tag', targetId: bestTargetId });
      this.tagLockedUntil = now + TAG_COOLDOWN_MS;
    }
  }

  loop(timestampMs) {
    if (this.stopped) {
      return;
    }
    this.animationFrame = requestAnimationFrame(this.loop);
    const nowSeconds = timestampMs / 1000;
    const deltaTime = Math.min(MAX_FRAME_TIME, Math.max(0.0001, nowSeconds - this.lastFrameSeconds));
    this.lastFrameSeconds = nowSeconds;
    this.elapsedSeconds += deltaTime;
    this.update(deltaTime);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (!this.isEliminated()) {
      this.renderer.clearDepth();
      this.renderer.render(this.viewModel.scene, this.camera);
    }
    if (this.showHudPotato) {
      this.renderHudPotato();
    }
  }

  renderHudPotato() {
    const renderer = this.renderer;
    const canvasSize = renderer.getSize(new THREE.Vector2());
    const viewportSize = Math.round(Math.min(HUD_POTATO_MAX_SIZE, canvasSize.y * 0.24));
    const viewportX = Math.round((canvasSize.x - viewportSize) / 2);
    const viewportY = Math.round(canvasSize.y - viewportSize - 4);
    renderer.setScissorTest(true);
    renderer.setScissor(viewportX, viewportY, viewportSize, viewportSize);
    renderer.setViewport(viewportX, viewportY, viewportSize, viewportSize);
    renderer.clearDepth();
    renderer.render(this.hudScene, this.hudCamera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, canvasSize.x, canvasSize.y);
  }

  readMovementInput(eliminated) {
    const keys = this.pressedKeys;
    const active = this.pointerLocked && !eliminated;
    return {
      forward: active && (keys.has('KeyW') || keys.has('ArrowUp')),
      backward: active && (keys.has('KeyS') || keys.has('ArrowDown')),
      left: active && (keys.has('KeyA') || keys.has('ArrowLeft')),
      right: active && (keys.has('KeyD') || keys.has('ArrowRight')),
      jumpHeld: active && keys.has('Space'),
      sprint: active && (keys.has('ShiftLeft') || keys.has('ShiftRight')),
      slideHeld: active && (keys.has('KeyC') || keys.has('ControlLeft')),
      jumpPressed: false,
    };
  }

  simulatePlayer(deltaTime, eliminated) {
    const player = this.player;
    const input = this.readMovementInput(eliminated);
    const stepCount = eliminated ? 0 : Math.max(1, Math.ceil(deltaTime / MAX_PHYSICS_STEP));
    const stepTime = deltaTime / stepCount;
    for (let stepIndex = 0; stepIndex < stepCount; stepIndex++) {
      input.jumpPressed = stepIndex === 0 && this.jumpPressedThisFrame;
      const wasOnGround = player.onGround;
      const wasOnWall = Boolean(player.wall);
      const wasMantling = Boolean(player.mantle);
      const fallSpeed = player.velocity.y;
      stepPlayer(player, input, stepTime, SOLIDS);
      if (!wasOnGround && player.onGround && fallSpeed < -6) {
        this.landingDip = Math.min(1, -fallSpeed / 16);
        sfx.land();
      }
      if (input.jumpPressed && wasOnGround && !player.onGround && player.velocity.y > 5) {
        sfx.jump();
      }
      if (!wasOnWall && player.wall) {
        sfx.wall();
      }
      if (!wasMantling && player.mantle) {
        sfx.wall();
      }
    }
    this.jumpPressedThisFrame = false;

    const { x: playerX, y: feetY, z: playerZ } = player.position;
    const outOfBounds = feetY < VOID_DEPTH || Math.abs(playerX) > ARENA_LIMIT || Math.abs(playerZ) > ARENA_LIMIT;
    if (!eliminated && outOfBounds) {
      this.respawn();
    }
  }

  sendPlayerState() {
    const { position, wall } = this.player;
    this.transport.send({
      type: 'state',
      position: { x: roundTo(position.x, 2), y: roundTo(position.y, 2), z: roundTo(position.z, 2) },
      yaw: roundTo(this.player.yaw, 3),
      pitch: roundTo(this.player.pitch, 3),
      state: this.player.state,
      wall: wall ? { normalX: roundTo(wall.normalX, 2), normalZ: roundTo(wall.normalZ, 2) } : null,
    });
  }

  update(deltaTime) {
    const eliminated = this.isEliminated();
    this.simulatePlayer(deltaTime, eliminated);

    this.updatePotato(deltaTime);
    for (const avatar of this.remoteAvatars.values()) {
      avatar.urgency = this.fuseUrgency;
      avatar.update(deltaTime, this.elapsedSeconds);
    }
    for (const ragdoll of this.ragdolls) {
      ragdoll.update(deltaTime);
    }
    this.blasts = this.blasts.filter((blast) => {
      const alive = blast.update(deltaTime);
      if (!alive) {
        blast.dispose();
      }
      return alive;
    });
    this.cameraShake = Math.max(0, this.cameraShake - deltaTime * 1.6);

    this.updateCamera(deltaTime);

    this.stateSendTimer += deltaTime;
    if (this.transport && this.stateSendTimer >= STATE_SEND_INTERVAL && !eliminated) {
      this.stateSendTimer = 0;
      this.sendPlayerState();
    }

    this.minimap.draw({
      avatars: this.remoteAvatars,
      itPlayerId: this.itPlayerId,
      localPosition: this.player.position,
      localYaw: this.player.yaw,
      localIsIt: this.isIt(),
    });

    this.hudTimer += deltaTime;
    if (this.hudTimer >= HUD_UPDATE_INTERVAL) {
      this.hudTimer = 0;
      this.publishHud();
    }
  }

  updatePotato(deltaTime) {
    const remaining = this.isPotatoMode() && this.phase === 'play' ? this.fuseRemainingSeconds() : null;
    const fuseBurning = remaining !== null;
    this.fuseUrgency = fuseBurning ? Math.max(0.08, Math.min(1, 1 - remaining / FUSE_URGENCY_WINDOW_SECONDS)) : 0;
    const holdingPotato = fuseBurning && this.isIt() && !this.isEliminated();
    this.heldPotato.group.visible = holdingPotato;
    if (holdingPotato) {
      this.heldPotato.setUrgency(this.fuseUrgency);
      this.heldPotato.update(deltaTime);
    }
    this.showHudPotato = fuseBurning;
    if (!fuseBurning) {
      this.secondsUntilFuseTick = 0;
      return;
    }
    this.hudPotato.setUrgency(this.fuseUrgency);
    this.hudPotato.update(deltaTime);
    this.hudPotato.group.rotation.y = Math.sin(this.elapsedSeconds * 1.3) * 0.7;
    this.secondsUntilFuseTick -= deltaTime;
    if (this.secondsUntilFuseTick <= 0) {
      this.secondsUntilFuseTick = Math.max(0.11, Math.min(1, remaining / 8));
      sfx.fuseTick(holdingPotato ? 1 : 0.35, this.fuseUrgency);
    }
  }

  updateSpectatorCamera(deltaTime) {
    const camera = this.camera;
    const desiredPosition = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();
    if (this.deathCameraSeconds > 0 && this.ragdolls.length) {
      this.deathCameraSeconds -= deltaTime;
      lookTarget.copy(this.ragdolls[this.ragdolls.length - 1].center);
      desiredPosition.copy(lookTarget).add(new THREE.Vector3(0, 3.5, 7));
    } else {
      const livingAvatars = [...this.remoteAvatars]
        .filter(([playerId]) => !this.eliminatedIds.has(playerId))
        .sort(([firstId], [secondId]) => firstId - secondId);
      if (!livingAvatars.length) {
        return;
      }
      const spectatedCount = livingAvatars.length;
      const [, avatar] = livingAvatars[((this.spectatedIndex % spectatedCount) + spectatedCount) % spectatedCount];
      const position = avatar.group.position;
      lookTarget.set(position.x, position.y + 1.3, position.z);
      desiredPosition.set(position.x + Math.sin(avatar.yaw) * 4.5, position.y + 2.8, position.z + Math.cos(avatar.yaw) * 4.5);
    }
    camera.position.lerp(desiredPosition, 1 - Math.exp(-5 * deltaTime));
    camera.lookAt(lookTarget);
    if (this.cameraShake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * this.cameraShake * 0.25;
      camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.25;
    }
    if (Math.abs(camera.fov - this.settings.fieldOfView) > 0.02) {
      camera.fov = this.settings.fieldOfView;
      camera.updateProjectionMatrix();
    }
  }

  updateCamera(deltaTime) {
    if (this.isEliminated()) {
      this.updateSpectatorCamera(deltaTime);
      return;
    }
    const player = this.player;
    const heightDifference = player.position.y - this.cameraY;
    if (Math.abs(heightDifference) > 1.2) {
      this.cameraY = player.position.y;
    } else {
      this.cameraY += heightDifference * Math.min(1, 22 * deltaTime);
    }

    const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    const walkingOnGround = player.onGround && !player.sliding;
    if (walkingOnGround) {
      this.bobTime += horizontalSpeed * deltaTime * 0.65;
    }
    const bobStrength = walkingOnGround ? Math.min(1, horizontalSpeed / 8) : 0;
    const bobOffset = Math.sin(this.bobTime * 2) * 0.035 * bobStrength;

    this.landingDip = Math.max(0, this.landingDip - deltaTime * 3.5);

    const camera = this.camera;
    camera.position.set(
      player.position.x,
      this.cameraY + player.eyeHeight + bobOffset - this.landingDip * 0.25,
      player.position.z
    );

    const localColor = this.players.get(this.localPlayerId)?.color ?? PLAYER_COLORS[0];
    this.viewModel.setColor(this.isIt() && !this.isPotatoMode() ? IT_COLOR : localColor);
    this.viewModel.update(deltaTime, {
      state: player.state,
      speed: horizontalSpeed,
      verticalSpeed: player.velocity.y,
      bobTime: this.bobTime,
      yaw: player.yaw,
      eyeHeight: player.eyeHeight,
      cameraY: this.cameraY,
      x: player.position.x,
      z: player.position.z,
      wall: player.wall,
      mantleProgress: player.mantle ? Math.min(1, player.mantle.elapsed / player.mantle.duration) : -1,
    });
    camera.rotation.set(player.pitch, player.yaw, player.roll + this.viewModel.kick.roll, 'YXZ');

    const holdingPotato = this.heldPotato.group.visible;
    const shakeAmount = this.cameraShake + (holdingPotato ? this.fuseUrgency ** 2 * 0.12 : 0);
    if (shakeAmount > 0.001) {
      camera.rotation.x += (Math.random() - 0.5) * shakeAmount * 0.05;
      camera.rotation.y += (Math.random() - 0.5) * shakeAmount * 0.05;
      camera.position.y += (Math.random() - 0.5) * shakeAmount * 0.1;
    }

    const targetFov = this.settings.fieldOfView + Math.min(horizontalSpeed, 16) * 0.55 + this.viewModel.kick.fov;
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, 6 * deltaTime);
    if (Math.abs(camera.fov - this.currentFov) > 0.02) {
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }
  }

  publishHud() {
    if (!this.options.onHudUpdate || this.stopped) {
      return;
    }
    const now = performance.now();
    this.feed = this.feed.filter((entry) => now - entry.createdAt < FEED_LIFETIME_MS);
    const scoreboard = [...this.players]
      .map(([playerId, info]) => ({
        id: playerId,
        name: info.name,
        score: this.scores[playerId] || 0,
        wins: this.wins[playerId] || 0,
        isIt: playerId === this.itPlayerId,
        isLocalPlayer: playerId === this.localPlayerId,
        eliminated: this.eliminatedIds.has(playerId),
      }))
      .sort((first, second) => second.score - first.score);
    const potatoRoundActive = this.isPotatoMode() && this.phase === 'play';
    const player = this.player;
    this.options.onHudUpdate({
      sessionKind: this.sessionKind,
      phase: this.phase,
      remainingSeconds: this.remainingSeconds,
      speedKmh: Math.round(Math.hypot(player.velocity.x, player.velocity.z) * 3.6),
      movementLabel: MOVEMENT_LABELS[player.state] || '',
      isIt: this.isIt(),
      itPlayerName: this.itPlayerId !== null ? this.nameOf(this.itPlayerId) : '',
      scoreboard,
      ranking: this.ranking,
      roundNumber: this.roundNumber,
      totalRounds: this.totalRounds,
      wins: this.wins,
      winnerIds: this.winnerIds,
      podium: this.podium,
      forfeit: this.forfeit,
      gameModeId: this.gameModeId,
      hostId: this.hostId,
      isRoomHost: this.hostId !== null && this.hostId === this.localPlayerId,
      feed: this.feed.map((entry) => ({ ...entry })),
      showScoreboard: this.showScoreboard,
      pingMs: this.pingMs,
      tagFlashCounter: this.tagFlashCounter,
      explosionCounter: this.explosionCounter,
      potatoActive: potatoRoundActive,
      fuse:
        potatoRoundActive && this.fuse
          ? { remainingSeconds: this.fuseRemainingSeconds(), totalSeconds: this.fuse.totalSeconds }
          : null,
      eliminated: this.isEliminated(),
      aliveCount: [...this.players.keys()].filter((playerId) => !this.eliminatedIds.has(playerId)).length,
      playerCount: this.players.size,
      localPlayerId: this.localPlayerId,
    });
  }
}
