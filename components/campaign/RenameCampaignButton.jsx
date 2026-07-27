import { useState } from "react";
import { useRouter } from "next/router";
import { useFormik } from "formik";
import * as Yup from "yup";

import ModalShell from "@/components/campaignDetails/ModalShell";
import PrimaryButton from "@/components/PrimaryButton";
import useFormErrorSnackbar from "@/components/useFormErrorSnackbar";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";
import { refreshCurrentRoute } from "@/lib/utils/navigation";

const validationSchema = Yup.object({
  label: Yup.string().trim().required("Campaign name is required"),
});

export default function RenameCampaignButton({ campaign }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const formik = useFormik({
    initialValues: {
      label: campaign?.label || "",
    },
    enableReinitialize: true,
    validationSchema,
    onSubmit: async (values, helpers) => {
      setError("");

      try {
        const response = await fetch(
          `/api/campaigns?slug=${encodeURIComponent(campaign.slug)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: values.label }),
          }
        );
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Failed to rename campaign");
        }

        showSuccessSnackbar("Campaign renamed.");
        window.dispatchEvent(
          new CustomEvent("campaign-updated", {
            detail: { campaign: payload.data },
          })
        );
        setOpen(false);
        helpers.resetForm({
          values: { label: payload.data?.label || values.label },
        });
        await refreshCurrentRoute(router, { scroll: false });
      } catch (submitError) {
        const message = submitError?.message || "Failed to rename campaign";
        setError(message);
        showErrorSnackbar(message);
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });
  useFormErrorSnackbar(formik);

  function openModal() {
    setError("");
    formik.resetForm({
      values: {
        label: campaign?.label || "",
      },
    });
    setOpen(true);
  }

  function closeModal() {
    if (formik.isSubmitting) {
      return;
    }

    setError("");
    formik.resetForm();
    setOpen(false);
  }

  return (
    <>
      <PrimaryButton
        className="dashboard-button-inline"
        variant="ghost"
        onClick={openModal}
        type="button"
      >
        Rename campaign
      </PrimaryButton>

      {open ? (
        <ModalShell title="Rename campaign" onClose={closeModal}>
          <form className="detail-account-form" onSubmit={formik.handleSubmit}>
            <label className="detail-form-field">
              <span className="detail-form-label">Campaign name</span>
              <input
                className="detail-form-input"
                name="label"
                value={formik.values.label}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                required
              />
            </label>

            {formik.touched.label && formik.errors.label ? (
              <p className="detail-form-message detail-form-message-error">
                {formik.errors.label}
              </p>
            ) : null}
            {error ? (
              <p className="detail-form-message detail-form-message-error">
                {error}
              </p>
            ) : null}

            <div className="detail-modal-actions">
              <PrimaryButton
                className="dashboard-button-inline"
                variant="ghost"
                onClick={closeModal}
                type="button"
                disabled={formik.isSubmitting}
              >
                Cancel
              </PrimaryButton>
              <PrimaryButton
                className="dashboard-button-inline detail-action-button"
                type="submit"
                disabled={formik.isSubmitting}
              >
                {formik.isSubmitting ? "Renaming..." : "Save name"}
              </PrimaryButton>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </>
  );
}
