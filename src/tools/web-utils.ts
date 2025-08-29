/**
 * Web utilities for WebFetch and WebSearch tools
 * Provides URL validation, HTML processing, and security features
 */

import validator from 'validator';
import axios, { AxiosResponse } from 'axios';
import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

// Configuration constants
export const WEB_CONFIG = {
  MAX_CONTENT_LENGTH: 1048576, // 1MB default
  REQUEST_TIMEOUT: 30000, // 30 seconds
  ALLOWED_PROTOCOLS: ['http:', 'https:'],
  ALLOWED_PORTS: [80, 443, 8080, 8443],
  MAX_REDIRECTS: 5,
  USER_AGENT: 'exa-code-cli/1.0 (Web Content Fetcher)',
};

// Blocked IP ranges (private networks, localhost, etc.)
const BLOCKED_IP_PATTERNS = [
  /^127\./,           // 127.0.0.0/8 (localhost)
  /^10\./,            // 10.0.0.0/8 (private)
  /^192\.168\./,      // 192.168.0.0/16 (private) 
  /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12 (private)
  /^169\.254\./,      // 169.254.0.0/16 (link-local)
  /^0\./,             // 0.0.0.0/8
  /^224\./,           // 224.0.0.0/4 (multicast)
];

// Domain blacklist
const BLOCKED_DOMAINS = [
  'localhost',
  'metadata.google.internal',
  '169.254.169.254', // AWS metadata
];

// Rate limiting storage
interface RateLimitEntry {
  count: number;
  firstRequest: number;
  lastRequest: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 10,
  MAX_REQUESTS_PER_DOMAIN_PER_MINUTE: 3,
  CLEANUP_INTERVAL: 300000, // 5 minutes
};

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  const oneMinute = 60 * 1000;
  
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.lastRequest > oneMinute) {
      rateLimitMap.delete(key);
    }
  }
}, RATE_LIMIT.CLEANUP_INTERVAL);

/**
 * URL validation and security checks
 */
export interface URLValidationResult {
  valid: boolean;
  errors: string[];
  normalizedUrl?: string;
  domain?: string;
}

export function validateUrl(url: string): URLValidationResult {
  const errors: string[] = [];
  
  try {
    // Basic URL validation
    if (!validator.isURL(url, {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true,
      allow_underscores: true,
      allow_trailing_dot: false,
      allow_protocol_relative_urls: false,
    })) {
      errors.push('Invalid URL format');
      return { valid: false, errors };
    }

    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.toLowerCase();

    // Protocol validation
    if (!WEB_CONFIG.ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
      errors.push(`Protocol ${parsedUrl.protocol} not allowed`);
    }

    // Port validation  
    const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 
      (parsedUrl.protocol === 'https:' ? 443 : 80);
    
    if (!WEB_CONFIG.ALLOWED_PORTS.includes(port)) {
      errors.push(`Port ${port} not allowed`);
    }

    // Domain blacklist check
    if (BLOCKED_DOMAINS.includes(domain)) {
      errors.push(`Domain ${domain} is blocked`);
    }

    // IP address validation (block private networks)
    if (validator.isIP(domain)) {
      for (const pattern of BLOCKED_IP_PATTERNS) {
        if (pattern.test(domain)) {
          errors.push(`IP address ${domain} is in blocked range`);
          break;
        }
      }
    }

    // Check for suspicious patterns
    if (domain.includes('metadata') || domain.includes('internal')) {
      errors.push(`Domain ${domain} contains suspicious keywords`);
    }

    if (errors.length === 0) {
      return {
        valid: true,
        errors: [],
        normalizedUrl: parsedUrl.toString(),
        domain: domain,
      };
    }

  } catch (error) {
    errors.push(`URL parsing failed: ${error}`);
  }

  return { valid: false, errors };
}

/**
 * Rate limiting checks
 */
export interface RateLimitResult {
  allowed: boolean;
  error?: string;
  retryAfter?: number;
}

export function checkRateLimit(url: string): RateLimitResult {
  const now = Date.now();
  const oneMinute = 60 * 1000;
  
  try {
    const domain = new URL(url).hostname;
    const globalKey = 'global';
    const domainKey = `domain:${domain}`;

    // Check global rate limit
    const globalEntry = rateLimitMap.get(globalKey);
    if (globalEntry && now - globalEntry.firstRequest < oneMinute) {
      if (globalEntry.count >= RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
        const retryAfter = oneMinute - (now - globalEntry.firstRequest);
        return {
          allowed: false,
          error: `Global rate limit exceeded (${RATE_LIMIT.MAX_REQUESTS_PER_MINUTE}/min)`,
          retryAfter: Math.ceil(retryAfter / 1000),
        };
      }
    }

    // Check domain-specific rate limit
    const domainEntry = rateLimitMap.get(domainKey);
    if (domainEntry && now - domainEntry.firstRequest < oneMinute) {
      if (domainEntry.count >= RATE_LIMIT.MAX_REQUESTS_PER_DOMAIN_PER_MINUTE) {
        const retryAfter = oneMinute - (now - domainEntry.firstRequest);
        return {
          allowed: false,
          error: `Domain rate limit exceeded (${RATE_LIMIT.MAX_REQUESTS_PER_DOMAIN_PER_MINUTE}/min for ${domain})`,
          retryAfter: Math.ceil(retryAfter / 1000),
        };
      }
    }

    // Update rate limit counters
    updateRateLimitEntry(globalKey, now);
    updateRateLimitEntry(domainKey, now);

    return { allowed: true };
    
  } catch (error) {
    return {
      allowed: false,
      error: `Rate limit check failed: ${error}`,
    };
  }
}

