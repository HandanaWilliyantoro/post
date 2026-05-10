import ModalShell from "@/components/campaignDetails/ModalShell";
import PrimaryButton from "@/components/PrimaryButton";
import useFormErrorSnackbar from "@/components/useFormErrorSnackbar";

export default function AddPostModal({ assignedAccountsCount, disableAddPost, formError, formSuccess, formik, onClose }) {
  useFormErrorSnackbar(formik);

  return (
    <ModalShell title="Add post" onClose={onClose}>
      <form className="detail-account-form" onSubmit={formik.handleSubmit}>
        <div className="detail-form-grid">
          <label className="detail-form-field detail-form-field-wide"><span className="detail-form-label">Content</span><textarea className="detail-form-input detail-form-textarea" name="content" value={formik.values.content} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Write the caption or post copy" rows={4} /></label>
          <label className="detail-form-field">
            <span className="detail-form-label">Assigned accounts</span>
            <div className="detail-form-static">{assignedAccountsCount} target{assignedAccountsCount === 1 ? "" : "s"}</div>
            <span className="detail-post-subtle">Posting will target every account assigned to this campaign.</span>
          </label>
          <label className="detail-form-field">
            <span className="detail-form-label">Publish at (Eastern Time)</span>
            <input autoComplete="off" className="detail-form-input" name="publish_at" type="datetime-local" value={formik.values.publish_at} min={formik.values.minPublishAt || undefined} onChange={formik.handleChange} onBlur={formik.handleBlur} />
            <span className="detail-post-subtle">Required only when using Post.</span>
          </label>
          <label className="detail-form-field detail-form-field-wide">
            <span className="detail-form-label">Video</span>
            <input className="detail-form-input" name="video" type="file" accept="video/*" onChange={(event) => formik.setFieldValue("video", event.currentTarget.files?.[0] || null)} onBlur={() => formik.setFieldTouched("video", true)} required />
            <span className="detail-post-subtle">The uploaded video will be sent directly through the PostOnce posting flow.</span>
          </label>
        </div>
        {formik.touched.content && formik.errors.content ? <p className="detail-form-message detail-form-message-error">{formik.errors.content}</p> : null}
        {formik.touched.publish_at && formik.errors.publish_at ? <p className="detail-form-message detail-form-message-error">{formik.errors.publish_at}</p> : null}
        {formik.touched.video && formik.errors.video ? <p className="detail-form-message detail-form-message-error">{formik.errors.video}</p> : null}
        {formError ? <p className="detail-form-message detail-form-message-error">{formError}</p> : null}
        {formSuccess ? <p className="detail-form-message detail-form-message-success">{formSuccess}</p> : null}
        <div className="detail-modal-actions">
          <PrimaryButton className="dashboard-button-inline" variant="ghost" onClick={onClose} type="button">Cancel</PrimaryButton>
          <PrimaryButton className="dashboard-button-inline detail-action-button" type="submit" disabled={formik.isSubmitting || disableAddPost}>{formik.isSubmitting ? "Posting..." : "Post"}</PrimaryButton>
        </div>
      </form>
    </ModalShell>
  );
}
