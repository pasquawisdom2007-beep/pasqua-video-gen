import { readdir, unlink, stat } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { cleanExpiredJobs } from "../store/jobs.js";
import { cleanRateLimitStore } from "../middleware/rateLimit.js";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VIDEO_MAX_AGE = 1000 * 60 * 60 * 2;
const UPLOAD_MAX_AGE = 1000 * 60 * 30;

async function cleanTempDir(dirPath, maxAge) {
  try {
    const files = await readdir(dirPath);
    let removed = 0;

    for (const file of files) {
      const filePath = join(dirPath, file);
      try {
        const fileStat = await stat(filePath);
        const age = Date.now() - fileStat.mtimeMs;

        if (age > maxAge) {
          await unlink(filePath);
          removed++;
        }
      } catch {
      }
    }

    if (removed > 0) {
      logger.info(`Cleaned ${removed} files from ${dirPath}`);
    }
  } catch (err) {
    logger.warn(`Cleanup failed for ${dirPath}: ${err.message}`);
  }
}

async function runCleanup() {
  const uploadsDir = join(__dirname, "../../tmp/uploads");
  const videosDir = join(__dirname, "../../tmp/videos");

  await cleanTempDir(uploadsDir, UPLOAD_MAX_AGE);
  await cleanTempDir(videosDir, VIDEO_MAX_AGE);

  const expired = cleanExpiredJobs();
  if (expired > 0) {
    logger.info(`Cleaned ${expired} expired jobs`);
  }

  cleanRateLimitStore();
}

export function startCleanup() {
  const CLEANUP_INTERVAL = 1000 * 60 * 30;

  setInterval(async () => {
    logger.info("Running scheduled cleanup...");
    await runCleanup();
  }, CLEANUP_INTERVAL);

  logger.info(`Cleanup scheduler started (every ${CLEANUP_INTERVAL / 60000}m)`);
}
