import { prisma } from '../config/database';
import {
  currentKeyVersion,
  availableKeyVersions,
  decrypt,
  keyVersionOf,
  reencrypt,
} from '../utils/encryption';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('key-rotation');

export interface RotationStatus {
  currentVersion: number;
  readableVersions: number[];
  /** Rows still wrapped with a non-current key. */
  pending: number;
  total: number;
  byVersion: Record<number, number>;
}

export interface RotationResult {
  scanned: number;
  rotated: number;
  failed: number;
  remaining: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Re-wraps encrypted-at-rest data with the active encryption key.
 *
 * Rotation is incremental and resumable rather than a single sweeping
 * transaction: each row is decrypted with whichever key it names and written
 * back under the current key, so an interrupted run leaves a mix of versions and
 * simply resumes on the next call. A row that fails to decrypt (its key is no
 * longer on the keyring) is reported and skipped rather than aborting the batch.
 */
export class KeyRotationService {
  /**
   * How many credentials are still on an old key. Cheap enough to poll from an
   * admin UI while a rotation runs.
   */
  async getStatus(): Promise<RotationStatus> {
    const current = currentKeyVersion();

    const grouped = await prisma.credential.groupBy({
      by: ['keyVersion'],
      _count: { id: true },
    });

    const byVersion: Record<number, number> = {};
    let total = 0;
    let pending = 0;

    for (const row of grouped) {
      const count = row._count.id;
      byVersion[row.keyVersion] = count;
      total += count;
      if (row.keyVersion !== current) pending += count;
    }

    return {
      currentVersion: current,
      readableVersions: availableKeyVersions(),
      pending,
      total,
      byVersion,
    };
  }

  /**
   * Re-wrap up to `batchSize` credentials. Returns how many remain so a caller
   * can loop until `remaining` is 0.
   */
  async rotateCredentials(batchSize = 100): Promise<RotationResult> {
    const current = currentKeyVersion();

    const stale = await prisma.credential.findMany({
      where: { keyVersion: { not: current } },
      select: { id: true, encryptedData: true, keyVersion: true },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });

    const result: RotationResult = {
      scanned: stale.length,
      rotated: 0,
      failed: 0,
      remaining: 0,
      errors: [],
    };

    for (const credential of stale) {
      try {
        // The stored keyVersion column can drift from the envelope (e.g. rows
        // written before the column existed). The envelope is authoritative.
        const actualVersion = keyVersionOf(credential.encryptedData);

        if (actualVersion === current) {
          // Already current; just correct the bookkeeping column.
          await prisma.credential.update({
            where: { id: credential.id },
            data: { keyVersion: current },
          });
          result.rotated++;
          continue;
        }

        const rewrapped = reencrypt(credential.encryptedData);

        await prisma.credential.update({
          where: { id: credential.id },
          data: { encryptedData: rewrapped, keyVersion: current },
        });

        result.rotated++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({ id: credential.id, error: error.message });
        log.error('Failed to rotate credential', {
          credentialId: credential.id,
          fromVersion: credential.keyVersion,
          error: error.message,
        });
      }
    }

    result.remaining = await prisma.credential.count({
      where: { keyVersion: { not: current } },
    });

    log.info('Key rotation batch complete', {
      scanned: result.scanned,
      rotated: result.rotated,
      failed: result.failed,
      remaining: result.remaining,
    });

    return result;
  }

  /**
   * Drive rotation to completion. Bounded by `maxBatches` so a runaway or
   * repeatedly-failing set of rows cannot spin forever.
   */
  async rotateAll(batchSize = 100, maxBatches = 100): Promise<RotationResult> {
    const totals: RotationResult = {
      scanned: 0,
      rotated: 0,
      failed: 0,
      remaining: 0,
      errors: [],
    };

    for (let batch = 0; batch < maxBatches; batch++) {
      const result = await this.rotateCredentials(batchSize);

      totals.scanned += result.scanned;
      totals.rotated += result.rotated;
      totals.failed += result.failed;
      totals.remaining = result.remaining;
      totals.errors.push(...result.errors);

      // Nothing left, or this batch made no progress (every row failed).
      if (result.remaining === 0 || result.rotated === 0) break;
    }

    return totals;
  }

  /**
   * Verify every stored credential can still be decrypted with the keys this
   * process holds. Run before retiring an old key.
   */
  async verifyAll(batchSize = 500): Promise<{ checked: number; unreadable: string[] }> {
    const unreadable: string[] = [];
    let checked = 0;
    let cursor: string | undefined;

    for (;;) {
      const page = await prisma.credential.findMany({
        select: { id: true, encryptedData: true },
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (page.length === 0) break;

      for (const credential of page) {
        checked++;
        try {
          decrypt(credential.encryptedData);
        } catch {
          unreadable.push(credential.id);
        }
      }

      cursor = page[page.length - 1].id;
    }

    return { checked, unreadable };
  }
}

export const keyRotationService = new KeyRotationService();
