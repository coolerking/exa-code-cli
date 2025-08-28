import { BaseProvider, ProviderConfig, Message, ChatOptions, ChatResponse } from './base.js';
import { PROVIDER_MODELS, DEFAULT_MODELS } from './models.js';

// Dynamic import for OpenAI SDK (used for Ollama's OpenAI-compatible API)
async function createOllamaClient(options: { baseURL: string }): Promise<any> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const openaiModule = await dynamicImport('openai');
    const OpenAI = openaiModule.default;
    return new OpenAI({
      baseURL: options.baseURL,
      apiKey: 'ollama', // Required by SDK but not used by Ollama
    });
  } catch (error) {
    throw new Error('openai package is required but not installed. Please run: npm install openai');
  }
}

export class OllamaProvider extends BaseProvider {
  readonly name = 'ollama';
  readonly displayName = 'Ollama Local';
  readonly models = PROVIDER_MODELS.ollama;

  private client: any = null;

  getRequiredConfigFields(): string[] {
    return ['endpoint'];
  }

  validateConfig(config: Partial<ProviderConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.endpoint) {
      errors.push('Endpoint URL is required for Ollama provider');
    } else {
      // Basic URL validation
      try {
        new URL(config.endpoint);
      } catch {
        errors.push('Invalid endpoint URL format');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);
    
    // Ensure endpoint ends with /v1 for OpenAI compatibility
    let endpoint = config.endpoint!;
    if (!endpoint.endsWith('/v1')) {
      endpoint = endpoint.replace(/\/$/, '') + '/v1';
    }
    
    this.client = await createOllamaClient({
      baseURL: endpoint
    });
    
    console.debug('Ollama client initialized with endpoint:', endpoint);
  }

  checkCompatibility(model: string): { compatible: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check if model is in our supported list
    const supportedModelIds = this.models.map(m => m.id);
    if (!supportedModelIds.includes(model)) {
      issues.push(`Model ${model} is not in supported model list`);
    }
    
    return {
      compatible: issues.length === 0,
      issues
    };
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    if (!this.client || !this.config) {
      throw new Error('Ollama provider not initialized');
    }

    try {
      const model = options.model || this.config.model || DEFAULT_MODELS.ollama;
      const maxTokens = options.maxTokens || 4000;
      
      const requestParams: any = {
        model: model,
        messages: messages as any,
        tools: options.tools as any,
        tool_choice: options.toolChoice as any,
        temperature: options.temperature || 1,
        max_tokens: maxTokens,
        stream: false
      };
      
      const response = await this.client.chat.completions.create(requestParams);

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
        errorMessage = `Ollama API Error (${error.status}): ${error.message || 'Unknown error'}`;
        
        // For connection errors, provide specific guidance
        if (error.status === 404) {
          throw new Error(`${errorMessage}. Please check that Ollama is running and the endpoint URL is correct.`);
        }
      } else if (error instanceof Error) {
        errorMessage = `Error: ${error.message}`;
        
        // Handle connection refused errors
        if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
          throw new Error(`Cannot connect to Ollama server. Please check that Ollama is running at ${this.config.endpoint}`);
        }
      } else {
        errorMessage = `Error: ${String(error)}`;
      }
      
      throw new Error(errorMessage);
    }
  }
}