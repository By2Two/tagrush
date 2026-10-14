import { useState } from 'react';
import { MODES } from '../game/modes.js';

const MIN_PLAYERS_TO_START = 2;

function ModeSelector({ selectedModeId, onSelect }) {
  return (
    <div className="mode-list" role="radiogroup" aria-label="Game mode">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="radio"
          aria-checked={selectedModeId === mode.id}
          className={selectedModeId === mode.id ? 'mode on' : 'mode'}
          onClick={() => onSelect(mode.id)}
        >
          <b>{mode.name}</b>
          <span>{mode.description}</span>
        </button>
      ))}
    </div>
  );
}

export default function LobbyPanel({ hud, onStartMatch, onLeave }) {
  const [selectedModeId, setSelectedModeId] = useState(hud.gameModeId);
  const enoughPlayers = hud.playerCount >= MIN_PLAYERS_TO_START;

  return (
    <div className="overlay-card panel">
      <h2>Lobby</h2>
      <p className="hint">
        {hud.playerCount} player(s) in the room · {hud.totalRounds} rounds per match, most round wins takes it
      </p>
      <ul className="roster-list">
        {hud.scoreboard.map((entry) => (
          <li key={entry.id}>
            {entry.name}
            {entry.id === hud.hostId ? ' (host)' : ''}
          </li>
        ))}
      </ul>
      {hud.isRoomHost ? (
        <>
          <ModeSelector selectedModeId={selectedModeId} onSelect={setSelectedModeId} />
          <button type="button" className="cta" disabled={!enoughPlayers} onClick={() => onStartMatch(selectedModeId)}>
            Start match
          </button>
          {!enoughPlayers && <p className="hint">Waiting for at least one more player…</p>}
        </>
      ) : (
        <p className="hint">Waiting for the host to pick a mode and start…</p>
      )}
      <p className="hint">Click the map to run around while you wait. Esc frees the mouse.</p>
      <button type="button" className="ghost" onClick={onLeave}>
        Leave room
      </button>
    </div>
  );
}
