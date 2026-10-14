export function ScreenHeader({ title, onBack }) {
  return (
    <header className="screen-head">
      <button type="button" className="secondary back-btn" onClick={onBack}>
        ← Back
      </button>
      <h2>{title}</h2>
    </header>
  );
}

export function MenuItem({ title, subtitle, onClick }) {
  return (
    <button type="button" className="menu-item" onClick={onClick}>
      <b>{title}</b>
      <span>{subtitle}</span>
      <i aria-hidden="true">›</i>
    </button>
  );
}

export function ErrorMessage({ message }) {
  return message ? <p className="error">{message}</p> : null;
}
