import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";

import generateRoute from "./routes/generate.js";
import statusRoute from "./routes/status.js";
import videoRoute from "./routes/video.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimiter } from "./middleware/rateLimit.js";
import { logger } from "./utils/logger.js";
import { startCleanup } from "./utils/cleanup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

mkdirSync(join(__dirname, "../tmp/uploads"), { recursive: true });
mkdirSync(join(__dirname, "../tmp/videos"), { recursive: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"]
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(join(__dirname, "../public")));

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path} — ${req.ip}`);
  next();
});

app.get("/", (_req, res) => {
  res.sendFile(join(__dirname, "../public/index.html"));
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage()
  });
});

app.use("/api/generate", rateLimiter, generateRoute);
app.use("/api/status", statusRoute);
app.use("/api/video", videoRoute);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found", status: 404 });
});

app.use(errorHandler);

app.listen(PORT, () => {
  logger.success(`🎬 Cinematic Video API running on port ${PORT}`);
  logger.info(`📡 Health: http://localhost:${PORT}/health`);
  startCleanup();
});

export default app;
