import { prisma } from '../../config/database';
import { redis } from '../../config/redis';
import { createContextLogger } from '../../utils/logger';

const log = createContextLogger('token-budget');

/**
 * AI Token Budget Service
 * Enforces token usage limits per organization to prevent runaway costs
 */

interface BudgetConfig {
  dailyTokenLimit: number;
  monthlyTokenLimit: number;
  dailyCostLimitUsd: number;
  monthlyCostLimitUsd: number;
  alertThresholdPercent: number; // Alert when this % of budget is used
}

const DEFAULT_BUDGET: Record<string, BudgetConfig> = {
  FREE: {
    dailyTokenLimit: 10_000,
    monthlyTokenLimit: 100_000,
    dailyCostLimitUsd: 0.50,
    monthlyCostLimitUsd: 5.00,
    alertThresholdPercent: 80,
  },
  STARTER: {
    dailyTokenLimit: 100_000,
    monthlyTokenLimit: 2_000_000,
    dailyCostLimitUsd: 5.00,
    monthlyCostLimitUsd: 100.00,
    alertThresholdPercent: 80,
  },
  PROFESSIONAL: {
    dailyTokenLimit: 500_000,
    monthlyTokenLimit: 10_000_000,
    dailyCostLimitUsd: 25.00,
    monthlyCostLimitUsd: 500.00,
    alertThresholdPercent: 85,
  },
  ENTERPRISE: {
    dailyTokenLimit: 5_000_000,
    monthlyTokenLimit: 100_000_000,
    dailyCostLimitUsd: 250.00,
    monthlyCostLimitUsd: 5000.00,
    alertThresholdPercent: 90,
  },
};

export class TokenBudgetService {
  /**
   * Check if an organization can make an AI request
   */
  async checkBudget(organizationId: string): Promise<{
    allowed: boolean;
    reason?: string;
    usage?: { dailyTokens: number; monthlyTokens: number; dailyCost: number; monthlyCost: number };
    limits?: BudgetConfig;
  }> {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) {
      return { allowed: false, reason: 'Organization not found' };
    }

    const budget = DEFAULT_BUDGET[org.plan] || DEFAULT_BUDGET['FREE'];
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [dailyData, monthlyData] = await Promise.all([
      redis.hgetall(`llm:usage:${organizationId}:${dateKey}`),
      redis.hgetall(`llm:usage:${organizationId}:month:${monthKey}`),
    ]);

    const dailyTokens = parseInt(dailyData.totalTokens || '0');
    const monthlyTokens = parseInt(monthlyData.totalTokens || '0');
    const dailyCost = parseFloat(dailyData.totalCost || '0');
    const monthlyCost = parseFloat(monthlyData.totalCost || '0');

    const usage = { dailyTokens, monthlyTokens, dailyCost, monthlyCost };

    // Check limits
    if (dailyTokens >= budget.dailyTokenLimit) {
      return { allowed: false, reason: `Daily token limit reached (${budget.dailyTokenLimit})`, usage, limits: budget };
    }
    if (monthlyTokens >= budget.monthlyTokenLimit) {
      return { allowed: false, reason: `Monthly token limit reached (${budget.monthlyTokenLimit})`, usage, limits: budget };
    }
    if (dailyCost >= budget.dailyCostLimitUsd) {
      return { allowed: false, reason: `Daily cost limit reached ($${budget.dailyCostLimitUsd})`, usage, limits: budget };
    }
    if (monthlyCost >= budget.monthlyCostLimitUsd) {
      return { allowed: false, reason: `Monthly cost limit reached ($${budget.monthlyCostLimitUsd})`, usage, limits: budget };
    }

    // Check alert threshold
    const monthlyUsagePercent = (monthlyTokens / budget.monthlyTokenLimit) * 100;
    if (monthlyUsagePercent >= budget.alertThresholdPercent) {
      log.warn('Organization approaching token budget limit', {
        organizationId,
        monthlyUsagePercent: monthlyUsagePercent.toFixed(1),
        plan: org.plan,
      });
    }

    return { allowed: true, usage, limits: budget };
  }

  /**
   * Get budget status for an organization
   */
  async getBudgetStatus(organizationId: string) {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) return null;

    const budget = DEFAULT_BUDGET[org.plan] || DEFAULT_BUDGET['FREE'];
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [dailyData, monthlyData] = await Promise.all([
      redis.hgetall(`llm:usage:${organizationId}:${dateKey}`),
      redis.hgetall(`llm:usage:${organizationId}:month:${monthKey}`),
    ]);

    const dailyTokens = parseInt(dailyData.totalTokens || '0');
    const monthlyTokens = parseInt(monthlyData.totalTokens || '0');
    const dailyCost = parseFloat(dailyData.totalCost || '0');
    const monthlyCost = parseFloat(monthlyData.totalCost || '0');

    return {
      plan: org.plan,
      budget,
      usage: {
        daily: { tokens: dailyTokens, cost: dailyCost },
        monthly: { tokens: monthlyTokens, cost: monthlyCost },
      },
      percentUsed: {
        dailyTokens: (dailyTokens / budget.dailyTokenLimit) * 100,
        monthlyTokens: (monthlyTokens / budget.monthlyTokenLimit) * 100,
        dailyCost: (dailyCost / budget.dailyCostLimitUsd) * 100,
        monthlyCost: (monthlyCost / budget.monthlyCostLimitUsd) * 100,
      },
    };
  }

  /**
   * Get all plan budgets (for admin UI)
   */
  getPlanBudgets(): Record<string, BudgetConfig> {
    return { ...DEFAULT_BUDGET };
  }
}

export const tokenBudgetService = new TokenBudgetService();
