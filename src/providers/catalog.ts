import { ModelInfo } from './base.js';
import { ProviderFactory, ProviderType, registerAllProviders } from './factory.js';
import { DEFAULT_MODELS } from './models.js';

export interface ProviderCatalogEntry {
  id: ProviderType;
  displayName: string;
  models: ModelInfo[];
  defaultModel: string;
}

export async function getProviderCatalog(): Promise<ProviderCatalogEntry[]> {
  await registerAllProviders();

  const providers = ProviderFactory.getAvailableProviders().sort((a, b) => a.localeCompare(b));
  const catalog: ProviderCatalogEntry[] = [];

  for (const providerId of providers) {
    const provider = await ProviderFactory.createProvider(providerId);
    catalog.push({
      id: providerId,
      displayName: provider.displayName,
      models: provider.models,
      defaultModel: DEFAULT_MODELS[providerId],
    });
  }

  return catalog;
}

export async function formatProvidersList(): Promise<string> {
  const catalog = await getProviderCatalog();
  const lines = ['Available AI providers:'];

  for (const provider of catalog) {
    lines.push(`- ${provider.id} (${provider.displayName})`);
  }

  return lines.join('\n');
}

export async function formatModelsList(providerFilter?: string): Promise<string> {
  const catalog = await getProviderCatalog();
  const normalizedFilter = providerFilter?.trim().toLowerCase();
  const filteredCatalog = normalizedFilter
    ? catalog.filter(provider => provider.id === normalizedFilter)
    : catalog;

  if (filteredCatalog.length === 0) {
    const availableProviders = catalog.map(provider => provider.id).join(', ');
    throw new Error(
      `Unknown provider: ${providerFilter}. Available providers: ${availableProviders}`
    );
  }

  const lines: string[] = ['Available AI models:'];

  for (const provider of filteredCatalog) {
    lines.push('');
    lines.push(`${provider.id} (${provider.displayName}):`);

    for (const model of provider.models) {
      const defaultLabel = model.id === provider.defaultModel ? ' [default]' : '';
      lines.push(`- ${model.id}${defaultLabel}`);
    }
  }

  return lines.join('\n');
}
