import { useState } from "react";
import { useRouter } from "next/router";

import PrimaryButton from "@/components/PrimaryButton";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";

export default function DeleteCampaignButton({ campaign }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${campaign.label}" and all of its local campaign data?`
    );

    if (!confirmed) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/campaigns?slug=${encodeURIComponent(campaign.slug)}`,
        { method: "DELETE" }
      );
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to delete campaign");
      }

      showSuccessSnackbar("Campaign deleted.");
      window.dispatchEvent(
        new CustomEvent("campaign-deleted", {
          detail: { slug: campaign.slug },
        })
      );
      await router.push("/");
    } catch (error) {
      showErrorSnackbar(error.message || "Failed to delete campaign");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PrimaryButton
      className="dashboard-button-inline"
      variant="ghost"
      onClick={handleDelete}
      disabled={submitting}
      type="button"
    >
      {submitting ? "Deleting..." : "Delete campaign"}
    </PrimaryButton>
  );
}
