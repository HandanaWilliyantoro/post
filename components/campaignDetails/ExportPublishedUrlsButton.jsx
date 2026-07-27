import { useState } from "react";

import PrimaryButton from "@/components/PrimaryButton";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";

function getDownloadFilename(response, campaignSlug) {
  const disposition = String(response.headers.get("Content-Disposition") || "");
  const match = disposition.match(/filename="?([^";]+)"?/i);

  return (
    match?.[1] ||
    `${String(campaignSlug || "campaign").trim() || "campaign"}-published-post-urls-last-24h.csv`
  );
}

async function getErrorMessage(response) {
  const contentType = String(response.headers.get("Content-Type") || "");

  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    return payload?.error || "Failed to export published URLs";
  }

  return (await response.text().catch(() => "")) || "Failed to export published URLs";
}

export default function ExportPublishedUrlsButton({ campaignSlug }) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (exporting) {
      return;
    }

    setExporting(true);

    try {
      const response = await fetch(
        `/api/posts/export-urls?campaignSlug=${encodeURIComponent(
          campaignSlug
        )}&hours=24`
      );

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = getDownloadFilename(response, campaignSlug);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);

      const urlCount = Number(response.headers.get("X-Export-Url-Count") || 0);
      showSuccessSnackbar(
        `Exported ${urlCount} published post URL${urlCount === 1 ? "" : "s"}.`
      );
    } catch (error) {
      showErrorSnackbar(error?.message || "Failed to export published URLs");
    } finally {
      setExporting(false);
    }
  }

  return (
    <PrimaryButton
      className="dashboard-button-inline"
      variant="ghost"
      type="button"
      onClick={handleExport}
      disabled={exporting}
    >
      {exporting ? "Exporting..." : "Export Post URLs (24h)"}
    </PrimaryButton>
  );
}
