import { generateVideo } from "./gradio.js";
import { updateJob, JOB_STATUS } from "../store/jobs.js";
import { logger } from "../utils/logger.js";
import { unlink } from "fs/promises";

const activeJobs = new Set();
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_JOBS || "3");

export async function processJob(job) {
  if (activeJobs.size >= MAX_CONCURRENT) {
    logger.warn(`Job ${job.id} queued — max concurrent limit reached (${MAX_CONCURRENT})`);
    await waitForSlot();
  }

  activeJobs.add(job.id);

  try {
    logger.info(`Processing job ${job.id} | "${job.prompt.slice(0, 50)}"`);

    updateJob(job.id, {
      status: JOB_STATUS.PROCESSING,
      progress: 5
    });

    const result = await generateVideo(job.imagePath, job.prompt, {
      model: job.model,
      jobId: job.id,
      steps: job.options?.steps,
      guidanceScale: job.options?.guidanceScale,
      numFrames: job.options?.numFrames,
      seed: job.options?.seed
    });

    updateJob(job.id, {
      status: JOB_STATUS.DONE,
      progress: 100,
      videoUrl: result.videoUrl,
      videoPath: result.localPath,
      space: result.space
    });

    logger.success(`Job ${job.id} completed`);

    await cleanupUpload(job.imagePath);

  } catch (err) {
    logger.error(`Job ${job.id} failed: ${err.message}`);

    updateJob(job.id, {
      status: JOB_STATUS.FAILED,
      progress: 0,
      error: err.message
    });

    await cleanupUpload(job.imagePath);
  } finally {
    activeJobs.delete(job.id);
  }
}

async function cleanupUpload(filePath) {
  if (!filePath) return;
  try {
    await unlink(filePath);
    logger.info(`Cleaned up upload: ${filePath}`);
  } catch {
  }
}

async function waitForSlot() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      if (activeJobs.size < MAX_CONCURRENT) {
        clearInterval(check);
        resolve();
      }
    }, 1000);
  });
}

export function getActiveJobCount() {
  return activeJobs.size;
}

export function isJobActive(id) {
  return activeJobs.has(id);
}
