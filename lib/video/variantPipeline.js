import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const LOCAL_FONTS_DIR = path.join(process.cwd(), "public", "fonts");
const FONT_CANDIDATES = [
  process.env.VIDEO_TITLE_FONT_PATH,
  path.join(LOCAL_FONTS_DIR, "Poppins-Regular.ttf"),
  path.join(LOCAL_FONTS_DIR, "Poppins-Medium.ttf"),
  path.join(LOCAL_FONTS_DIR, "Poppins-SemiBold.ttf"),
].filter(Boolean);

function resolveTitleFontPath() {
  const match = FONT_CANDIDATES.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });

  if (!match) {
    throw new Error(
      "Poppins font file not found. Set VIDEO_TITLE_FONT_PATH to a Poppins .ttf file, or place Poppins-Regular.ttf / Poppins-Medium.ttf / Poppins-SemiBold.ttf in public/fonts or Downloads."
    );
  }

  return match;
}

function hashString(input) {
  let hash = 2166136261;

  for (const char of String(input || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function randomFromSeed(seed, min, max) {
  const normalized = (hashString(seed) % 10000) / 10000;
  return min + (max - min) * normalized;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildVariantAdjustments(seed, variantIndex = 0) {
  const index = Math.max(0, Number(variantIndex || 0));
  const serialOffset = index * 0.0003;
  const direction = index % 2 === 0 ? 1 : -1;

  const brightness = clamp(
    randomFromSeed(`${seed}:brightness`, -0.055, 0.055) +
      direction * serialOffset,
    -0.075,
    0.075
  );
  const contrast = clamp(
    randomFromSeed(`${seed}:contrast`, 0.94, 1.09) + index * 0.0012,
    0.92,
    1.12
  );
  const saturation = clamp(
    randomFromSeed(`${seed}:saturation`, 0.88, 1.18) + direction * index * 0.0015,
    0.84,
    1.22
  );
  const gamma = clamp(
    randomFromSeed(`${seed}:gamma`, 0.95, 1.07) + direction * index * 0.0008,
    0.93,
    1.09
  );
  const hue = clamp(
    randomFromSeed(`${seed}:hue`, -9.5, 9.5) + direction * index * 0.17,
    -14,
    14
  );
  const vignetteAngle = clamp(
    randomFromSeed(`${seed}:vignette`, 0.5, 0.78) + index * 0.001,
    0.48,
    0.84
  );
  const pitch = clamp(
    randomFromSeed(`${seed}:pitch`, 0.965, 1.04) + direction * index * 0.0015,
    0.95,
    1.055
  );
  const volume = clamp(
    randomFromSeed(`${seed}:volume`, 0.93, 1.07) + direction * index * 0.001,
    0.9,
    1.1
  );

  return {
    brightness,
    contrast,
    saturation,
    gamma,
    hue,
    vignetteAngle,
    pitch,
    volume,
  };
}

function escapeFilterPath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}

function safeRm(dirPath) {
  try {
    if (dirPath && fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {}
}

async function ensureTempDir(prefix) {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function probeMediaInfo(sourceFilePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,width,height",
      "-of",
      "json",
      sourceFilePath,
    ],
    {
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    }
  );
  const payload = JSON.parse(String(stdout || "{}"));
  const streams = Array.isArray(payload?.streams) ? payload.streams : [];
  const videoStream = streams.find((stream) => stream?.codec_type === "video") || {};
  const hasAudio = streams.some((stream) => stream?.codec_type === "audio");
  const width = Number(videoStream?.width);
  const height = Number(videoStream?.height);

  return {
    width: Number.isFinite(width) ? width : 720,
    height: Number.isFinite(height) ? height : 1280,
    hasAudio,
  };
}

function wrapTitleText(title, videoWidth, fontSize) {
  const maxWidth = Math.max(240, Math.floor(videoWidth * 0.85));
  const approxCharWidth = Math.max(6, Math.round(fontSize * 0.58));
  const maxCharsPerLine = Math.max(10, Math.floor(maxWidth / approxCharWidth));
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join("\n");
}

function normalizeManualTitles(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((title) => String(title || "").trim())
    .filter(Boolean);
}

async function buildVariantMetadata(sourceFilePath, variantCount = 1, manualTitles = []) {
  const dimensions = await probeMediaInfo(sourceFilePath);
  const fontSize = Math.max(17, Math.min(31, Math.round(dimensions.width * 0.05) - 11));
  const normalizedManualTitles = normalizeManualTitles(manualTitles);

  if (!normalizedManualTitles.length) {
    throw new Error("Comma-separated titles are required");
  }

  const resolvedTitles = Array.from({ length: Math.max(1, variantCount) }, (_, index) => {
    const title =
      normalizedManualTitles[index] ||
      normalizedManualTitles[0] ||
      "Watch this clip";
    return wrapTitleText(title, dimensions.width, fontSize);
  });

  return {
    transcript: "",
    titles: resolvedTitles,
    titleProvider: "manual",
    dimensions,
    fontSize,
  };
}

function buildVideoFilter({
  seed,
  title,
  fontPath,
  fontSize,
  variantIndex,
}) {
  const adjustments = buildVariantAdjustments(seed, variantIndex);
  const hue = adjustments.hue.toFixed(3);
  const brightness = adjustments.brightness.toFixed(4);
  const contrast = adjustments.contrast.toFixed(4);
  const saturation = adjustments.saturation.toFixed(4);
  const gamma = adjustments.gamma.toFixed(4);
  const vignetteAngle = adjustments.vignetteAngle.toFixed(4);
  const yOffset = Math.round(randomFromSeed(`${seed}:y`, -20, 24));
  const yOffsetExpression = yOffset < 0 ? `${yOffset}` : `+${yOffset}`;
  const boxPadding = Math.max(6, Math.round(fontSize * 0.24));
  const titleLines = String(title || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lineHeight = fontSize + Math.max(8, Math.round(fontSize * 0.35));
  const lineGap = 2;
  const totalBlockHeight =
    titleLines.length * lineHeight +
    Math.max(0, titleLines.length - 1) * lineGap;

  const filterParts = [
    `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}:gamma=${gamma}`,
    `hue=h=${hue}`,
    `vignette=angle=${vignetteAngle}:x0=w/2:y0=h/2`,
    ...titleLines.map((line, index) => {
      const lineYOffset =
        index * (lineHeight + lineGap) - totalBlockHeight / 2 + lineHeight / 2;
      const lineOffsetExpression =
        lineYOffset < 0 ? `${lineYOffset}` : `+${lineYOffset}`;

      return `drawtext=${[
        `fontfile='${escapeFilterPath(fontPath)}'`,
        `text='${escapeFilterPath(line)}'`,
        "enable='between(t,0,5)'",
        `fontsize=${fontSize}`,
        "fontcolor=black",
        "x=(w-text_w)/2",
        `y=(h*0.72-text_h/2${yOffsetExpression}${lineOffsetExpression})`,
        "text_align=center+middle",
        "box=1",
        "boxcolor=white@1.0",
        `boxborderw=${boxPadding}`,
        "shadowcolor=black@0.06",
        "shadowx=0",
        "shadowy=1",
      ].join(":")}`;
    }),
  ];

  return filterParts.join(",");
}

function buildAudioFilter(seed, variantIndex = 0) {
  const adjustments = buildVariantAdjustments(seed, variantIndex);
  const pitch = adjustments.pitch.toFixed(4);
  const volume = adjustments.volume.toFixed(4);
  const tempo = (1 / Number(pitch)).toFixed(4);

  return [
    `asetrate=44100*${pitch}`,
    "aresample=44100",
    `atempo=${tempo}`,
    `volume=${volume}`,
  ].join(",");
}

async function renderVideoVariant({
  sourceFilePath,
  outputFilePath,
  seed,
  titleText,
  fontSize,
  hasAudio,
  variantIndex,
}) {
  const fontPath = resolveTitleFontPath();

  try {
    const filter = buildVideoFilter({
      seed,
      title: titleText,
      fontPath,
      fontSize,
      variantIndex,
    });
    const audioFilter = hasAudio ? buildAudioFilter(seed, variantIndex) : null;
    const ffmpegArgs = [
      "-y",
      "-i",
      sourceFilePath,
      "-vf",
      filter,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "27",
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
    ];

    if (audioFilter) {
      ffmpegArgs.push("-af", audioFilter);
    }

    ffmpegArgs.push(
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputFilePath
    );

    await execFileAsync("ffmpeg", ffmpegArgs, {
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
  } finally {
    // no temp files needed for per-line text rendering
  }
}

export async function createVideoVariantContext(sourceFilePath, variantCount = 1, manualTitles = []) {
  return buildVariantMetadata(sourceFilePath, variantCount, manualTitles);
}

export async function createVideoVariant({
  sourceFile,
  variantKey,
  variantIndex = 0,
  context,
}) {
  const resolvedSourcePath = path.resolve(sourceFile.path);
  const fileExt = path.extname(sourceFile.name || resolvedSourcePath) || ".mp4";
  const outputDir = await ensureTempDir("video-variant-");
  const outputFilePath = path.join(outputDir, `variant-${variantIndex}${fileExt}`);
  const titleText =
    String(context?.titles?.[variantIndex] || context?.titles?.[0] || "Watch this clip").trim() ||
    "Watch this clip";

  try {
    await renderVideoVariant({
      sourceFilePath: resolvedSourcePath,
      outputFilePath,
      seed: variantKey,
      titleText,
      fontSize: Number(context?.fontSize || 36),
      hasAudio: Boolean(context?.dimensions?.hasAudio),
      variantIndex,
    });

    return {
      dir: outputDir,
      file: {
        name: path.basename(outputFilePath),
        path: outputFilePath,
      },
      metadata: {
        transcript: context?.transcript || "",
        title: titleText,
        rawTitle: context?.titles?.[variantIndex] || context?.titles?.[0] || "",
        titleProvider: context?.titleProvider || "unknown",
      },
    };
  } catch (error) {
    throw error;
  }
}

export function cleanupVideoVariant(variant) {
  safeUnlink(variant?.file?.path);
  safeRm(variant?.dir);
}

export function cleanupVideoVariantContext(context) {
  return context;
}
