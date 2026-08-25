import { prisma } from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';
import crypto from 'crypto';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('2fa');

/**
 * Two-Factor Authentication Service
 * TOTP-based 2FA (Google Authenticator, Authy, etc.)
 * Also supports backup codes
 */

export class TwoFactorService {
  /**
   * Generate 2FA secret for a user
   */
  async generateSecret(userId: string): Promise<{ secret: string; otpauthUrl: string; backupCodes: string[] }> {
    // Generate TOTP secret
    const secret = this.generateBase32Secret(20);

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Store encrypted secret and backup codes
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: encrypt(secret),
        mfaEnabled: false, // Not enabled until verified
      },
    });

    // Persist hashed backup codes alongside the secret
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaBackupCodes: backupCodes.map((code) => ({ code: this.hashCode(code), used: false })),
      },
    });

    // Get user email for otpauth URL
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const otpauthUrl = `otpauth://totp/EngagementPlatform:${user?.email}?secret=${secret}&issuer=EngagementPlatform&algorithm=SHA1&digits=6&period=30`;

    return { secret, otpauthUrl, backupCodes };
  }

  /**
   * Verify TOTP code and enable 2FA
   */
  async verifyAndEnable(userId: string, code: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaSecret) return false;

    const secret = decrypt(user.mfaSecret);
    const isValid = this.verifyTOTP(secret, code);

    if (isValid) {
      await prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true, mfaEnabledAt: new Date() },
      });
      log.info('2FA enabled', { userId });
      return true;
    }

    return false;
  }

  /**
   * Verify 2FA code during login
   */
  async verify(userId: string, code: string): Promise<{ valid: boolean; usedBackupCode: boolean }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaEnabled || !user?.mfaSecret) {
      return { valid: true, usedBackupCode: false }; // 2FA not enabled
    }

    // Try TOTP first
    const secret = decrypt(user.mfaSecret);
    if (this.verifyTOTP(secret, code)) {
      return { valid: true, usedBackupCode: false };
    }

    // Try backup codes — single use, burned on match
    const codes = (user.mfaBackupCodes as Array<{ code: string; used: boolean }> | null) ?? [];
    const codeHash = this.hashCode(code.toUpperCase().replace(/\s+/g, ''));

    const codeIndex = codes.findIndex((c) => c.code === codeHash && !c.used);
    if (codeIndex >= 0) {
      codes[codeIndex].used = true;
      await prisma.user.update({
        where: { id: userId },
        data: { mfaBackupCodes: codes },
      });
      const remaining = codes.filter((c) => !c.used).length;
      log.info('Backup code used', { userId, remaining });
      return { valid: true, usedBackupCode: true };
    }

    return { valid: false, usedBackupCode: false };
  }

  /**
   * Disable 2FA
   */
  async disable(userId: string, currentPassword: string): Promise<boolean> {
    // Verify password before disabling
    const bcrypt = await import('bcryptjs');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return false;

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) return false;

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaEnabledAt: null,
        mfaBackupCodes: [],
      },
    });

    log.info('2FA disabled', { userId });
    return true;
  }

  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaBackupCodes: backupCodes.map((code) => ({ code: this.hashCode(code), used: false })),
      },
    });

    return backupCodes;
  }

  /**
   * Check if 2FA is enabled for a user
   */
  async isEnabled(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true },
    });
    return user?.mfaEnabled || false;
  }

  // ============================================================
  // TOTP Implementation
  // ============================================================

  private verifyTOTP(secret: string, code: string, window: number = 1): boolean {
    const time = Math.floor(Date.now() / 30000);

    for (let i = -window; i <= window; i++) {
      const expectedCode = this.generateTOTP(secret, time + i);
      if (this.constantTimeCompare(code, expectedCode)) {
        return true;
      }
    }
    return false;
  }

  private generateTOTP(secret: string, time: number): string {
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(time));

    const secretBuffer = this.base32Decode(secret);
    const hmac = crypto.createHmac('sha1', secretBuffer);
    hmac.update(timeBuffer);
    const hash = hmac.digest();

    const offset = hash[hash.length - 1] & 0x0f;
    const code = (
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)
    ) % 1000000;

    return code.toString().padStart(6, '0');
  }

  private generateBase32Secret(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % 32];
    }
    return result;
  }

  private base32Decode(encoded: string): Buffer {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of encoded.toUpperCase()) {
      const val = chars.indexOf(char);
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substring(i, i + 8), 2));
    }
    return Buffer.from(bytes);
  }

  private hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}

export const twoFactorService = new TwoFactorService();
