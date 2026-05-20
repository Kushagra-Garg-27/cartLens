const express = require("express");
const router = express.Router();
const { healthCheck } = require("../db");

// GET /api/health
router.get("/", async (req, res) => {
  const dbOk = await healthCheck();
  res.json({
    status: "ok",
    db: dbOk ? "connected" : "error",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
