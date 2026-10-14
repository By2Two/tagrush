import { useState } from 'react';
import Settings from './Settings.jsx';

const CONTROLS = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump'],
  ['Jump toward a wall', 'Wall run'],
  ['Hold Space facing a wall', 'Climb (and mantle ledges)'],
  ['Space on a wall', 'Wall jump'],
  ['C (while sprinting)', 'Slide'],
  ['Click', 'Tag someone or pass the potato (left and right hand)'],
  ['Tab', 'Scoreboard'],
  ['R', 'Respawn'],
  ['Esc', 'Pause'],
];

const TABS = [
  { id: 'controls', label: 'Controls' },
  { id: 'settings', label: 'Settings' },
  { id: 'rules', label: 'Rules' },
];

function ControlsList() {
  return (
    <dl className="controls">
      {CONTROLS.map(([keys, action]) => (
        <div key={keys}>
          <dt>
            <kbd>{keys}</kbd>
          </dt>
          <dd>{action}</dd>
        </div>
      ))}
    </dl>
  );
}

function Rules() {
  return (
    <>
      <h3>Matches</h3>
      <p className="hint">
        A match is <b>6 rounds</b>. Win a round to earn a win. The player with the most wins takes the podium.
      </p>
      <h3>Tag</h3>
      <p className="hint">
        One player is <b>IT</b>. Click near someone to tag them. Whoever just passed the tag is briefly immune. IT earns{' '}
        <b>0 points</b> per second, everyone else earns <b>1 point</b> per second. Most points wins the round.
      </p>
      <h3>Hot Potato</h3>
      <p className="hint">
        Whoever holds the bomb potato must pass it before the fuse runs out. When it explodes, the holder is out. Last
        one alive wins the round.
      </p>
    </>
  );
}

export default function SidePanel({ settings, onSettingsChange }) {
  const [activeTab, setActiveTab] = useState('controls');

  return (
    <div className="start-side">
      <nav className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'on' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <section className="side-panel">
        {activeTab === 'controls' && <ControlsList />}
        {activeTab === 'settings' && <Settings settings={settings} onChange={onSettingsChange} />}
        {activeTab === 'rules' && <Rules />}
      </section>
    </div>
  );
}
