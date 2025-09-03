import { BaseProvider, ProviderConfig, Message, ChatOptions, ChatResponse } from './base.js';
import { PROVIDER_MODELS, DEFAULT_MODELS } from './models.js';

type GoogleClient = any;

async function createGoogleClient(apiKey: string): Promise<GoogleClient> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const mod = await dynamicImport('@google/generative-ai');
    const GoogleGenerativeAI = mod.GoogleGenerativeAI || (mod as any).default;
    return new GoogleGenerativeAI(apiKey);
  } catch (error) {
    throw new Error('@google/generative-ai package is required but not installed. Please run: npm install @google/generative-ai');
  }
}

function mapMessagesToGeminiContents(messages: Message[]): any[] {
  const contents: any[] = [];
  for (const m of messages) {
    // Map roles: 'assistant' -> 'model', 'user' -> 'user'.
    // For 'system' and 'tool', include as 'user' text notes to preserve context.
    let role: 'user' | 'model' = 'user';
    if (m.role === 'assistant') role = 'model';
    else role = 'user';

    const text = m.content || '';
    if (text.trim().length === 0) continue;
    contents.push({
      role,
      parts: [{ text }]
    });
  }
  return contents;
}

export class GoogleGeminiProvider extends BaseProvider {
  readonly name = 'google';
  readonly displayName = 'Google Gemini';
  readonly models = PROVIDER_MODELS.google;

  private client: GoogleClient | null = null;

  getRequiredConfigFields(): string[] {
    return ['apiKey'];
  }

  validateConfig(config: Partial<ProviderConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!config.apiKey) {
      errors.push('API key is required for Google Gemini provider');
    }
    return { valid: errors.length === 0, errors };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);
    this.client = await createGoogleClient(config.apiKey);
    console.debug('Google Gemini client initialized');
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    if (!this.client || !this.config) {
      throw new Error('Google Gemini provider not initialized');
    }

    try {
      const modelId = options.model || this.config.model || DEFAULT_MODELS.google;
      const generativeModel = this.client.getGenerativeModel({ model: modelId });

      const contents = mapMessagesToGeminiContents(messages);

      const generationConfig: any = {
        temperature: options.temperature ?? 1,
        maxOutputTokens: options.maxTokens ?? 4000,
      };

      const result = await generativeModel.generateContent({
        contents,
        generationConfig
      });

      const response = result.response;
      const text = typeof response?.text === 'function' ? response.text() : '';
      const usage = (response as any)?.usageMetadata;
      const candidates = (response as any)?.candidates || [];
      const finishReason = candidates[0]?.finishReason;

      return {
        content: text || '',
        toolCalls: undefined, // Tool/function calling not yet mapped for Gemini
        usage: usage ? {
          prompt_tokens: usage.promptTokenCount || usage.inputTokens || 0,
          completion_tokens: usage.candidatesTokenCount || usage.outputTokens || 0,
          total_tokens: usage.totalTokenCount || (usage.inputTokens || 0) + (usage.outputTokens || 0)
        } : undefined,
        finishReason
      };
    } catch (error: any) {
      let message = 'Unknown error occurred';
      if (error && typeof error === 'object') {
        if ('status' in error) {
          message = `Google Gemini API Error (${(error as any).status}): ${error.message || 'Unknown error'}`;
        } else if (error.message) {
          message = `Error: ${error.message}`;
        } else {
          message = `Error: ${String(error)}`;
        }
      }
      throw new Error(message);
    }
  }
}

