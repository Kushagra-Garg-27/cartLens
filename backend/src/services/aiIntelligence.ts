/**
 * AI Intelligence Service — Smart buy/wait recommendations.
 *
 * Integrates with:
 * - Price analytics for data-driven signals
 * - Gemini AI for natural language reasoning
 * - Fallback heuristic model when AI is unavailable
 */

import { config } from "../config.js";
import { cache, CacheKeys, CacheTTL, type CacheProvider } from "./cache.js";
import type {
  PriceAnalytics,
  PricePrediction,
} from "./priceAnalytics.js";
import type { AggregatedResult, StoreListing } from "./priceAggregator.js";

export interface AIRecommendation {
  recommendation: "BUY" | "WAIT" | "NEUTRAL";
  confidence: number;
  summary: string;
  insights: AIInsight[];
  expectedDrop: number | null;
  expectedDropPercent: number | null;
  bestBuyWindow: string | null;
  dealQuality: "excellent" | "good" | "fair" | "poor";
  factors: string[];
}

export interface AIInsight {
  title: string;
  description: string;
  type: "positive" | "negative" | "neutral";
  icon: string;
}

export class AIIntelligenceService {
  private cacheProvider: CacheProvider;

  constructor(cacheProvider?: CacheProvider) {
    this.cacheProvider = cacheProvider ?? cache;
  }

  /**
   * Generate AI-powered recommendation.
   * Uses Gemini if available, falls back to heuristic model.
   */
  async getRecommendation(
    aggregated: AggregatedResult,
    analytics: PriceAnalytics,
    prediction: PricePrediction,
  ): Promise<AIRecommendation> {
    const cacheKey = CacheKeys.aiRecommendation(aggregated.productId);
    const cached = await this.cacheProvider.get<AIRecommendation>(cacheKey);
    if (cached) return cached;

    let result: AIRecommendation;

    if (config.geminiApiKey) {
      try {
        result = await this.getGeminiRecommendation(
          aggregated,
          analytics,
          prediction,
        );
      } catch {
        result = this.getHeuristicRecommendation(
          aggregated,
          analytics,
          prediction,
        );
      }
    } else {
      result = this.getHeuristicRecommendation(
        aggregated,
        analytics,
        prediction,
      );
    }

    await this.cacheProvider.set(cacheKey, result, CacheTTL.AI_RECOMMENDATION);
    return result;
  }

  /**
   * Heuristic-based recommendation (no external API needed).
   */
  private getHeuristicRecommendation(
    aggregated: AggregatedResult,
    analytics: PriceAnalytics,
    prediction: PricePrediction,
  ): AIRecommendation {
    const insights: AIInsight[] = [];
    const factors: string[] = [];

    // Price Position Analysis
    const { priceStats } = aggregated;
    if (priceStats.savingsPercent > 15) {
      insights.push({
        title: "Significant price variation",
        description: `There's a ${priceStats.savingsPercent}% gap between the lowest and highest prices. You could save ₹${priceStats.savingsFromHighest} by choosing the best deal.`,
        type: "positive",
        icon: "trending-down",
      });
      factors.push(
        `Price spread of ${priceStats.savingsPercent}% across stores`,
      );
    }

    // Trend Analysis
    if (analytics.trend === "down") {
      insights.push({
        title: "Price trending downward",
        description:
          "Prices have been declining recently. If you can wait, you may get a better deal.",
        type: analytics.trendStrength > 0.5 ? "negative" : "neutral",
        icon: "trending-down",
      });
      factors.push("Downward price trend detected");
    } else if (analytics.trend === "up") {
      insights.push({
        title: "Prices rising",
        description:
          "Prices have increased recently. Buying now may avoid further increases.",
        type: "positive",
        icon: "trending-up",
      });
      factors.push("Upward price trend — buying sooner is better");
    }

    // All-time low proximity
    if (analytics.lowestPrice > 0 && analytics.currentPrice > 0) {
      const aboveLow =
        ((analytics.currentPrice - analytics.lowestPrice) /
          analytics.lowestPrice) *
        100;
      if (aboveLow < 5) {
        insights.push({
          title: "Near all-time low!",
          description: `Current price is only ${aboveLow.toFixed(1)}% above the all-time low of ₹${analytics.lowestPrice}. This is an excellent time to buy.`,
          type: "positive",
          icon: "zap",
        });
        factors.push("Price near all-time low");
      } else if (aboveLow > 20) {
        insights.push({
          title: "Above historical average",
          description: `Current price is ${aboveLow.toFixed(1)}% above the all-time low. Historical data suggests better deals are possible.`,
          type: "negative",
          icon: "alert-triangle",
        });
        factors.push("Price significantly above all-time low");
      }
    }

    // Store comparison insight
    if (aggregated.listings.length > 1) {
      const bestStore = aggregated.listings[0]; // sorted by price
      insights.push({
        title: `Best price at ${bestStore.storeDisplayName}`,
        description: `₹${bestStore.price} is the lowest across ${aggregated.listings.length} stores we checked.`,
        type: "positive",
        icon: "award",
      });
      factors.push(
        `Compared across ${aggregated.listings.length} stores`,
      );
    }

    // Volatility
    if (analytics.volatility > 10) {
      insights.push({
        title: "High price volatility",
        description:
          "This product's price changes frequently. Setting a price alert might help you catch the next drop.",
        type: "neutral",
        icon: "activity",
      });
      factors.push("High price volatility suggests waiting may help");
    }

    // Recent price drop
    if (analytics.recentDrop) {
      insights.push({
        title: "Recent price drop detected",
        description: `Price dropped ${analytics.recentDrop.dropPercent}% at ${analytics.recentDrop.store}. This could be the start of a sale or a temporary reduction.`,
        type: "positive",
        icon: "arrow-down",
      });
      factors.push(
        `Recent ${analytics.recentDrop.dropPercent}% price drop at ${analytics.recentDrop.store}`,
      );
    }

    // Determine deal quality
    let dealQuality: "excellent" | "good" | "fair" | "poor";
    if (analytics.priceChangePct < -10) dealQuality = "excellent";
    else if (analytics.priceChangePct < -3) dealQuality = "good";
    else if (analytics.priceChangePct < 5) dealQuality = "fair";
    else dealQuality = "poor";

    // Build summary
    const summary = this.buildSummary(
      prediction.recommendation,
      aggregated,
      analytics,
      dealQuality,
    );

    return {
      recommendation: prediction.recommendation,
      confidence: prediction.confidence,
      summary,
      insights,
      expectedDrop: prediction.expectedDropAmount,
      expectedDropPercent: prediction.expectedDropPercent,
      bestBuyWindow: prediction.bestBuyWindow,
      dealQuality,
      factors,
    };
  }

