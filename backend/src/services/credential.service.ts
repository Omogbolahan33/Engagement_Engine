import { prisma } from '../config/database';
import { encrypt, decrypt, maskSensitive, currentKeyVersion } from '../utils/encryption';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { auditLog } from '../middleware/audit';
import { createContextLogger } from '../utils/logger';
import { AuthType } from '@prisma/client';

const log = createContextLogger('credential-service');

interface CreateCredentialInput {
  siteId: string;
  name: string;
  authType: AuthType;
  credentialData: Record<string, any>;
  metadata?: Record<string, any>;
  expiresAt?: Date;
  refreshStrategy?: string;
}

interface CredentialResponse {
  id: string;
  siteId: string;
  name: string;
  authType: AuthType;
  metadata: Record<string, any>;
  isActive: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  // Masked credential fields
  maskedData: Record<string, string>;
}

/**
 * Supported credential schemas per auth type
 * This defines what fields are required for each auth type
 */
const CREDENTIAL_SCHEMAS: Record<string, { fields: string[]; sensitive: string[]; description: string }> = {
  // Token-based
  API_KEY: {
    fields: ['apiKey'],
    sensitive: ['apiKey'],
    description: 'API Key for authentication',
  },
  BEARER_TOKEN: {
    fields: ['token'],
    sensitive: ['token'],
    description: 'Bearer token for Authorization header',
  },
  SESSION_TOKEN: {
    fields: ['sessionToken', 'cookieName'],
    sensitive: ['sessionToken'],
    description: 'Session token from cookie or header',
  },
  JWT_TOKEN: {
    fields: ['jwt'],
    sensitive: ['jwt'],
    description: 'JSON Web Token',
  },
  OAUTH2_CLIENT_CREDENTIALS: {
    fields: ['clientId', 'clientSecret', 'tokenUrl', 'scope'],
    sensitive: ['clientSecret'],
    description: 'OAuth 2.0 Client Credentials flow',
  },
  OAUTH2_AUTHORIZATION_CODE: {
    fields: ['clientId', 'clientSecret', 'redirectUri', 'authorizationCode', 'tokenUrl'],
    sensitive: ['clientSecret', 'authorizationCode'],
    description: 'OAuth 2.0 Authorization Code flow',
  },
  OAUTH2_DEVICE_CODE: {
    fields: ['clientId', 'clientSecret', 'deviceCode', 'tokenUrl'],
    sensitive: ['clientSecret', 'deviceCode'],
    description: 'OAuth 2.0 Device Code flow',
  },
  PERSONAL_ACCESS_TOKEN: {
    fields: ['token'],
    sensitive: ['token'],
    description: 'Personal Access Token (GitHub, GitLab, etc.)',
  },

  // Username/Password
  BASIC_AUTH: {
    fields: ['username', 'password'],
    sensitive: ['password'],
    description: 'HTTP Basic Authentication',
  },
  FORM_LOGIN: {
    fields: ['username', 'password', 'loginUrl', 'usernameField', 'passwordField'],
    sensitive: ['password'],
    description: 'Form-based login (browser automation)',
  },
  DIGEST_AUTH: {
    fields: ['username', 'password', 'realm'],
    sensitive: ['password'],
    description: 'HTTP Digest Authentication',
  },
  NTLM_AUTH: {
    fields: ['username', 'password', 'domain', 'workstation'],
    sensitive: ['password'],
    description: 'NTLM/Windows Authentication',
  },
  KERBEROS: {
    fields: ['keytabBase64', 'principal', 'realm'],
    sensitive: ['keytabBase64'],
    description: 'Kerberos Authentication',
  },

  // Cookie/Session
  COOKIE_AUTH: {
    fields: ['cookies'],
    sensitive: ['cookies'],
    description: 'Raw cookie string for authentication',
  },
  SESSION_COOKIE: {
    fields: ['sessionCookie', 'cookieDomain'],
    sensitive: ['sessionCookie'],
    description: 'Session cookie value',
  },
  CSRF_TOKEN_PLUS_SESSION: {
    fields: ['sessionCookie', 'csrfToken', 'csrfHeaderName'],
    sensitive: ['sessionCookie', 'csrfToken'],
    description: 'Session cookie + CSRF token',
  },

  // Header-based
  CUSTOM_HEADER: {
    fields: ['headerName', 'headerValue'],
    sensitive: ['headerValue'],
    description: 'Custom header authentication',
  },
  HMAC_SIGNATURE: {
    fields: ['secretKey', 'algorithm', 'headerName'],
    sensitive: ['secretKey'],
    description: 'HMAC request signing',
  },
  REQUEST_SIGNING: {
    fields: ['privateKey', 'signingAlgorithm', 'signatureHeader'],
    sensitive: ['privateKey'],
    description: 'Request signing with private key',
  },

  // Certificate
  MTLS_CERTIFICATE: {
    fields: ['certificatePem', 'privateKeyPem', 'caPem'],
    sensitive: ['privateKeyPem'],
    description: 'Mutual TLS client certificate',
  },
  CLIENT_CERTIFICATE: {
    fields: ['certificatePfx', 'passphrase'],
    sensitive: ['certificatePfx', 'passphrase'],
    description: 'Client certificate (PFX/P12)',
  },

  // Platform-Specific
  TWITTER_OAUTH1: {
    fields: ['consumerKey', 'consumerSecret', 'accessToken', 'accessTokenSecret'],
    sensitive: ['consumerSecret', 'accessTokenSecret'],
    description: 'Twitter OAuth 1.0a',
  },
  TWITTER_OAUTH2: {
    fields: ['clientId', 'clientSecret', 'refreshToken'],
    sensitive: ['clientSecret', 'refreshToken'],
    description: 'Twitter OAuth 2.0',
  },
  GOOGLE_OAUTH2: {
    fields: ['clientId', 'clientSecret', 'refreshToken'],
    sensitive: ['clientSecret', 'refreshToken'],
    description: 'Google OAuth 2.0',
  },
  FACEBOOK_LOGIN: {
    fields: ['appId', 'appSecret', 'accessToken'],
    sensitive: ['appSecret', 'accessToken'],
    description: 'Facebook Login',
  },
  GITHUB_APP: {
    fields: ['appId', 'privateKey', 'installationId'],
    sensitive: ['privateKey'],
    description: 'GitHub App authentication',
  },
  SLACK_BOT_TOKEN: {
    fields: ['botToken', 'appToken'],
    sensitive: ['botToken', 'appToken'],
    description: 'Slack Bot/App tokens',
  },
  DISCORD_BOT_TOKEN: {
    fields: ['botToken'],
    sensitive: ['botToken'],
    description: 'Discord Bot token',
  },
  REDDIT_OAUTH2: {
    fields: ['clientId', 'clientSecret', 'username', 'password', 'userAgent'],
    sensitive: ['clientSecret', 'password'],
    description: 'Reddit OAuth 2.0 (script app)',
  },
  LINKEDIN_OAUTH2: {
    fields: ['clientId', 'clientSecret', 'accessToken'],
    sensitive: ['clientSecret', 'accessToken'],
    description: 'LinkedIn OAuth 2.0',
  },

  // Browser-based
  PUPPETEER_LOGIN: {
    fields: ['loginUrl', 'steps'],
    sensitive: ['steps'],
    description: 'Automated browser login via Puppeteer',
  },
  SELENIUM_LOGIN: {
    fields: ['loginUrl', 'steps'],
    sensitive: ['steps'],
    description: 'Automated browser login via Selenium',
  },
  BROWSER_COOKIE_IMPORT: {
    fields: ['cookiesJson', 'browserType'],
    sensitive: ['cookiesJson'],
    description: 'Import cookies from browser',
  },

  // Webhook
  WEBHOOK_SECRET: {
    fields: ['secret'],
    sensitive: ['secret'],
    description: 'Webhook verification secret',
  },
  HMAC_WEBHOOK: {
    fields: ['secret', 'algorithm', 'signatureHeader'],
    sensitive: ['secret'],
    description: 'HMAC webhook verification',
  },

  // SSO
  SAML_SSO: {
    fields: ['idpMetadataUrl', 'spEntityId', 'privateKey'],
    sensitive: ['privateKey'],
    description: 'SAML SSO authentication',
  },
  OIDC_SSO: {
    fields: ['issuer', 'clientId', 'clientSecret'],
    sensitive: ['clientSecret'],
    description: 'OpenID Connect SSO',
  },
  LDAP_AUTH: {
    fields: ['url', 'bindDn', 'bindPassword', 'searchBase'],
    sensitive: ['bindPassword'],
    description: 'LDAP authentication',
  },

  // Custom
  CUSTOM_SCRIPT: {
    fields: ['script', 'language'],
    sensitive: ['script'],
    description: 'Custom authentication script',
  },
  MULTI_STEP_AUTH: {
    fields: ['steps'],
    sensitive: ['steps'],
    description: 'Multi-step authentication flow',
  },
};

