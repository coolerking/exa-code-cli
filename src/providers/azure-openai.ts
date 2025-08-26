import { BaseProvider, ProviderConfig, Message, ChatOptions, ChatResponse } from './base.js';
import { PROVIDER_MODELS, DEFAULT_MODELS } from './models.js';

// Dynamic import for OpenAI SDK (Azure OpenAI)
async function createAzureOpenAIClient(options: { apiKey: string; endpoint: string; apiVersion: string }): Promise<any> {
  try {
    const { AzureOpenAI } = await import('openai');
    return new AzureOpenAI(options);
  } catch (error) {
    throw new Error('openai package is required but not installed. Please run: npm install openai');
  }
}

export class AzureOpenAIProvider extends BaseProvider {
  readonly name = 'azure';
  readonly displayName = 'Azure OpenAI Service';
  readonly models = PROVIDER_MODELS.azure;

  private client: any = null;

  getRequiredConfigFields(): string[] {
    return ['apiKey', 'endpoint', 'deploymentName'];
  }

  validateConfig(config: Partial<ProviderConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.apiKey) {
      errors.push('API key is required for Azure OpenAI provider');
    }
    
    if (!config.endpoint) {
      errors.push('Endpoint URL is required for Azure OpenAI provider');
    }
    
    if (!config.deploymentName) {
      errors.push('Deployment name is required for Azure OpenAI provider');
    }
    
    // Validate endpoint format
    if (config.endpoint) {
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
    
    this.client = await createAzureOpenAIClient({
      apiKey: config.apiKey!,
      endpoint: config.endpoint!,
      apiVersion: config.apiVersion || '2024-10-21'
    });
    
    console.debug(`Azure OpenAI client initialized with endpoint: ${config.endpoint}`);
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    if (!this.client || !this.config) {
      throw new Error('Azure OpenAI provider not initialized');
    }

    if (!this.config.deploymentName) {
      throw new Error('Deployment name is required for Azure OpenAI');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.deploymentName, // Azure OpenAI uses deployment name as model
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
    } catch (error) {
      let errorMessage = 'Unknown error occurred';
      
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        errorMessage = `Azure OpenAI API Error (${apiError.status}): ${apiError.message || 'Unknown error'}`;
        
        // For 401 errors (invalid API key), provide specific guidance
        if (apiError.status === 401) {
          throw new Error(`${errorMessage}. Please check your Azure OpenAI API key and endpoint, and use /login azure to set valid credentials.`);
        }
        
        // For 404 errors (invalid deployment), provide specific guidance
        if (apiError.status === 404) {
          throw new Error(`${errorMessage}. Please check your deployment name "${this.config.deploymentName}" exists in your Azure OpenAI resource.`);
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