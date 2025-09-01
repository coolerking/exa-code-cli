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