function updateRateLimitEntry(key: string, now: number): void {
  const entry = rateLimitMap.get(key);
  const oneMinute = 60 * 1000;

  if (!entry || now - entry.firstRequest > oneMinute) {
    // Start new window
    rateLimitMap.set(key, {
      count: 1,
      firstRequest: now,
      lastRequest: now,
    });
  } else {
    // Update existing window
    entry.count++;
    entry.lastRequest = now;
    rateLimitMap.set(key, entry);
  }
}

/**
 * HTTP request with security controls
 */
export interface FetchResult {
  success: boolean;
  content?: string;
  contentType?: string;
  statusCode?: number;
  error?: string;
  finalUrl?: string;
}

export async function secureHttpFetch(url: string, timeout?: number): Promise<FetchResult> {
  try {
    // URL validation
    const validation = validateUrl(url);
    if (!validation.valid) {
      return {
        success: false,
        error: `URL validation failed: ${validation.errors.join(', ')}`,
      };
    }

    // Rate limiting
    const rateLimit = checkRateLimit(validation.normalizedUrl!);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: rateLimit.error,
      };
    }

    // Make HTTP request with security settings
    const response: AxiosResponse = await axios.get(validation.normalizedUrl!, {
      timeout: timeout || WEB_CONFIG.REQUEST_TIMEOUT,
      maxContentLength: WEB_CONFIG.MAX_CONTENT_LENGTH,
      maxBodyLength: WEB_CONFIG.MAX_CONTENT_LENGTH,
      maxRedirects: WEB_CONFIG.MAX_REDIRECTS,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        'User-Agent': WEB_CONFIG.USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'close',
      },
      // Disable automatic decompression to check content size
      decompress: true,
    });

    // Content type validation
    const contentType = response.headers['content-type'] || '';
    if (!isAllowedContentType(contentType)) {
      return {
        success: false,
        error: `Content type ${contentType} not allowed`,
      };
    }

    return {
      success: true,
      content: response.data,
      contentType: contentType,
      statusCode: response.status,
      finalUrl: response.request?.res?.responseUrl || validation.normalizedUrl,
    };

  } catch (error: any) {
    let errorMessage = 'HTTP request failed';
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Domain not found';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Request timeout';
    } else if (error.response?.status) {
      errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

function isAllowedContentType(contentType: string): boolean {
  const allowedTypes = [
    'text/html',
    'text/plain',
    'application/xhtml+xml',
    'application/xml',
    'text/xml',
    'application/json',
  ];

  const lowerContentType = contentType.toLowerCase();
  return allowedTypes.some(type => lowerContentType.includes(type));
}

/**
 * HTML processing and conversion to Markdown
 */
export interface HtmlProcessingResult {
  success: boolean;
  markdown?: string;
  title?: string;
  description?: string;
  error?: string;
}

export function processHtmlToMarkdown(html: string, url?: string): HtmlProcessingResult {
  try {
    // Parse HTML with JSDOM
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract metadata
    const title = document.title || '';
    const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

    // Clean HTML with cheerio
    const $ = cheerio.load(html);
    
    // Remove unwanted elements
    $('script, style, noscript, iframe, object, embed').remove();
    $('nav, header, footer, aside, .advertisement, .ad, .sidebar').remove();
    $('.navigation, .menu, .breadcrumb, .social-media, .share').remove();
    $('[class*="comment"], [class*="footer"], [class*="header"]').remove();
    
    // Focus on main content areas
    let mainContent = $('main, [role="main"], .main-content, .content, article').first();
    if (mainContent.length === 0) {
      // Fallback to body if no main content area found
      mainContent = $('body');
    }

    // Clean up the HTML
    const cleanHtml = mainContent.html() || '';

    // Convert to Markdown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full',
    });

    // Configure turndown rules
    turndownService.addRule('removeEmptyElements', {
      filter: (node) => {
        return node.nodeName === 'P' && !node.textContent?.trim();
      },
      replacement: () => '',
    });

    turndownService.addRule('preserveLinks', {
      filter: 'a',
      replacement: (content, node) => {
        const href = (node as Element).getAttribute('href');
        if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) {
          return content;
        }
        
        // Convert relative URLs to absolute if base URL provided
        let fullUrl = href;
        if (url && !href.match(/^https?:\/\//)) {
          try {
            fullUrl = new URL(href, url).toString();
          } catch {
            fullUrl = href;
          }
        }
        
        return content.trim() ? `[${content}](${fullUrl})` : '';
      },
    });

    const markdown = turndownService.turndown(cleanHtml);

    // Post-process markdown
    const cleanMarkdown = markdown
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive newlines
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .replace(/\n\s+/g, '\n'); // Remove leading spaces on lines

    return {
      success: true,
      markdown: cleanMarkdown,
      title: title.trim(),
      description: metaDescription.trim(),
    };

  } catch (error: any) {
    return {
      success: false,
      error: `HTML processing failed: ${error.message}`,
    };
  }
}

/**
 * Environment variable helpers for web configuration
 */
export function getWebConfig(): typeof WEB_CONFIG {
  return {
    ...WEB_CONFIG,
    MAX_CONTENT_LENGTH: parseInt(process.env.EXA_WEB_MAX_CONTENT_LENGTH || '') || WEB_CONFIG.MAX_CONTENT_LENGTH,
    REQUEST_TIMEOUT: parseInt(process.env.EXA_WEB_REQUEST_TIMEOUT || '') || WEB_CONFIG.REQUEST_TIMEOUT,
  };
}

/**
 * Clean up resources
 */
export function cleanup(): void {
  rateLimitMap.clear();
}