const express = require("express");
const router = express.Router();
const db = require("../db");
const { hashPassword, comparePassword, signToken } = require("../auth");
const { createRateLimiter } = require("../middleware/rate-limiter");
const config = require("../config");
const logger = require("../utils/logger");

const authRateLimiter = createRateLimiter({
  max: config.rateLimit.auth,
  windowMs: 60000,
});

// POST /api/auth/register
router.post("/register", authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
        code: "VALIDATION_ERROR",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters",
        code: "VALIDATION_ERROR",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Invalid email format",
        code: "VALIDATION_ERROR",
      });
    }

    // Check if user already exists
    const existing = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "Email already registered",
        code: "DUPLICATE_EMAIL",
      });
    }

    const passwordHash = await hashPassword(password);
    const result = await db.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email.toLowerCase().trim(), passwordHash]
    );

    const user = result.rows[0];
    const token = signToken(user);

    logger.info({
      service: "api",
      event: "user_registered",
      user_id: user.id.substring(0, 8),
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    logger.error({
      service: "api",
      event: "register_error",
      error: err.message,
    });
    res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
  }
});

// POST /api/auth/login
router.post("/login", authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
        code: "VALIDATION_ERROR",
      });
    }

    const result = await db.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password",
        code: "INVALID_CREDENTIALS",
      });
    }

    const user = result.rows[0];
    const valid = await comparePassword(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({
        error: "Invalid email or password",
        code: "INVALID_CREDENTIALS",
      });
    }

    const token = signToken(user);

    logger.info({
      service: "api",
      event: "user_login",
      user_id: user.id.substring(0, 8),
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (err) {
    logger.error({
      service: "api",
      event: "login_error",
      error: err.message,
    });
    res.status(500).json({ error: "Internal error", code: "SERVER_ERROR" });
  }
});

module.exports = router;
