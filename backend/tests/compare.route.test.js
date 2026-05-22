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

// Mock AI services to prevent real Gemini API calls
jest.mock("../src/services/ai.attributes", () => ({
  extractAttributes: jest.fn().mockResolvedValue({ product_type: "electronics", normalized: {} }),
}));
jest.mock("../src/services/ai.history", () => ({
  generateAndStoreHistory: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/services/ai.recommendations", () => ({
  getRecommendations: jest.fn().mockResolvedValue([]),
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

  test("known ASIN returns status with results array", async () => {
    const productId = "660e8400-e29b-41d4-a716-446655440001";
    const listingId = "770e8400-e29b-41d4-a716-446655440001";

    // Mock queries robustly by checking query SQL text
    db.query.mockImplementation(async (sql, params) => {
      const queryStr = sql.toLowerCase();

      if (queryStr.includes("insert into listings") || queryStr.includes("listings (url")) {
        return { rows: [{ id: listingId, is_inserted: false }] };
      }
      if (queryStr.includes("insert into price_history")) {
        return { rows: [] };
      }
      if (queryStr.includes("from listings") && queryStr.includes("url = $1")) {
        // product resolver URL cache
        return { rows: [{ product_id: productId }] };
      }
      if (queryStr.includes("from listings") && queryStr.includes("product_id = $1")) {
        // listing fetcher
        return {
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
        };
      }
      if (queryStr.includes("from products") && queryStr.includes("id = $1")) {
        // product info
        return {
          rows: [{
            canonical_name: "Test Product",
            brand: "Test Brand",
            category: "electronics",
            model_number: null,
            ai_product_type: null,
            raw_gender: null,
            ai_attributes: {},
          }],
        };
      }
      if (queryStr.includes("from watchlist")) {
        return { rows: [] };
      }
      if (queryStr.includes("from price_history")) {
        return { rows: [] };
      }
      if (queryStr.includes("from user_platform_affinity")) {
        return { rows: [] };
      }
      if (queryStr.includes("from platform_health")) {
        return { rows: [] };
      }
      if (queryStr.includes("from user_profiles")) {
        return { rows: [] };
      }

      // Default fallback
      return { rows: [], rowCount: 0 };
    });

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
    expect(res.body.results).toBeInstanceOf(Array);
  });

  test("unknown product returns 200 with queued status", async () => {
    const productId = "880e8400-e29b-41d4-a716-446655440001";

    // Default mock for any unmatched queries — safe fallback
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });

    // Mock chain — must exactly match the query execution order:
    //
    // storeExtensionObservation:
    //   Q1: upsert listing (RETURNING id, is_inserted)
    //   Q2: insert price_history
    //   (generateAndStoreHistory is fully mocked — no DB queries)
    //
    // resolve() — for URL "randomsite.com", no extractors match:
    //   Q3: URL cache (miss)
    //   Q4: URL match any (miss)  — no ASIN/FK/model/EAN/ISBN/myntra/ajio queries because extractors return null
    //   Q5: NLP category candidates (miss)
    //   Q6: fallback candidates (miss)
    //   → returns null (no match)
    //
    // Cold path:
    //   Q7: createNewProduct INSERT INTO products RETURNING id
    //   Q8: linkListingToProduct UPDATE listings
    //   Q9: enqueueAllPlatforms: SELECT product info
    //   Q10+: INSERT scrape_jobs (one per matching platform — falls through to default mock)
    //
    // Response assembly:
    //   Q_n: listing fetcher SELECT (falls through to default)
    //   Q_n+1: watchlist check SELECT (falls through to default)
    //   (no deal score/stats/buy-rec queries because currentPrice is null with 0 listings)
    //
    //   Q_last: product title fetch

    db.query
      .mockResolvedValueOnce({ rows: [{ id: "listing-1", is_inserted: true }] })  // Q1 upsert listing
      .mockResolvedValueOnce({ rows: [] })                                          // Q2 price_history
      .mockResolvedValueOnce({ rows: [] })                                          // Q3 URL cache
      .mockResolvedValueOnce({ rows: [] })                                          // Q4 URL match any
      .mockResolvedValueOnce({ rows: [] })                                          // Q5 NLP candidates
      .mockResolvedValueOnce({ rows: [] })                                          // Q6 fallback candidates
      .mockResolvedValueOnce({ rows: [{ id: productId }] })                         // Q7 INSERT product
      .mockResolvedValueOnce({ rows: [] })                                          // Q8 link listing
      .mockResolvedValueOnce({ rows: [{ canonical_name: "Unknown Product", brand: null, category: "electronics", ai_product_type: null, ai_attributes: null }] }); // Q9 get product for enqueue

    const res = await request(app)
      .post("/api/compare")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        title: "Unknown Product XYZ",
        price: 9999,
        url: "https://randomsite.com/product/xyz",
        platform: "amazon",
      });

    // Route returns HTTP 200 with the product data
    expect(res.status).toBe(200);
    expect(res.body.product_id).toBeDefined();
  });
});

