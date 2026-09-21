const COLORS = {
  reset: "\x1b[0m",
  info: "\x1b[36m",
  success: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m"
};

function timestamp() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

export const logger = {
  info: (msg) => console.log(`${COLORS.info}[${timestamp()}] INFO  ${COLORS.reset}${msg}`),
  success: (msg) => console.log(`${COLORS.success}[${timestamp()}] OK    ${COLORS.reset}${msg}`),
  warn: (msg) => console.warn(`${COLORS.warn}[${timestamp()}] WARN  ${COLORS.reset}${msg}`),
  error: (msg) => console.error(`${COLORS.error}[${timestamp()}] ERROR ${COLORS.reset}${msg}`)
};
