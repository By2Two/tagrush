import { useEffect, useState } from 'react';
import { normalizeRoomCode } from '../game/p2p.js';
import HostRoomScreen from './HostRoomScreen.jsx';
import { ErrorMessage, MenuItem, ScreenHeader } from './MenuParts.jsx';

const EMPTY_HOSTED_ROOM = { roomCode: null, players: [], error: '' };
const ROOM_CODE_LENGTH = 5;

function JoinRoomScreen({ profile, onProfileChange, errorMessage, onJoin, onBack }) {
  const updateRoomCode = (event) => onProfileChange({ ...profile, roomCode: normalizeRoomCode(event.target.value) });
  const joinOnEnter = (event) => {
    if (event.key === 'Enter') {
      onJoin();
    }
  };
  return (
    <div className="screen">
      <ScreenHeader title="Join a room" onBack={onBack} />
      <ErrorMessage message={errorMessage} />
      <label className="field">
        <span>Room code</span>
        <input
          value={profile.roomCode || ''}
          maxLength={ROOM_CODE_LENGTH}
          onChange={updateRoomCode}
          onKeyDown={joinOnEnter}
          placeholder="ABCDE"
          spellCheck="false"
          autoFocus
        />
      </label>
      <p className="hint">Ask the host for the code or the invite link. A round starts with 2 players.</p>
      <button type="button" className="primary" onClick={onJoin}>
        Join
      </button>
    </div>
  );
}

function SoloScreen({ errorMessage, onPlay, onBack }) {
  return (
    <div className="screen">
      <ScreenHeader title="Solo practice" onBack={onBack} />
      <ErrorMessage message={errorMessage} />
      <p className="hint">No server. Open map to practice wall runs, climbing and sliding.</p>
      <button type="button" className="primary" onClick={onPlay}>
        Play
      </button>
    </div>
  );
}

function MainScreen({ profile, onProfileChange, errorMessage, onChooseScreen }) {
  return (
    <div className="screen">
      <h1>
        Tag<span>-</span>Rush
      </h1>
      <p className="tagline">First-person tag. Run on walls, climb, slide and pass the tag along.</p>
      <ErrorMessage message={errorMessage} />
      <label className="field">
        <span>Your name</span>
        <input
          value={profile.name}
          maxLength={16}
          onChange={(event) => onProfileChange({ ...profile, name: event.target.value })}
          placeholder="Runner"
        />
      </label>
      <nav className="main-menu" aria-label="Main menu">
        <MenuItem title="Host a room" subtitle="Create a room and invite friends" onClick={() => onChooseScreen('host')} />
        <MenuItem title="Join a room" subtitle="Enter a friend's room code" onClick={() => onChooseScreen('join')} />
        <MenuItem title="Solo practice" subtitle="Open map, no server" onClick={() => onChooseScreen('solo')} />
      </nav>
    </div>
  );
}

export default function LeftColumn({
  profile,
  onProfileChange,
  onStartSession,
  errorMessage,
  invitedRoomCode,
  hostedRoom,
  onHostRoom,
  onCancelHosting,
}) {
  const [screen, setScreen] = useState(invitedRoomCode ? 'join' : 'main');

  useEffect(() => {
    if (invitedRoomCode) {
      onProfileChange((current) => ({ ...current, roomCode: invitedRoomCode }));
    }
  }, [invitedRoomCode, onProfileChange]);

  const goToMainScreen = () => setScreen('main');

  const chooseScreen = (nextScreen) => {
    if (nextScreen === 'host') {
      onHostRoom();
    }
    setScreen(nextScreen);
  };

  const stopHosting = () => {
    onCancelHosting();
    goToMainScreen();
  };

  if (screen === 'host') {
    return (
      <HostRoomScreen
        hostedRoom={hostedRoom || EMPTY_HOSTED_ROOM}
        errorMessage={errorMessage}
        onEnterGame={() => onStartSession('host')}
        onBack={stopHosting}
      />
    );
  }
  if (screen === 'join') {
    return (
      <JoinRoomScreen
        profile={profile}
        onProfileChange={onProfileChange}
        errorMessage={errorMessage}
        onJoin={() => onStartSession('join')}
        onBack={goToMainScreen}
      />
    );
  }
  if (screen === 'solo') {
    return <SoloScreen errorMessage={errorMessage} onPlay={() => onStartSession('solo')} onBack={goToMainScreen} />;
  }
  return (
    <MainScreen
      profile={profile}
      onProfileChange={onProfileChange}
      errorMessage={errorMessage}
      onChooseScreen={chooseScreen}
    />
  );
}
