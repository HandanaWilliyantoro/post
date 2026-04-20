export default function StatusPill({ value }) {
  const normalized = String(value || "").trim().toLowerCase();
  return <span className={`detail-pill detail-pill-${normalized || "unknown"}`}>{normalized || "unknown"}</span>;
}
