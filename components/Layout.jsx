import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import { campaignRoutes } from "@/lib/campaigns";

function CampaignIcon({ type }) {
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
      return (
        <svg {...commonProps}>
          <path d="M5 18L18 5" />
          <path d="M7 7h10v10" />
          <path d="M5 12v7h7" />
        </svg>
      );
    case "play":
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="16" height="14" rx="3" />
          <path d="M10 9.5L15 12l-5 2.5z" />
        </svg>
      );
    case "spark":
      return (
        <svg {...commonProps}>
          <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z" />
        </svg>
      );
    case "debate":
      return (
        <svg {...commonProps}>
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H9l-3.5 3V11A2.5 2.5 0 0 1 4 8.5z" />
          <path d="M14 10h3.5A2.5 2.5 0 0 1 20 12.5v5l-3-2.5H14a2 2 0 0 1-2-2" />
        </svg>
      );
    case "news":
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 9h8" />
          <path d="M8 13h5" />
          <path d="M15.5 12.5h.5" />
          <path d="M15.5 15.5h.5" />
        </svg>
      );
    default:
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function SidebarToggleIcon({ collapsed }) {
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

function isActiveRoute(currentPath, href) {
  const pathOnly = String(currentPath || "").split("?")[0];
  return pathOnly === href || pathOnly.startsWith(`${href}/`);
}

export default function Layout({
  children,
  title = "Campaign Dashboard",
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const currentPath = router.asPath;

  return (
    <div className="dashboard-shell h-screen overflow-hidden">
      <div className="mx-auto flex h-screen max-w-[1600px] overflow-hidden">
        <aside
          className={`dashboard-sidebar campaign-sidebar relative h-screen shrink-0 overflow-hidden border-r border-white/10 px-4 py-6 transition-[width] duration-300 ease-out lg:px-5 lg:py-8 ${collapsed ? "w-[96px]" : "w-[320px]"}`}
        >
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="sidebar-collapse-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
          >
            <SidebarToggleIcon collapsed={collapsed} />
          </button>

          <div className="flex h-full flex-col">
            <nav className="mt-6 grid gap-3">
              {campaignRoutes.map((campaign) => {
                const active = isActiveRoute(currentPath, campaign.href);

                return (
                  <Link
                    key={campaign.slug}
                    href={campaign.href}
                    className={`campaign-nav-item ${active ? "campaign-nav-item-active" : ""} ${collapsed ? "campaign-nav-item-collapsed" : ""}`}
                    aria-label={campaign.label}
                    title={campaign.label}
                  >
                    <span className="campaign-nav-icon">
                      <CampaignIcon type={campaign.icon} />
                    </span>
                    <span
                      className={`campaign-nav-label ${collapsed ? "campaign-nav-label-hidden" : ""}`}
                    >
                      {campaign.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="flex-1 overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="dashboard-main-panel campaign-main-panel h-full rounded-[28px] p-6 sm:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
