import nodemailer from 'nodemailer';
import { config } from '../config';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('email');

/**
 * Email Service
 * Handles transactional emails: password reset, verification, notifications
 */

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.port === 465,
  auth: config.email.user ? {
    user: config.email.user,
    pass: config.email.pass,
  } : undefined,
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  /**
   * Send an email
   */
  async send(options: EmailOptions): Promise<boolean> {
    try {
      if (!config.email.host || config.email.host === 'localhost') {
        log.warn('Email not configured, skipping send', { to: options.to, subject: options.subject });
        return false;
      }

      await transporter.sendMail({
        from: config.email.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      log.info('Email sent', { to: options.to, subject: options.subject });
      return true;
    } catch (error: any) {
      log.error('Email send failed', { to: options.to, error: error.message });
      return false;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(to: string, resetToken: string, userName?: string): Promise<boolean> {
    const resetUrl = `${config.cors.origin}/reset-password?token=${resetToken}`;

    return this.send({
      to,
      subject: 'Reset Your Password - Engagement Platform',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e293b;">Password Reset</h2>
          <p>Hello ${userName || 'there'},</p>
          <p>You requested a password reset. Click the button below to reset your password:</p>
          <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            Reset Password
          </a>
          <p style="color: #64748b; font-size: 14px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 12px;">Engagement Platform</p>
        </div>
      `,
    });
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(to: string, verifyToken: string, userName?: string): Promise<boolean> {
    const verifyUrl = `${config.cors.origin}/verify-email?token=${verifyToken}`;

    return this.send({
      to,
      subject: 'Verify Your Email - Engagement Platform',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e293b;">Verify Your Email</h2>
          <p>Hello ${userName || 'there'},</p>
          <p>Please verify your email address by clicking the button below:</p>
          <a href="${verifyUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            Verify Email
          </a>
          <p style="color: #64748b; font-size: 14px;">This link expires in 24 hours.</p>
        </div>
      `,
    });
  }

  /**
   * Send engagement failure notification
   */
  async sendEngagementFailureAlert(
    to: string,
    engagementName: string,
    siteName: string,
    errorMessage: string,
    errorCategory: string
  ): Promise<boolean> {
    return this.send({
      to,
      subject: `⚠️ Engagement Failed: ${engagementName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ef4444;">Engagement Failed</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px; color: #64748b;">Engagement</td><td style="padding: 8px; font-weight: bold;">${engagementName}</td></tr>
            <tr><td style="padding: 8px; color: #64748b;">Site</td><td style="padding: 8px;">${siteName}</td></tr>
            <tr><td style="padding: 8px; color: #64748b;">Category</td><td style="padding: 8px;">${errorCategory}</td></tr>
            <tr><td style="padding: 8px; color: #64748b;">Error</td><td style="padding: 8px; color: #ef4444;">${errorMessage}</td></tr>
          </table>
          <a href="${config.cors.origin}/engagements" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">
            View Details
          </a>
        </div>
      `,
    });
  }

  /**
   * Send credential expiry warning
   */
  async sendCredentialExpiryWarning(
    to: string,
    credentialName: string,
    siteName: string,
    expiresAt: Date
  ): Promise<boolean> {
    const hoursLeft = Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));

    return this.send({
      to,
      subject: `🔑 Credential Expiring: ${credentialName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">Credential Expiring Soon</h2>
          <p>The credential <strong>${credentialName}</strong> for <strong>${siteName}</strong> will expire in <strong>${hoursLeft} hours</strong>.</p>
          <p>Please refresh or re-authenticate to avoid engagement interruptions.</p>
          <a href="${config.cors.origin}/credentials" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">
            Manage Credentials
          </a>
        </div>
      `,
    });
  }

  /**
   * Send daily summary
   */
  async sendDailySummary(
    to: string,
    stats: {
      totalRuns: number;
      successful: number;
      failed: number;
      successRate: number;
      topError?: string;
    }
  ): Promise<boolean> {
    return this.send({
      to,
      subject: `📊 Daily Summary - ${stats.successRate.toFixed(1)}% success rate`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e293b;">Daily Engagement Summary</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px; color: #64748b;">Total Runs</td><td style="padding: 8px; font-weight: bold; font-size: 18px;">${stats.totalRuns}</td></tr>
            <tr><td style="padding: 8px; color: #64748b;">Successful</td><td style="padding: 8px; color: #22c55e;">${stats.successful}</td></tr>
            <tr><td style="padding: 8px; color: #64748b;">Failed</td><td style="padding: 8px; color: #ef4444;">${stats.failed}</td></tr>
            <tr><td style="padding: 8px; color: #64748b;">Success Rate</td><td style="padding: 8px; font-weight: bold;">${stats.successRate.toFixed(1)}%</td></tr>
          </table>
          ${stats.topError ? `<p style="color: #ef4444;">Top error: ${stats.topError}</p>` : ''}
          <a href="${config.cors.origin}/analytics" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">
            View Analytics
          </a>
        </div>
      `,
    });
  }
}

export const emailService = new EmailService();
