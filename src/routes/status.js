import { Router } from "express";
import { getJob, getAllJobs, getJobStats } from "../store/jobs.js";
import { getActiveJobCount } from "../services/processor.js";

const router = Router();

router.get("/:id", (req, res) => {
  const { id } = req.params;

  if (!id || id.length < 10) {
    return res.status(400).json({ error: "Invalid job ID" });
  }

  const job = getJob(id);

  if (!job) {
    return res.status(404).json({
      error: "Job not found",
      message: "Job may have expired (TTL: 2 hours) or the ID is invalid"
    });
  }

  const response = {
    job_id: job.id,
    status: job.status,
    progress: job.progress,
    model: job.model,
    prompt: job.prompt,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    expires_at: job.expiresAt
  };

  if (job.status === "done") {
    response.video_url = job.videoUrl;
    response.download_url = `/api/video/${job.id}`;
    response.completed_at = job.completedAt;
    response.space_used = job.space;
    response.message = "Video is ready! Use download_url to get the video.";
  }

  if (job.status === "failed") {
    response.error = job.error;
    response.message = "Generation failed. Try again with a different prompt or model.";
    response.retry_suggestion = "Try model: 'svd' or 'animatediff' as fallback";
  }

  if (job.status === "processing") {
    response.message = "Video is being generated... This takes 2-5 minutes.";
  }

  if (job.status === "pending") {
    response.message = "Job is queued and will start shortly.";
    response.queue_position = getActiveJobCount();
  }

  return res.json(response);
});

router.get("/", (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const adminKey = process.env.ADMIN_KEY;

  if (adminKey && apiKey !== adminKey) {
    return res.status(403).json({ error: "Admin access required" });
  }

  const jobs = getAllJobs();
  const stats = getJobStats();

  return res.json({
    stats,
    active_jobs: getActiveJobCount(),
    jobs: jobs.map(j => ({
      id: j.id,
      status: j.status,
      model: j.model,
      prompt: j.prompt.slice(0, 80),
      created_at: j.createdAt,
      completed_at: j.completedAt
    }))
  });
});

export default router;
