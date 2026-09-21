import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { upload } from "../middleware/upload.js";
import { createJob } from "../store/jobs.js";
import { processJob } from "../services/processor.js";
import { getAvailableModels } from "../services/gradio.js";
import { logger } from "../utils/logger.js";

const router = Router();

const ALLOWED_MODELS = ["cogvideox", "svd", "animatediff"];

const PROMPT_MAX_LENGTH = 500;
const PROMPT_MIN_LENGTH = 3;

router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { prompt, model, steps, guidance_scale, num_frames, seed } = req.body;

    if (!req.file) {
      return res.status(400).json({
        error: "No image uploaded",
        hint: "Send image as multipart/form-data with field name 'image'"
      });
    }

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required",
        hint: "Describe how you want the image to animate, e.g. 'person walking through rainy Tokyo streets at night'"
      });
    }

    if (prompt.length < PROMPT_MIN_LENGTH || prompt.length > PROMPT_MAX_LENGTH) {
      return res.status(400).json({
        error: `Prompt must be between ${PROMPT_MIN_LENGTH} and ${PROMPT_MAX_LENGTH} characters`,
        received: prompt.length
      });
    }

    const selectedModel = model && ALLOWED_MODELS.includes(model) ? model : "cogvideox";

    const jobId = uuidv4();

    const job = createJob(jobId, {
      prompt: prompt.trim(),
      imagePath: req.file.path,
      originalName: req.file.originalname,
      model: selectedModel,
      options: {
        steps: steps ? parseInt(steps) : undefined,
        guidanceScale: guidance_scale ? parseFloat(guidance_scale) : undefined,
        numFrames: num_frames ? parseInt(num_frames) : undefined,
        seed: seed ? parseInt(seed) : undefined
      }
    });

    logger.info(`Job created: ${jobId} | model: ${selectedModel} | image: ${req.file.originalname}`);

    processJob(job).catch(err => {
      logger.error(`processJob crashed for ${jobId}: ${err.message}`);
    });

    return res.status(202).json({
      job_id: jobId,
      status: "pending",
      message: "Video generation started. Poll /api/status/:id for updates.",
      poll_url: `/api/status/${jobId}`,
      estimated_time: "2-5 minutes",
      model: selectedModel,
      prompt: prompt.trim(),
      created_at: job.createdAt
    });

  } catch (err) {
    logger.error(`Generate route error: ${err.message}`);
    return res.status(500).json({
      error: "Failed to start generation",
      message: err.message
    });
  }
});

router.get("/models", async (_req, res) => {
  try {
    const models = await getAvailableModels();
    return res.json({
      models,
      default: "cogvideox",
      recommendation: "Use cogvideox for best cinematic quality"
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/test", (_req, res) => {
  res.json({
    message: "Generate endpoint is alive 🎬",
    usage: {
      method: "POST",
      contentType: "multipart/form-data",
      fields: {
        image: "Image file (jpg/png/webp, max 10MB)",
        prompt: "String describing the video motion (required)",
        model: "cogvideox | svd | animatediff (optional, default: cogvideox)",
        steps: "Number of inference steps (optional, default: 50)",
        guidance_scale: "Guidance scale 1-20 (optional, default: 6)",
        num_frames: "Number of video frames (optional, default: 49)",
        seed: "Random seed -1 for random (optional)"
      }
    }
  });
});

export default router;