export class CredentialService {
  /**
   * Get available auth types and their schemas
   */
  getAuthTypeSchemas(): Record<string, any> {
    return CREDENTIAL_SCHEMAS;
  }

  /**
   * Validate credential data against auth type schema
   */
  validateCredentialData(authType: AuthType, data: Record<string, any>): void {
    const schema = CREDENTIAL_SCHEMAS[authType];
    if (!schema) {
      throw new ValidationError(`Unsupported auth type: ${authType}`);
    }

    const missingFields = schema.fields.filter((field) => !(field in data) || !data[field]);
    if (missingFields.length > 0) {
      throw new ValidationError(`Missing required fields for ${authType}: ${missingFields.join(', ')}`);
    }
  }

  /**
   * Create a new credential
   */
  async create(input: CreateCredentialInput, organizationId: string): Promise<CredentialResponse> {
    // Validate the credential data
    this.validateCredentialData(input.authType, input.credentialData);

    // Verify site belongs to organization
    const site = await prisma.site.findFirst({
      where: { id: input.siteId, organizationId },
    });

    if (!site) {
      throw new NotFoundError('Site');
    }

    // Encrypt the credential data
    const encryptedData = encrypt(JSON.stringify(input.credentialData));

    const credential = await prisma.credential.create({
      data: {
        siteId: input.siteId,
        name: input.name,
        authType: input.authType,
        encryptedData,
        keyVersion: currentKeyVersion(),
        metadata: input.metadata || {},
        expiresAt: input.expiresAt,
        refreshStrategy: input.refreshStrategy as any,
      },
    });

    // Audit log
    await auditLog(organizationId, undefined, {
      action: 'CREDENTIAL_CREATED',
      resource: 'credential',
      resourceId: credential.id,
      details: { siteId: input.siteId, authType: input.authType },
    });

    log.info('Credential created', { credentialId: credential.id, authType: input.authType });

    return this.toResponse(credential, input.authType, input.credentialData);
  }

