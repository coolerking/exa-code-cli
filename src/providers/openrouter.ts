import { BaseProvider, ProviderConfig, Message, ChatOptions, ChatResponse } from './base.js';
import { PROVIDER_MODELS, DEFAULT_MODELS } from './models.js';

// Dynamic import for OpenAI SDK (used by OpenRouter)
async function createOpenRouterClient(options: { apiKey: string; baseURL: string; defaultHeaders: any }): Promise<any> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const openaiModule = await dynamicImport('openai');
    const OpenAI = openaiModule.default;
    return new OpenAI(options);
  } catch (error) {
    throw new Error('openai package is required but not installed. Please run: npm install openai');
  }
}

export class OpenRouterProvider extends BaseProvider {
  readonly name = 'openrouter';
  readonly displayName = 'OpenRouter API';
  readonly models = PROVIDER_MODELS.openrouter;

  private client: any = null;

  getRequiredConfigFields(): string[] {
    return ['apiKey'];
  }

  validateConfig(config: Partial<ProviderConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.apiKey) {
      errors.push('API key is required for OpenRouter provider');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);
    
    this.client = await createOpenRouterClient({
      apiKey: config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/build-with-groq/groq-code-cli', // Optional: for OpenRouter analytics
        'X-Title': 'Groq Code CLI' // Optional: for OpenRouter analytics
      }
    });
    
    console.debug('OpenRouter client initialized');
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    if (!this.client || !this.config) {
      throw new Error('OpenRouter provider not initialized');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.config.model || DEFAULT_MODELS.openrouter,
        messages: messages as any,
        tools: options.tools as any,
        tool_choice: options.toolChoice as any,
        temperature: options.temperature || 1,
        max_tokens: options.maxTokens || 4000,
        stream: false
      });

      const message = response.choices[0].message;

      return {
        content: message.content || '',
        toolCalls: message.tool_calls,
        usage: response.usage ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens
        } : undefined,
        finishReason: response.choices[0].finish_reason
      };
    } catch (error: any) {
      let errorMessage = 'Unknown error occurred';
      
      if (error && typeof error === 'object' && 'status' in error) {
        errorMessage = `OpenRouter API Error (${error.status}): ${error.message || 'Unknown error'}`;
        
        // For 401 errors (invalid API key), provide specific guidance
        if (error.status === 401) {
          throw new Error(`${errorMessage}. Please check your OpenRouter API key and use /login openrouter to set a valid key.`);
        }
        
        // For 402 errors (insufficient credits), provide specific guidance
        if (error.status === 402) {
          throw new Error(`${errorMessage}. Please check your OpenRouter account balance and add credits.`);
        }
      } else if (error instanceof Error) {
        errorMessage = `Error: ${error.message}`;
      } else {
        errorMessage = `Error: ${String(error)}`;
      }
      
      throw new Error(errorMessage);
    }
  }
}