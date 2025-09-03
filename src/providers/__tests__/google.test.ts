import test from 'ava';
import { GoogleGeminiProvider } from '../google.js';

test('GoogleGeminiProvider - constructor', t => {
  const provider = new GoogleGeminiProvider();
  t.is(provider.name, 'google');
  t.is(provider.displayName, 'Google Gemini');
  t.true(Array.isArray(provider.models));
  t.true(provider.models.length >= 2);
});

test('GoogleGeminiProvider - validateConfig requires apiKey', t => {
  const provider = new GoogleGeminiProvider();
  const result = provider.validateConfig({});
  t.false(result.valid);
  t.true(result.errors.some(e => e.toLowerCase().includes('api key')));
});

