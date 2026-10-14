function rowLabel(entry, potatoActive) {
  const itLabel = potatoActive ? ' (BOMB)' : ' (IT)';
  return `${entry.name}${entry.isIt ? itLabel : ''}${entry.eliminated ? ' (OUT)' : ''}`;
}

export default function Scoreboard({ hud }) {
  const roundBreak = hud.phase === 'break';
  const rows = roundBreak && hud.ranking ? hud.ranking : hud.scoreboard;
  const roundWinnerNames = hud.scoreboard
    .filter((entry) => hud.winnerIds.includes(entry.id))
    .map((entry) => entry.name)
    .join(', ');
  const winsOf = (playerId) => hud.wins?.[playerId] ?? 0;

  return (
    <div className="board panel">
      <h2>{roundBreak ? `Round ${hud.roundNumber} results` : 'Scoreboard'}</h2>
      {roundBreak && hud.winnerIds.length > 0 && (
        <p className="hint">
          <b>Round winner:</b> {roundWinnerNames}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th />
            <th />
            <th>Pts</th>
            <th>Wins</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry, rowIndex) => (
            <tr key={entry.id} className={entry.isLocalPlayer || entry.id === hud.localPlayerId ? 'me' : ''}>
              <td>{rowIndex + 1}</td>
              <td>{rowLabel(entry, hud.potatoActive)}</td>
              <td>{entry.score}</td>
              <td>{winsOf(entry.id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {roundBreak && <p className="hint">Next round in {hud.remainingSeconds}s</p>}
    </div>
  );
}