describe("GET /api/compare/poll/:product_id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 without auth token", async () => {
    const res = await request(app)
      .get("/api/compare/poll/some-product-id");

    expect(res.status).toBe(401);
  });

  test("returns found if results has multiple listings", async () => {
    const productId = "660e8400-e29b-41d4-a716-446655440001";
    const listingId1 = "770e8400-e29b-41d4-a716-446655440001";
    const listingId2 = "770e8400-e29b-41d4-a716-446655440002";

    db.query.mockImplementation(async (sql, params) => {
      const queryStr = sql.toLowerCase();
      if (queryStr.includes("from listings") && queryStr.includes("product_id = $1")) {
        return {
          rows: [
            {
              listing_id: listingId1,
              platform: "amazon",
              url: "https://amazon.in/dp/B0TEST1234",
              current_price: "12999.00",
              currency: "INR",
              availability: "in_stock",
              last_scraped_at: new Date().toISOString(),
            },
            {
              listing_id: listingId2,
              platform: "flipkart",
              url: "https://flipkart.com/p/itm123",
              current_price: "12499.00",
              currency: "INR",
              availability: "in_stock",
              last_scraped_at: new Date().toISOString(),
            }
          ],
        };
      }
      if (queryStr.includes("from products") && queryStr.includes("id = $1")) {
        return {
          rows: [{
            canonical_name: "Test Product",
            brand: "Test Brand",
            category: "electronics",
          }],
        };
      }
      if (queryStr.includes("from user_platform_affinity")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .get(`/api/compare/poll/${productId}`)
      .set("Authorization", `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("found");
    expect(res.body.partial).toBe(false);
    expect(res.body.results).toHaveLength(2);
  });

  test("returns partial if 1 listing exists and scrape jobs are pending/running", async () => {
    const productId = "660e8400-e29b-41d4-a716-446655440001";
    const listingId1 = "770e8400-e29b-41d4-a716-446655440001";

    db.query.mockImplementation(async (sql, params) => {
      const queryStr = sql.toLowerCase();
      if (queryStr.includes("from listings") && queryStr.includes("product_id = $1")) {
        return {
          rows: [
            {
              listing_id: listingId1,
              platform: "amazon",
              url: "https://amazon.in/dp/B0TEST1234",
              current_price: "12999.00",
              currency: "INR",
              availability: "in_stock",
              last_scraped_at: new Date().toISOString(),
            }
          ],
        };
      }
      if (queryStr.includes("from scrape_jobs") && queryStr.includes("status in ('pending', 'running')")) {
        return {
          rows: [{ cnt: "1" }],
        };
      }
      if (queryStr.includes("from products") && queryStr.includes("id = $1")) {
        return {
          rows: [{
            canonical_name: "Test Product",
          }],
        };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .get(`/api/compare/poll/${productId}`)
      .set("Authorization", `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("partial");
    expect(res.body.partial).toBe(true);
    expect(res.body.results).toHaveLength(1);
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
