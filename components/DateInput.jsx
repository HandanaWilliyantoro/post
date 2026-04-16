export default function DateInput({
  value,
  onChange,
  label = "Start date",
  hint = "Choose the first day for the publishing run.",
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[var(--color-ink)]">
        {label}
      </span>
      <span className="mt-1 block text-sm text-[var(--color-muted)]">
        {hint}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="dashboard-input mt-3 w-full"
      />
    </label>
  );
}
