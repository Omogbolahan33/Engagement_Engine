import { prisma } from '../config/database';
import { decrypt } from '../utils/encryption';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('proxy');

/**
 * Proxy Rotation Service
 * Manages proxy pools per site, rotates proxies, tracks health and load
 */

interface ProxyInstance {
  id: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  proxyType: string;
  maxConcurrent: number;
  currentLoad: number;
}

interface ProxyUrl {
  url: string;
  proxyId: string;
}

export class ProxyService {
  /**
   * Get next available proxy for a site using weighted round-robin
   * Respects maxConcurrent limits and prefers least-loaded proxies
   */
  async getProxy(siteId: string): Promise<ProxyUrl | null> {
    const proxies = await prisma.proxyConfig.findMany({
      where: { siteId, isActive: true },
      orderBy: { currentLoad: 'asc' },
    });

    if (proxies.length === 0) return null;

    // Find a proxy that hasn't hit its concurrency limit
    const available = proxies.find((p) => p.currentLoad < p.maxConcurrent);
    if (!available) {
      log.warn('All proxies at capacity', { siteId, count: proxies.length });
      return null;
    }

    // Increment load counter
    await prisma.proxyConfig.update({
      where: { id: available.id },
      data: {
        currentLoad: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    // Build proxy URL
    const auth = available.username
      ? `${available.username}:${available.encryptedPassword ? decrypt(available.encryptedPassword) : ''}@`
      : '';

    const protocol = available.proxyType === 'SOCKS4' || available.proxyType === 'SOCKS5'
      ? available.proxyType.toLowerCase()
      : 'http';

    return {
      url: `${protocol}://${auth}${available.host}:${available.port}`,
      proxyId: available.id,
    };
  }

  /**
   * Release a proxy (decrement load counter)
   */
  async releaseProxy(proxyId: string): Promise<void> {
    await prisma.proxyConfig.update({
      where: { id: proxyId },
      data: { currentLoad: { decrement: 1 } },
    }).catch(() => {}); // Don't fail if proxy was deleted
  }

  /**
   * Mark a proxy as failed/unhealthy
   */
  async markFailed(proxyId: string): Promise<void> {
    await prisma.proxyConfig.update({
      where: { id: proxyId },
      data: {
        currentLoad: { decrement: 1 },
        metadata: { lastFailure: new Date().toISOString() },
      },
    }).catch(() => {});
  }

  /**
   * Get proxy pool health for a site
   */
  async getPoolHealth(siteId: string) {
    const proxies = await prisma.proxyConfig.findMany({
      where: { siteId },
    });

    const total = proxies.length;
    const active = proxies.filter((p) => p.isActive).length;
    const atCapacity = proxies.filter((p) => p.currentLoad >= p.maxConcurrent).length;
    const totalLoad = proxies.reduce((sum, p) => sum + p.currentLoad, 0);
    const totalCapacity = proxies.reduce((sum, p) => sum + p.maxConcurrent, 0);

    return {
      total,
      active,
      atCapacity,
      totalLoad,
      totalCapacity,
      utilization: totalCapacity > 0 ? (totalLoad / totalCapacity) * 100 : 0,
    };
  }

  /**
   * Reset all load counters (called on startup or periodically)
   */
  async resetAllLoads(): Promise<void> {
    await prisma.proxyConfig.updateMany({
      data: { currentLoad: 0 },
    });
    log.info('All proxy load counters reset');
  }
}

export const proxyService = new ProxyService();
