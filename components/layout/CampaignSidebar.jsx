import Link from "next/link";

import { CampaignIcon, PlusIcon, SidebarToggleIcon } from "@/components/layout/SidebarIcons";
import {
  normalizeRouteForComparison,
  preventSameRouteLinkNavigation,
} from "@/lib/utils/navigation";

function isActiveRoute(currentPath, href) {
  const current = normalizeRouteForComparison(currentPath, {
    includeSearch: false,
  });
  const target = normalizeRouteForComparison(href, {
    includeSearch: false,
  });

  return current === target || current.startsWith(`${target}/`);
}

export default function CampaignSidebar({
  campaigns,
  collapsed,
  currentPath,
  extraLinks = [],
  onToggle,
  onCreate,
}) {
  function preventSameRouteNavigation(event, href) {
    preventSameRouteLinkNavigation(event, href, {
      currentPath,
      includeSearch: false,
    });
  }

  return (
    <aside className={`dashboard-sidebar campaign-sidebar sticky top-0 h-screen shrink-0 overflow-y-auto overflow-x-hidden border-r border-white/10 px-4 py-6 transition-[width] duration-300 ease-out lg:px-5 lg:py-8 ${collapsed ? "w-[96px]" : "w-[320px]"}`}>
      <button type="button" onClick={onToggle} className="sidebar-collapse-button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed}>
        <SidebarToggleIcon collapsed={collapsed} />
      </button>

      <div className="flex h-full flex-col">
        <nav className="mt-6 grid gap-3">
          {extraLinks.map((item) => {
            const active = isActiveRoute(currentPath, item.href);
            const className = `campaign-nav-item ${active ? "campaign-nav-item-active" : ""} ${collapsed ? "campaign-nav-item-collapsed" : ""}`;

            return (
              active ? (
                <span key={item.href} className={className} aria-current="page" aria-label={item.label} title={item.label}>
                  <span className="campaign-nav-icon">
                    <CampaignIcon type={item.icon} />
                  </span>
                  <span className={`campaign-nav-label ${collapsed ? "campaign-nav-label-hidden" : ""}`}>{item.label}</span>
                </span>
              ) : (
                <Link key={item.href} href={item.href} className={className} aria-label={item.label} title={item.label} onClick={(event) => preventSameRouteNavigation(event, item.href)}>
                  <span className="campaign-nav-icon">
                    <CampaignIcon type={item.icon} />
                  </span>
                  <span className={`campaign-nav-label ${collapsed ? "campaign-nav-label-hidden" : ""}`}>{item.label}</span>
                </Link>
              )
            );
          })}

          {campaigns.map((campaign) => {
            const active = isActiveRoute(currentPath, campaign.href);
            const className = `campaign-nav-item ${active ? "campaign-nav-item-active" : ""} ${collapsed ? "campaign-nav-item-collapsed" : ""}`;

            return (
              active ? (
                <span key={campaign.slug} className={className} aria-current="page" aria-label={campaign.label} title={campaign.label}>
                  <span className="campaign-nav-icon">
                    <CampaignIcon type={campaign.icon} />
                  </span>
                  <span className={`campaign-nav-label ${collapsed ? "campaign-nav-label-hidden" : ""}`}>{campaign.label}</span>
                </span>
              ) : (
                <Link key={campaign.slug} href={campaign.href} className={className} aria-label={campaign.label} title={campaign.label} onClick={(event) => preventSameRouteNavigation(event, campaign.href)}>
                  <span className="campaign-nav-icon">
                    <CampaignIcon type={campaign.icon} />
                  </span>
                  <span className={`campaign-nav-label ${collapsed ? "campaign-nav-label-hidden" : ""}`}>{campaign.label}</span>
                </Link>
              )
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
