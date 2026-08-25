import { prisma } from '../../config/database';
import { redis } from '../../config/redis';
import { createContextLogger } from '../../utils/logger';

const log = createContextLogger('llm-cost');

/**
 * LLM Cost Tracking Service
 * Tracks token usage and estimated costs per organization, provider, and model
 */

// Pricing per 1M tokens (input/output) in USD
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'o1-preview': { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },
  // Anthropic
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
  'claude-3-sonnet-20240229': { input: 3, output: 15 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  // Google
  'gemini-2.0-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  // Mistral
  'mistral-large-latest': { input: 2, output: 6 },
  'mistral-small-latest': { input: 0.2, output: 0.6 },
  // Groq (very cheap)
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  // DeepSeek
  'deepseek-chat': { input: 0.14, output: 0.28 },
  // Default for unknown models
  'default': { input: 1, output: 3 },
};

interface UsageRecord {
  organizationId: string;
  llmConfigId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  scope?: string;
  engagementId?: string;
}

export class LLMCostTrackerService {
  /**
   * Record token usage
   */
  async recordUsage(record: UsageRecord): Promise<void> {
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Increment counters in Redis for fast reads
    const multi = redis.multi();

    // Daily counters
    const dailyKey = `llm:usage:${record.organizationId}:${dateKey}`;
    multi.hincrby(dailyKey, 'totalTokens', record.totalTokens);
    multi.hincrby(dailyKey, 'inputTokens', record.inputTokens);
    multi.hincrby(dailyKey, 'outputTokens', record.outputTokens);
    multi.hincrbyfloat(dailyKey, 'totalCost', record.estimatedCostUsd);
    multi.hincrby(dailyKey, 'requestCount', 1);
    multi.expire(dailyKey, 86400 * 32); // 32 days

    // Monthly counters
    const monthlyKey = `llm:usage:${record.organizationId}:month:${monthKey}`;
    multi.hincrby(monthlyKey, 'totalTokens', record.totalTokens);
    multi.hincrbyfloat(monthlyKey, 'totalCost', record.estimatedCostUsd);
    multi.hincrby(monthlyKey, 'requestCount', 1);
    multi.expire(monthlyKey, 86400 * 365); // 1 year

    // Per-model counters
    const modelKey = `llm:usage:${record.organizationId}:model:${record.model}:${dateKey}`;
    multi.hincrby(modelKey, 'totalTokens', record.totalTokens);
    multi.hincrbyfloat(modelKey, 'totalCost', record.estimatedCostUsd);
    multi.hincrby(modelKey, 'requestCount', 1);
    multi.expire(modelKey, 86400 * 32);

    await multi.exec().catch((err) => {
      log.error('Failed to record LLM usage', { error: err.message });
    });
  }

  /**
   * Calculate cost for a given model and token count
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  }

  /**
   * Get usage summary for an organization
   */
  async getUsageSummary(organizationId: string, days: number = 30) {
    const now = new Date();
    const dailyUsage: Array<{ date: string; tokens: number; cost: number; requests: number }> = [];

    for (let i = 0; i < days; i++) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const data = await redis.hgetall(`llm:usage:${organizationId}:${dateKey}`);
      dailyUsage.unshift({
        date: dateKey,
        tokens: parseInt(data.totalTokens || '0'),
        cost: parseFloat(data.totalCost || '0'),
        requests: parseInt(data.requestCount || '0'),
      });
    }

    // Monthly total
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthlyData = await redis.hgetall(`llm:usage:${organizationId}:month:${monthKey}`);

    return {
      monthly: {
        totalTokens: parseInt(monthlyData.totalTokens || '0'),
        totalCost: parseFloat(monthlyData.totalCost || '0'),
        requestCount: parseInt(monthlyData.requestCount || '0'),
      },
      daily: dailyUsage,
    };
  }

  /**
   * Get model pricing reference
   */
  getModelPricing(): Array<{ model: string; inputPer1M: number; outputPer1M: number }> {
    return Object.entries(MODEL_PRICING)
      .filter(([model]) => model !== 'default')
      .map(([model, pricing]) => ({
        model,
        inputPer1M: pricing.input,
        outputPer1M: pricing.output,
      }));
  }
}

export const llmCostTracker = new LLMCostTrackerService();
