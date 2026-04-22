import { useFormik } from "formik";
import * as Yup from "yup";

import PrimaryButton from "@/components/PrimaryButton";

const validationSchema = Yup.object({
  startDate: Yup.string().required("Start date is required"),
  videoDir: Yup.string().trim().required("Folder path is required"),
});

export default function BulkPublishSection({
  campaignSlug,
  disabled,
  error,
  success,
  isRunning,
  progressLoading,
  onLoadProgress,
  onSubmit,
}) {
  const formik = useFormik({
    initialValues: { startDate: "", videoDir: "" },
    validationSchema,
    onSubmit,
  });

  return (
    <section className="dashboard-card campaign-scheduler-card">
      <div className="dashboard-card-header">
        <div>
          <p className="dashboard-section-label">Bulk Publish</p>
          <h3 className="dashboard-card-title">Schedule this campaign</h3>
        </div>
        {isRunning ? (
          <button type="button" className="dashboard-badge dashboard-badge-accent campaign-progress-trigger" onClick={onLoadProgress}>
            {progressLoading ? "Loading..." : "View progress"}
          </button>
        ) : null}
      </div>

      <form className="campaign-scheduler-form" onSubmit={formik.handleSubmit}>
        <label className="campaign-scheduler-field">
          <span className="detail-form-label">Start Date</span>
          <input className="detail-form-input" name="startDate" type="date" value={formik.values.startDate} onChange={formik.handleChange} onBlur={formik.handleBlur} required />
        </label>

        <label className="campaign-scheduler-field campaign-scheduler-field-wide">
          <span className="detail-form-label">Folder Path</span>
          <input className="detail-form-input" name="videoDir" value={formik.values.videoDir} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="C:\\Users\\USER\\Videos\\Assets\\..." required />
        </label>

        {formik.touched.startDate && formik.errors.startDate ? <p className="detail-form-message detail-form-message-error">{formik.errors.startDate}</p> : null}
        {formik.touched.videoDir && formik.errors.videoDir ? <p className="detail-form-message detail-form-message-error">{formik.errors.videoDir}</p> : null}
        {error ? <p className="detail-form-message detail-form-message-error">{error}</p> : null}
        {success ? <p className="detail-form-message detail-form-message-success">{success}</p> : null}

        <div className="campaign-scheduler-actions">
          <PrimaryButton className="dashboard-button-inline detail-action-button" type="submit" disabled={formik.isSubmitting || disabled}>
            {formik.isSubmitting ? "Starting..." : "Start bulk publish"}
          </PrimaryButton>
        </div>
      </form>
    </section>
  );
}
