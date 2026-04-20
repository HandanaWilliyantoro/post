import { useFormik } from "formik";
import * as Yup from "yup";

import PrimaryButton from "@/components/PrimaryButton";

const INITIAL_VALUES = {
  label: "",
  description: "",
  icon: "spark",
  niche: "streaming",
};

const validationSchema = Yup.object({
  label: Yup.string().trim().required("Campaign name is required"),
  description: Yup.string().trim(),
  icon: Yup.string().required("Icon is required"),
  niche: Yup.string().trim().required("Niche is required"),
});

export default function CreateCampaignModal({
  error,
  success,
  onClose,
  onSubmit,
}) {
  const formik = useFormik({
    initialValues: INITIAL_VALUES,
    validationSchema,
    onSubmit,
  });

  function handleClose() {
    formik.resetForm();
    onClose();
  }

  return (
    <div className="detail-modal-overlay" role="dialog" aria-modal="true">
      <div className="detail-modal">
        <div className="detail-modal-header">
          <h3 className="detail-modal-title">Add campaign</h3>
          <button type="button" className="detail-icon-button" onClick={handleClose} aria-label="Close dialog">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="detail-modal-body">
          <form className="detail-account-form" onSubmit={formik.handleSubmit}>
            <div className="detail-form-grid">
              <label className="detail-form-field detail-form-field-wide">
                <span className="detail-form-label">Campaign name</span>
                <input className="detail-form-input" name="label" value={formik.values.label} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="My New Campaign" required />
              </label>

              <label className="detail-form-field">
                <span className="detail-form-label">Icon</span>
                <select className="detail-form-input" name="icon" value={formik.values.icon} onChange={formik.handleChange} onBlur={formik.handleBlur}>
                  <option value="spark">Spark</option>
                  <option value="play">Play</option>
                  <option value="kick">Kick</option>
                  <option value="debate">Debate</option>
                  <option value="news">News</option>
                </select>
              </label>

              <label className="detail-form-field">
                <span className="detail-form-label">Niche</span>
                <input className="detail-form-input" name="niche" value={formik.values.niche} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="streaming" required />
              </label>

              <label className="detail-form-field detail-form-field-wide">
                <span className="detail-form-label">Description</span>
                <textarea className="detail-form-input detail-form-textarea" name="description" rows={4} value={formik.values.description} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Describe what this campaign is for" />
              </label>
            </div>

            {formik.touched.label && formik.errors.label ? <p className="detail-form-message detail-form-message-error">{formik.errors.label}</p> : null}
            {formik.touched.niche && formik.errors.niche ? <p className="detail-form-message detail-form-message-error">{formik.errors.niche}</p> : null}
            {error ? <p className="detail-form-message detail-form-message-error">{error}</p> : null}
            {success ? <p className="detail-form-message detail-form-message-success">{success}</p> : null}

            <div className="detail-modal-actions">
              <PrimaryButton className="dashboard-button-inline" variant="ghost" onClick={handleClose} type="button">
                Cancel
              </PrimaryButton>
              <PrimaryButton className="dashboard-button-inline detail-action-button" type="submit" disabled={formik.isSubmitting}>
                {formik.isSubmitting ? "Creating..." : "Create campaign"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
