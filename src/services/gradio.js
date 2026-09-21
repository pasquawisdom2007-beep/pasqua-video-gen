import { Client, handle_file } from "@gradio/client";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SPACES = {
  // hysts/CogVideoX-5b and Manjushri/CogVideoX-5B were guessed fallback
  // mirrors that don't actually exist (confirmed: "Space metadata could
  // not be loaded" on every attempt) — removed so a failed run doesn't
  // waste ~4s knocking on dead Spaces before it can even try the real one.
  cogvideox: [
    "THUDM/CogVideoX-5B-Space"
  ],
  svd: [
    "multimodalart/stable-video-diffusion",
    "vdo/stable-video-diffusion"
  ],
  animatediff: [
    "guoyww/animatediff",
    "camenduru/animatediff"
  ]
};

const SPACE_CONFIGS = {
  "THUDM/CogVideoX-5B-Space": {
    endpoint: "/generate",
    inputFormat: "cogvideox_standard"
  },
  "hysts/CogVideoX-5b": {
    endpoint: "/generate",
    inputFormat: "cogvideox_standard"
  },
  "multimodalart/stable-video-diffusion": {
    endpoint: "/run",
    inputFormat: "svd_standard"
  }
};

async function connectWithRetry(spaceName, maxRetries = 3) {
  let lastError;

  const token = process.env.HF_TOKEN;
  const tokenPreview = token ? `${token.slice(0, 6)}...(${token.length} chars)` : "MISSING";
  logger.info(`HF_TOKEN check: ${tokenPreview}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Connecting to space: ${spaceName} (attempt ${attempt})`);
      const client = await Client.connect(spaceName, {
        hf_token: process.env.HF_TOKEN || undefined,
        status_callback: (status) => {
          logger.info(`Space status: ${JSON.stringify(status)}`);
        }
      });
      logger.success(`Connected to ${spaceName}`);

      try {
        const api = await client.view_api();
        logger.info(`API schema for ${spaceName}: ${JSON.stringify(api).slice(0, 5000)}`);
      } catch (schemaErr) {
        logger.warn(`Could not fetch API schema for ${spaceName}: ${schemaErr.message}`);
      }

      return client;
    } catch (err) {
      lastError = err;
      logger.warn(`Failed connecting to ${spaceName}: ${err.message}`);
      if (attempt < maxRetries) {
        await sleep(2000 * attempt);
      }
    }
  }

  throw lastError;
}

async function trySpaces(modelKey, connectFn) {
  const spaceList = SPACES[modelKey] || SPACES.cogvideox;

  for (const space of spaceList) {
    try {
      const client = await connectWithRetry(space, 2);
      const result = await connectFn(client, space);
      if (result) return result;
    } catch (err) {
      logger.warn(`Space ${space} failed: ${err.message}`);
    }
  }

  throw new Error("All spaces failed. HuggingFace may be rate-limiting or spaces are down.");
}

function buildCogVideoXPayload(imagePath, prompt, options = {}) {
  // This Space's /generate endpoint only accepts these five named
  // parameters (confirmed via client.view_api() logged at connect time —
  // see logger.info("API schema for ...") in connectWithRetry above).
  // It does NOT expose steps / guidance_scale / num_frames / width / height —
  // sending those keys makes Gradio reject the whole call.
  return {
    prompt: prompt,
    image_input: handle_file(readFileSync(imagePath)),
    video_input: null,
    video_strength: options.videoStrength ?? 0.8,
    seed_value: options.seed ?? -1
  };
}

function buildSVDPayload(imagePath, prompt, options = {}) {
  return {
    image: handle_file(readFileSync(imagePath)),
    num_frames: options.numFrames || 25,
    num_inference_steps: options.steps || 25,
    fps_id: options.fps || 6,
    motion_bucket_id: options.motionBucket || 127,
    cond_aug: 0.02,
    seed: options.seed || 0,
    decoding_t: 7,
    device: "cuda"
  };
}

function extractVideoFromResult(result, space) {
  if (!result || !result.data) {
    throw new Error("No data in result");
  }

  const data = result.data;

  for (const item of data) {
    if (item && typeof item === "object") {
      if (item.video && item.video.url) return item.video.url;
      if (item.url && (item.url.endsWith(".mp4") || item.url.includes("video"))) return item.url;
    }
    if (typeof item === "string" && (item.endsWith(".mp4") || item.startsWith("http"))) {
      return item;
    }
  }

  if (data[0]) {
    if (typeof data[0] === "string") return data[0];
    if (data[0].url) return data[0].url;
    if (data[0].video) return data[0].video.url || data[0].video;
    if (data[0].path) return data[0].path;
  }

  logger.warn(`Unknown result structure from ${space}: ${JSON.stringify(data).slice(0, 300)}`);
  throw new Error("Could not extract video URL from space result");
}

export async function generateVideo(imagePath, prompt, options = {}) {
  if (!existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  const modelKey = options.model || "cogvideox";

  logger.info(`Starting video generation | model: ${modelKey} | prompt: "${prompt.slice(0, 60)}..."`);

  const result = await trySpaces(modelKey, async (client, space) => {
    const config = SPACE_CONFIGS[space] || { endpoint: "/generate", inputFormat: "cogvideox_standard" };

    let payload;
    if (config.inputFormat === "svd_standard") {
      payload = buildSVDPayload(imagePath, prompt, options);
    } else {
      payload = buildCogVideoXPayload(imagePath, prompt, options);
    }

    logger.info(`Submitting to ${space} endpoint ${config.endpoint}`);

    const prediction = await client.predict(config.endpoint, payload);

    const videoUrl = extractVideoFromResult(prediction, space);
    logger.success(`Video generated from ${space}: ${videoUrl}`);

    return { videoUrl, space };
  });

  const localPath = await downloadVideo(result.videoUrl, options.jobId);

  return {
    videoUrl: result.videoUrl,
    localPath,
    space: result.space
  };
}

async function downloadVideo(url, jobId) {
  if (!url || url.startsWith("/") || !url.startsWith("http")) {
    return url;
  }

  try {
    const outputDir = join(dirname(__filename), "../../tmp/videos");
    const fileName = `${jobId || Date.now()}.mp4`;
    const filePath = join(outputDir, fileName);

    logger.info(`Downloading video to ${filePath}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "CinematicVideoAPI/1.0"
      }
    });

    if (!response.ok) {
      logger.warn(`Download failed (${response.status}), returning direct URL`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(filePath, buffer);

    logger.success(`Video downloaded: ${fileName} (${(buffer.length / 1024 / 1024).toFixed(2)}MB)`);
    return filePath;
  } catch (err) {
    logger.warn(`Could not download video locally: ${err.message}`);
    return null;
  }
}

export async function getAvailableModels() {
  const models = [];

  for (const [modelKey, spaceList] of Object.entries(SPACES)) {
    models.push({
      key: modelKey,
      spaces: spaceList,
      description: getModelDescription(modelKey)
    });
  }

  return models;
}

function getModelDescription(key) {
  const descriptions = {
    cogvideox: "CogVideoX-5B — High quality image-to-video, best cinematic results",
    svd: "Stable Video Diffusion — Fast image animation, great for motion effects",
    animatediff: "AnimateDiff — Smooth animation, great for stylized motion"
  };
  return descriptions[key] || "Open source video generation model";
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
