export default function ProgressBar({ percentage }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">
          Completion
        </span>
        <span className="font-mono text-sm text-[var(--color-ink)]">
          {percentage}%
        </span>
      </div>

      <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-[var(--color-progress-track)]">
        <div
          className="dashboard-progress-bar"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
