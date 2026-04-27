import config from "@/config";

const TITLE_MAX_LENGTH = 72;

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sentenceCase(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function trimTitle(value) {
  const normalized = sentenceCase(value)
    .replace(/^["']+|["']+$/g, "")
    .replace(/[.?!]+$/g, "")
    .trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length <= TITLE_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, TITLE_MAX_LENGTH - 3).trim()}...`;
}

export function buildFallbackVideoTitle(transcript) {
  const normalized = normalizeWhitespace(transcript);

  if (!normalized) {
    return "Watch this clip";
  }

  const [firstSentence = ""] = normalized.split(/(?<=[.!?])\s+/);
  const candidate = trimTitle(firstSentence || normalized);

  if (candidate) {
    return candidate;
  }

  const words = normalized.split(" ").slice(0, 10).join(" ");
  return trimTitle(words) || "Watch this clip";
}

function parseTitleList(outputText, expectedCount) {
  const lines = String(outputText || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[\).\-\s]+/, "").trim())
    .filter(Boolean)
    .map(trimTitle)
    .filter(Boolean);

  return lines.slice(0, expectedCount);
}

function buildFallbackVideoTitles(transcript, count) {
  const base = buildFallbackVideoTitle(transcript);
  const words = normalizeWhitespace(transcript).split(" ").filter(Boolean);
  const variants = [];

  for (let index = 0; index < Math.max(1, count); index++) {
    const sliceStart = Math.min(index * 2, Math.max(0, words.length - 6));
    const slice = words.slice(sliceStart, sliceStart + 6).join(" ");
    const candidate = trimTitle(slice) || base;
    variants.push(index === 0 ? base : candidate === base ? `${base} ${index + 1}` : candidate);
  }

  return variants.slice(0, Math.max(1, count));
}

export async function generateVideoTitles(transcript, count = 1, options = {}) {
  const normalizedCount = Math.max(1, Number(count || 1));
  const fallbackTitles = buildFallbackVideoTitles(transcript, normalizedCount);
  const apiKey = String(config.openai.apiKey || "").trim();

  if (!apiKey || !normalizeWhitespace(transcript)) {
    return {
      titles: fallbackTitles,
      provider: apiKey ? "fallback" : "fallback-no-api-key",
    };
  }

  const prompt = [
    `Write ${normalizedCount} short social video titles for the same video.`,
    "Requirements:",
    "- 4 to 8 words",
    "- sentence case",
    "- no hashtags",
    "- no quotes",
    "- no ending punctuation",
    "- make them natural and specific to the transcript",
    "- every title should be meaningfully different from the others",
    "- return exactly one title per line",
    "",
    "Transcript:",
    normalizeWhitespace(transcript),
  ].join("\n");

  try {
    const response = await fetch(`${config.openai.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model || config.openai.model,
        input: prompt,
        max_output_tokens: Math.max(64, normalizedCount * 20),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status}`);
    }

    const payload = await response.json();
    const outputTitles = parseTitleList(payload?.output_text, normalizedCount);

    return {
      titles:
        outputTitles.length === normalizedCount
          ? outputTitles
          : fallbackTitles.map((title, index) => outputTitles[index] || title),
      provider: outputTitles.length ? "openai" : "fallback-empty-response",
    };
  } catch (error) {
    console.error("[ai/generateVideoTitle] fallback:", error.message);

    return {
      titles: fallbackTitles,
      provider: "fallback-error",
    };
  }
}

export async function generateVideoTitle(transcript, options = {}) {
  const result = await generateVideoTitles(transcript, 1, options);
  return {
    title: result.titles[0] || buildFallbackVideoTitle(transcript),
    provider: result.provider,
  };
}
