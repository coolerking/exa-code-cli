import test from 'ava';
import { formatModelsList, formatProvidersList, getProviderCatalog } from '../catalog.js';
import { DEFAULT_MODELS, PROVIDER_MODELS } from '../models.js';

test('getProviderCatalog includes all configured providers', async t => {
  const catalog = await getProviderCatalog();
  const providerIds = catalog.map(provider => provider.id).sort();
  const expectedProviderIds = Object.keys(PROVIDER_MODELS).sort();

  t.deepEqual(providerIds, expectedProviderIds);
});

test('formatProvidersList prints all providers', async t => {
  const output = await formatProvidersList();

  for (const providerId of Object.keys(PROVIDER_MODELS)) {
    t.true(output.includes(`- ${providerId} (`));
  }
});

test('formatModelsList prints all models for selected provider', async t => {
  const output = await formatModelsList('openai');

  for (const model of PROVIDER_MODELS.openai) {
    t.true(output.includes(`- ${model.id}`));
  }
});

test('formatModelsList throws for unknown provider', async t => {
  await t.throwsAsync(formatModelsList('invalid-provider'), {
    message: /Unknown provider: invalid-provider/,
  });
});

test('default model exists in each provider model list', t => {
  for (const providerId of Object.keys(PROVIDER_MODELS) as Array<keyof typeof PROVIDER_MODELS>) {
    const modelIds = PROVIDER_MODELS[providerId].map(model => model.id);
    t.true(
      modelIds.includes(DEFAULT_MODELS[providerId]),
      `Default model for ${providerId} should exist in PROVIDER_MODELS`
    );
  }
});
