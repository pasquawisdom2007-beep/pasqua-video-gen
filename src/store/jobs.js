const jobs = new Map();

const JOB_TTL = 1000 * 60 * 60 * 2;

export const JOB_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  DONE: "done",
  FAILED: "failed"
};

export function createJob(id, data) {
  const job = {
    id,
    status: JOB_STATUS.PENDING,
    prompt: data.prompt,
    imagePath: data.imagePath,
    originalName: data.originalName,
    videoUrl: null,
    videoPath: null,
    error: null,
    progress: 0,
    model: data.model || "cogvideox",
    options: data.options || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    expiresAt: new Date(Date.now() + JOB_TTL).toISOString()
  };

  jobs.set(id, job);
  return job;
}

export function getJob(id) {
  const job = jobs.get(id);
  if (!job) return null;

  if (new Date(job.expiresAt) < new Date()) {
    jobs.delete(id);
    return null;
  }

  return job;
}

export function updateJob(id, updates) {
  const job = jobs.get(id);
  if (!job) return null;

  const updated = {
    ...job,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  if (updates.status === JOB_STATUS.DONE || updates.status === JOB_STATUS.FAILED) {
    updated.completedAt = new Date().toISOString();
  }

  jobs.set(id, updated);
  return updated;
}

export function deleteJob(id) {
  return jobs.delete(id);
}

export function getAllJobs() {
  const result = [];
  for (const [, job] of jobs) {
    if (new Date(job.expiresAt) > new Date()) {
      result.push(job);
    }
  }
  return result;
}

export function cleanExpiredJobs() {
  let count = 0;
  for (const [id, job] of jobs) {
    if (new Date(job.expiresAt) < new Date()) {
      jobs.delete(id);
      count++;
    }
  }
  return count;
}

export function getJobStats() {
  const all = getAllJobs();
  return {
    total: all.length,
    pending: all.filter(j => j.status === JOB_STATUS.PENDING).length,
    processing: all.filter(j => j.status === JOB_STATUS.PROCESSING).length,
    done: all.filter(j => j.status === JOB_STATUS.DONE).length,
    failed: all.filter(j => j.status === JOB_STATUS.FAILED).length
  };
}
