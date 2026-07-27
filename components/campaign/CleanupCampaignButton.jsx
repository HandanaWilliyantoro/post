import { useState } from "react";
import { useRouter } from "next/router";

import PrimaryButton from "@/components/PrimaryButton";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";

function formatCount(value, singular, plural = `${singular}s`) {
  const count = Number(value || 0);
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function CleanupCampaignButton({ campaign }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleCleanup() {
    const confirmed = window.confirm(
      `Clean up local posts and finished recent runs for "${campaign.label}"? This will not delete the campaign or active queued/running work.`
    );

    if (!confirmed) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/campaign-cleanup?campaignSlug=${encodeURIComponent(campaign.slug)}`,
        { method: "DELETE" }
      );
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to clean up campaign data");
      }

      const data = payload.data || {};
      const preservedCount =
        Number(data.activeManualPostsPreserved || 0) +
        Number(data.activeRunsPreserved || 0);
      const preservedCopy = preservedCount
        ? ` Kept ${formatCount(preservedCount, "active item")}.`
        : "";

      showSuccessSnackbar(
        `Cleaned up ${formatCount(data.postsDeleted, "post")} and ${formatCount(
          data.runsDeleted,
          "recent run"
        )}.${preservedCopy}`
      );
      router.reload();
    } catch (error) {
      showErrorSnackbar(error.message || "Failed to clean up campaign data");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PrimaryButton
      className="dashboard-button-inline"
      variant="ghost"
      onClick={handleCleanup}
      disabled={submitting}
      type="button"
    >
      {submitting ? "Cleaning..." : "Clean up posts/runs"}
    </PrimaryButton>
  );
}
