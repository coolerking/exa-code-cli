import { BaseProvider, ProviderConfig, Message, ChatOptions, ChatResponse } from './base.js';
import { PROVIDER_MODELS, DEFAULT_MODELS } from './models.js';
import { getModelParameterConfig, validateModelParameters } from './model-params.js';

// Dynamic import for OpenAI SDK
async function createOpenAIClient(options: { apiKey: string }): Promise<any> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const openaiModule = await dynamicImport('openai');
    const OpenAI = openaiModule.default;
    return new OpenAI(options);
  } catch (error) {
    throw new Error('openai package is required but not installed. Please run: npm install openai');
  }
}

export class OpenAIProvider extends BaseProvider {
  readonly name = 'openai';
  readonly displayName = 'OpenAI API';
  readonly models = PROVIDER_MODELS.openai;

  private client: any = null;

  getRequiredConfigFields(): string[] {
    return ['apiKey'];
  }

  validateConfig(config: Partial<ProviderConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.apiKey) {
      errors.push('API key is required for OpenAI provider');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);
    
    this.client = await createOpenAIClient({
      apiKey: config.apiKey
    });
    
    console.debug('OpenAI client initialized');
  }

  checkCompatibility(model: string): { compatible: boolean; issues: string[] } {
    const modelConfig = getModelParameterConfig(model);
    const issues: string[] = [];
    
    // Check if model is in our supported list
    const supportedModelIds = this.models.map(m => m.id);
    if (!supportedModelIds.includes(model)) {
      issues.push(`Model ${model} is not in supported model list`);
    }
    
    // Check parameter compatibility
    const testParams: any = {
      model: model,
      messages: [],
      temperature: 1,
      stream: false
    };
    
    // Add appropriate token parameter based on model
    if (modelConfig.useMaxCompletionTokens) {
      testParams.max_completion_tokens = 1000;
    } else {
      testParams.max_tokens = 1000;
    }
    
    const validation = validateModelParameters(model, testParams);
    if (!validation.valid) {
      issues.push(...validation.errors);
    }
    
    return {
      compatible: issues.length === 0,
      issues
    };
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    if (!this.client || !this.config) {
      throw new Error('OpenAI provider not initialized');
    }

    try {
      const model = options.model || this.config.model || DEFAULT_MODELS.openai;
      const maxTokens = options.maxTokens || 4000;
      
      // Get model parameter configuration
      const modelConfig = getModelParameterConfig(model);
      
      const requestParams: any = {
        model: model,
        messages: messages as any,
        tools: options.tools as any,
        tool_choice: options.toolChoice as any,
        temperature: options.temperature || 1,
        stream: false
      };
      
      // Use appropriate token parameter based on model configuration
      if (modelConfig.useMaxCompletionTokens) {
        requestParams.max_completion_tokens = maxTokens;
      } else {
        requestParams.max_tokens = maxTokens;
      }
      
      // Validate parameters before sending request
      const validation = validateModelParameters(model, requestParams);
      if (!validation.valid) {
        throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
      }
      
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
        errorMessage = `OpenAI API Error (${error.status}): ${error.message || 'Unknown error'}`;
        
        // For 401 errors (invalid API key), provide specific guidance
        if (error.status === 401) {
          throw new Error(`${errorMessage}. Please check your OpenAI API key and use /login openai to set a valid key.`);
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