import { BaseProvider, ProviderConfig, Message, ChatOptions, ChatResponse } from './base.js';
import { PROVIDER_MODELS, DEFAULT_MODELS } from './models.js';
import { getModelParameterConfig, validateModelParameters } from './model-params.js';

// Dynamic import for Anthropic SDK
async function createAnthropicClient(options: { apiKey: string }): Promise<any> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const anthropicModule = await dynamicImport('@anthropic-ai/sdk');
    const Anthropic = anthropicModule.default;
    return new Anthropic(options);
  } catch (error) {
    throw new Error('@anthropic-ai/sdk package is required but not installed. Please run: npm install @anthropic-ai/sdk');
  }
}

// Convert messages format to Anthropic format
function convertMessagesToAnthropic(messages: Message[]): any[] {
  const anthropicMessages: any[] = [];
  
  for (const message of messages) {
    if (message.role === 'system') {
      // System messages will be handled separately as system parameter
      continue;
    }
    
    if (message.role === 'tool') {
      // Convert tool response to Anthropic format
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.tool_call_id,
            content: message.content
          }
        ]
      });
    } else {
      anthropicMessages.push({
        role: message.role,
        content: message.content
      });
    }
  }
  
  return anthropicMessages;
}

// Convert tools format to Anthropic format
function convertToolsToAnthropic(tools?: any[]): any[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters
  }));
}

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  readonly displayName = 'Anthropic API';
  readonly models = PROVIDER_MODELS.anthropic;

  private client: any = null;

  getRequiredConfigFields(): string[] {
    return ['apiKey'];
  }

  validateConfig(config: Partial<ProviderConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.apiKey) {
      errors.push('API key is required for Anthropic provider');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);
    
    this.client = await createAnthropicClient({
      apiKey: config.apiKey
    });
    
    console.debug('Anthropic client initialized');
  }

  checkCompatibility(model: string): { compatible: boolean; issues: string[] } {
    const modelConfig = getModelParameterConfig(model);
    const issues: string[] = [];
    
    // Check if model is in our supported list
    const supportedModelIds = this.models.map(m => m.id);
    if (!supportedModelIds.includes(model)) {
      issues.push(`Model ${model} is not in supported model list`);
    }
    
    // Anthropic has different parameter structure
    const testParams: any = {
      model: model,
      messages: [],
      temperature: 1,
    };
    
    // Anthropic uses max_tokens (not max_completion_tokens)
    testParams.max_tokens = 1000;
    
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
      throw new Error('Anthropic provider not initialized');
    }

    try {
      const model = options.model || this.config.model || DEFAULT_MODELS.anthropic;
      const maxTokens = options.maxTokens || 4000;
      
      // Extract system message
      const systemMessage = messages.find(m => m.role === 'system')?.content;
      
      // Convert messages to Anthropic format (excluding system message)
      const anthropicMessages = convertMessagesToAnthropic(messages);
      
      // Convert tools to Anthropic format
      const anthropicTools = convertToolsToAnthropic(options.tools);
      
      const requestParams: any = {
        model: model,
        max_tokens: maxTokens,
        messages: anthropicMessages,
        temperature: options.temperature || 1,
      };
      
      if (systemMessage) {
        requestParams.system = systemMessage;
      }
      
      if (anthropicTools) {
        requestParams.tools = anthropicTools;
      }
      
      // Validate parameters before sending request
      const validation = validateModelParameters(model, requestParams);
      if (!validation.valid) {
        throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
      }
      
      const response = await this.client.messages.create(requestParams);

      let content = '';
      let toolCalls: any[] = [];
      
      // Process response content
      if (response.content) {
        for (const block of response.content) {
          if (block.type === 'text') {
            content += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input)
              }
            });
          }
        }
      }

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: response.usage ? {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens
        } : undefined,
        finishReason: response.stop_reason
      };
    } catch (error: any) {
      let errorMessage = 'Unknown error occurred';
      
      if (error && typeof error === 'object' && 'status' in error) {
        errorMessage = `Anthropic API Error (${error.status}): ${error.message || 'Unknown error'}`;
        
        // For 401 errors (invalid API key), provide specific guidance
        if (error.status === 401) {
          throw new Error(`${errorMessage}. Please check your Anthropic API key and use /login anthropic to set a valid key.`);
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