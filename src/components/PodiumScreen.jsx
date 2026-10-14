const PODIUM_DISPLAY_ORDER = [1, 0, 2];
const MIN_PLAYERS_TO_RESTART = 2;

const winsLabel = (wins) => `${wins} ${wins === 1 ? 'win' : 'wins'}`;

function PodiumStep({ entry, place }) {
  return (
    <div className={`step place-${place}`}>
      <div className="who">
        <div className="avatar" style={{ background: entry.colorCss }} />
        <b>
          {entry.name}
          {entry.isLocalPlayer ? ' (you)' : ''}
        </b>
        {entry.left && <em className="left-tag">left the match</em>}
        <small>{winsLabel(entry.wins)}</small>
      </div>
      <div className="block">
        <span>{place}</span>
      </div>
    </div>
  );
}

function HostActions({ hud, onStartMatch, onReturnToLobby }) {
  const enoughPlayers = hud.playerCount >= MIN_PLAYERS_TO_RESTART;
  return (
    <>
      <button type="button" className="cta" disabled={!enoughPlayers} onClick={() => onStartMatch(hud.gameModeId)}>
        {enoughPlayers ? 'Play again' : 'Waiting for players…'}
      </button>
      <button type="button" className="ghost" onClick={onReturnToLobby}>
        Choose mode
      </button>
    </>
  );
}

export default function PodiumScreen({ hud, onStartMatch, onReturnToLobby, onLeave }) {
  const topThree = hud.podium.slice(0, 3);
  const everyoneElse = hud.podium.slice(3);
  const visibleSteps = PODIUM_DISPLAY_ORDER.filter((rankIndex) => topThree[rankIndex]);

  return (
    <div className="podium-screen">
      <h2 className="podium-title">{hud.forfeit ? 'Last one standing!' : 'Match over'}</h2>
      <div className="podium">
        {visibleSteps.map((rankIndex) => (
          <PodiumStep key={topThree[rankIndex].id} entry={topThree[rankIndex]} place={rankIndex + 1} />
        ))}
      </div>
      {everyoneElse.length > 0 && (
        <ol className="podium-rest" start={4}>
          {everyoneElse.map((entry) => (
            <li key={entry.id} className={entry.isLocalPlayer ? 'me' : ''}>
              {entry.name}
              {entry.left ? ' (left)' : ''} · {winsLabel(entry.wins)}
            </li>
          ))}
        </ol>
      )}
      <div className="podium-actions">
        {hud.isRoomHost ? (
          <HostActions hud={hud} onStartMatch={onStartMatch} onReturnToLobby={onReturnToLobby} />
        ) : (
          <p className="hint">Waiting for the host…</p>
        )}
        <button type="button" className="ghost" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </div>
  );
}
