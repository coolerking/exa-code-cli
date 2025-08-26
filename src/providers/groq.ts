import { BaseProvider, ProviderConfig, Message, ChatOptions, ChatResponse } from './base.js';
import { PROVIDER_MODELS, DEFAULT_MODELS } from './models.js';
import { getProxyAgent, getProxyInfo } from '../utils/proxy-config.js';

// Import types only to avoid runtime dependency errors
interface GroqClientOptions {
  apiKey: string;
  httpAgent?: any;
}

interface GroqClient {
  chat: {
    completions: {
      create(params: any): Promise<any>;
    };
  };
}

// Dynamic import for Groq SDK
async function createGroqClient(options: GroqClientOptions): Promise<GroqClient> {
  try {
    const Groq = await import('groq-sdk').then(m => m.default);
    return new Groq(options);
  } catch (error) {
    throw new Error('groq-sdk package is required but not installed. Please run: npm install groq-sdk');
  }
}

export class GroqProvider extends BaseProvider {
  readonly name = 'groq';
  readonly displayName = 'Groq Cloud';
  readonly models = PROVIDER_MODELS.groq;

  private client: GroqClient | null = null;
  private requestCount: number = 0;

  getRequiredConfigFields(): string[] {
    return ['apiKey'];
  }

  validateConfig(config: Partial<ProviderConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.apiKey) {
      errors.push('API key is required for Groq provider');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);
    
    // Get proxy configuration
    const proxyAgent = getProxyAgent();
    const proxyInfo = getProxyInfo();
    
    if (proxyInfo.enabled) {
      console.debug(`Using ${proxyInfo.type} proxy: ${proxyInfo.url}`);
    }
    
    // Initialize Groq client with proxy if available
    const clientOptions: GroqClientOptions = { apiKey: config.apiKey };
    if (proxyAgent) {
      clientOptions.httpAgent = proxyAgent;
    }
    
    this.client = await createGroqClient(clientOptions);
    console.debug('Groq client initialized with provided API key' + (proxyInfo.enabled ? ' and proxy' : ''));
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    if (!this.client || !this.config) {
      throw new Error('Groq provider not initialized');
    }

    try {
      this.requestCount++;
      
      const response = await this.client.chat.completions.create({
        model: options.model || this.config.model || DEFAULT_MODELS.groq,
        messages: messages as any,
        tools: options.tools,
        tool_choice: options.toolChoice as any,
        temperature: options.temperature || 1,
        max_tokens: options.maxTokens || 8000,
        stream: false
      });

      const message = response.choices[0].message;
      const reasoning = (message as any).reasoning;

      return {
        content: message.content || '',
        toolCalls: message.tool_calls,
        usage: response.usage ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
          total_time: response.usage.total_time
        } : undefined,
        reasoning,
        finishReason: response.choices[0].finish_reason
      };
    } catch (error) {
      let errorMessage = 'Unknown error occurred';
      let is401Error = false;
      
      if (error instanceof Error) {
        // Check if it's an API error with more details
        if ('status' in error && 'error' in error) {
          const apiError = error as any;
          is401Error = apiError.status === 401;
          if (apiError.error?.error?.message) {
            errorMessage = `API Error (${apiError.status}): ${apiError.error.error.message}`;
            if (apiError.error.error.code) {
              errorMessage += ` (Code: ${apiError.error.error.code})`;
            }
          } else {
            errorMessage = `API Error (${apiError.status}): ${error.message}`;
          }
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      } else {
        errorMessage = `Error: ${String(error)}`;
      }
      
      // For 401 errors (invalid API key), don't retry - terminate immediately
      if (is401Error) {
        throw new Error(`${errorMessage}. Please check your API key and use /login to set a valid key.`);
      }
      
      throw new Error(errorMessage);
    }
  }
}