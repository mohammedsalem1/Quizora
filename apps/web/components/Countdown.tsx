const pad = (n: number) => String(n).padStart(2, "0");

// "12:34", or "1:05:00" for quizzes longer than an hour. Rounded up, so it shows 00:00 only
// when the time is really up.
function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

export function Countdown({ remainingMs }: { remainingMs: number }) {
  const tone =
    remainingMs <= 60_000
      ? "text-danger"
      : remainingMs <= 5 * 60_000
        ? "text-warn"
        : "text-ink";
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-sm text-ink-muted">الوقت المتبقي</span>
      <span
        role="timer"
        dir="ltr"
        className={`text-xl font-semibold tabular-nums ${tone}`}
      >
        {formatRemaining(remainingMs)}
      </span>
    </span>
  );
}
