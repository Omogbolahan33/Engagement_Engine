import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('engagement-features');

/**
 * Engagement Features Service
 * Advanced engagement capabilities:
 * - Scheduling windows (time-of-day restrictions)
 * - Content rotation (cycle through variations)
 * - Target cooldowns (don't repeat targets)
 * - Engagement chains (workflow sequences)
 * - Engagement groups (batch management)
 * - Health scoring (rolling success rate)
 * - A/B testing (compare strategies)
 * - Blacklists (skip targets)
 * - Conditions (run only when criteria met)
 */

// ============================================================
// SCHEDULING WINDOWS
// ============================================================

export interface SchedulingWindow {
  timezone: string;
  windows: Array<{
    days: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    startTime: string; // "09:00"
    endTime: string;   // "18:00"
  }>;
  blackoutDates?: string[]; // ["2024-12-25", "2024-01-01"]
}

export class EngagementFeaturesService {
  /**
   * Check if current time is within scheduling window
   */
  isWithinSchedule(window: SchedulingWindow): { allowed: boolean; reason?: string; nextWindow?: Date } {
    const now = new Date();

    // Convert to target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: window.timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0');
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
      parts.find((p) => p.type === 'weekday')?.value || 'Sun'
    );
    const dateStr = `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;

    // Check blackout dates
    if (window.blackoutDates?.includes(dateStr)) {
      return { allowed: false, reason: `Blackout date: ${dateStr}` };
    }

    const currentTime = hour * 60 + minute;

    // Check each window
    for (const w of window.windows) {
      if (!w.days.includes(weekday)) continue;

      const [startH, startM] = w.startTime.split(':').map(Number);
      const [endH, endM] = w.endTime.split(':').map(Number);
      const startTime = startH * 60 + startM;
      const endTime = endH * 60 + endM;

      if (currentTime >= startTime && currentTime <= endTime) {
        return { allowed: true };
      }
    }

    // Find next window
    const nextWindow = this.findNextWindow(window, now);

    return {
      allowed: false,
      reason: 'Outside scheduling window',
      nextWindow,
    };
  }

  private findNextWindow(window: SchedulingWindow, now: Date): Date | undefined {
    // Simplified: find next start time
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = new Date(now.getTime() + dayOffset * 86400000);
      const weekday = checkDate.getDay();

      for (const w of window.windows) {
        if (!w.days.includes(weekday)) continue;
        const [startH, startM] = w.startTime.split(':').map(Number);
        const nextStart = new Date(checkDate);
        nextStart.setHours(startH, startM, 0, 0);

        if (nextStart > now) return nextStart;
      }
    }
    return undefined;
  }

  // ============================================================
  // CONTENT ROTATION
  // ============================================================

  /**
   * Get next content from rotation pool
   * Ensures no content is repeated until all variations are used
   */
  async getNextContent(engagementId: string, contents: string[]): Promise<string> {
    if (contents.length === 0) throw new Error('No content variations provided');
    if (contents.length === 1) return contents[0];

    const key = `content-rotation:${engagementId}`;
    const usedIndices = await redis.lrange(key, 0, -1);
    const usedSet = new Set(usedIndices.map(Number));

    // Find unused content
    const unusedIndices = contents
      .map((_, i) => i)
      .filter((i) => !usedSet.has(i));

    let selectedIndex: number;

    if (unusedIndices.length === 0) {
      // All used, reset rotation
      await redis.del(key);
      selectedIndex = Math.floor(Math.random() * contents.length);
    } else {
      // Pick random from unused
      selectedIndex = unusedIndices[Math.floor(Math.random() * unusedIndices.length)];
    }

    // Mark as used
    await redis.rpush(key, selectedIndex.toString());
    await redis.expire(key, 86400 * 7); // 7 days

    return contents[selectedIndex];
  }

  // ============================================================
  // TARGET COOLDOWNS
  // ============================================================

  /**
   * Check if a target is on cooldown
   */
  async isTargetOnCooldown(engagementId: string, targetId: string): Promise<{ onCooldown: boolean; remainingMs?: number }> {
    const key = `target-cooldown:${engagementId}:${targetId}`;
    const ttl = await redis.ttl(key);

    if (ttl > 0) {
      return { onCooldown: true, remainingMs: ttl * 1000 };
    }

    return { onCooldown: false };
  }

  /**
   * Set target cooldown
   */
  async setTargetCooldown(engagementId: string, targetId: string, cooldownHours: number = 24): Promise<void> {
    const key = `target-cooldown:${engagementId}:${targetId}`;
    await redis.setex(key, cooldownHours * 3600, '1');
  }

  /**
   * Get all targets on cooldown for an engagement
   */
  async getCooldownTargets(engagementId: string): Promise<string[]> {
    const pattern = `target-cooldown:${engagementId}:*`;
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [newCursor, foundKeys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    return keys.map((k) => k.split(':').pop()!);
  }

  // ============================================================
  // ENGAGEMENT CHAINS (WORKFLOWS)
  // ============================================================

  /**
   * Record that an engagement step completed and trigger next step
   */
  async triggerNextInChain(
    currentEngagementId: string,
    success: boolean,
    result?: any
  ): Promise<string | null> {
    const engagement = await prisma.engagement.findUnique({
      where: { id: currentEngagementId },
    });

    if (!engagement) return null;

    const config = engagement.config as any;
    const chain = config?.chain;

    if (!chain?.nextEngagementId) return null;

    // Check if chain should continue
    if (chain.onFailure === 'stop' && !success) {
      log.info('Chain stopped due to failure', { currentEngagementId });
      return null;
    }

    // Check chain condition
    if (chain.condition) {
      const conditionMet = this.evaluateChainCondition(chain.condition, result);
      if (!conditionMet) {
        log.info('Chain condition not met', { currentEngagementId, condition: chain.condition });
        return null;
      }
    }

    // Add delay if specified
    const delay = chain.delayMs || 0;

    // Queue next engagement
    const { enqueueEngagement } = await import('./queue.service');
    await enqueueEngagement(chain.nextEngagementId, { delay });

    log.info('Chain triggered next engagement', {
      currentEngagementId,
      nextEngagementId: chain.nextEngagementId,
      delay,
    });

    return chain.nextEngagementId;
  }

  private evaluateChainCondition(condition: any, result?: any): boolean {
    if (!condition) return true;

    // Simple condition evaluation
    if (condition.type === 'success' && !result?.success) return false;
    if (condition.type === 'statusCode' && result?.statusCode !== condition.value) return false;
    if (condition.type === 'contains' && !result?.data?.toString().includes(condition.value)) return false;

    return true;
  }

  // ============================================================
  // ENGAGEMENT GROUPS
  // ============================================================

  /**
   * Create an engagement group
   */
  async createGroup(
    organizationId: string,
    name: string,
    engagementIds: string[],
    settings?: {
      runAll?: boolean;       // Run all in group, or pick one
      rotateEngagements?: boolean; // Rotate through engagements
      sharedSchedule?: SchedulingWindow;
    }
  ) {
    const groupId = `group_${Date.now()}`;

    await redis.set(`engagement-group:${groupId}`, JSON.stringify({
      id: groupId,
      name,
      organizationId,
      engagementIds,
      settings: settings || {},
      createdAt: new Date().toISOString(),
    }));

    // Index group by engagement
    for (const engId of engagementIds) {
      await redis.sadd(`engagement-groups:${engId}`, groupId);
    }

    return groupId;
  }

  /**
   * Get next engagement from group (for rotation)
   */
  async getNextFromGroup(groupId: string): Promise<string | null> {
    const data = await redis.get(`engagement-group:${groupId}`);
    if (!data) return null;

    const group = JSON.parse(data);
    if (group.engagementIds.length === 0) return null;

    if (!group.settings.rotateEngagements) {
      return group.engagementIds[0];
    }

    // Rotate
    const rotationKey = `group-rotation:${groupId}`;
    const currentIndex = parseInt(await redis.get(rotationKey) || '0');
    const nextIndex = (currentIndex + 1) % group.engagementIds.length;
    await redis.set(rotationKey, nextIndex.toString());

    return group.engagementIds[currentIndex];
  }

  // ============================================================
  // HEALTH SCORING
  // ============================================================

  /**
   * Calculate engagement health score (0-100)
   * Based on rolling success rate, response time, and error patterns
   */
  async calculateHealthScore(engagementId: string): Promise<{
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    factors: {
      successRate: number;
      avgResponseTime: number;
      errorSeverity: number;
      consistency: number;
    };
  }> {
    const now = new Date();
    const last24h = new Date(now.getTime() - 86400000);
    const last7d = new Date(now.getTime() - 7 * 86400000);

    // Get recent runs
    const [runs24h, runs7d] = await Promise.all([
      prisma.engagementRun.findMany({
        where: { engagementId, createdAt: { gte: last24h } },
        select: { status: true, metadata: true, createdAt: true },
      }),
      prisma.engagementRun.findMany({
        where: { engagementId, createdAt: { gte: last7d } },
        select: { status: true, metadata: true, createdAt: true },
      }),
    ]);

    // Success rate (40% weight)
    const successRate24h = runs24h.length > 0
      ? runs24h.filter((r) => r.status === 'SUCCESS').length / runs24h.length
      : 0.5;

    // Response time (20% weight) — lower is better
    const responseTimes = runs24h
      .map((r) => (r.metadata as any)?.responseTime)
      .filter(Boolean);
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 5000;
    const responseTimeScore = Math.max(0, 1 - avgResponseTime / 10000); // 10s = 0

    // Error severity (20% weight)
    const errors = runs24h.filter((r) => r.status === 'FAILED');
    const criticalErrors = errors.filter((r) => {
      const code = (r.metadata as any)?.statusCode;
      return code === 401 || code === 403 || code === 429;
    });
    const errorSeverity = errors.length > 0
      ? 1 - (criticalErrors.length / errors.length)
      : 1;

    // Consistency (20% weight) — variance in success rate over 7 days
    const dailyRates: number[] = [];
    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(now.getTime() - (i + 1) * 86400000);
      const dayEnd = new Date(now.getTime() - i * 86400000);
      const dayRuns = runs7d.filter((r) => r.createdAt >= dayStart && r.createdAt < dayEnd);
      if (dayRuns.length > 0) {
        dailyRates.push(dayRuns.filter((r) => r.status === 'SUCCESS').length / dayRuns.length);
      }
    }
    const consistency = dailyRates.length > 1
      ? 1 - this.standardDeviation(dailyRates)
      : 0.5;

    // Calculate weighted score
    const score = Math.round(
      (successRate24h * 40 + responseTimeScore * 20 + errorSeverity * 20 + consistency * 20)
    );

    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

    return {
      score,
      grade,
      factors: {
        successRate: Math.round(successRate24h * 100),
        avgResponseTime: Math.round(avgResponseTime),
        errorSeverity: Math.round(errorSeverity * 100),
        consistency: Math.round(consistency * 100),
      },
    };
  }

  private standardDeviation(values: number[]): number {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  // ============================================================
  // A/B TESTING
  // ============================================================

  /**
   * Create an A/B test between two engagement strategies
   */
  async createABTest(
    organizationId: string,
    name: string,
    engagementAId: string,
    engagementBId: string,
    options?: {
      splitPercent?: number; // % of traffic to A (default 50)
      durationHours?: number;
      successMetric?: string; // 'success_rate', 'response_time', 'custom'
    }
  ) {
    const testId = `abtest_${Date.now()}`;

    await redis.set(`ab-test:${testId}`, JSON.stringify({
      id: testId,
      name,
      organizationId,
      engagementAId,
      engagementBId,
      splitPercent: options?.splitPercent || 50,
      durationHours: options?.durationHours || 168, // 7 days
      successMetric: options?.successMetric || 'success_rate',
      startedAt: new Date().toISOString(),
      status: 'running',
    }));

    // Index by engagement
    await redis.sadd(`ab-tests:${engagementAId}`, testId);
    await redis.sadd(`ab-tests:${engagementBId}`, testId);

    return testId;
  }

  /**
   * Get which engagement variant to use for this execution
   */
  async getABVariant(testId: string): Promise<string | null> {
    const data = await redis.get(`ab-test:${testId}`);
    if (!data) return null;

    const test = JSON.parse(data);
    if (test.status !== 'running') return null;

    // Check if test has expired
    const startedAt = new Date(test.startedAt);
    const expiresAt = new Date(startedAt.getTime() + test.durationHours * 3600000);
    if (new Date() > expiresAt) {
      await this.concludeABTest(testId);
      return null;
    }

    // Random split
    return Math.random() * 100 < test.splitPercent
      ? test.engagementAId
      : test.engagementBId;
  }

  /**
   * Conclude A/B test and pick winner
   */
  async concludeABTest(testId: string): Promise<{ winner: string; results: any }> {
    const data = await redis.get(`ab-test:${testId}`);
    if (!data) throw new Error('A/B test not found');

    const test = JSON.parse(data);

    // Compare health scores
    const [scoreA, scoreB] = await Promise.all([
      this.calculateHealthScore(test.engagementAId),
      this.calculateHealthScore(test.engagementBId),
    ]);

    const winner = scoreA.score >= scoreB.score ? test.engagementAId : test.engagementBId;

    // Update test status
    test.status = 'completed';
    test.winner = winner;
    test.completedAt = new Date().toISOString();
    test.results = { scoreA: scoreA.score, scoreB: scoreB.score };
    await redis.set(`ab-test:${testId}`, JSON.stringify(test));

    return { winner, results: test.results };
  }

  // ============================================================
  // BLACKLISTS
  // ============================================================

  /**
   * Add targets to blacklist
   */
  async addToBlacklist(
    organizationId: string,
    type: 'user' | 'post' | 'keyword' | 'domain',
    entries: string[]
  ): Promise<void> {
    const key = `blacklist:${organizationId}:${type}`;
    await redis.sadd(key, ...entries);
  }

  /**
   * Remove from blacklist
   */
  async removeFromBlacklist(
    organizationId: string,
    type: 'user' | 'post' | 'keyword' | 'domain',
    entries: string[]
  ): Promise<void> {
    const key = `blacklist:${organizationId}:${type}`;
    await redis.srem(key, ...entries);
  }

  /**
   * Check if a target is blacklisted
   */
  async isBlacklisted(
    organizationId: string,
    target: { userId?: string; postId?: string; content?: string; url?: string }
  ): Promise<{ blocked: boolean; reason?: string }> {
    // Check user blacklist
    if (target.userId) {
      const isBlocked = await redis.sismember(`blacklist:${organizationId}:user`, target.userId);
      if (isBlocked) return { blocked: true, reason: `User ${target.userId} is blacklisted` };
    }

    // Check post blacklist
    if (target.postId) {
      const isBlocked = await redis.sismember(`blacklist:${organizationId}:post`, target.postId);
      if (isBlocked) return { blocked: true, reason: `Post ${target.postId} is blacklisted` };
    }

    // Check keyword blacklist
    if (target.content) {
      const keywords = await redis.smembers(`blacklist:${organizationId}:keyword`);
      const lowerContent = target.content.toLowerCase();
      for (const keyword of keywords) {
        if (lowerContent.includes(keyword.toLowerCase())) {
          return { blocked: true, reason: `Content contains blacklisted keyword: ${keyword}` };
        }
      }
    }

    // Check domain blacklist
    if (target.url) {
      const domains = await redis.smembers(`blacklist:${organizationId}:domain`);
      try {
        const urlDomain = new URL(target.url).hostname;
        for (const domain of domains) {
          if (urlDomain.includes(domain)) {
            return { blocked: true, reason: `Domain ${domain} is blacklisted` };
          }
        }
      } catch {}
    }

    return { blocked: false };
  }

  /**
   * Get full blacklist
   */
  async getBlacklist(organizationId: string) {
    const [users, posts, keywords, domains] = await Promise.all([
      redis.smembers(`blacklist:${organizationId}:user`),
      redis.smembers(`blacklist:${organizationId}:post`),
      redis.smembers(`blacklist:${organizationId}:keyword`),
      redis.smembers(`blacklist:${organizationId}:domain`),
    ]);

    return { users, posts, keywords, domains };
  }

  // ============================================================
  // CONDITIONS
  // ============================================================

  /**
   * Evaluate engagement conditions
   * Only run engagement when conditions are met
   */
  async evaluateConditions(
    engagementId: string,
    conditions: Array<{
      type: 'min_likes' | 'min_comments' | 'max_age_hours' | 'contains_keyword' | 'not_contains_keyword' | 'user_follower_count' | 'custom';
      value: any;
      operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'contains';
    }>,
    context: {
      targetLikes?: number;
      targetComments?: number;
      targetAgeHours?: number;
      targetContent?: string;
      targetUserFollowers?: number;
      customData?: Record<string, any>;
    }
  ): Promise<{ met: boolean; failedConditions: string[] }> {
    const failed: string[] = [];

    for (const condition of conditions) {
      switch (condition.type) {
        case 'min_likes':
          if ((context.targetLikes || 0) < condition.value) {
            failed.push(`Likes ${context.targetLikes || 0} < ${condition.value}`);
          }
          break;
        case 'min_comments':
          if ((context.targetComments || 0) < condition.value) {
            failed.push(`Comments ${context.targetComments || 0} < ${condition.value}`);
          }
          break;
        case 'max_age_hours':
          if ((context.targetAgeHours || Infinity) > condition.value) {
            failed.push(`Age ${context.targetAgeHours}h > ${condition.value}h`);
          }
          break;
        case 'contains_keyword':
          if (!context.targetContent?.toLowerCase().includes(condition.value.toLowerCase())) {
            failed.push(`Content doesn't contain: ${condition.value}`);
          }
          break;
        case 'not_contains_keyword':
          if (context.targetContent?.toLowerCase().includes(condition.value.toLowerCase())) {
            failed.push(`Content contains blacklisted keyword: ${condition.value}`);
          }
          break;
        case 'user_follower_count':
          if ((context.targetUserFollowers || 0) < condition.value) {
            failed.push(`Followers ${context.targetUserFollowers || 0} < ${condition.value}`);
          }
          break;
      }
    }

    return { met: failed.length === 0, failedConditions: failed };
  }
}

export const engagementFeatures = new EngagementFeaturesService();
