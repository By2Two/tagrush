import { buildInviteLink } from '../game/p2p.js';
import { MAX_PLAYERS } from '../game/host.js';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard.js';
import { ErrorMessage, ScreenHeader } from './MenuParts.jsx';

function InviteLinkField({ inviteLink }) {
  const [copied, copyInviteLink] = useCopyToClipboard(inviteLink);
  return (
    <div className="field">
      <span>Invite link</span>
      <div className="copy-row">
        <input
          value={inviteLink}
          readOnly
          spellCheck="false"
          onFocus={(event) => event.target.select()}
        />
        <button type="button" className="secondary" onClick={copyInviteLink}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function RoomDetails({ hostedRoom }) {
  const { roomCode, players } = hostedRoom;
  return (
    <>
      <div className="room-code" aria-label="Room code">
        {roomCode}
      </div>
      <InviteLinkField inviteLink={buildInviteLink(roomCode)} />
      <p className="hint">
        Send the link (or just the code) to your friends. <b>You are the server</b>: the game opens in fullscreen, and
        you must <b>never minimize it or switch tabs</b>, or it freezes for everyone.
      </p>
      <div className="field">
        <span>
          In the room ({players.length}/{MAX_PLAYERS})
        </span>
        <ul className="roster">
          {players.length === 0 && <li className="hint">Nobody yet. Enter the game and wait for friends.</li>}
          {players.map((player) => (
            <li key={player.id}>{player.name}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

export default function HostRoomScreen({ hostedRoom, errorMessage, onEnterGame, onBack }) {
  const { roomCode, error } = hostedRoom;
  return (
    <div className="screen">
      <ScreenHeader title="Your room" onBack={onBack} />
      <ErrorMessage message={errorMessage} />
      <ErrorMessage message={error} />
      {!roomCode && !error && <p className="hint">Creating room…</p>}
      {roomCode && <RoomDetails hostedRoom={hostedRoom} />}
      <button type="button" className="primary" disabled={!roomCode} onClick={onEnterGame}>
        Enter game
      </button>
    </div>
  );
}
