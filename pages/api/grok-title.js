import appConfig from "@/config";
import { formatErrorForLog } from "@/lib/utils/formatErrorForLog";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "32mb",
    },
  },
};

const MIN_TITLE_CHARS = 130;
const MAX_TITLE_CHARS = 150;
const TITLE_FILLERS = [
  " as the clip spreads online",
  " as viewers demand answers",
  " after the moment was caught on camera",
  " while the footage draws fresh reaction",
];

function normalizeTitle(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHashTags(value) {
  return normalizeTitle(value).replace(/(^|\s)#[^\s#]+/g, "").trim();
}

function trimToMaxLength(value) {
  const title = normalizeTitle(value);

  if (title.length <= MAX_TITLE_CHARS) {
    return title;
  }

  const hardLimit = title.slice(0, MAX_TITLE_CHARS + 1);
  const lastSpace = hardLimit.lastIndexOf(" ");
  const candidate =
    lastSpace >= MIN_TITLE_CHARS
      ? hardLimit.slice(0, lastSpace)
      : title.slice(0, MAX_TITLE_CHARS);

  return candidate.replace(/[,:;.!?\s]+$/g, "").trim();
}

function expandToMinLength(value) {
  let title = normalizeTitle(value);

  if (title.length >= MIN_TITLE_CHARS) {
    return title;
  }

  for (const filler of TITLE_FILLERS) {
    if (title.length >= MIN_TITLE_CHARS) {
      break;
    }

    const withFiller = `${title}${filler}`;
    if (withFiller.length <= MAX_TITLE_CHARS) {
      title = withFiller;
    }
  }

  return title;
}

function fitTitleLength(value) {
  const withoutHashTags = stripHashTags(value);
  return trimToMaxLength(expandToMinLength(withoutHashTags));
}

function isValidTitle(value) {
  const length = normalizeTitle(value).length;
  return length >= MIN_TITLE_CHARS && length <= MAX_TITLE_CHARS;
}

function assertImageDataUrl(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error("imageDataUrl is required");
  }

  if (!/^data:image\/(png|jpe?g);base64,/i.test(normalized)) {
    throw new Error("A PNG or JPEG image is required");
  }

  return normalized;
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  if (Array.isArray(payload?.choices)) {
    const content = payload.choices
      .map((choice) => choice?.message?.content || choice?.text || "")
      .join(" ");

    if (content.trim()) {
      return content;
    }
  }

  if (!Array.isArray(payload?.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => {
      if (typeof item?.content === "string") {
        return item.content;
      }

      if (!Array.isArray(item?.content)) {
        return [];
      }

      return item.content.map((part) => part?.text || part?.value || "");
    })
    .join(" ");
}

function buildPrompt({ campaignLabel, fileName, previousTitle }) {
  const context = [
    campaignLabel ? `Campaign: ${campaignLabel}.` : "",
    fileName ? `Uploaded image filename: ${fileName}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const retryInstruction = previousTitle
    ? ` The previous draft was ${normalizeTitle(previousTitle).length} characters: "${normalizeTitle(previousTitle)}". Rewrite it to fit exactly within the required range.`
    : "";

  return [
    context,
    "Write one social-media title for this image in the style of a punchy political news caption.",
    `It must be at least ${MIN_TITLE_CHARS} characters and at most ${MAX_TITLE_CHARS} characters.`,
    "Return only the title. No quotes, hashtags, emojis, bullets, prefixes, or line breaks.",
    "Do not invent specific names, places, crimes, or outcomes that are not visible or clearly implied by the image.",
    retryInstruction,
  ]
    .filter(Boolean)
    .join(" ");
}

async function requestGrokTitle({ imageDataUrl, campaignLabel, fileName, previousTitle }) {
  const response = await fetch(`${appConfig.xai.baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appConfig.xai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: appConfig.xai.titleModel,
      store: false,
      temperature: 0.8,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "high",
            },
            {
              type: "input_text",
              text: buildPrompt({ campaignLabel, fileName, previousTitle }),
            },
          ],
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      `Grok title generation failed with status ${response.status}`;
    throw new Error(message);
  }

  return normalizeTitle(extractResponseText(payload));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    if (!appConfig.xai.apiKey) {
      return res.status(500).json({
        success: false,
        error: "XAI_API_KEY or GROK_API_KEY is not configured",
      });
    }

    const imageDataUrl = assertImageDataUrl(req.body?.imageDataUrl);
    const campaignLabel = normalizeTitle(req.body?.campaignLabel);
    const fileName = normalizeTitle(req.body?.fileName);
    let title = "";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      title = fitTitleLength(
        await requestGrokTitle({
          imageDataUrl,
          campaignLabel,
          fileName,
          previousTitle: title,
        })
      );

      if (isValidTitle(title)) {
        break;
      }
    }

    if (!isValidTitle(title)) {
      throw new Error("Grok could not produce a title between 130 and 150 characters");
    }

    return res.status(200).json({
      success: true,
      data: {
        title,
        characterCount: title.length,
        model: appConfig.xai.titleModel,
      },
    });
  } catch (error) {
    console.error(formatErrorForLog(error, "[api/grok-title] failed"));
    return res.status(400).json({
      success: false,
      error: error?.message || "Failed to generate title",
    });
  }
}
