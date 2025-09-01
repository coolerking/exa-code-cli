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
 * Web search functionality
 */

// Search providers configuration
export interface SearchProvider {
  name: string;
  baseUrl: string;
  requiresApiKey: boolean;
}

export const SEARCH_PROVIDERS: { [key: string]: SearchProvider } = {
  duckduckgo: {
    name: 'DuckDuckGo',
    baseUrl: 'https://api.duckduckgo.com',
    requiresApiKey: false,
  },
  google: {
    name: 'Google Custom Search',
    baseUrl: 'https://www.googleapis.com/customsearch/v1',
    requiresApiKey: true,
  },
  bing: {
    name: 'Bing Web Search',
    baseUrl: 'https://api.bing.microsoft.com/v7.0/search',
    requiresApiKey: true,
  },
};

// プロバイダー設定検出ヘルパー
function isGoogleConfigured(): boolean {
  return Boolean(process.env.EXA_GOOGLE_SEARCH_API_KEY && process.env.EXA_GOOGLE_SEARCH_ENGINE_ID);
}

function isBingConfigured(): boolean {
  return Boolean(process.env.EXA_BING_SEARCH_API_KEY);
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  displayUrl?: string;
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  query: string;
  provider: string;
  totalResults?: number;
  error?: string;
  // 試行ログ（UX改善・デバッグ用）
  attempts?: Array<{ provider: string; status: 'success' | 'fail'; reason?: string; results?: number }>;
}

/**
 * DuckDuckGo search implementation (primary, no API key required)
 */
async function searchDuckDuckGo(query: string, maxResults: number = 10): Promise<SearchResponse> {
  try {
    // DuckDuckGo Instant Answer API
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: '1',
        skip_disambig: '1',
      },
      timeout: WEB_CONFIG.REQUEST_TIMEOUT,
      headers: {
        'User-Agent': WEB_CONFIG.USER_AGENT,
      },
    });

    const data = response.data;
    const results: SearchResult[] = [];

    // Process DuckDuckGo results
    if (data.Results && Array.isArray(data.Results)) {
      for (const result of data.Results.slice(0, maxResults)) {
        if (result.FirstURL && result.Text) {
          results.push({
            title: result.Text,
            url: result.FirstURL,
            snippet: result.Text,
            displayUrl: result.FirstURL,
          });
        }
      }
    }

    // If no instant answers, try related topics
    if (results.length === 0 && data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, maxResults)) {
        if (topic.FirstURL && topic.Text) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text,
            url: topic.FirstURL,
            snippet: topic.Text,
            displayUrl: topic.FirstURL,
          });
        }
      }
    }

    return {
      success: true,
      results,
      query,
      provider: 'DuckDuckGo',
      totalResults: results.length,
    };

  } catch (error: any) {
    return {
      success: false,
      results: [],
      query,
      provider: 'DuckDuckGo',
      error: `DuckDuckGo search failed: ${error.message}`,
    };
  }
}

/**
 * Google Custom Search implementation (requires API key)
 */
async function searchGoogle(query: string, maxResults: number = 10): Promise<SearchResponse> {
  const apiKey = process.env.EXA_GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.EXA_GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    return {
      success: false,
      results: [],
      query,
      provider: 'Google',
      error: 'Google Search API key or Search Engine ID not configured',
    };
  }

  try {
    const response = await axios.get(SEARCH_PROVIDERS.google.baseUrl, {
      params: {
        key: apiKey,
        cx: searchEngineId,
        q: query,
        num: Math.min(maxResults, 10), // Google allows max 10 per request
      },
      timeout: WEB_CONFIG.REQUEST_TIMEOUT,
      headers: {
        'User-Agent': WEB_CONFIG.USER_AGENT,
      },
    });

    const data = response.data;
    const results: SearchResult[] = [];

    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        results.push({
          title: item.title,
          url: item.link,
          snippet: item.snippet,
          displayUrl: item.displayLink,
        });
      }
    }

    return {
      success: true,
      results,
      query,
      provider: 'Google',
      totalResults: parseInt(data.searchInformation?.totalResults || '0'),
    };

  } catch (error: any) {
    return {
      success: false,
      results: [],
      query,
      provider: 'Google',
      error: `Google search failed: ${error.response?.data?.error?.message || error.message}`,
    };
  }
}

/**
 * Bing Web Search implementation (requires API key)
 */
async function searchBing(query: string, maxResults: number = 10): Promise<SearchResponse> {
  const apiKey = process.env.EXA_BING_SEARCH_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      results: [],
      query,
      provider: 'Bing',
      error: 'Bing Search API key not configured',
    };
  }

  try {
    const response = await axios.get(SEARCH_PROVIDERS.bing.baseUrl, {
      params: {
        q: query,
        count: Math.min(maxResults, 50), // Bing allows max 50 per request
      },
      timeout: WEB_CONFIG.REQUEST_TIMEOUT,
      headers: {
        'User-Agent': WEB_CONFIG.USER_AGENT,
        'Ocp-Apim-Subscription-Key': apiKey,
      },
    });

    const data = response.data;
    const results: SearchResult[] = [];

    if (data.webPages && data.webPages.value && Array.isArray(data.webPages.value)) {
      for (const item of data.webPages.value) {
        results.push({
          title: item.name,
          url: item.url,
          snippet: item.snippet,
          displayUrl: item.displayUrl,
        });
      }
    }

    return {
      success: true,
      results,
      query,
      provider: 'Bing',
      totalResults: data.webPages?.totalEstimatedMatches || results.length,
    };

  } catch (error: any) {
    return {
      success: false,
      results: [],
      query,
      provider: 'Bing',
      error: `Bing search failed: ${error.response?.data?.message || error.message}`,
    };
  }
}

