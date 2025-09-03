import test from 'ava';
import axios from 'axios';

// Import target after setting up test hooks to ensure env is read at call-time
import { webSearch } from '../../tools/web-utils.js';
import { webSearchTool } from '../../tools/tools.js';

type AxiosGet = (url: string, config?: any) => Promise<any>;

const originalEnv = { ...process.env };
let originalAxiosGet: AxiosGet;

test.before(() => {
  // Save original axios.get
  originalAxiosGet = (axios as any).get;
});

test.after.always(() => {
  // Restore axios.get and env
  (axios as any).get = originalAxiosGet;
  process.env = { ...originalEnv };
});

test.beforeEach(() => {
  // Reset env and axios.get before each test
  process.env = { ...originalEnv };
  delete process.env.EXA_SERP_API_KEY;
  delete process.env.EXA_GOOGLE_SEARCH_API_KEY;
  delete process.env.EXA_GOOGLE_SEARCH_ENGINE_ID;
  delete process.env.EXA_BING_SEARCH_API_KEY;
  process.env.EXA_SEARCH_FALLBACK_STRATEGY = 'cascade';
  (axios as any).get = originalAxiosGet;
});

function mockAxiosGet(handler: (url: string, config?: any) => any) {
  (axios as any).get = async (url: string, config?: any) => {
    return handler(url, config);
  };
}

function makeResponse(data: any) {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    config: {},
  };
}

