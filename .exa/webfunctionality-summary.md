# exa-code-cli WebFetch & WebSearch Functionality Summary

## Overview
The exa-code-cli project has been enhanced with comprehensive WebFetch and WebSearch capabilities, providing real-time web content access with robust security measures.

## New Files Added

### 1. `/src/tools/web-utils.ts` (800+ lines)
**Purpose**: Core web utilities for URL validation, content fetching, and search functionality

**Key Components**:
- **Configuration**: `WEB_CONFIG` with timeouts, content limits, allowed protocols
- **Security**: IP blocking patterns, domain blacklisting, rate limiting
- **URL Validation**: `validateUrl()` with comprehensive security checks  
- **Content Fetching**: `secureHttpFetch()` with security and rate limiting
- **HTML Processing**: `processHtmlToMarkdown()` using JSDOM and Turndown
- **Search Providers**: Support for DuckDuckGo, Google, Bing with cascade fallback
- **Rate Limiting**: Per-domain and global request limits with cleanup

**Security Features**:
- Blocks private IP ranges (127.x, 10.x, 192.168.x, 172.16-31.x)
- Domain blacklist (localhost, metadata.google.internal, AWS metadata)
- Rate limiting: 10 requests/minute, 3 per domain
- Request timeout: 30 seconds
- Content size limit: 1MB

### 2. `/src/tools/prompt-templates.ts` (300+ lines)  
**Purpose**: AI prompt templates for web content analysis

**Templates Available**:
- **summarize**: Create concise summaries of web content
- **analyze**: Detailed analysis for insights and patterns
- **extract**: Extract specific information from content
- **compare**: Compare content or evaluate against criteria
- **research**: Research assistance with context analysis
- **fact_check**: Verify claims and identify sources
- **translate_intent**: Understand user intent for content processing

**Template Structure**:
```typescript
interface PromptTemplate {
  name: string;
  description: string;
  template: string;
  variables: string[];
}
```

## Updated Files

### 3. `/src/tools/tools.ts`
**New Functions**:
- `webFetch(url, prompt, timeout?)`: Fetch and analyze web content
- `webSearchTool(query, maxResults?, searchProvider?)`: Search web with multiple providers

**Integration**:
- Added to `tools` export object as `web_fetch` and `web_search`
- Integrated with validation and error handling
- Uses web utilities and prompt templates

### 4. `/src/tools/tool-schemas.ts`
**New Schemas**:
- `WEB_FETCH_SCHEMA`: URL, prompt, optional timeout parameters
- `WEB_SEARCH_SCHEMA`: Query, max results, optional search provider

**Security Classifications**:
- `web_search`: Added to `SAFE_TOOLS` (auto-executable)
- `web_fetch`: Added to `APPROVAL_REQUIRED_TOOLS` (requires user approval)

### 5. `/src/tools/validators.ts`
**New Validators**:
- `validateWebFetchParameters()`: URL format, prompt validation, timeout limits
- `validateWebSearchParameters()`: Query validation, result limits, provider validation

### 6. `/src/core/agent.ts`
**Integration**: Web tools registered with agent system for execution

## API Reference

### WebFetch Tool
```json
{
  "name": "web_fetch",
  "parameters": {
    "url": "https://example.com/page",
    "prompt": "Summarize the main points",
    "timeout": 30000
  }
}
```

**Features**:
- Converts HTML to clean markdown
- Applies AI prompt templates for analysis
- Security validation and rate limiting
- Configurable timeout (5-60 seconds)

### WebSearch Tool  
```json
{
  "name": "web_search",
  "parameters": {
    "query": "JavaScript async/await tutorial",
    "max_results": 10,
    "search_provider": "google"
  }
}
```

**Features**:
- Multi-provider cascade: Google → Bing → DuckDuckGo  
- Structured results: title, URL, snippet, provider
- Configurable result limits (1-50)
- Provider selection or automatic fallback

## Search Providers

### DuckDuckGo
- Primary provider for privacy
- HTML scraping with cheerio
- Selector: `.react-results--main .result`

### Google  
- Secondary provider for comprehensive results
- HTML scraping with security headers
- Selector: `.MjjYud`

### Bing
- Fallback provider  
- HTML scraping with cheerio
- Selector: `.b_algo`

## Security Implementation

### IP Address Validation
- Resolves hostnames to IP addresses
- Blocks private networks and localhost
- Prevents SSRF attacks

### Rate Limiting
- Global: 10 requests per minute
- Per-domain: 3 requests per minute  
- Automatic cleanup of expired entries

### Content Filtering
- Maximum content size: 1MB
- Request timeout: 30 seconds
- Allowed protocols: HTTP, HTTPS only
- User agent identification

## Error Handling
- Comprehensive validation with detailed error messages
- Graceful fallback between search providers
- Rate limiting with clear error responses
- Network timeout handling
- Invalid content type handling

## Integration Points
- Agent system integration for tool execution
- Validation system for parameter checking
- Prompt template system for content analysis
- Security system for safe web access
- Rate limiting system for abuse prevention

## Usage Examples

### Fetch and Analyze Web Content
```typescript
const result = await webFetch(
  "https://example.com/article",
  "Summarize the key technical concepts"
);
```

### Search for Information
```typescript  
const results = await webSearchTool(
  "Next.js 14 new features",
  5,
  "google"
);
```

This comprehensive web functionality transforms exa-code-cli into a powerful tool for real-time information access while maintaining security and performance standards.