import Link from "next/link";

import { CampaignIcon, PlusIcon, SidebarToggleIcon } from "@/components/layout/SidebarIcons";

function isActiveRoute(currentPath, href) {
  const pathOnly = String(currentPath || "").split("?")[0];
  return pathOnly === href || pathOnly.startsWith(`${href}/`);
}

export default function CampaignSidebar({
  campaigns,
  collapsed,
  currentPath,
  extraLinks = [],
  onToggle,
  onCreate,
}) {
  return (
    <aside className={`dashboard-sidebar campaign-sidebar sticky top-0 h-screen shrink-0 overflow-y-auto overflow-x-hidden border-r border-white/10 px-4 py-6 transition-[width] duration-300 ease-out lg:px-5 lg:py-8 ${collapsed ? "w-[96px]" : "w-[320px]"}`}>
      <button type="button" onClick={onToggle} className="sidebar-collapse-button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed}>
        <SidebarToggleIcon collapsed={collapsed} />
      </button>

      <div className="flex h-full flex-col">
        <nav className="mt-6 grid gap-3">
          {extraLinks.map((item) => {
            const active = isActiveRoute(currentPath, item.href);

            return (
              <Link key={item.href} href={item.href} className={`campaign-nav-item ${active ? "campaign-nav-item-active" : ""} ${collapsed ? "campaign-nav-item-collapsed" : ""}`} aria-label={item.label} title={item.label}>
                <span className="campaign-nav-icon">
                  <CampaignIcon type={item.icon} />
                </span>
                <span className={`campaign-nav-label ${collapsed ? "campaign-nav-label-hidden" : ""}`}>{item.label}</span>
              </Link>
            );
          })}

          {campaigns.map((campaign) => {
            const active = isActiveRoute(currentPath, campaign.href);

            return (
              <Link key={campaign.slug} href={campaign.href} className={`campaign-nav-item ${active ? "campaign-nav-item-active" : ""} ${collapsed ? "campaign-nav-item-collapsed" : ""}`} aria-label={campaign.label} title={campaign.label}>
                <span className="campaign-nav-icon">
                  <CampaignIcon type={campaign.icon} />
                </span>
                <span className={`campaign-nav-label ${collapsed ? "campaign-nav-label-hidden" : ""}`}>{campaign.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-4">
          <button type="button" onClick={onCreate} className={`campaign-create-button ${collapsed ? "campaign-create-button-collapsed" : ""}`} aria-label="Add campaign" title="Add campaign">
            <span className="campaign-nav-icon">
              <PlusIcon />
            </span>
            <span className={`campaign-nav-label ${collapsed ? "campaign-nav-label-hidden" : ""}`}>Add Campaign</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
