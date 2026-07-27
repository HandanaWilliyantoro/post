import { useRef, useState } from "react";

import ModalShell from "@/components/campaignDetails/ModalShell";
import PrimaryButton from "@/components/PrimaryButton";
import {
  addMinutesToEasternDateTimeInput,
  getCurrentEasternDateTimeInput,
  getEasternDateTimeInputAfterMinutes,
} from "@/lib/utils/easternTime";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const CONTENT_X = 96;
const CONTENT_WIDTH = 876;
const PROFILE_IMAGE_SRC = "/api/post-generator-profile?account=truerepublicanhub";
const MIN_TITLE_CHARS = 130;
const MAX_TITLE_CHARS = 150;

function buildItemId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getTitleLength(value) {
  return normalizeTitle(value).length;
}

function isValidTitle(value) {
  const length = getTitleLength(value);
  return length >= MIN_TITLE_CHARS && length <= MAX_TITLE_CHARS;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Failed to render generated image"));
    }, "image/png");
  });
}

function wrapText(ctx, text, maxWidth) {
  const words = normalizeTitle(text).split(" ").filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;

    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) {
      lines.push(line);
      line = word;
      continue;
    }

    let fragment = "";
    for (const char of word) {
      const next = `${fragment}${char}`;
      if (ctx.measureText(next).width > maxWidth && fragment) {
        lines.push(fragment);
        fragment = char;
      } else {
        fragment = next;
      }
    }
    line = fragment;
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function drawCircularImage(ctx, image, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

function drawProfileFallback(ctx, x, y, size) {
  ctx.save();
  ctx.fillStyle = "#122131";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 30px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("TRH", x + size / 2, y + size / 2);
  ctx.restore();
}

async function composePostImage({ sourceDataUrl, title }) {
  const [sourceImage, profileImage] = await Promise.all([
    loadImage(sourceDataUrl),
    loadImage(PROFILE_IMAGE_SRC).catch(() => null),
  ]);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const avatarSize = 112;
  const avatarY = 216;

  if (profileImage) {
    drawCircularImage(ctx, profileImage, CONTENT_X, avatarY, avatarSize);
  } else {
    drawProfileFallback(ctx, CONTENT_X, avatarY, avatarSize);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#050505";
  ctx.font = "700 48px Arial, sans-serif";
  ctx.fillText("True Republican Hub", CONTENT_X + 146, avatarY + 30);
  ctx.fillStyle = "#777777";
  ctx.font = "700 39px Arial, sans-serif";
  ctx.fillText("truerepublicanhub", CONTENT_X + 146, avatarY + 88);

  const titleX = CONTENT_X;
  const titleY = 500;
  const titlePaddingX = 9;
  const titlePaddingY = 10;
  const titleLineHeight = 56;

  ctx.font = "400 45px Arial, sans-serif";
  ctx.fillStyle = "#050505";
  const titleLines = wrapText(
    ctx,
    title,
    CONTENT_WIDTH - titlePaddingX * 2
  );
  const titleHeight = titleLines.length * titleLineHeight + titlePaddingY * 2;

  ctx.strokeStyle = "#8b4dff";
  ctx.lineWidth = 8;
  ctx.strokeRect(titleX, titleY, CONTENT_WIDTH, titleHeight);

  titleLines.forEach((line, index) => {
    ctx.fillText(
      line,
      titleX + titlePaddingX,
      titleY + titlePaddingY + index * titleLineHeight
    );
  });

  const imageY = titleY + titleHeight + 54;
  const cropSize = Math.min(sourceImage.naturalWidth, sourceImage.naturalHeight);
  const cropX = (sourceImage.naturalWidth - cropSize) / 2;
  const cropY = (sourceImage.naturalHeight - cropSize) / 2;

  ctx.drawImage(
    sourceImage,
    cropX,
    cropY,
    cropSize,
    cropSize,
    CONTENT_X,
    imageY,
    CONTENT_WIDTH,
    CONTENT_WIDTH
  );

  const blob = await canvasToBlob(canvas);

  return {
    blob,
    dataUrl: canvas.toDataURL("image/png"),
  };
}

function getStatusLabel(status) {
  switch (status) {
    case "reading":
      return "Reading";
    case "generating":
      return "Grok";
    case "rendering":
      return "Rendering";
    case "ready":
      return "Ready";
    case "queueing":
      return "Queueing";
    case "queued":
      return "Queued";
    case "error":
      return "Needs attention";
    default:
      return "Draft";
  }
}

function getOutputFileName(fileName) {
  const base = String(fileName || "post")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${base || "post"}-generated.png`;
}

export default function BulkImagePostGeneratorModal({
  assignedAccountsCount,
  campaign,
  disableAddPost,
  onClose,
  onQueued,
}) {
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [startPublishAt, setStartPublishAt] = useState(
    getEasternDateTimeInputAfterMinutes(60)
  );
  const [spacingMinutes, setSpacingMinutes] = useState(60);
  const minPublishAt = getCurrentEasternDateTimeInput();
  const readyCount = items.filter((item) => item.status === "ready").length;
  const queueableItems = items.filter(
    (item) =>
      ["ready", "queued"].includes(item.status) &&
      item.status !== "queued" &&
      isValidTitle(item.title) &&
      item.outputBlob &&
      item.publishAt
  );

  function updateItem(id, patch) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function removeItem(id) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function scheduledAtForIndex(index, start = startPublishAt, spacing = spacingMinutes) {
    try {
      return addMinutesToEasternDateTimeInput(
        start,
        Math.max(0, index) * Math.max(0, Number(spacing || 0))
      );
    } catch {
      return start;
    }
  }

  function applySchedule(nextStart, nextSpacing) {
    setItems((current) =>
      current.map((item, index) => ({
        ...item,
        publishAt: scheduledAtForIndex(index, nextStart, nextSpacing),
      }))
    );
  }

  async function fetchTitleForItem(item) {
    const response = await fetch("/api/grok-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: item.sourceDataUrl,
        fileName: item.fileName,
        campaignLabel: campaign?.label || "",
      }),
    });
    const payload = await response.json();

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || "Failed to generate title with Grok");
    }

    return payload.data.title;
  }

  async function renderPreview(id, titleOverride) {
    const item = items.find((current) => current.id === id);
    const title = normalizeTitle(titleOverride ?? item?.title);

    if (!item?.sourceDataUrl) {
      return;
    }

    if (!isValidTitle(title)) {
      updateItem(id, {
        error: "Title must be between 130 and 150 characters before previewing.",
      });
      return;
    }

    updateItem(id, { status: "rendering", error: "" });

    try {
      const output = await composePostImage({
        sourceDataUrl: item.sourceDataUrl,
        title,
      });

      updateItem(id, {
        title,
        renderedTitle: title,
        outputBlob: output.blob,
        outputDataUrl: output.dataUrl,
        status: "ready",
        error: "",
      });
    } catch (renderError) {
      updateItem(id, {
        status: "error",
        error: renderError?.message || "Failed to render preview",
      });
    }
  }

  async function prepareFile(file, index) {
    const id = buildItemId();
    const initialItem = {
      id,
      fileName: file.name,
      sourceDataUrl: "",
      outputDataUrl: "",
      outputBlob: null,
      title: "",
      renderedTitle: "",
      publishAt: scheduledAtForIndex(items.length + index),
      dimensions: "",
      status: "reading",
      error: "",
    };

    setItems((current) => [...current, initialItem]);

    try {
      const sourceDataUrl = await readFileAsDataUrl(file);
      const sourceImage = await loadImage(sourceDataUrl);
      const width = sourceImage.naturalWidth;
      const height = sourceImage.naturalHeight;

      if (Math.abs(width - height) > 2) {
        throw new Error("Only square images can use this post template.");
      }

      updateItem(id, {
        sourceDataUrl,
        dimensions: `${width} x ${height}`,
        status: "generating",
      });

      const hydratedItem = {
        ...initialItem,
        sourceDataUrl,
        dimensions: `${width} x ${height}`,
      };
      const title = await fetchTitleForItem(hydratedItem);
      const output = await composePostImage({ sourceDataUrl, title });

      updateItem(id, {
        title,
        renderedTitle: title,
        outputBlob: output.blob,
        outputDataUrl: output.dataUrl,
        status: "ready",
        error: "",
      });
    } catch (itemError) {
      updateItem(id, {
        status: "error",
        error: itemError?.message || "Failed to prepare image",
      });
    }
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => {
      const type = String(file.type || "").toLowerCase();
      return (
        type === "image/png" ||
        type === "image/jpeg" ||
        /\.(png|jpe?g)$/i.test(String(file.name || ""))
      );
    });

    setError("");
    setSuccess("");

    if (!files.length) {
      setError("Choose at least one PNG or JPEG image.");
      return;
    }

    for (let index = 0; index < files.length; index += 1) {
      await prepareFile(files[index], index);
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function handleRegenerateTitle(id) {
    const item = items.find((current) => current.id === id);

    if (!item?.sourceDataUrl) {
      return;
    }

    updateItem(id, { status: "generating", error: "" });

    try {
      const title = await fetchTitleForItem(item);
      const output = await composePostImage({
        sourceDataUrl: item.sourceDataUrl,
        title,
      });

      updateItem(id, {
        title,
        renderedTitle: title,
        outputBlob: output.blob,
        outputDataUrl: output.dataUrl,
        status: "ready",
        error: "",
      });
    } catch (titleError) {
      updateItem(id, {
        status: "error",
        error: titleError?.message || "Failed to regenerate title",
      });
    }
  }

  function handleTitleChange(id, value) {
    updateItem(id, {
      title: value,
      status: "ready",
      error: "",
    });
  }

  async function handleQueuePosts() {
    const pendingItems = items.filter(
      (item) => item.status !== "queued" && item.status !== "error"
    );

    setError("");
    setSuccess("");

    if (disableAddPost || assignedAccountsCount <= 0) {
      setError("Assign at least one account before queueing posts.");
      return;
    }

    if (!pendingItems.length) {
      setError("There are no reviewed posts ready to queue.");
      return;
    }

    const invalidItem = pendingItems.find(
      (item) => !isValidTitle(item.title) || !item.publishAt
    );

    if (invalidItem) {
      setError("Every reviewed title must be 130 to 150 characters with a publish time.");
      return;
    }

    setIsQueueing(true);
    let currentQueueItemId = "";

    try {
      for (const item of pendingItems) {
        currentQueueItemId = item.id;
        updateItem(item.id, { status: "queueing", error: "" });

        let outputBlob = item.outputBlob;
        if (!outputBlob || item.title !== item.renderedTitle) {
          const output = await composePostImage({
            sourceDataUrl: item.sourceDataUrl,
            title: item.title,
          });
          outputBlob = output.blob;
          updateItem(item.id, {
            outputBlob,
            outputDataUrl: output.dataUrl,
            renderedTitle: item.title,
          });
        }

        const formData = new FormData();
        formData.append("campaignSlug", campaign.slug);
        formData.append("content", normalizeTitle(item.title));
        formData.append("publish_at", item.publishAt);
        formData.append(
          "image",
          new File([outputBlob], getOutputFileName(item.fileName), {
            type: "image/png",
          })
        );

        const response = await fetch("/api/posts", {
          method: "POST",
          body: formData,
        });
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Failed to queue generated post");
        }

        updateItem(item.id, { status: "queued", error: "" });
      }

      setSuccess(`Queued ${pendingItems.length} generated post${pendingItems.length === 1 ? "" : "s"}.`);
      window.setTimeout(() => {
        onQueued?.();
      }, 650);
    } catch (queueError) {
      if (currentQueueItemId) {
        updateItem(currentQueueItemId, {
          status: "error",
          error: queueError?.message || "Failed to queue generated post",
        });
      }
      setError(queueError?.message || "Failed to queue generated posts");
    } finally {
      setIsQueueing(false);
    }
  }

  return (
    <ModalShell
      title="Bulk image post generator"
      modalClassName="bulk-generator-modal"
      onClose={onClose}
    >
      <div className="bulk-generator-body">
        <div className="bulk-generator-controls">
          <label className="detail-form-field">
            <span className="detail-form-label">Publish start</span>
            <input
              autoComplete="off"
              className="detail-form-input"
              type="datetime-local"
              value={startPublishAt}
              min={minPublishAt}
              onChange={(event) => {
                const nextStart = event.target.value;
                setStartPublishAt(nextStart);
                applySchedule(nextStart, spacingMinutes);
              }}
            />
          </label>

          <label className="detail-form-field">
            <span className="detail-form-label">Spacing minutes</span>
            <input
              className="detail-form-input"
              min="0"
              step="5"
              type="number"
              value={spacingMinutes}
              onChange={(event) => {
                const nextSpacing = Math.max(0, Number(event.target.value || 0));
                setSpacingMinutes(nextSpacing);
                applySchedule(startPublishAt, nextSpacing);
              }}
            />
          </label>

          <label className="detail-form-field">
            <span className="detail-form-label">Assigned accounts</span>
            <div className="detail-form-static">
              {assignedAccountsCount} target{assignedAccountsCount === 1 ? "" : "s"}
            </div>
          </label>
        </div>

        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg"
          multiple
          onChange={(event) => handleFiles(event.currentTarget.files)}
        />
        <button
          type="button"
          className={`detail-file-dropzone bulk-generator-dropzone${isDragging ? " detail-file-dropzone-dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            void handleFiles(event.dataTransfer?.files);
          }}
        >
          <span className="detail-file-dropzone-title">
            Upload square images
          </span>
          <span className="detail-file-dropzone-meta">
            {readyCount} ready for review
          </span>
        </button>

        {error ? (
          <p className="detail-form-message detail-form-message-error">{error}</p>
        ) : null}
        {success ? (
          <p className="detail-form-message detail-form-message-success">{success}</p>
        ) : null}

        <div className="bulk-generator-list">
          {!items.length ? (
            <div className="bulk-generator-empty">No images selected.</div>
          ) : null}

          {items.map((item) => {
            const titleLength = getTitleLength(item.title);
            const titleValid = isValidTitle(item.title);
            const needsPreviewRefresh =
              item.title && item.renderedTitle && item.title !== item.renderedTitle;

            return (
              <article className="bulk-generator-card" key={item.id}>
                <div className="bulk-generator-preview-shell">
                  {item.outputDataUrl ? (
                    <img
                      className="bulk-generator-preview"
                      src={item.outputDataUrl}
                      alt={`Generated preview for ${item.fileName}`}
                    />
                  ) : item.sourceDataUrl ? (
                    <img
                      className="bulk-generator-preview bulk-generator-preview-source"
                      src={item.sourceDataUrl}
                      alt={`Source upload ${item.fileName}`}
                    />
                  ) : (
                    <div className="bulk-generator-preview-placeholder">
                      Preparing
                    </div>
                  )}
                </div>

                <div className="bulk-generator-card-panel">
                  <div className="bulk-generator-card-head">
                    <div>
                      <p className="bulk-generator-file-name">{item.fileName}</p>
                      <p className="detail-post-subtle">
                        {item.dimensions || "Square image"} - {getStatusLabel(item.status)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="detail-icon-button"
                      aria-label={`Remove ${item.fileName}`}
                      title="Remove"
                      onClick={() => removeItem(item.id)}
                      disabled={isQueueing || item.status === "queueing"}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <path d="M18 6L6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <label className="bulk-generator-field">
                    <span className="detail-form-label">Generated title</span>
                    <textarea
                      className="detail-form-input detail-form-textarea bulk-generator-title-input"
                      value={item.title}
                      rows={4}
                      onChange={(event) => handleTitleChange(item.id, event.target.value)}
                    />
                  </label>

                  <div className="bulk-generator-meta-row">
                    <span
                      className={`bulk-generator-count${titleValid ? " bulk-generator-count-valid" : ""}`}
                    >
                      {titleLength}/{MAX_TITLE_CHARS}
                    </span>
                    {needsPreviewRefresh ? (
                      <span className="bulk-generator-count">Preview changed</span>
                    ) : null}
                  </div>

                  <label className="bulk-generator-field">
                    <span className="detail-form-label">Publish at</span>
                    <input
                      autoComplete="off"
                      className="detail-form-input"
                      type="datetime-local"
                      value={item.publishAt}
                      min={minPublishAt}
                      onChange={(event) =>
                        updateItem(item.id, { publishAt: event.target.value })
                      }
                    />
                  </label>

                  {item.error ? (
                    <p className="detail-form-message detail-form-message-error">
                      {item.error}
                    </p>
                  ) : null}

                  <div className="bulk-generator-card-actions">
                    <PrimaryButton
                      className="dashboard-button-inline"
                      variant="ghost"
                      type="button"
                      disabled={
                        isQueueing ||
                        item.status === "generating" ||
                        item.status === "rendering" ||
                        !item.sourceDataUrl
                      }
                      onClick={() => void handleRegenerateTitle(item.id)}
                    >
                      Regenerate
                    </PrimaryButton>
                    <PrimaryButton
                      className="dashboard-button-inline detail-action-button"
                      type="button"
                      disabled={
                        isQueueing ||
                        item.status === "rendering" ||
                        !item.sourceDataUrl ||
                        !titleValid
                      }
                      onClick={() => void renderPreview(item.id)}
                    >
                      Update preview
                    </PrimaryButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="detail-modal-actions bulk-generator-footer">
          <PrimaryButton
            className="dashboard-button-inline"
            variant="ghost"
            onClick={onClose}
            type="button"
            disabled={isQueueing}
          >
            Close
          </PrimaryButton>
          <PrimaryButton
            className="dashboard-button-inline detail-action-button"
            type="button"
            disabled={isQueueing || !queueableItems.length || disableAddPost}
            onClick={() => void handleQueuePosts()}
          >
            {isQueueing ? "Queueing..." : "Queue reviewed posts"}
          </PrimaryButton>
        </div>
      </div>
    </ModalShell>
  );
}
