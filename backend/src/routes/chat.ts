/**
 * AI Chat route (frontend-compatible).
 *
 * POST /ai/chat — Streaming AI shopping advisor
 *
 * Supports Server-Sent Events (SSE) streaming via Gemini API.
 * Falls back to a non-streaming mock response when GEMINI_API_KEY is not set.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";
import type { ChatMessage, ChatContext } from "../types.js";

export async function chatRoutes(fastify: FastifyInstance) {
  // --- POST /ai/chat ---
  fastify.post<{ Body: { messages: ChatMessage[]; context: ChatContext } }>(
    "/ai/chat",
    async (
      request: FastifyRequest<{ Body: { messages: ChatMessage[]; context: ChatContext } }>,
      reply: FastifyReply,
    ) => {
      const { messages, context } = request.body;

      const systemPrompt = buildSystemPrompt(context);
      const geminiMessages = [
        { role: "user" as const, parts: [{ text: systemPrompt }] },
        { role: "model" as const, parts: [{ text: "Understood. I'm ready to help as a shopping advisor." }] },
        ...messages.map((m: ChatMessage) => ({
          role: m.role === "user" ? ("user" as const) : ("model" as const),
          parts: [{ text: m.content }],
        })),
      ];

      if (config.geminiApiKey) {
        // Stream from Gemini API
        return await streamFromGemini(reply, geminiMessages);
      }

      // Fallback: generate a helpful mock response
      return await streamMockResponse(reply, messages, context);
    },
  );
}

function buildSystemPrompt(context: ChatContext): string {
  const altText =
    context.alternatives.length > 0
      ? context.alternatives
          .map((a) => `${a.name} at $${a.price} (${a.store})`)
          .join("; ")
      : "none found";

  return `You are SmartCompare AI, a helpful shopping advisor. You provide concise, actionable advice about products and deals.

Current product context:
- Product: ${context.product}
- Current Price: $${context.currentPrice}
- Lowest Price: $${context.lowestPrice}
- Highest Price: $${context.highestPrice}
- Store: ${context.store}
- Deal Score: ${context.dealScore}/100
- Seller Trust: ${context.sellerTrust}/100
- Price History: ${context.priceHistory}
- Alternatives: ${altText}

Keep responses brief (2-4 sentences). Use data from the context to give specific advice. Focus on helping the user make a smart purchase decision.`;
}

async function streamFromGemini(
  reply: FastifyReply,
  contents: { role: string; parts: { text: string }[] }[],
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.geminiApiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 512,
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    fastifyLog(reply, `Gemini API error: ${response.status} — ${errBody}`);
    return reply.status(502).send({ error: "AI service unavailable" });
  }

  // Pipe the SSE stream directly to the client
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const reader = response.body?.getReader();
  if (!reader) {
    reply.raw.end();
    return reply;
  }

  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      reply.raw.write(decoder.decode(value, { stream: true }));
    }
  } finally {
    reply.raw.end();
  }

  return reply;
}

async function streamMockResponse(
  reply: FastifyReply,
  messages: ChatMessage[],
  context: ChatContext,
) {
  const lastMessage = messages[messages.length - 1]?.content || "";
  const mockResponse = generateMockAdvice(lastMessage, context);

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Simulate SSE streaming by sending the response in chunks
  const words = mockResponse.split(" ");
  let buffer = "";
  for (let i = 0; i < words.length; i++) {
    buffer += (i > 0 ? " " : "") + words[i];
    if (i % 4 === 3 || i === words.length - 1) {
      const chunk = {
        candidates: [
          {
            content: {
              parts: [{ text: buffer }],
              role: "model",
            },
          },
        ],
      };
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      buffer = "";
      // Small delay to simulate streaming
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  reply.raw.end();
  return reply;
}

function generateMockAdvice(
  userMessage: string,
  context: ChatContext,
): string {
  const msg = userMessage.toLowerCase();

  if (msg.includes("buy") || msg.includes("worth") || msg.includes("should")) {
    if (context.dealScore >= 80) {
      return `Based on the data, this is a strong deal. The ${context.product} at $${context.currentPrice} has a deal score of ${context.dealScore}/100. The lowest recorded price is $${context.lowestPrice}, so you're getting close to the best price available. I'd recommend buying now.`;
    }
    return `The ${context.product} is currently $${context.currentPrice}, which is not the lowest we've seen ($${context.lowestPrice}). You might want to set a price alert and wait for a better deal. The deal score is ${context.dealScore}/100.`;
  }

  if (msg.includes("price") || msg.includes("history") || msg.includes("trend")) {
    return `The ${context.product} has ranged from $${context.lowestPrice} to $${context.highestPrice}. The current price of $${context.currentPrice} at ${context.store} is ${context.currentPrice <= context.lowestPrice * 1.05 ? "very close to the all-time low" : "above the historical low"}. ${context.priceHistory}`;
  }

  if (msg.includes("alternative") || msg.includes("compare") || msg.includes("other")) {
    if (context.alternatives.length > 0) {
      const alts = context.alternatives
        .map((a) => `${a.name} ($${a.price} at ${a.store})`)
        .join(", ");
      return `Here are some alternatives to consider: ${alts}. Compare the specs and prices carefully based on your needs.`;
    }
    return `I don't have specific alternatives loaded right now, but I'd recommend checking competitor stores for similar products in the same category.`;
  }

  if (msg.includes("trust") || msg.includes("seller") || msg.includes("safe")) {
    return `The seller trust score for ${context.store} is ${context.sellerTrust}/100, which is ${context.sellerTrust >= 90 ? "excellent" : context.sellerTrust >= 80 ? "good" : "moderate"}. ${context.sellerTrust >= 85 ? "You can feel confident buying from this seller." : "Consider verified sellers with higher ratings for peace of mind."}`;
  }

  return `The ${context.product} is priced at $${context.currentPrice} at ${context.store} with a deal score of ${context.dealScore}/100 and seller trust of ${context.sellerTrust}/100. What specific aspect would you like to know more about — pricing trends, alternatives, or purchase advice?`;
}

function fastifyLog(reply: FastifyReply, message: string) {
  reply.log?.warn?.(message);
}