test.serial('auto without API keys uses DuckDuckGo only', async t => {
  mockAxiosGet((url) => {
    if (url.includes('duckduckgo.com')) {
      return makeResponse({
        Results: [
          { FirstURL: 'https://example.com/a', Text: 'Result A' },
          { FirstURL: 'https://example.com/b', Text: 'Result B' },
        ],
      });
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearch('OpenAI API 最新情報');
  t.true(res.success);
  t.is(res.provider, 'DuckDuckGo');
  t.true(res.results.length > 0);
  t.truthy(res.attempts);
  t.is(res.attempts!.length, 1);
  t.is(res.attempts![0].provider, 'duckduckgo');
  t.is(res.attempts![0].status, 'success');
});

test.serial('strict with google preferred but not configured returns not configured error', async t => {
  process.env.EXA_SEARCH_FALLBACK_STRATEGY = 'strict';

  const res = await webSearch('query', 5, 'google');
  t.false(res.success);
  t.is(res.provider, 'google');
  t.regex(res.error || '', /not configured/);
  t.truthy(res.attempts);
  t.is(res.attempts!.length, 1);
  t.is(res.attempts![0].provider, 'google');
  t.is(res.attempts![0].status, 'fail');
});

test.serial('cascade with google configured returns google results and does not call DDG', async t => {
  process.env.EXA_GOOGLE_SEARCH_API_KEY = 'key';
  process.env.EXA_GOOGLE_SEARCH_ENGINE_ID = 'engine';
  // bing not configured

  let ddgCalled = 0;
  mockAxiosGet((url, config) => {
    if (url.includes('googleapis.com/customsearch')) {
      return makeResponse({
        items: [
          { title: 'G A', link: 'https://google.example/a', snippet: 'ga', displayLink: 'google.example' },
          { title: 'G B', link: 'https://google.example/b', snippet: 'gb', displayLink: 'google.example' },
        ],
        searchInformation: { totalResults: '2' },
      });
    }
    if (url.includes('duckduckgo.com')) {
      ddgCalled++;
      t.fail('DuckDuckGo should not be called after Google success');
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearch('OpenAI');
  t.true(res.success);
  t.is(res.provider, 'Google');
  t.is(res.results.length, 2);
  t.truthy(res.attempts);
  t.is(res.attempts![0].provider, 'google');
  t.is(res.attempts![0].status, 'success');
  t.is(ddgCalled, 0);
});

test.serial('cascade: google 0 results then DDG success', async t => {
  process.env.EXA_GOOGLE_SEARCH_API_KEY = 'key';
  process.env.EXA_GOOGLE_SEARCH_ENGINE_ID = 'engine';

  mockAxiosGet((url) => {
    if (url.includes('googleapis.com/customsearch')) {
      return makeResponse({ items: [], searchInformation: { totalResults: '0' } });
    }
    if (url.includes('duckduckgo.com')) {
      return makeResponse({ Results: [{ FirstURL: 'https://example.com/x', Text: 'X' }] });
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearch('OpenAI');
  t.true(res.success);
  t.is(res.provider, 'DuckDuckGo');
  t.is(res.results.length, 1);
  t.truthy(res.attempts);
  t.is(res.attempts!.length, 2);
  t.is(res.attempts![0].provider, 'google');
  t.is(res.attempts![1].provider, 'duckduckgo');
});

test.serial('strict: DDG 0 results is success with empty list', async t => {
  process.env.EXA_SEARCH_FALLBACK_STRATEGY = 'strict';
  mockAxiosGet((url) => {
    if (url.includes('duckduckgo.com')) {
      return makeResponse({ Results: [] });
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearch('no hits expected');
  t.true(res.success);
  t.is(res.provider, 'DuckDuckGo');
  t.is(res.results.length, 0);
});

test.serial('error aggregation across providers', async t => {
  process.env.EXA_GOOGLE_SEARCH_API_KEY = 'key';
  process.env.EXA_GOOGLE_SEARCH_ENGINE_ID = 'engine';
  process.env.EXA_BING_SEARCH_API_KEY = 'key2';

  mockAxiosGet((url) => {
    if (url.includes('googleapis.com/customsearch')) {
      throw new Error('google outage');
    }
    if (url.includes('bing.microsoft.com')) {
      throw new Error('bing outage');
    }
    if (url.includes('duckduckgo.com')) {
      throw new Error('ddg outage');
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearch('query');
  t.false(res.success);
  t.truthy(res.error);
  t.regex(res.error || '', /google/i);
  t.regex(res.error || '', /bing/i);
  t.regex(res.error || '', /duckduckgo/i);
  t.truthy(res.attempts);
  t.is(res.attempts!.length, 3);
});

test.serial('tools.webSearchTool propagates attempts metadata', async t => {
  mockAxiosGet((url) => {
    if (url.includes('duckduckgo.com')) {
      return makeResponse({ Results: [{ FirstURL: 'https://example.com', Text: 'OK' }] });
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearchTool('OpenAI API 最新情報', 3, 'duckduckgo');
  t.true(res.success);
  t.truthy(res.content);
  t.truthy((res.content as any)?.metadata?.attempts);
});

// SerpApi テストケース
test.serial('SerpApi: success with configured API key', async t => {
  process.env.EXA_SERP_API_KEY = 'test_api_key';
  
  mockAxiosGet((url, config) => {
    if (url.includes('serpapi.com/search')) {
      t.is(config.params.api_key, 'test_api_key');
      t.is(config.params.engine, 'google');
      t.is(config.params.q, 'OpenAI API');
      return makeResponse({
        search_metadata: { status: 'Success', id: 'test123' },
        search_parameters: { engine: 'google', q: 'OpenAI API' },
        organic_results: [
          {
            position: 1,
            title: 'OpenAI API Documentation',
            link: 'https://openai.com/api',
            displayed_link: 'openai.com',
            snippet: 'Official OpenAI API documentation'
          },
          {
            position: 2,
            title: 'OpenAI API Pricing',
            link: 'https://openai.com/pricing',
            displayed_link: 'openai.com',
            snippet: 'Pricing information for OpenAI API'
          }
        ],
        search_information: { total_results: 2 }
      });
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearch('OpenAI API', 10, 'serpapi');
  t.true(res.success);
  t.is(res.provider, 'SerpApi');
  t.is(res.results.length, 2);
  t.is(res.results[0].title, 'OpenAI API Documentation');
  t.is(res.results[0].url, 'https://openai.com/api');
  t.is(res.results[0].snippet, 'Official OpenAI API documentation');
  t.is(res.results[0].displayUrl, 'openai.com');
});

test.serial('SerpApi: API key not configured error', async t => {
  // EXA_SERP_API_KEY is deleted in beforeEach
  
  const res = await webSearch('query', 5, 'serpapi');
  t.false(res.success);
  t.is(res.provider, 'SerpApi');
  t.regex(res.error || '', /API key not configured/);
});

test.serial('SerpApi: API error response handling', async t => {
  process.env.EXA_SERP_API_KEY = 'invalid_key';
  
  mockAxiosGet((url) => {
    if (url.includes('serpapi.com/search')) {
      return makeResponse({
        search_metadata: { status: 'Error', id: 'error123' },
        error: 'Invalid API key provided'
      });
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearch('query', 5, 'serpapi');
  t.false(res.success);
  t.is(res.provider, 'SerpApi');
  t.regex(res.error || '', /SerpApi error: Invalid API key provided/);
});

test.serial('SerpApi: HTTP 401 authentication error', async t => {
  process.env.EXA_SERP_API_KEY = 'invalid_key';
  
  mockAxiosGet((url) => {
    if (url.includes('serpapi.com/search')) {
      const error: any = new Error('Request failed with status code 401');
      error.response = {
        status: 401,
        data: { error: 'Authentication failed' }
      };
      throw error;
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearch('query', 5, 'serpapi');
  t.false(res.success);
  t.is(res.provider, 'SerpApi');
  t.regex(res.error || '', /SerpApi authentication failed: Invalid API key/);
});

test.serial('SerpApi: HTTP 429 rate limit error', async t => {
  process.env.EXA_SERP_API_KEY = 'test_key';
  
  mockAxiosGet((url) => {
    if (url.includes('serpapi.com/search')) {
      const error: any = new Error('Request failed with status code 429');
      error.response = { status: 429 };
      throw error;
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearch('query', 5, 'serpapi');
  t.false(res.success);
  t.is(res.provider, 'SerpApi');
  t.regex(res.error || '', /SerpApi rate limit exceeded/);
});

test.serial('SerpApi: empty results handling', async t => {
  process.env.EXA_SERP_API_KEY = 'test_key';
  
  mockAxiosGet((url) => {
    if (url.includes('serpapi.com/search')) {
      return makeResponse({
        search_metadata: { status: 'Success', id: 'empty123' },
        organic_results: [],
        search_information: { total_results: 0 }
      });
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearch('no results query', 5, 'serpapi');
  t.true(res.success);
  t.is(res.provider, 'SerpApi');
  t.is(res.results.length, 0);
});

test.serial('SerpApi: prioritized in auto mode when configured', async t => {
  process.env.EXA_SERP_API_KEY = 'test_key';
  // Google not configured
  
  let serpApiCalled = false;
  mockAxiosGet((url) => {
    if (url.includes('serpapi.com/search')) {
      serpApiCalled = true;
      return makeResponse({
        search_metadata: { status: 'Success', id: 'priority123' },
        organic_results: [
          { title: 'SerpApi Result', link: 'https://example.com', snippet: 'Test' }
        ]
      });
    }
    if (url.includes('duckduckgo.com')) {
      t.fail('DuckDuckGo should not be called after SerpApi success');
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearch('test query'); // auto mode
  t.true(res.success);
  t.is(res.provider, 'SerpApi');
  t.true(serpApiCalled);
  t.is(res.results.length, 1);
});

test.serial('SerpApi: cascade fallback to next provider on failure', async t => {
  process.env.EXA_SERP_API_KEY = 'test_key';
  process.env.EXA_SEARCH_FALLBACK_STRATEGY = 'cascade';
  
  mockAxiosGet((url) => {
    if (url.includes('serpapi.com/search')) {
      throw new Error('SerpApi service unavailable');
    }
    if (url.includes('duckduckgo.com')) {
      return makeResponse({
        Results: [{ FirstURL: 'https://fallback.com', Text: 'Fallback result' }]
      });
    }
    t.fail(`Unexpected provider called: ${url}`);
  });

  const res = await webSearch('test query');
  t.true(res.success);
  t.is(res.provider, 'DuckDuckGo');
  t.is(res.results.length, 1);
  t.truthy(res.attempts);
  t.is(res.attempts!.length, 2);
  t.is(res.attempts![0].provider, 'serpapi');
  t.is(res.attempts![0].status, 'fail');
  t.is(res.attempts![1].provider, 'duckduckgo');
  t.is(res.attempts![1].status, 'success');
});
