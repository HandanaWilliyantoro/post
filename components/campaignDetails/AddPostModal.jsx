import { useRef, useState } from "react";

import ModalShell from "@/components/campaignDetails/ModalShell";
import PrimaryButton from "@/components/PrimaryButton";
import useFormErrorSnackbar from "@/components/useFormErrorSnackbar";

export default function AddPostModal({ assignedAccountsCount, disableAddPost, formError, formSuccess, formik, onClose }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  useFormErrorSnackbar(formik);
  const selectedVideo = formik.values.video;

  function setSelectedVideo(file) {
    if (!file) {
      return;
    }

    const isVideoFile =
      String(file.type || "").toLowerCase().startsWith("video/") ||
      /\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(String(file.name || ""));

    if (!isVideoFile) {
      formik.setFieldTouched("video", true, false);
      formik.setFieldError("video", "Video file is required");
      return;
    }

    formik.setFieldValue("video", file);
    formik.setFieldTouched("video", true, false);
    formik.setFieldError("video", undefined);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer?.files?.[0] || null;
    setSelectedVideo(file);
  }

  return (
    <ModalShell title="Add post" onClose={onClose}>
      <form className="detail-account-form" onSubmit={formik.handleSubmit}>
        <div className="detail-form-grid">
          <label className="detail-form-field detail-form-field-wide"><span className="detail-form-label">Content</span><textarea className="detail-form-input detail-form-textarea" name="content" value={formik.values.content} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Write the caption or post copy" rows={4} /></label>
          <label className="detail-form-field">
            <span className="detail-form-label">Assigned accounts</span>
            <div className="detail-form-static">{assignedAccountsCount} target{assignedAccountsCount === 1 ? "" : "s"}</div>
            <span className="detail-post-subtle">The post is queued in the background and targets exactly the accounts currently assigned to this campaign.</span>
          </label>
          <label className="detail-form-field">
            <span className="detail-form-label">Publish at (Eastern Time)</span>
            <input autoComplete="off" className="detail-form-input" name="publish_at" type="datetime-local" value={formik.values.publish_at} min={formik.values.minPublishAt || undefined} onChange={formik.handleChange} onBlur={formik.handleBlur} />
            <span className="detail-post-subtle">Required only when using Post.</span>
          </label>
          <label className="detail-form-field detail-form-field-wide">
            <span className="detail-form-label">Video</span>
            <input ref={inputRef} className="sr-only" name="video" type="file" accept="video/*" onChange={(event) => setSelectedVideo(event.currentTarget.files?.[0] || null)} onBlur={() => formik.setFieldTouched("video", true)} />
            <button
              type="button"
              className={`detail-file-dropzone${isDragging ? " detail-file-dropzone-dragging" : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDrop={handleDrop}
            >
              <span className="detail-file-dropzone-title">
                {selectedVideo ? selectedVideo.name : "Drop video here or click to choose a file"}
              </span>
              <span className="detail-file-dropzone-meta">
                {selectedVideo ? "Selected video will be reused for the next queue action." : "Supports drag and drop."}
              </span>
            </button>
            <span className="detail-post-subtle">The uploaded video will be queued locally for the posting flow.</span>
          </label>
        </div>
        {formik.touched.content && formik.errors.content ? <p className="detail-form-message detail-form-message-error">{formik.errors.content}</p> : null}
        {formik.touched.publish_at && formik.errors.publish_at ? <p className="detail-form-message detail-form-message-error">{formik.errors.publish_at}</p> : null}
        {formik.touched.video && formik.errors.video ? <p className="detail-form-message detail-form-message-error">{formik.errors.video}</p> : null}
        {formError ? <p className="detail-form-message detail-form-message-error">{formError}</p> : null}
        {formSuccess ? <p className="detail-form-message detail-form-message-success">{formSuccess}</p> : null}
        <div className="detail-modal-actions">
          <PrimaryButton className="dashboard-button-inline" variant="ghost" onClick={onClose} type="button">Cancel</PrimaryButton>
          <PrimaryButton className="dashboard-button-inline detail-action-button" type="submit" disabled={formik.isSubmitting || disableAddPost}>{formik.isSubmitting ? "Queueing..." : "Queue post"}</PrimaryButton>
        </div>
      </form>
    </ModalShell>
  );
}
