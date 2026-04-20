import formidable from "formidable";
import { easternDateTimeInputToIso } from "@/lib/utils/easternTime";

export function getSingleValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function getSingleFile(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseMultipartForm(req) {
  const form = formidable({ multiples: false, keepExtensions: true });
  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) return reject(error);
      resolve({ fields, files });
    });
  });
}

export function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export async function parsePostPatchPayload(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  const payload = {};
  let replacementFile = null;

  if (contentType.includes("multipart/form-data")) {
    const { fields, files } = await parseMultipartForm(req);
    const content = String(getSingleValue(fields.content) || "").trim();
    const publishAt = String(getSingleValue(fields.publish_at) || "").trim();
    replacementFile = getSingleFile(files.video);
    if (content) payload.content = content;
    if (publishAt) payload.publish_at = easternDateTimeInputToIso(publishAt);
  } else {
    const body = await parseJsonBody(req);
    if (typeof body?.content === "string") payload.content = body.content.trim();
    if (typeof body?.publish_at === "string") payload.publish_at = easternDateTimeInputToIso(body.publish_at.trim());
  }

  return { payload, replacementFile };
}
