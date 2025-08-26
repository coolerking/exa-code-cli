export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

export interface ProviderConfig {
  apiKey: string;
  endpoint?: string; // For Azure OpenAI endpoint URL
  deploymentName?: string; // For Azure OpenAI - the deployment name you created (may differ from model name)
  apiVersion?: string; // For Azure OpenAI API version (e.g., "2024-10-21")
  model?: string; // Model identifier used by the provider
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: any[];
  toolChoice?: string;
}

export interface ChatResponse {
  content: string;
  toolCalls?: any[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    total_time?: number;
  };
  reasoning?: string;
  finishReason?: string;
}

export interface IProvider {
  readonly name: string;
  readonly displayName: string;
  readonly models: ModelInfo[];
  
  initialize(config: ProviderConfig): Promise<void>;
  chat(messages: Message[], options: ChatOptions): Promise<ChatResponse>;
  isConfigured(): boolean;
  getRequiredConfigFields(): string[];
  validateConfig(config: Partial<ProviderConfig>): { valid: boolean; errors: string[] };
}

export abstract class BaseProvider implements IProvider {
  abstract readonly name: string;
  abstract readonly displayName: string;
  abstract readonly models: ModelInfo[];
  
  protected config?: ProviderConfig;
  protected isInitialized: boolean = false;
  
  async initialize(config: ProviderConfig): Promise<void> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }
    this.config = config;
    this.isInitialized = true;
  }
  
  isConfigured(): boolean {
    return this.isInitialized && !!this.config;
  }
  
  abstract chat(messages: Message[], options: ChatOptions): Promise<ChatResponse>;
  abstract getRequiredConfigFields(): string[];
  abstract validateConfig(config: Partial<ProviderConfig>): { valid: boolean; errors: string[] };
}