/**
 * Main search function with cascade fallback strategy
 */
export async function webSearch(
  query: string,
  maxResults: number = 10,
  preferredProvider?: string
): Promise<SearchResponse> {
  // Validate query
  if (!query || query.trim().length === 0) {
    return {
      success: false,
      results: [],
      query,
      provider: 'None',
      error: 'Search query is required',
    };
  }

  // Check for malicious patterns
  const suspiciousPatterns = [
    /script:/i,
    /javascript:/i,
    /data:/i,
    /vbscript:/i,
    /<script/i,
    /onclick/i,
    /onerror/i,
  ];

  if (suspiciousPatterns.some(pattern => pattern.test(query))) {
    return {
      success: false,
      results: [],
      query,
      provider: 'None',
      error: 'Query contains suspicious patterns',
    };
  }

  const fallbackStrategy = (process.env.EXA_SEARCH_FALLBACK_STRATEGY || 'cascade').toLowerCase();
  const trimmedQuery = query.trim();
  const clampedMaxResults = Math.max(1, Math.min(maxResults, 20)); // Limit between 1-20

  // 候補プロバイダー組み立て
  const googleOK = isGoogleConfigured();
  const bingOK = isBingConfigured();

  let providers: string[] = [];
  if (preferredProvider && preferredProvider !== 'auto' && SEARCH_PROVIDERS[preferredProvider]) {
    if (fallbackStrategy === 'strict') {
      const needsKey = preferredProvider === 'google' || preferredProvider === 'bing';
      const configured = preferredProvider === 'google' ? googleOK : preferredProvider === 'bing' ? bingOK : true;
      if (needsKey && !configured) {
        return {
          success: false,
          results: [],
          query: trimmedQuery,
          provider: preferredProvider,
          error: `${SEARCH_PROVIDERS[preferredProvider].name} not configured`,
          attempts: [{ provider: preferredProvider, status: 'fail', reason: 'not configured' }],
        };
      }
      providers = [preferredProvider];
    } else {
      const base = [preferredProvider, 'google', 'bing', 'duckduckgo'];
      const seen = new Set<string>();
      for (const p of base) {
        if (!SEARCH_PROVIDERS[p] || seen.has(p)) continue;
        if (p === 'google' && !googleOK) continue;
        if (p === 'bing' && !bingOK) continue;
        seen.add(p);
        providers.push(p);
      }
      if (!providers.includes('duckduckgo')) providers.push('duckduckgo');
    }
  } else {
    if (googleOK || bingOK) {
      const base = ['google', 'bing', 'duckduckgo'];
      providers = base.filter(p => p === 'duckduckgo' || (p === 'google' ? googleOK : p === 'bing' ? bingOK : true));
    } else {
      providers = ['duckduckgo'];
    }
    if (fallbackStrategy === 'strict') {
      providers = [providers[0]];
    }
  }

  const attempts: Array<{ provider: string; status: 'success' | 'fail'; reason?: string; results?: number }> = [];
  let lastError = '';
  let zeroResultSuccess: SearchResponse | null = null;

  for (const providerName of providers) {
    try {
      let searchResult: SearchResponse;
      switch (providerName) {
        case 'google':
          searchResult = await searchGoogle(trimmedQuery, clampedMaxResults);
          break;
        case 'bing':
          searchResult = await searchBing(trimmedQuery, clampedMaxResults);
          break;
        case 'duckduckgo':
          searchResult = await searchDuckDuckGo(trimmedQuery, clampedMaxResults);
          break;
        default:
          continue;
      }

      if (searchResult.success) {
        attempts.push({ provider: providerName, status: 'success', results: searchResult.results.length });
        if (searchResult.results.length > 0) {
          return { ...searchResult, attempts };
        } else {
          if (!zeroResultSuccess) zeroResultSuccess = { ...searchResult, attempts: [...attempts] };
          if (fallbackStrategy === 'strict') {
            return { ...searchResult, attempts };
          }
          continue;
        }
      } else {
        const reason = searchResult.error || 'unknown error';
        attempts.push({ provider: providerName, status: 'fail', reason });
        lastError = reason;
        if (fallbackStrategy === 'strict') {
          return { ...searchResult, attempts };
        }
        continue;
      }
    } catch (error: any) {
      const reason = `${providerName} provider failed: ${error.message || error}`;
      attempts.push({ provider: providerName, status: 'fail', reason });
      lastError = reason;
      if (fallbackStrategy === 'strict') {
        return {
          success: false,
          results: [],
          query: trimmedQuery,
          provider: providerName,
          error: reason,
          attempts,
        };
      }
      continue;
    }
  }

  if (zeroResultSuccess) {
    return { ...zeroResultSuccess, attempts };
  }

  const errorSummary = attempts
    .filter(a => a.status === 'fail')
    .map(a => `${a.provider}: ${a.reason}`)
    .join('; ');
  return {
    success: false,
    results: [],
    query: trimmedQuery,
    provider: 'All',
    error: errorSummary || lastError || 'All search providers failed',
    attempts,
  };
}

/**
 * Clean up resources
 */
export function cleanup(): void {
  rateLimitMap.clear();
}
