const { Pool } = require("pg");
const config = require("./config");
const logger = require("./utils/logger");

const pool = new Pool({
  connectionString: config.database.url,
  ssl: config.database.url.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  logger.error({
    service: "api",
    event: "db_pool_error",
    error: err.message,
  });
  process.exit(1);
});

/**
 * Execute a parameterized query.
 * @param {string} text - SQL query string
 * @param {any[]} [params] - Query parameters
 * @returns {Promise<import("pg").QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 500) {
    logger.warn({
      service: "api",
      event: "slow_query",
      duration_ms: duration,
      query: text.substring(0, 120),
    });
  }
  return result;
}

/**
 * Execute a function inside a database transaction.
 * @param {(client: import("pg").PoolClient) => Promise<any>} fn
 * @returns {Promise<any>}
 */
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Check if the database connection is alive.
 * @returns {Promise<boolean>}
 */
async function healthCheck() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

module.exports = { pool, query, transaction, healthCheck };