  /**
   * Gemini-powered recommendation with structured output.
   */
  private async getGeminiRecommendation(
    aggregated: AggregatedResult,
    analytics: PriceAnalytics,
    prediction: PricePrediction,
  ): Promise<AIRecommendation> {
    const systemPrompt = `You are a price intelligence AI. Analyze the following product data and provide a structured buy/wait recommendation.

Product: ${aggregated.canonicalTitle}
Brand: ${aggregated.brand || "Unknown"}
Category: ${aggregated.category || "Unknown"}

Current Prices:
${aggregated.listings.map((l) => `- ${l.storeDisplayName}: ₹${l.price}`).join("\n")}

Price Stats:
- Lowest: ₹${aggregated.priceStats.lowest} (${aggregated.priceStats.lowestStore})
- Highest: ₹${aggregated.priceStats.highest}
- Average: ₹${aggregated.priceStats.average}
- Savings possible: ₹${aggregated.priceStats.savingsFromHighest} (${aggregated.priceStats.savingsPercent}%)

Analytics:
- Trend: ${analytics.trend} (strength: ${analytics.trendStrength})
- Volatility: ${analytics.volatility}%
- vs Average: ${analytics.priceChangePct}%
- All-time low: ₹${analytics.lowestPrice}
- Data points: ${analytics.dataPoints}

Respond in JSON format: { "summary": "...", "insights": [{"title":"...", "description":"...", "type":"positive|negative|neutral"}] }`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${config.geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Try to parse structured response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          summary?: string;
          insights?: Array<{
            title: string;
            description: string;
            type: string;
          }>;
        };

        const heuristic = this.getHeuristicRecommendation(
          aggregated,
          analytics,
          prediction,
        );

        return {
          ...heuristic,
          summary: parsed.summary || heuristic.summary,
          insights:
            parsed.insights?.map((i) => ({
              title: i.title,
              description: i.description,
              type: (i.type as "positive" | "negative" | "neutral") || "neutral",
              icon: "sparkles",
            })) || heuristic.insights,
        };
      }
    } catch {
      // Fall through to heuristic
    }

    return this.getHeuristicRecommendation(aggregated, analytics, prediction);
  }

  private buildSummary(
    recommendation: "BUY" | "WAIT" | "NEUTRAL",
    aggregated: AggregatedResult,
    analytics: PriceAnalytics,
    dealQuality: string,
  ): string {
    const bestStore = aggregated.listings[0];
    if (!bestStore) return "Insufficient data to make a recommendation.";

    switch (recommendation) {
      case "BUY":
        return `This is a ${dealQuality} time to buy the ${aggregated.canonicalTitle}. The best price is ₹${bestStore.price} at ${bestStore.storeDisplayName}, which is ${analytics.priceChangePct < 0 ? Math.abs(analytics.priceChangePct) + "% below" : "near"} the average price. We compared ${aggregated.listings.length} stores.`;
      case "WAIT":
        return `Consider waiting before purchasing the ${aggregated.canonicalTitle}. The current price of ₹${bestStore.price} is ${analytics.priceChangePct > 0 ? analytics.priceChangePct + "% above" : "near"} the average. ${analytics.trend === "down" ? "Prices are trending downward." : "Price drops have been detected in similar products."}`;
      default:
        return `The ${aggregated.canonicalTitle} is priced at ₹${bestStore.price} at ${bestStore.storeDisplayName}. The price is near the average across ${aggregated.listings.length} stores. No strong signal to buy now or wait.`;
    }
  }
}
