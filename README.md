# 🎬 Cinematic Video API

> Send an image + a text prompt → get back an AI-generated cinematic video. Free. No Replicate. No paid keys.

Powered by open-source models running on HuggingFace Spaces (CogVideoX-5B, Stable Video Diffusion, AnimateDiff).

---

## 🚀 Deploy on Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service → Connect your repo
3. Render auto-detects `render.yaml` — just hit Deploy
4. Set `HF_TOKEN` env var (optional but recommended for higher HF rate limits — free at huggingface.co)

---

## 📡 Endpoints

### `POST /api/generate`
Generate a cinematic video from an image.

**Request (multipart/form-data):**
```
image       — Image file (jpg/png/webp, max 10MB)
prompt      — Motion description (required)
model       — cogvideox | svd | animatediff (optional, default: cogvideox)
steps       — Inference steps (optional, default: 50)
seed        — Random seed, -1 for random (optional)
```

**Response:**
```json
{
  "job_id": "uuid-here",
  "status": "pending",
  "poll_url": "/api/status/uuid-here",
  "estimated_time": "2-5 minutes"
}
```

---

### `GET /api/status/:id`
Poll for job status.

**Response (done):**
```json
{
  "job_id": "uuid",
  "status": "done",
  "video_url": "https://...",
  "download_url": "/api/video/uuid"
}
```

---

### `GET /api/video/:id`
Stream or download the generated video (mp4).
Supports range requests for mobile playback.

---

### `GET /api/generate/models`
List available models and their spaces.

---

## 💡 Usage Example (WhatsApp bot)

```js
const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function imageToVideo(imagePath, prompt) {
  const form = new FormData();
  form.append('image', fs.createReadStream(imagePath));
  form.append('prompt', prompt);
  form.append('model', 'cogvideox');

  const res = await fetch('https://your-api.onrender.com/api/generate', {
    method: 'POST',
    body: form
  });

  const { job_id } = await res.json();

  while (true) {
    await new Promise(r => setTimeout(r, 8000));
    const status = await fetch(`https://your-api.onrender.com/api/status/${job_id}`).then(r => r.json());

    if (status.status === 'done') {
      return status.download_url;
    }
    if (status.status === 'failed') {
      throw new Error(status.error);
    }
  }
}
```

---

## 🎬 Models

| Model | Key | Quality | Speed |
|-------|-----|---------|-------|
| CogVideoX-5B | `cogvideox` | 🔥🔥🔥 Best | ~3-5 min |
| Stable Video Diffusion | `svd` | 🔥🔥 Great | ~1-2 min |
| AnimateDiff | `animatediff` | 🔥🔥 Good | ~1-2 min |

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HF_TOKEN` | — | HuggingFace token (optional, higher rate limits) |
| `PORT` | 3000 | Server port |
| `MAX_CONCURRENT_JOBS` | 3 | Max parallel generations |
| `RATE_MAX_REQUESTS` | 5 | Max requests per window per IP |
| `RATE_WINDOW_MS` | 60000 | Rate limit window (ms) |
| `ADMIN_KEY` | — | Secret key for admin endpoints |
| `MAX_IMAGE_SIZE` | 10 | Max upload size in MB |
