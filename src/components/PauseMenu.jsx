import { useCopyToClipboard } from '../hooks/useCopyToClipboard.js';
import Settings from './Settings.jsx';

export default function PauseMenu({ settings, onSettingsChange, inviteLink, onResume, onLeave }) {
  const [copied, copyInviteLink] = useCopyToClipboard(inviteLink);

  return (
    <div className="pause">
      <div className="panel pause-card">
        <h2>Paused</h2>
        <button className="cta" onClick={onResume}>
          Resume
        </button>
        {inviteLink && (
          <>
            <p className="hint host-note">
              You are the host. <b>Never minimize or switch tabs</b>: the game runs in your browser and freezes for
              everyone.
            </p>
            <button className="ghost" onClick={copyInviteLink}>
              {copied ? 'Invite link copied!' : 'Copy invite link'}
            </button>
          </>
        )}
        <Settings settings={settings} onChange={onSettingsChange} />
        <button className="ghost" onClick={onLeave}>
          Leave to menu
        </button>
      </div>
    </div>
  );
}
