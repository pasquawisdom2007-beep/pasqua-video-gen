import { Router } from "express";
import { createReadStream, existsSync, statSync } from "fs";
import { getJob } from "../store/jobs.js";
import fetch from "node-fetch";
import { logger } from "../utils/logger.js";

const router = Router();

router.get("/:id", async (req, res) => {
  const { id } = req.params;

  const job = getJob(id);

  if (!job) {
    return res.status(404).json({
      error: "Job not found or expired"
    });
  }

  if (job.status !== "done") {
    return res.status(400).json({
      error: "Video not ready yet",
      current_status: job.status,
      poll_url: `/api/status/${id}`
    });
  }

  if (!job.videoUrl && !job.videoPath) {
    return res.status(500).json({ error: "No video available for this job" });
  }

  try {
    if (job.videoPath && existsSync(job.videoPath)) {
      const stat = statSync(job.videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="cinematic-${id.slice(0, 8)}.mp4"`);
      res.setHeader("X-Job-Id", id);
      res.setHeader("X-Model-Used", job.model);
      res.setHeader("X-Space-Used", job.space || "unknown");
      res.setHeader("Accept-Ranges", "bytes");

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Content-Length", chunkSize);

        const stream = createReadStream(job.videoPath, { start, end });
        stream.pipe(res);
      } else {
        res.setHeader("Content-Length", fileSize);
        const stream = createReadStream(job.videoPath);
        stream.pipe(res);
      }

      logger.info(`Streaming video for job ${id} from local path`);
      return;
    }

    if (job.videoUrl && job.videoUrl.startsWith("http")) {
      logger.info(`Proxying video for job ${id} from: ${job.videoUrl}`);

      const videoResponse = await fetch(job.videoUrl, {
        headers: {
          "User-Agent": "CinematicVideoAPI/1.0",
          ...(req.headers.range ? { Range: req.headers.range } : {})
        }
      });

      if (!videoResponse.ok) {
        return res.status(502).json({
          error: "Failed to fetch video from source",
          direct_url: job.videoUrl,
          hint: "Try downloading directly from direct_url"
        });
      }

      const contentType = videoResponse.headers.get("content-type") || "video/mp4";
      const contentLength = videoResponse.headers.get("content-length");

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="cinematic-${id.slice(0, 8)}.mp4"`);
      res.setHeader("X-Job-Id", id);
      res.setHeader("X-Model-Used", job.model);
      res.setHeader("X-Direct-Source", job.videoUrl);

      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      videoResponse.body.pipe(res);
      return;
    }

    return res.status(500).json({
      error: "Video file unavailable",
      video_url: job.videoUrl || null,
      hint: "Video may have been cleaned up. Use video_url directly if available."
    });

  } catch (err) {
    logger.error(`Video route error for ${id}: ${err.message}`);
    return res.status(500).json({
      error: "Failed to serve video",
      message: err.message,
      direct_url: job.videoUrl || null
    });
  }
});

router.get("/:id/info", (req, res) => {
  const { id } = req.params;
  const job = getJob(id);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  return res.json({
    job_id: id,
    status: job.status,
    video_url: job.videoUrl || null,
    video_path_available: job.videoPath ? existsSync(job.videoPath) : false,
    model: job.model,
    space: job.space || null,
    prompt: job.prompt,
    created_at: job.createdAt,
    completed_at: job.completedAt
  });
});

export default router;
