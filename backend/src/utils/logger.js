/**
 * Structured JSON logger — writes to stdout.
 * Every log line matches the spec format.
 */
function formatLog(level, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    ...data,
  };
  return JSON.stringify(entry);
}

const logger = {
  info(data) {
    console.log(formatLog("info", data));
  },
  warn(data) {
    console.warn(formatLog("warn", data));
  },
  error(data) {
    console.error(formatLog("error", data));
  },
};

module.exports = logger;