  /**
   * Get credential with decrypted data (internal use only)
   */
  async getDecrypted(credentialId: string): Promise<Record<string, any>> {
    const credential = await prisma.credential.findUnique({
      where: { id: credentialId },
    });

    if (!credential) {
      throw new NotFoundError('Credential');
    }

    return JSON.parse(decrypt(credential.encryptedData));
  }

  /**
   * List credentials for a site (masked)
   */
  async listBySite(siteId: string, organizationId: string): Promise<CredentialResponse[]> {
    const site = await prisma.site.findFirst({
      where: { id: siteId, organizationId },
    });

    if (!site) {
      throw new NotFoundError('Site');
    }

    const credentials = await prisma.credential.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
    });

    return credentials.map((cred) => {
      const data = JSON.parse(decrypt(cred.encryptedData));
      return this.toResponse(cred, cred.authType, data);
    });
  }

  /**
   * Update credential
   */
  async update(
    credentialId: string,
    updates: Partial<CreateCredentialInput>,
    organizationId: string
  ): Promise<CredentialResponse> {
    const credential = await prisma.credential.findFirst({
      where: { id: credentialId, site: { organizationId } },
    });

    if (!credential) {
      throw new NotFoundError('Credential');
    }

    const updateData: any = {};

    if (updates.name) updateData.name = updates.name;
    if (updates.metadata) updateData.metadata = updates.metadata;
    if (updates.expiresAt) updateData.expiresAt = updates.expiresAt;
    if (updates.refreshStrategy) updateData.refreshStrategy = updates.refreshStrategy;

    if (updates.credentialData) {
      if (updates.authType) {
        this.validateCredentialData(updates.authType, updates.credentialData);
        updateData.authType = updates.authType;
      }
      updateData.encryptedData = encrypt(JSON.stringify(updates.credentialData));
      updateData.keyVersion = currentKeyVersion();
    }

    const updated = await prisma.credential.update({
      where: { id: credentialId },
      data: updateData,
    });

    const data = JSON.parse(decrypt(updated.encryptedData));

    await auditLog(organizationId, undefined, {
      action: 'CREDENTIAL_UPDATED',
      resource: 'credential',
      resourceId: credentialId,
    });

    return this.toResponse(updated, updated.authType, data);
  }

  /**
   * Delete credential (soft delete → deactivate)
   */
  async delete(credentialId: string, organizationId: string): Promise<void> {
    const credential = await prisma.credential.findFirst({
      where: { id: credentialId, site: { organizationId } },
    });

    if (!credential) {
      throw new NotFoundError('Credential');
    }

    // Soft delete: deactivate instead of hard delete
    await prisma.credential.update({
      where: { id: credentialId },
      data: { isActive: false },
    });

    await auditLog(organizationId, undefined, {
      action: 'CREDENTIAL_DELETED',
      resource: 'credential',
      resourceId: credentialId,
    });

    log.info('Credential deactivated (soft deleted)', { credentialId });
  }

  /**
   * Mark credential as used
   */
  async markUsed(credentialId: string): Promise<void> {
    await prisma.credential.update({
      where: { id: credentialId },
      data: { lastUsedAt: new Date() },
    });
  }

  /**
   * Convert to response (mask sensitive data)
   */
  private toResponse(credential: any, authType: AuthType, data: Record<string, any>): CredentialResponse {
    const schema = CREDENTIAL_SCHEMAS[authType];
    const maskedData: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      if (schema?.sensitive.includes(key)) {
        maskedData[key] = maskSensitive(String(value));
      } else {
        maskedData[key] = String(value);
      }
    }

    return {
      id: credential.id,
      siteId: credential.siteId,
      name: credential.name,
      authType: credential.authType,
      metadata: credential.metadata as Record<string, any>,
      isActive: credential.isActive,
      expiresAt: credential.expiresAt,
      lastUsedAt: credential.lastUsedAt,
      createdAt: credential.createdAt,
      maskedData,
    };
  }
}

export const credentialService = new CredentialService();
