import * as path from 'path';
import { validateUrl, checkRateLimit } from './web-utils.js';

// Track which files have been read in the current session
let readFiles: Set<string> | null = null;

export function setReadFilesTracker(tracker: Set<string>) {
  readFiles = tracker;
}

// Check if a file has been read before allowing edits
export function validateReadBeforeEdit(filePath: string): boolean {
  if (!readFiles) {
    return true; // No tracking enabled, allow edit
  }
  
  const resolvedPath = path.resolve(filePath);
  return readFiles.has(resolvedPath);
}

export function getReadBeforeEditError(filePath: string): string {
  return `File must be read before editing. Use read_file tool first: ${filePath}`;
}

// Web-specific validation functions
export interface WebValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateWebFetchParameters(url: string, prompt: string, timeout?: number): WebValidationResult {
  const errors: string[] = [];

  // URL validation
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid) {
    errors.push(`Invalid URL: ${urlValidation.errors.join(', ')}`);
  }

  // Prompt validation
  if (!prompt || prompt.trim().length === 0) {
    errors.push('Prompt is required and cannot be empty');
  }

  if (prompt.length > 10000) {
    errors.push('Prompt too long (max 10,000 characters)');
  }

  // Timeout validation
  if (timeout !== undefined) {
    if (timeout < 1000 || timeout > 60000) {
      errors.push('Timeout must be between 1,000 and 60,000 milliseconds');
    }
  }

  // Rate limiting check
  if (urlValidation.valid && urlValidation.normalizedUrl) {
    const rateLimitResult = checkRateLimit(urlValidation.normalizedUrl);
    if (!rateLimitResult.allowed) {
      errors.push(`Rate limit exceeded: ${rateLimitResult.error}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateWebSearchParameters(query: string, maxResults?: number, searchProvider?: string): WebValidationResult {
  const errors: string[] = [];

  // Query validation
  if (!query || query.trim().length === 0) {
    errors.push('Search query is required and cannot be empty');
  }

  if (query.length > 1000) {
    errors.push('Search query too long (max 1,000 characters)');
  }

  // Check for suspicious or harmful queries
  const suspiciousPatterns = [
    /site:localhost/i,
    /site:127\.0\.0\.1/i,
    /site:192\.168\./i,
    /site:10\./i,
    /intitle:index\.of/i,
    /filetype:sql/i,
    /inurl:admin/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(query)) {
      errors.push('Search query contains potentially harmful patterns');
      break;
    }
  }

  // Max results validation
  if (maxResults !== undefined) {
    if (maxResults < 1 || maxResults > 20) {
      errors.push('Max results must be between 1 and 20');
    }
  }

  // Search provider validation
  if (searchProvider !== undefined) {
    const allowedProviders = ['auto', 'duckduckgo', 'google', 'bing'];
    if (!allowedProviders.includes(searchProvider.toLowerCase())) {
      errors.push(`Invalid search provider: ${searchProvider}. Allowed: ${allowedProviders.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}