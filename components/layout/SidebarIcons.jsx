export function CampaignIcon({ type }) {
  const commonProps = {
    className: "h-5 w-5",
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  switch (type) {
    case "kick":
      return <svg {...commonProps}><path d="M5 18L18 5" /><path d="M7 7h10v10" /><path d="M5 12v7h7" /></svg>;
    case "play":
      return <svg {...commonProps}><rect x="4" y="5" width="16" height="14" rx="3" /><path d="M10 9.5L15 12l-5 2.5z" /></svg>;
    case "spark":
      return <svg {...commonProps}><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z" /></svg>;
    case "debate":
      return <svg {...commonProps}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H9l-3.5 3V11A2.5 2.5 0 0 1 4 8.5z" /><path d="M14 10h3.5A2.5 2.5 0 0 1 20 12.5v5l-3-2.5H14a2 2 0 0 1-2-2" /></svg>;
    case "news":
      return <svg {...commonProps}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8" /><path d="M8 13h5" /><path d="M15.5 12.5h.5" /><path d="M15.5 15.5h.5" /></svg>;
    case "accounts":
      return <svg {...commonProps}><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    default:
      return <svg {...commonProps}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

export function SidebarToggleIcon({ collapsed }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
