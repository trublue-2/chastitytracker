import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared Anthropic client singleton.
 * Mirrors the Prisma singleton pattern — one instance per process.
 */
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
