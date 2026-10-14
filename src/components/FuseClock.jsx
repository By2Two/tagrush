const DANGER_SECONDS = 5;

export default function FuseClock({ fuse }) {
  const remainingSeconds = Math.max(0, fuse.remainingSeconds);
  const className = remainingSeconds < DANGER_SECONDS ? 'fuse hot' : 'fuse';
  return (
    <div className={className} role="timer" aria-label={`${remainingSeconds.toFixed(1)} seconds until the potato explodes`}>
      <b>{remainingSeconds.toFixed(1)}</b>
      <i>s</i>
    </div>
  );
}
