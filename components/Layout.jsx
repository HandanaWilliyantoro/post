import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";
import CampaignSidebar from "@/components/layout/CampaignSidebar";
import CreateCampaignModal from "@/components/layout/CreateCampaignModal";

export default function Layout({ children, title = "Campaign Dashboard" }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);
  const [campaignError, setCampaignError] = useState("");
  const [campaignSuccess, setCampaignSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCampaigns() {
      try {
        const response = await fetch("/api/campaigns", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload?.success || cancelled) return;
        setCampaigns(payload.data);
      } catch {}
    }

    void loadCampaigns();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (campaignError) showErrorSnackbar(campaignError);
  }, [campaignError]);

  useEffect(() => {
    if (campaignSuccess) showSuccessSnackbar(campaignSuccess);
  }, [campaignSuccess]);

  useEffect(() => {
    function handleCampaignDeleted(event) {
      const deletedSlug = String(event?.detail?.slug || "").trim();
      if (!deletedSlug) return;
      setCampaigns((current) =>
        current.filter((campaign) => campaign.slug !== deletedSlug)
      );
    }

    window.addEventListener("campaign-deleted", handleCampaignDeleted);
    return () => {
      window.removeEventListener("campaign-deleted", handleCampaignDeleted);
    };
  }, []);

  async function handleCreateCampaign(values, helpers) {
    setCampaignError("");
    setCampaignSuccess("");

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to create campaign");
      }

      setCampaigns((current) => [...current, payload.data]);
      setCampaignSuccess("Campaign created.");
      helpers.resetForm();
      setShowCreateCampaignModal(false);
      await router.push(payload.data.href);
    } catch (error) {
      setCampaignError(error.message || "Failed to create campaign");
    } finally {
      helpers.setSubmitting(false);
    }
  }

  function closeCreateCampaignModal() {
    setShowCreateCampaignModal(false);
    setCampaignError("");
    setCampaignSuccess("");
  }

  return (
    <div className="dashboard-shell h-screen overflow-hidden">
      <div className="mx-auto flex h-screen max-w-[1600px] overflow-hidden">
        <CampaignSidebar
          campaigns={campaigns}
          collapsed={collapsed}
          currentPath={router.asPath}
          extraLinks={[
            {
              href: "/accounts",
              icon: "accounts",
              label: "All Accounts",
            },
          ]}
          onToggle={() => setCollapsed((value) => !value)}
          onCreate={() => setShowCreateCampaignModal(true)}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="dashboard-main-panel campaign-main-panel min-h-full rounded-[28px] p-6 sm:p-8">
            {children}
          </div>
        </main>
      </div>

      {showCreateCampaignModal ? (
        <CreateCampaignModal
          error={campaignError}
          success={campaignSuccess}
          onClose={closeCreateCampaignModal}
          onSubmit={handleCreateCampaign}
        />
      ) : null}
    </div>
  );
}
