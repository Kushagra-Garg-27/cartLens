/**
 * Product API routes — Enterprise-grade price intelligence endpoints.
 *
 * POST /api/product/identify     — Identify product + aggregate prices across all stores
 * POST /api/product/compare      — Get cross-platform comparison
 * GET  /api/product/history      — Get price history for charts
 * GET  /api/product/analytics    — Get price analytics and statistics
 * GET  /api/product/recommendation — Get AI buy/wait recommendation
 * GET  /api/product/stores       — Get available stores list
 */

import { FastifyInstance } from "fastify";
import { PriceAggregatorService } from "../services/priceAggregator.js";
import { PriceAnalyticsService } from "../services/priceAnalytics.js";
import { AIIntelligenceService } from "../services/aiIntelligence.js";
import { storeRegistry } from "../stores/registry.js";
import type { DetectedProductInput, SearchLink } from "../types.js";

export async function productRoutes(
  fastify: FastifyInstance,
  opts: {
    aggregator: PriceAggregatorService;
    analytics: PriceAnalyticsService;
    aiIntelligence: AIIntelligenceService;
  },
) {
  const { aggregator, analytics, aiIntelligence } = opts;

  // --- POST /api/product/identify ---
  // Main entry point: identifies product, scrapes all stores, returns aggregated comparison
  fastify.post<{ Body: DetectedProductInput }>(
    "/api/product/identify",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "currency", "platform", "url"],
          properties: {
            title: { type: "string" },
            price: { type: ["number", "null"] },
            currency: { type: "string" },
            platform: { type: "string" },
            externalId: { type: ["string", "null"] },
            gtin: { type: ["string", "null"] },
            brand: { type: ["string", "null"] },
            image: { type: ["string", "null"] },
            url: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const aggregated = await aggregator.identifyAndAggregate(request.body);

        // Also compute analytics and AI recommendation in parallel
        const [analyticsData, prediction] = await Promise.all([
          analytics.getAnalytics(aggregated.productId),
          analytics.getPrediction(aggregated.productId),
        ]);

        const aiRecommendation = await aiIntelligence.getRecommendation(
          aggregated,
          analyticsData,
          prediction,
        );

        return reply.send({
          product: {
            id: aggregated.productId,
            canonicalTitle: aggregated.canonicalTitle,
            brand: aggregated.brand,
            category: aggregated.category,
            image: aggregated.image,
          },
          listings: aggregated.listings,
          searchLinks: buildSearchLinks(
            aggregated.canonicalTitle,
            new Set(aggregated.listings.map(l => l.store.toLowerCase())),
            request.body.platform,
          ),
          priceStats: aggregated.priceStats,
          analytics: {
            currentPrice: analyticsData.currentPrice,
            lowestPrice: analyticsData.lowestPrice,
            highestPrice: analyticsData.highestPrice,
            averagePrice: analyticsData.averagePrice,
            volatility: analyticsData.volatility,
            trend: analyticsData.trend,
            trendStrength: analyticsData.trendStrength,
            priceChangePct: analyticsData.priceChangePct,
            recentDrop: analyticsData.recentDrop,
            storeRankings: analyticsData.storeRankings,
            dataPoints: analyticsData.dataPoints,
            sources: analyticsData.sources,
          },
          recommendation: {
            action: aiRecommendation.recommendation,
            confidence: aiRecommendation.confidence,
            summary: aiRecommendation.summary,
            insights: aiRecommendation.insights,
            expectedDrop: aiRecommendation.expectedDrop,
            expectedDropPercent: aiRecommendation.expectedDropPercent,
            bestBuyWindow: aiRecommendation.bestBuyWindow,
            dealQuality: aiRecommendation.dealQuality,
          },
          metadata: aggregated.metadata,
          // Legacy compatibility fields
          productId: aggregated.productId,
          canonicalTitle: aggregated.canonicalTitle,
          brand: aggregated.brand,
          category: aggregated.category,
          matched: true,
        });
      } catch (err) {
        fastify.log.error(err, "Product identification failed");
        // Fallback to legacy identify
        const result = await aggregator.identify(request.body);
        return reply.send(result);
      }
    },
  );

  // --- POST /api/product/compare ---
  fastify.post<{ Body: { productId: string; currentPlatform?: string } }>(
    "/api/product/compare",
    {
      schema: {
        body: {
          type: "object",
          required: ["productId"],
          properties: {
            productId: { type: "string" },
            currentPlatform: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { productId, currentPlatform } = request.body;
      const result = await aggregator.compare(productId, currentPlatform);
      return reply.send(result);
    },
  );

  // --- GET /api/product/history ---
  fastify.get<{ Querystring: { productId: string } }>(
    "/api/product/history",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["productId"],
          properties: {
            productId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { productId } = request.query;
      const result = await aggregator.getHistory(productId);
      return reply.send(result);
    },
  );

  // --- GET /api/product/analytics ---
  fastify.get<{ Querystring: { productId: string } }>(
    "/api/product/analytics",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["productId"],
          properties: {
            productId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { productId } = request.query;
      const result = await analytics.getAnalytics(productId);
      return reply.send(result);
    },
  );

  // --- GET /api/product/recommendation ---
  fastify.get<{ Querystring: { productId: string } }>(
    "/api/product/recommendation",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["productId"],
          properties: {
            productId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { productId } = request.query;
      const analyticsData = await analytics.getAnalytics(productId);
      const prediction = await analytics.getPrediction(productId);

      // Build a minimal aggregated result for the AI service
      return reply.send({
        prediction,
        analytics: {
          trend: analyticsData.trend,
          volatility: analyticsData.volatility,
          priceChangePct: analyticsData.priceChangePct,
          lowestPrice: analyticsData.lowestPrice,
          highestPrice: analyticsData.highestPrice,
          currentPrice: analyticsData.currentPrice,
        },
      });
    },
  );

  // --- GET /api/product/stores ---
  fastify.get("/api/product/stores", async (_request, reply) => {
    const stores = storeRegistry.getEnabled().map((s) => ({
      id: s.id,
      name: s.displayName,
      logo: s.logo,
      region: s.region,
      currency: s.currency,
      trustScore: s.trustScore,
    }));
    return reply.send({ stores });
  });
}

const SEARCH_STORE_IDS = [
  "amazon",
  "walmart",
  "bestbuy",
  "ebay",
  "target",
  "newegg",
  "flipkart",
] as const;

function buildSearchLinks(
  canonicalTitle: string,
  coveredStores: Set<string>,
  currentPlatform: string,
): SearchLink[] {
  const links: SearchLink[] = [];
  const current = currentPlatform.toLowerCase();

  for (const storeId of SEARCH_STORE_IDS) {
    if (coveredStores.has(storeId) || storeId === current) continue;
    const url = storeRegistry.buildSearchUrl(storeId, canonicalTitle);
    if (!url) continue;
    const store = storeRegistry.get(storeId);
    links.push({
      platform: storeId,
      displayName: store?.displayName || storeId,
      url,
    });
  }

  return links;
}
