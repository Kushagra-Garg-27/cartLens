/**
 * Compare route integration tests.
 * Uses supertest to test the Express app.
 */
const request = require("supertest");

// Mock db module before requiring the app
jest.mock("../src/db", () => {
  const mockQuery = jest.fn();
  return {
    query: mockQuery,
    transaction: jest.fn((fn) => fn({ query: mockQuery })),
    healthCheck: jest.fn().mockResolvedValue(true),
    pool: { on: jest.fn(), query: jest.fn() },
  };
});

// Mock node-cron to prevent actual scheduling
jest.mock("node-cron", () => ({
  schedule: jest.fn(),
}));

// Mock scrapers to prevent Playwright initialization
jest.mock("../src/scrapers/scraper.runner", () => ({
  processScrapeJobs: jest.fn(),
}));

const db = require("../src/db");

// Set env before requiring config
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "test-secret-key-minimum-32-characters-long";
process.env.JWT_EXPIRES_IN = "7d";

const jwt = require("jsonwebtoken");
const app = require("../src/index");

const testUserId = "550e8400-e29b-41d4-a716-446655440000";
const testToken = jwt.sign(
  { id: testUserId, email: "test@example.com" },
  process.env.JWT_SECRET,
  { expiresIn: "1h" }
);

describe("POST /api/compare", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 without auth token", async () => {
    const res = await request(app)
      .post("/api/compare")
      .send({ title: "Test Product", url: "https://amazon.in/dp/B123", platform: "amazon" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
  });

  test("returns 400 for missing required fields", async () => {
    const res = await request(app)
      .post("/api/compare")
      .set("Authorization", `Bearer ${testToken}`)
      .send({ title: "Test" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("known ASIN returns status: found with results array", async () => {
    const productId = "660e8400-e29b-41d4-a716-446655440001";
    const listingId = "770e8400-e29b-41d4-a716-446655440001";

    // Mock storeExtensionObservation upsert
    db.query
      .mockResolvedValueOnce({ rows: [{ id: listingId }] }) // upsert listing
      .mockResolvedValueOnce({ rows: [] }) // insert price_history
      // Mock product resolver — ASIN match
      .mockResolvedValueOnce({ rows: [{ id: productId }] }) // platform_pid lookup
      // Mock listing fetcher
      .mockResolvedValueOnce({
        rows: [{
          listing_id: listingId,
          platform: "amazon",
          url: "https://amazon.in/dp/B0TEST1234",
          platform_pid: "B0TEST1234",
          current_price: "12999.00",
          currency: "INR",
          availability: "in_stock",
          match_confidence: "1.00",
          match_method: "deterministic",
          last_scraped_at: new Date().toISOString(),
          price_history: [{ price: 13999, scraped_at: new Date().toISOString() }],
        }],
      })
      // Mock watchlist check
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/compare")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        title: "Test Product",
        price: 12999,
        url: "https://amazon.in/dp/B0TEST1234",
        platform: "amazon",
        asin: "B0TEST1234",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("found");
    expect(res.body.results).toBeInstanceOf(Array);
  });

  test("unknown product returns 202 with scrape_jobs created", async () => {
    const productId = "880e8400-e29b-41d4-a716-446655440001";
    const jobId = "990e8400-e29b-41d4-a716-446655440001";

    // The compare route calls these queries in order:
    // 1. upsert listing (storeExtensionObservation)
    // 2. insert price_history (storeExtensionObservation)
    // 3. product resolver: URL match query (url lookup)
    // 4. product resolver: probabilistic candidates
    // 5. createNewProduct
    // 6. linkListingToProduct
    // 7. enqueueAllPlatforms: get product info
    // 8-11. Insert scrape_jobs (4 platforms minus amazon)
    db.query
      .mockResolvedValueOnce({ rows: [{ id: "listing-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: productId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ canonical_name: "Unknown Product", brand: null }] })
      .mockResolvedValueOnce({ rows: [{ id: jobId }] })
      .mockResolvedValueOnce({ rows: [{ id: jobId }] })
      .mockResolvedValueOnce({ rows: [{ id: jobId }] })
      .mockResolvedValueOnce({ rows: [{ id: jobId }] });

    const res = await request(app)
      .post("/api/compare")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        title: "Unknown Product XYZ",
        price: 9999,
        url: "https://randomsite.com/product/xyz",
        platform: "amazon",
      });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("queued");
    expect(res.body.job_ids).toBeInstanceOf(Array);
    expect(res.body.message).toContain("check back");
  });
});

describe("GET /api/health", () => {
  test("returns status ok with db connected", async () => {
    db.healthCheck.mockResolvedValue(true);

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("connected");
    expect(res.body.timestamp).toBeDefined();
  });
});
