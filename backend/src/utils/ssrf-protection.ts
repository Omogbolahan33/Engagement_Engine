import { URL } from 'url';
import { createContextLogger } from './logger';

const log = createContextLogger('ssrf');

/**
 * SSRF Protection
 * Prevents attackers from using the platform to probe internal networks
 * Blocks requests to private IPs, localhost, metadata endpoints, etc.
 */

// Blocked IP ranges (RFC 1918, loopback, link-local, metadata)
const BLOCKED_RANGES = [
  // Loopback
  { start: '127.0.0.0', end: '127.255.255.255' },
  // Private Class A
  { start: '10.0.0.0', end: '10.255.255.255' },
  // Private Class B
  { start: '172.16.0.0', end: '172.31.255.255' },
  // Private Class C
  { start: '192.168.0.0', end: '192.168.255.255' },
  // Link-local
  { start: '169.254.0.0', end: '169.254.255.255' },
  // Cloud metadata endpoints
  { start: '169.254.169.254', end: '169.254.169.254' },
  // IPv6 loopback
  { start: '::1', end: '::1' },
  // IPv6 link-local
  { start: 'fe80::', end: 'fe80::ffff:ffff:ffff:ffff' },
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
  'instance-data',
];

const BLOCKED_PROTOCOLS = ['file:', 'ftp:', 'gopher:', 'dict:'];

const BLOCKED_PORTS = [
  22, 23, 25, 445, 1433, 1434, 3306, 3389, 5432, 5900, 6379, 8001, 8080, 8443, 9200, 9300, 11211, 27017,
];

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isPrivateIP(ip: string): boolean {
  // IPv6 check
  if (ip.includes(':')) {
    return ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc00:') || ip.startsWith('fd00:');
  }

  // IPv4 check
  const num = ipToNumber(ip);
  return BLOCKED_RANGES.some((range) => {
    if (range.start.includes(':')) return false; // Skip IPv6
    return num >= ipToNumber(range.start) && num <= ipToNumber(range.end);
  });
}

export interface SSRFCheckResult {
  safe: boolean;
  reason?: string;
}

/**
 * Validate a URL before fetching it
 * Returns { safe: true } if URL is safe to fetch
 */
export function validateUrl(urlString: string): SSRFCheckResult {
  let url: URL;

  try {
    url = new URL(urlString);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  // Check protocol
  if (BLOCKED_PROTOCOLS.includes(url.protocol)) {
    return { safe: false, reason: `Blocked protocol: ${url.protocol}` };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { safe: false, reason: `Only HTTP/HTTPS allowed, got: ${url.protocol}` };
  }

  // Check hostname
  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { safe: false, reason: `Blocked hostname: ${hostname}` };
  }

  // Check for IP in hostname
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isPrivateIP(hostname)) {
      return { safe: false, reason: `Blocked private IP: ${hostname}` };
    }
  }

  // Check for IPv6
  if (hostname.includes(':') && isPrivateIP(hostname)) {
    return { safe: false, reason: `Blocked private IPv6: ${hostname}` };
  }

  // Check for encoded IPs (e.g., 0x7f000001 = 127.0.0.1)
  if (/^0x[0-9a-f]+$/i.test(hostname)) {
    return { safe: false, reason: 'Hex-encoded IP not allowed' };
  }

  // Check port
  const port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
  if (BLOCKED_PORTS.includes(port)) {
    return { safe: false, reason: `Blocked port: ${port}` };
  }

  // Check for DNS rebinding patterns
  if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) {
    return { safe: false, reason: `Blocked internal hostname: ${hostname}` };
  }

  // Check URL length (prevent extremely long URLs)
  if (urlString.length > 2048) {
    return { safe: false, reason: 'URL too long (max 2048 chars)' };
  }

  return { safe: true };
}

/**
 * Safe fetch wrapper that validates URLs before fetching
 */
export async function safeFetch(
  url: string,
  options?: RequestInit & { ssrfBypass?: boolean }
): Promise<Response> {
  if (!options?.ssrfBypass) {
    const check = validateUrl(url);
    if (!check.safe) {
      log.warn('SSRF blocked', { url, reason: check.reason });
      throw new Error(`SSRF protection: ${check.reason}`);
    }
  }

  return fetch(url, options);
}
