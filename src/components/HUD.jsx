import FuseClock from './FuseClock.jsx';
import LobbyPanel from './LobbyPanel.jsx';
import PodiumScreen from './PodiumScreen.jsx';
import Scoreboard from './Scoreboard.jsx';

const SECONDS_PER_MINUTE = 60;

function formatClock(totalSeconds) {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return `${minutes}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')}`;
}

function describePotatoBanner(hud) {
  if (hud.eliminated) {
    return { tone: 'it', text: 'You blew up!' };
  }
  if (hud.fuse && hud.isIt) {
    return { tone: 'it', text: 'Pass it!' };
  }
  return null;
}

function describeBanner(hud) {
  if (hud.sessionKind === 'solo') {
    return { tone: 'calm', text: 'Free practice' };
  }
  switch (hud.phase) {
    case 'connecting':
      return { tone: 'calm', text: 'Connecting...' };
    case 'lobby':
      return { tone: 'calm', text: 'Lobby' };
    case 'podium':
      return null;
    case 'break':
      return { tone: 'calm', text: 'Round over' };
    default:
      break;
  }
  if (hud.potatoActive) {
    return describePotatoBanner(hud);
  }
  if (hud.isIt) {
    return { tone: 'it', text: "You're IT! Click to tag" };
  }
  return { tone: 'run', text: `Run from ${hud.itPlayerName || '...'}` };
}

function TopCenter({ hud }) {
  const banner = describeBanner(hud);
  const solo = hud.sessionKind === 'solo';
  const roundInProgress = hud.phase === 'play' || hud.phase === 'break';
  return (
    <div className={hud.potatoActive ? 'top-center has-potato' : 'top-center'}>
      {hud.potatoActive && hud.fuse && <FuseClock fuse={hud.fuse} />}
      {banner && <div className={`banner ${banner.tone}`}>{banner.text}</div>}
      {!solo && !hud.potatoActive && roundInProgress && (
        <div className="timer">
          {formatClock(hud.remainingSeconds)}
          <small>
            Round {hud.roundNumber}/{hud.totalRounds}
          </small>
        </div>
      )}
      {hud.eliminated && <div className="spectate-hint">Spectating · click to switch player</div>}
    </div>
  );
}

export default function HUD({
  hud,
  visible,
  pointerLocked,
  minimapRef,
  isHostingSession,
  onStartMatch,
  onReturnToLobby,
  onLeave,
}) {
  const solo = hud?.sessionKind === 'solo';
  const inMenuPhase = hud?.phase === 'lobby' || hud?.phase === 'podium';
  const showScoreboard = hud && (hud.showScoreboard || hud.phase === 'break') && !inMenuPhase && !solo;

  return (
    <div className={`hud ${visible ? 'show' : ''}`}>
      <canvas ref={minimapRef} width={200} height={200} className="minimap" />
      {hud && (
        <>
          {hud.isIt && hud.phase === 'play' && <div className="vignette" />}
          {hud.tagFlashCounter > 0 && <div key={hud.tagFlashCounter} className="flash" />}
          {hud.explosionCounter > 0 && <div key={`explosion${hud.explosionCounter}`} className="boom-flash" />}

          <TopCenter hud={hud} />

          <ul className="feed">
            {hud.feed.map((entry, entryIndex) => (
              <li key={`${entry.createdAt}-${entryIndex}`} className={entry.kind}>
                {entry.text}
              </li>
            ))}
          </ul>

          {pointerLocked && <div className="crosshair" />}

          <div className="speed">
            <b>{hud.speedKmh}</b>
            <small>km/h</small>
            <em>{hud.movementLabel}</em>
          </div>

          {isHostingSession && (
            <div className="host-warn">
              YOU ARE THE HOST: don&apos;t minimize or switch tabs, or the game freezes for everyone
            </div>
          )}

          {hud.phase === 'lobby' && <LobbyPanel hud={hud} onStartMatch={onStartMatch} onLeave={onLeave} />}
          {hud.phase === 'podium' && hud.podium && (
            <PodiumScreen hud={hud} onStartMatch={onStartMatch} onReturnToLobby={onReturnToLobby} onLeave={onLeave} />
          )}

          {!solo && (
            <div className="net">
              {hud.potatoActive && `Round ${hud.roundNumber}/${hud.totalRounds} · ${hud.aliveCount} alive · `}
              {hud.playerCount} player(s) · {hud.pingMs} ms · Tab: scoreboard
            </div>
          )}

          {showScoreboard && <Scoreboard hud={hud} />}
        </>
      )}
    </div>
  );
}
