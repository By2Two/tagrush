export default function Settings({ settings, onChange }) {
  const updateNumber = (key) => (event) => onChange({ ...settings, [key]: Number(event.target.value) });

  return (
    <div className="settings">
      <label>
        <span>
          Sensitivity <b>{settings.mouseSensitivity.toFixed(1)}</b>
        </span>
        <input
          type="range"
          min="0.2"
          max="3"
          step="0.1"
          value={settings.mouseSensitivity}
          onChange={updateNumber('mouseSensitivity')}
        />
      </label>
      <label>
        <span>
          Field of view <b>{settings.fieldOfView}°</b>
        </span>
        <input type="range" min="70" max="110" step="1" value={settings.fieldOfView} onChange={updateNumber('fieldOfView')} />
      </label>
      <label>
        <span>
          Volume <b>{Math.round(settings.volume * 100)}%</b>
        </span>
        <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={updateNumber('volume')} />
      </label>
    </div>
  );
}
