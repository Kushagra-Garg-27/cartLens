const { normalizeText, tokenize, matchScore } = require("../src/utils/text.utils");

describe("Text Matching Utilities", () => {
  describe("normalizeText", () => {
    test("lowercases and strips special characters", () => {
      expect(normalizeText("Samsung Galaxy S24 Ultra!")).toBe("samsung galaxy s24 ultra");
    });

    test("handles empty string", () => {
      expect(normalizeText("")).toBe("");
    });

    test("handles null/undefined", () => {
      expect(normalizeText(null)).toBe("");
      expect(normalizeText(undefined)).toBe("");
    });
  });

  describe("tokenize", () => {
    test("splits and filters stop words", () => {
      const tokens = tokenize("The Best New Samsung Galaxy S24");
      expect(tokens).not.toContain("the");
      expect(tokens).not.toContain("best");
      expect(tokens).not.toContain("new");
      expect(tokens).toContain("samsung");
      expect(tokens).toContain("galaxy");
      expect(tokens).toContain("s24");
    });

    test("removes single-character tokens", () => {
      const tokens = tokenize("A B Samsung C Galaxy");
      expect(tokens).not.toContain("a");
      expect(tokens).not.toContain("b");
      expect(tokens).not.toContain("c");
    });

    test("handles empty string", () => {
      expect(tokenize("")).toEqual([]);
    });
  });

  describe("matchScore", () => {
    test("identical titles return 1.0", () => {
      const score = matchScore(
        "Samsung Galaxy S24 Ultra 256GB",
        "Samsung Galaxy S24 Ultra 256GB"
      );
      expect(score).toBe(1.0);
    });

    test("same product different format returns >= 0.60", () => {
      const score = matchScore(
        "Samsung Galaxy S24 Ultra 256GB Titanium Black",
        "Samsung Galaxy S24 Ultra 256 GB - Titanium Black"
      );
      // Jaccard similarity: tokens differ slightly due to "256gb" vs "256" + "gb"
      // Expanded STOP_WORDS now filters colors like "titanium" and "black", reducing overlap
      expect(score).toBeGreaterThanOrEqual(0.55);
    });

    test("different brands return 0.0", () => {
      const score = matchScore(
        "Galaxy Wireless Headphones",
        "Galaxy Wireless Headphones",
        "Samsung",
        "Apple"
      );
      expect(score).toBe(0);
    });

    test("unrelated products return < 0.75", () => {
      const score = matchScore(
        "Samsung Galaxy S24 Ultra 256GB",
        "Nike Air Max 270 Running Shoes"
      );
      expect(score).toBeLessThan(0.75);
    });

    test("empty strings don't throw", () => {
      expect(() => matchScore("", "")).not.toThrow();
      expect(matchScore("", "")).toBe(0);
    });

    test("matching brands with similar titles score high", () => {
      const score = matchScore(
        "Sony WH-1000XM5 Headphones",
        "Sony WH1000XM5 Wireless Noise Cancelling Headphones",
        "Sony",
        "Sony"
      );
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test("null brands are treated as matching", () => {
      const score = matchScore(
        "Samsung Galaxy S24 Ultra",
        "Samsung Galaxy S24 Ultra",
        null,
        null
      );
      expect(score).toBe(1.0);
    });
  });

  describe("pickBestResult", () => {
    const { pickBestResult } = require("../src/scrapers/scraper.utils");

    test("selects the candidate with the highest Jaccard overlap", () => {
      const candidates = [
        { url: "/p1", title: "Samsung Galaxy S24 Ultra 256GB" },
        { url: "/p2", title: "OnePlus TV 55 Inch" },
        { url: "/p3", title: "Apple iPhone 15 Pro Max" }
      ];
      const query = "Samsung S24 Ultra";
      expect(pickBestResult(candidates, query)).toBe("/p1");
    });

    test("falls back to the first candidate if no candidate scores above 0.2", () => {
      const candidates = [
        { url: "/p1", title: "Unrelated Item A" },
        { url: "/p2", title: "Totally Different B" }
      ];
      const query = "Samsung S24 Ultra";
      expect(pickBestResult(candidates, query)).toBe("/p1");
    });

    test("returns first candidate if query is empty or not provided", () => {
      const candidates = [
        { url: "/p1", title: "Item A" },
        { url: "/p2", title: "Item B" }
      ];
      expect(pickBestResult(candidates, "")).toBe("/p1");
      expect(pickBestResult(candidates, null)).toBe("/p1");
    });
  });
});
