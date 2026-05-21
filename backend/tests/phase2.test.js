const db = require("../src/db");
const dealDetector = require("../src/services/deal.detector");
const specComparator = require("../src/services/spec.comparator");
const ranker = require("../src/services/ranker.service");
const alertService = require("../src/services/alert.service");

// Mock db module
jest.mock("../src/db", () => {
  const mockQuery = jest.fn();
  return {
    query: mockQuery,
    transaction: jest.fn((fn) => fn({ query: mockQuery })),
    healthCheck: jest.fn().mockResolvedValue(true),
    pool: { on: jest.fn(), query: jest.fn() },
  };
});

// Mock resend email client
jest.mock("resend", () => {
  return {
    Resend: jest.fn().mockImplementation(() => {
      return {
        emails: {
          send: jest.fn().mockResolvedValue({ id: "mock-email-id" }),
        },
      };
    }),
  };
});

describe("Phase 2 Feature Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    db.query.mockImplementation(async (sql, params) => {
      const queryStr = sql.toLowerCase();

      // Feature 1: Platform price history
      if (queryStr.includes("l.platform, date(ph.scraped_at) as day")) {
        return {
          rows: [
            { platform: "amazon", day: new Date("2026-05-18T00:00:00.000Z"), price: "12000.00" },
            { platform: "amazon", day: new Date("2026-05-19T00:00:00.000Z"), price: "11800.00" },
            { platform: "flipkart", day: new Date("2026-05-19T00:00:00.000Z"), price: "11500.00" },
          ]
        };
      }

      // Feature 2 & 3: Product info check
      if (queryStr.includes("canonical_name, brand, model_number, category") && queryStr.includes("from products")) {
        return {
          rows: [{
            canonical_name: "OnePlus 12 5G",
            brand: "OnePlus",
            model_number: "CPH2573",
            category: "smartphones",
            ai_product_type: "smartphones",
            raw_gender: "unisex",
            ai_attributes: {
              ram: "16GB",
              storage: "512GB",
              color: "Flowy Emerald",
            },
          }]
        };
      }

      // Feature 3: recordClick - Product category check
      if (queryStr.includes("select category from products where id = $1")) {
        return { rows: [{ category: "smartphones" }] };
      }

      // Feature 3: recordClick - Clicks fetch for decay calculations
      if (queryStr.includes("select chosen_platform, chosen_price, alternatives, category, extract")) {
        return {
          rows: [
            { chosen_platform: "amazon", chosen_price: 10000, alternatives: JSON.stringify([{ platform: "flipkart", price: 11000 }]), category: "smartphones", days_ago: 0 },
            { chosen_platform: "amazon", chosen_price: 12000, alternatives: JSON.stringify([{ platform: "flipkart", price: 10500 }]), category: "smartphones", days_ago: 10 },
          ]
        };
      }

      // Feature 3: rankResults - Affinity check
      if (queryStr.includes("from user_platform_affinity")) {
        return {
          rows: [
            { platform: "amazon", category: "smartphones", affinity_score: "0.9" },
            { platform: "flipkart", category: "smartphones", affinity_score: "0.5" },
          ]
        };
      }

      // Feature 3: rankResults - Platform health check
      if (queryStr.includes("from platform_health")) {
        return {
          rows: [
            { platform: "amazon", success_rate: "0.98" },
            { platform: "flipkart", success_rate: "0.95" },
          ]
        };
      }

      // Feature 3: rankResults - User profile check
      if (queryStr.includes("from user_profiles")) {
        return {
          rows: [{ price_sensitivity: 0.2 }] // brand loyalist -> weights affinity heavily
        };
      }

      // Feature 4: checkWatchlistAlerts - Find watchlist
      if (queryStr.includes("from watchlist w") && queryStr.includes("join users u")) {
        return {
          rows: [
            { id: "w-1", user_id: "user-123456", target_price: "11000.00", email: "user@example.com", canonical_name: "Phone 1" }
          ]
        };
      }

      // Feature 4: checkWatchlistAlerts - Cheaper alternatives
      if (queryStr.includes("from listings") && queryStr.includes("current_price < $3")) {
        return {
          rows: [{ platform: "flipkart", current_price: "10500.00", url: "https://flipkart.com/p" }]
        };
      }

      // Feature 4: checkWatchlistAlerts - Old price query
      if (queryStr.includes("from price_history ph") && queryStr.includes("offset 1 limit 1")) {
        return {
          rows: [{ price: "12000.00" }]
        };
      }

      // Default fallback
      return { rows: [], rowCount: 0 };
    });
  });

  describe("Feature 1: Per-Platform Price History Scraper", () => {
    test("buildPlatformPriceHistory returns deduplicated map per platform", async () => {
      const history = await dealDetector.buildPlatformPriceHistory("product-123", 90);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("l.platform, DATE(ph.scraped_at) AS day"),
        ["product-123", 90]
      );
      expect(history).toEqual({
        amazon: [
          { date: "2026-05-18", price: 12000 },
          { date: "2026-05-19", price: 11800 },
        ],
        flipkart: [
          { date: "2026-05-19", price: 11500 },
        ],
      });
    });
  });

  describe("Feature 2: Cross-Website Price Comparison & Specs", () => {
    test("compareSpecs builds side-by-side specs comparison matrices", async () => {
      const mockListings = [
        { platform: "amazon", title: "OnePlus 12 (Flowy Emerald, 16GB RAM, 512GB Storage)" },
        { platform: "flipkart", title: "OnePlus 12 (Emerald Green, 256 GB)" },
      ];

      const specRows = await specComparator.compareSpecs("product-123", mockListings);

      expect(specRows).toContainEqual(expect.objectContaining({
        label: "Brand",
        canonical: "OnePlus",
      }));
      expect(specRows).toContainEqual(expect.objectContaining({
        label: "RAM",
        canonical: "16GB",
        values: { amazon: "16GB", flipkart: "256GB" },
      }));
    });
  });

  describe("Feature 3: Personalized Platform Ranker v2", () => {
    test("recordClick updates user profiles and calculates sensitivity & category affinity", async () => {
      await ranker.recordClick(
        "user-123",
        "product-123",
        "amazon",
        10000,
        [{ platform: "amazon", price: 10000 }, { platform: "flipkart", price: 11000 }],
        "smartphones"
      );

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO user_platform_clicks"),
        expect.any(Array)
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO user_profiles"),
        expect.any(Array)
      );
    });

    test("rankResults boosts score based on user profile sensitivity and affinity", async () => {
      const mockResults = [
        { platform: "amazon", price: 10000, match_confidence: 0.9, last_scraped_at: new Date() },
        { platform: "flipkart", price: 9500, match_confidence: 0.9, last_scraped_at: new Date() },
      ];

      const ranked = await ranker.rankResults("user-123", mockResults, "smartphones");

      expect(ranked).toHaveLength(2);
      expect(ranked[0].platform).toBe("amazon"); // amazon is preferred despite higher price because user is brand loyalist
    });
  });

  describe("Feature 4: Smart Price Alerts & Predictive drop", () => {
    test("checkWatchlistAlerts runs alert logic when price matches/drops and fetches cross-platform option", async () => {
      // Mock computeBuyRecommendation
      const spyBuyRec = jest.spyOn(dealDetector, "computeBuyRecommendation").mockResolvedValue({
        score: 80,
        label: "Buy Now",
      });

      await alertService.checkWatchlistAlerts({
        productId: "product-123",
        platform: "amazon",
        price: 10999,
        url: "https://amazon.in/dp/phone",
      });

      expect(spyBuyRec).toHaveBeenCalledWith("product-123", 10999);
      spyBuyRec.mockRestore();
    });
  });
});
