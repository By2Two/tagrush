import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/Game.js';
import { GuestTransport, HostSession, buildInviteLink, normalizeRoomCode } from './game/p2p.js';
import HUD from './components/HUD.jsx';
import Menu from './components/Menu.jsx';
import PauseMenu from './components/PauseMenu.jsx';

const SETTINGS_STORAGE_KEY = 'tagrush.settings';
const PROFILE_STORAGE_KEY = 'tagrush.profile';
const DEFAULT_SETTINGS = { mouseSensitivity: 1, fieldOfView: 90, volume: 0.5 };
const ROOM_CODE_LENGTH = 5;

const readRoomCodeFromUrl = () => normalizeRoomCode(new URLSearchParams(window.location.search).get('room'));

function readStored(key, fallback) {
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(key)) || {}) };
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function createDefaultProfile() {
  return {
    name: `Runner${Math.floor(100 + Math.random() * 900)}`,
    sessionKind: 'online',
    roomCode: '',
  };
}

export default function App() {
  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const gameRef = useRef(null);
  const hostSessionRef = useRef(null);

  const [screen, setScreen] = useState('menu');
  const [pointerLocked, setPointerLocked] = useState(false);
  const [hud, setHud] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [settings, setSettings] = useState(() => readStored(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS));
  const [profile, setProfile] = useState(() => readStored(PROFILE_STORAGE_KEY, createDefaultProfile()));
  const [invitedRoomCode] = useState(readRoomCodeFromUrl);
  const [hostedRoom, setHostedRoom] = useState(null);
  const [inviteLink, setInviteLink] = useState('');
  const isHostingSession = screen === 'play' && Boolean(inviteLink);

  useEffect(() => {
    writeStored(SETTINGS_STORAGE_KEY, settings);
    gameRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    writeStored(PROFILE_STORAGE_KEY, profile);
  }, [profile]);

  useEffect(
    () => () => {
      gameRef.current?.stop();
      hostSessionRef.current?.destroy();
    },
    []
  );

  useEffect(() => {
    if (!isHostingSession) {
      return undefined;
    }
    const confirmBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', confirmBeforeUnload);
    return () => window.removeEventListener('beforeunload', confirmBeforeUnload);
  }, [isHostingSession]);

  const closeHostSession = useCallback(() => {
    hostSessionRef.current?.destroy();
    hostSessionRef.current = null;
    setHostedRoom(null);
    setInviteLink('');
  }, []);

  const hostRoom = useCallback(() => {
    hostSessionRef.current?.destroy();
    setErrorMessage('');
    setHostedRoom({ roomCode: null, players: [], error: '' });
    const updateHostedRoom = (changes) => setHostedRoom((room) => (room ? { ...room, ...changes } : room));
    hostSessionRef.current = new HostSession({
      onReady: (roomCode) => updateHostedRoom({ roomCode }),
      onRosterChange: (players) => updateHostedRoom({ players }),
      onError: (message) => updateHostedRoom({ error: message }),
    });
  }, []);

  const leaveGame = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    gameRef.current?.stop();
    gameRef.current = null;
    closeHostSession();
    setHud(null);
    setPointerLocked(false);
    setScreen('menu');
  }, [closeHostSession]);

  const startSession = useCallback(
    (kind) => {
      setErrorMessage('');
      const sessionKind = kind === 'solo' ? 'solo' : 'online';
      if (sessionKind !== profile.sessionKind) {
        setProfile((current) => ({ ...current, sessionKind }));
      }

      let createTransport = null;
      if (kind === 'host') {
        const hostSession = hostSessionRef.current;
        if (!hostSession?.roomCode) {
          return;
        }
        setInviteLink(buildInviteLink(hostSession.roomCode));
        createTransport = (handlers) => hostSession.createTransport(handlers);
      } else if (kind === 'join') {
        const roomCode = normalizeRoomCode(profile.roomCode);
        if (roomCode.length < ROOM_CODE_LENGTH) {
          setErrorMessage(`Enter the ${ROOM_CODE_LENGTH}-character room code.`);
          return;
        }
        createTransport = (handlers) => new GuestTransport(roomCode, handlers);
      }

      gameRef.current?.stop();
      const game = new Game(canvasRef.current, {
        minimapCanvas: minimapRef.current,
        settings,
        sessionKind,
        playerName: profile.name.trim() || 'Runner',
        createTransport,
        onHudUpdate: setHud,
        onPointerLockChange: setPointerLocked,
        onError: (message) => {
          game.stop();
          if (gameRef.current === game) {
            gameRef.current = null;
          }
          closeHostSession();
          setHud(null);
          setPointerLocked(false);
          setErrorMessage(message);
          setScreen('menu');
        },
      });
      gameRef.current = game;
      setHud(null);
      setScreen('play');
      game.start();
      game.lock();
      if (kind === 'host') {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    },
    [settings, profile, closeHostSession]
  );

  const inMenuPhase = hud?.phase === 'lobby' || hud?.phase === 'podium';
  const showPauseMenu = screen === 'play' && !pointerLocked && !inMenuPhase;

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" />
      <HUD
        hud={hud}
        visible={screen === 'play'}
        pointerLocked={pointerLocked}
        minimapRef={minimapRef}
        isHostingSession={isHostingSession}
        onStartMatch={(modeId) => gameRef.current?.startMatch(modeId)}
        onReturnToLobby={() => gameRef.current?.returnToLobby()}
        onLeave={leaveGame}
      />
      {screen === 'menu' && (
        <Menu
          profile={profile}
          onProfileChange={setProfile}
          settings={settings}
          onSettingsChange={setSettings}
          onStartSession={startSession}
          errorMessage={errorMessage}
          invitedRoomCode={invitedRoomCode}
          hostedRoom={hostedRoom}
          onHostRoom={hostRoom}
          onCancelHosting={closeHostSession}
        />
      )}
      {showPauseMenu && (
        <PauseMenu
          settings={settings}
          onSettingsChange={setSettings}
          inviteLink={inviteLink}
          onResume={() => gameRef.current?.lock()}
          onLeave={leaveGame}
        />
      )}
    </div>
  );
}
