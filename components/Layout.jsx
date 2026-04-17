import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";

import PrimaryButton from "@/components/PrimaryButton";
import { defaultCampaignRoutes } from "@/lib/campaignDefaults";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";

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

function PlusIcon() {
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

function isActiveRoute(currentPath, href) {
  const pathOnly = String(currentPath || "").split("?")[0];
  return pathOnly === href || pathOnly.startsWith(`${href}/`);
}

export default function Layout({ children, title = "Campaign Dashboard" }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [campaigns, setCampaigns] = useState(defaultCampaignRoutes);
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);
  const [campaignError, setCampaignError] = useState("");
  const [campaignSuccess, setCampaignSuccess] = useState("");
  const currentPath = router.asPath;

  useEffect(() => {
    let cancelled = false;

    async function loadCampaigns() {
      try {
        const response = await fetch("/api/campaigns");
        const payload = await response.json();

        if (!response.ok || !payload?.success || cancelled) {
          return;
        }

        setCampaigns(payload.data);
      } catch {
        // keep defaults if the request fails
      }
    }

    void loadCampaigns();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (campaignError) {
      showErrorSnackbar(campaignError);
    }
  }, [campaignError]);

  useEffect(() => {
    if (campaignSuccess) {
      showSuccessSnackbar(campaignSuccess);
    }
  }, [campaignSuccess]);

  const createCampaignFormik = useFormik({
    initialValues: {
      label: "",
      description: "",
      icon: "spark",
    },
    validationSchema: Yup.object({
      label: Yup.string().trim().required("Campaign name is required"),
      description: Yup.string().trim(),
      icon: Yup.string().required("Icon is required"),
    }),
    onSubmit: async (values, helpers) => {
      setCampaignError("");
      setCampaignSuccess("");

      try {
        const response = await fetch("/api/campaigns", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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
    },
  });

  function closeCreateCampaignModal() {
    setShowCreateCampaignModal(false);
    setCampaignError("");
    setCampaignSuccess("");
    createCampaignFormik.resetForm();
  }

  return (
    <div className="dashboard-shell h-screen overflow-hidden">
      <div className="mx-auto flex h-screen max-w-[1600px] overflow-hidden">
        <aside
          className={`dashboard-sidebar campaign-sidebar sticky top-0 h-screen shrink-0 overflow-y-auto overflow-x-hidden border-r border-white/10 px-4 py-6 transition-[width] duration-300 ease-out lg:px-5 lg:py-8 ${collapsed ? "w-[96px]" : "w-[320px]"}`}
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
              {campaigns.map((campaign) => {
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

            <div className="mt-auto pt-4">
              <button
                type="button"
                onClick={() => setShowCreateCampaignModal(true)}
                className={`campaign-create-button ${collapsed ? "campaign-create-button-collapsed" : ""}`}
                aria-label="Add campaign"
                title="Add campaign"
              >
                <span className="campaign-nav-icon">
                  <PlusIcon />
                </span>
                <span
                  className={`campaign-nav-label ${collapsed ? "campaign-nav-label-hidden" : ""}`}
                >
                  Add Campaign
                </span>
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="dashboard-main-panel campaign-main-panel min-h-full rounded-[28px] p-6 sm:p-8">
            {children}
          </div>
        </main>
      </div>

      {showCreateCampaignModal ? (
        <div className="detail-modal-overlay" role="dialog" aria-modal="true">
          <div className="detail-modal">
            <div className="detail-modal-header">
              <h3 className="detail-modal-title">Add campaign</h3>
              <button
                type="button"
                className="detail-icon-button"
                onClick={closeCreateCampaignModal}
                aria-label="Close dialog"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="detail-modal-body">
              <form
                className="detail-account-form"
                onSubmit={createCampaignFormik.handleSubmit}
              >
                <div className="detail-form-grid">
                  <label className="detail-form-field detail-form-field-wide">
                    <span className="detail-form-label">Campaign name</span>
                    <input
                      className="detail-form-input"
                      name="label"
                      value={createCampaignFormik.values.label}
                      onChange={createCampaignFormik.handleChange}
                      onBlur={createCampaignFormik.handleBlur}
                      placeholder="My New Campaign"
                      required
                    />
                  </label>

                  <label className="detail-form-field">
                    <span className="detail-form-label">Icon</span>
                    <select
                      className="detail-form-input"
                      name="icon"
                      value={createCampaignFormik.values.icon}
                      onChange={createCampaignFormik.handleChange}
                      onBlur={createCampaignFormik.handleBlur}
                    >
                      <option value="spark">Spark</option>
                      <option value="play">Play</option>
                      <option value="kick">Kick</option>
                      <option value="debate">Debate</option>
                      <option value="news">News</option>
                    </select>
                  </label>

                  <label className="detail-form-field detail-form-field-wide">
                    <span className="detail-form-label">Description</span>
                    <textarea
                      className="detail-form-input detail-form-textarea"
                      name="description"
                      rows={4}
                      value={createCampaignFormik.values.description}
                      onChange={createCampaignFormik.handleChange}
                      onBlur={createCampaignFormik.handleBlur}
                      placeholder="Describe what this campaign is for"
                    />
                  </label>
                </div>

                {createCampaignFormik.touched.label &&
                createCampaignFormik.errors.label ? (
                  <p className="detail-form-message detail-form-message-error">
                    {createCampaignFormik.errors.label}
                  </p>
                ) : null}

                {campaignError ? (
                  <p className="detail-form-message detail-form-message-error">
                    {campaignError}
                  </p>
                ) : null}

                {campaignSuccess ? (
                  <p className="detail-form-message detail-form-message-success">
                    {campaignSuccess}
                  </p>
                ) : null}

                <div className="detail-modal-actions">
                  <PrimaryButton
                    className="dashboard-button-inline"
                    variant="ghost"
                    onClick={closeCreateCampaignModal}
                    type="button"
                  >
                    Cancel
                  </PrimaryButton>
                  <PrimaryButton
                    className="dashboard-button-inline detail-action-button"
                    type="submit"
                    disabled={createCampaignFormik.isSubmitting}
                  >
                    {createCampaignFormik.isSubmitting
                      ? "Creating..."
                      : "Create campaign"}
                  </PrimaryButton>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
