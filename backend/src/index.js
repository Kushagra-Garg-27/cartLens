const express = require("express");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const logger = require("./utils/logger");
const loggerMiddleware = require("./middleware/logger.middleware");
const db = require("./db");

// Routes
const authRoutes = require("./routes/auth.routes");
const compareRoutes = require("./routes/compare.routes");
const watchlistRoutes = require("./routes/watchlist.routes");
const historyRoutes = require("./routes/history.routes");
const healthRoutes = require("./routes/health.routes");
const observeRoutes = require("./routes/observe.routes");
const rankerRoutes = require("./routes/ranker.routes");

// Cron jobs
const { processScrapeJobs } = require("./scrapers/scraper.runner");
const { enqueueWatchlistedProducts } = require("./cron/watchlist.cron");
const { enqueueStaleListings } = require("./cron/stale.cron");
const { cleanupOldPriceHistory, cleanupDoneScrapeJobs } = require("./cron/cleanup.cron");
const { runSalePrealerts } = require("./cron/sale-prealert.cron");

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));

// CORS — allow extension and dev origins
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const allowed =
    !origin ||
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("moz-extension://") ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin === config.app.backendUrl;

  if (allowed) {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(loggerMiddleware);

// ── Routes ─────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/compare", compareRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/observe", observeRoutes);
app.use("/api/rank", rankerRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
});

// Global error handler — never expose stack to client
app.use((err, req, res, _next) => {
  logger.error({
    service: "api",
    event: "unhandled_error",
    error: err.message,
    request_id: req.requestId,
  });
  res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
});

// ── Migration Runner ───────────────────────────────────────
async function runPendingMigrations() {
  try {
    // Ensure schema_migrations table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, "..", "migrations");
    if (!fs.existsSync(migrationsDir)) {
      logger.info({ service: "api", event: "no_migrations_dir" });
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      // Check if already applied
      const applied = await db.query(
        "SELECT filename FROM schema_migrations WHERE filename = $1",
        [file]
      );

      if (applied.rows.length === 0) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
        await db.query(sql);
        logger.info({ service: "api", event: "migration_applied", filename: file });
      }
    }
  } catch (err) {
    logger.error({
      service: "api",
      event: "migration_error",
      error: err.message,
    });
  }
}

// ── Cron Scheduler ─────────────────────────────────────────
// Process scrape jobs every minute for faster results
cron.schedule("* * * * *", async () => {
  try {
    await processScrapeJobs();
  } catch (err) {
    logger.error({ service: "cron", event: "scrape_cron_error", error: err.message });
  }
});

// Enqueue watchlisted products every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  try {
    await enqueueWatchlistedProducts();
  } catch (err) {
    logger.error({ service: "cron", event: "watchlist_cron_error", error: err.message });
  }
});

// Enqueue stale listings every 4 hours
cron.schedule("0 */4 * * *", async () => {
  try {
    await enqueueStaleListings();
  } catch (err) {
    logger.error({ service: "cron", event: "stale_cron_error", error: err.message });
  }
});

// Cleanup done scrape_jobs daily at 2AM
cron.schedule("0 2 * * *", async () => {
  try {
    await cleanupDoneScrapeJobs();
  } catch (err) {
    logger.error({ service: "cron", event: "cleanup_jobs_cron_error", error: err.message });
  }
});

// Cleanup old price_history weekly on Sunday at 3AM
cron.schedule("0 3 * * 0", async () => {
  try {
    await cleanupOldPriceHistory();
  } catch (err) {
    logger.error({ service: "cron", event: "cleanup_history_cron_error", error: err.message });
  }
});

// Run sale pre-alerts daily at 9:00 AM
cron.schedule("0 9 * * *", async () => {
  try {
    await runSalePrealerts();
  } catch (err) {
    logger.error({ service: "cron", event: "sale_prealert_cron_error", error: err.message });
  }
});

// ── Start Server ───────────────────────────────────────
const PORT = config.app.port;

// Only start the server when run directly (not imported by tests)
if (require.main === module) {
  runPendingMigrations().then(() => {
    app.listen(PORT, () => {
      logger.info({
        service: "api",
        event: "server_started",
        port: PORT,
        env: config.app.nodeEnv,
      });
    });
  });
}

module.exports = app;
