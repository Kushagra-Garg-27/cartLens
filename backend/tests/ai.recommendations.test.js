const { getAIRecommendations } = require("../src/services/ai.recommendations");

// Mock lazy GoogleGenerativeAI so we don't make real API calls
jest.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => {
      return {
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockRejectedValue(new Error("Simulated API Block or Quota Limit")),
        }),
      };
    }),
  };
});

describe("AI Recommendations Service — Fallback Engine", () => {
  test("Historical Fiction Book Fallback (Sensitive Title)", async () => {
    const recommendations = await getAIRecommendations({
      title: "The Tattooist of Auschwitz",
      price: 399,
      category: "books",
      brand: "Heather Morris",
    });

    expect(recommendations).toHaveLength(3);
    expect(recommendations[0].name).toBe("The Book Thief by Markus Zusak");
    expect(recommendations[1].name).toBe("The Boy in the Striped Pyjamas by John Boyne");
    expect(recommendations[2].name).toBe("All the Light We Cannot See by Anthony Doerr");
    expect(recommendations[0].better_for).toBe("value");
    expect(recommendations[1].better_for).toBe("budget");
  });

  test("Regular Book Fallback", async () => {
    const recommendations = await getAIRecommendations({
      title: "Think and Grow Rich",
      price: 299,
      category: "books",
    });

    expect(recommendations).toHaveLength(3);
    expect(recommendations[0].name).toBe("Atomic Habits by James Clear");
    expect(recommendations[1].name).toBe("The Alchemist by Paulo Coelho");
    expect(recommendations[2].name).toBe("Sapiens by Yuval Noah Harari");
  });

  test("Soft Drinks / Beverage Fallback (Zero Sugar focus)", async () => {
    const recommendations = await getAIRecommendations({
      title: "Coca-Cola Classic 300ml Can",
      price: 40,
      category: "grocery",
    });

    expect(recommendations).toHaveLength(3);
    expect(recommendations[0].name).toBe("Coca-Cola Zero Sugar (300ml)");
    expect(recommendations[1].name).toBe("Pepsi Black (250ml)");
    expect(recommendations[2].name).toBe("Diet Coke Can (300ml)");
  });

  test("General Groceries / Pantry Staples Fallback", async () => {
    const recommendations = await getAIRecommendations({
      title: "Pillsbury Chakki Fresh Atta",
      price: 300,
      category: "grocery",
    });

    expect(recommendations).toHaveLength(3);
    expect(recommendations[0].name).toBe("Aashirvaad Organic Whole Wheat Atta (5kg)");
    expect(recommendations[1].name).toBe("Fortune Cold Pressed Mustard Oil (1L)");
  });

  test("Beauty & Cosmetics Fallback", async () => {
    const recommendations = await getAIRecommendations({
      title: "L'Oreal Infallible Foundation",
      price: 700,
      category: "beauty",
    });

    expect(recommendations).toHaveLength(3);
    expect(recommendations[0].name).toBe("Maybelline Fit Me Matte Foundation");
    expect(recommendations[1].name).toBe("Lakme Peach Milk Soft Creme (150g)");
  });

  test("Kids & Baby Products Fallback", async () => {
    const recommendations = await getAIRecommendations({
      title: "MamyPoko Pants Standard Size L",
      price: 999,
      category: "kids",
    });

    expect(recommendations).toHaveLength(3);
    expect(recommendations[0].name).toBe("Pampers Active Baby Diapers (Medium, 72 Count)");
    expect(recommendations[1].name).toBe("Himalaya Herbal Baby Powder (200g)");
  });

  test("Sports & Fitness Fallback", async () => {
    const recommendations = await getAIRecommendations({
      title: "Kipsta Football Size 4",
      price: 499,
      category: "sports",
    });

    expect(recommendations).toHaveLength(3);
    expect(recommendations[0].name).toBe("Decathlon Hiking Backpack (20L)");
    expect(recommendations[1].name).toBe("Yonex Nanoray Lightweight Badminton Racket");
  });

  test("Electronics - Smartphones Fallback", async () => {
    const recommendations = await getAIRecommendations({
      title: "Google Pixel 8 Pro",
      price: 99999,
      category: "smartphones",
    });

    expect(recommendations).toHaveLength(3);
    expect(recommendations[0].name).toBe("OnePlus Nord CE4");
    expect(recommendations[1].name).toBe("Samsung Galaxy A35 5G");
  });

  test("Miscellaneous category fallback (No Technical tags for non-tech)", async () => {
    const recommendations = await getAIRecommendations({
      title: "Pure Leather Premium Wallet",
      price: 1500,
      category: "luggage",
    });

    expect(recommendations).toHaveLength(3);
    expect(recommendations[0].name).toContain("Wallet");
    expect(recommendations[0].name).not.toContain("Pro");
    expect(recommendations[2].name).toContain("Lite"); // Standard fashion fallback allows Lite, let's verify format
  });
});
