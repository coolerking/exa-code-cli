import { IProvider } from './base.js';

export type ProviderType = 'groq' | 'openai' | 'azure' | 'openrouter' | 'ollama' | 'anthropic';

export class ProviderFactory {
  private static providers: Map<ProviderType, () => Promise<IProvider>> = new Map();
  private static instances: Map<ProviderType, IProvider> = new Map();
  
  static registerProvider(type: ProviderType, factory: () => Promise<IProvider>): void {
    this.providers.set(type, factory);
  }
  
  static async createProvider(type: ProviderType): Promise<IProvider> {
    // Return existing instance if already created
    if (this.instances.has(type)) {
      return this.instances.get(type)!;
    }
    
    const factory = this.providers.get(type);
    if (!factory) {
      throw new Error(`Unknown provider type: ${type}`);
    }
    
    const provider = await factory();
    this.instances.set(type, provider);
    return provider;
  }
  
  static getAvailableProviders(): ProviderType[] {
    return Array.from(this.providers.keys());
  }
  
  static async getAllProviders(): Promise<Map<ProviderType, IProvider>> {
    const providers = new Map<ProviderType, IProvider>();
    
    for (const [type] of this.providers) {
      const provider = await this.createProvider(type);
      providers.set(type, provider);
    }
    
    return providers;
  }
  
  static clearInstances(): void {
    this.instances.clear();
  }
}

// Auto-register providers when they are imported
export async function registerAllProviders(): Promise<void> {
  // Groq provider (will be implemented)
  ProviderFactory.registerProvider('groq', async () => {
    const { GroqProvider } = await import('./groq.js');
    return new GroqProvider();
  });
  
  // OpenAI provider (will be implemented)
  ProviderFactory.registerProvider('openai', async () => {
    const { OpenAIProvider } = await import('./openai.js');
    return new OpenAIProvider();
  });
  
  // Azure OpenAI provider (will be implemented)
  ProviderFactory.registerProvider('azure', async () => {
    const { AzureOpenAIProvider } = await import('./azure-openai.js');
    return new AzureOpenAIProvider();
  });
  
  // OpenRouter provider (will be implemented)
  ProviderFactory.registerProvider('openrouter', async () => {
    const { OpenRouterProvider } = await import('./openrouter.js');
    return new OpenRouterProvider();
  });
  
  // Ollama provider
  ProviderFactory.registerProvider('ollama', async () => {
    const { OllamaProvider } = await import('./ollama.js');
    return new OllamaProvider();
  });
  
  // Anthropic provider
  ProviderFactory.registerProvider('anthropic', async () => {
    const { AnthropicProvider } = await import('./anthropic.js');
    return new AnthropicProvider();
  });
}