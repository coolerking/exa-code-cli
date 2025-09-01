import { BaseProvider, ProviderConfig, Message, ChatOptions, ChatResponse } from './base.js';
import { PROVIDER_MODELS, DEFAULT_MODELS } from './models.js';
import { getModelParameterConfig, validateModelParameters } from './model-params.js';

// Dynamic imports for AWS SDK
async function createBedrockClient(region: string, credentials?: any): Promise<any> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const bedrockModule = await dynamicImport('@aws-sdk/client-bedrock-runtime');
    const credentialsModule = await dynamicImport('@aws-sdk/credential-providers');
    
    const BedrockRuntimeClient = bedrockModule.BedrockRuntimeClient;
    const { fromEnv, fromIni, fromInstanceMetadata } = credentialsModule;
    
    let resolvedCredentials;
    
    if (credentials) {
      // Use provided credentials
      resolvedCredentials = credentials;
    } else {
      // Try multiple credential sources in order
      try {
        // 1. Environment variables
        resolvedCredentials = fromEnv();
      } catch {
        try {
          // 2. AWS profile/config files
          resolvedCredentials = fromIni();
        } catch {
          try {
            // 3. EC2 instance metadata (for EC2/ECS/Lambda)
            resolvedCredentials = fromInstanceMetadata();
          } catch {
            throw new Error('No valid AWS credentials found. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables, configure AWS profile, or run on AWS infrastructure with IAM roles.');
          }
        }
      }
    }
    
    return new BedrockRuntimeClient({
      region: region,
      credentials: resolvedCredentials
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('No valid AWS credentials')) {
      throw error;
    }
    throw new Error('@aws-sdk/client-bedrock-runtime and @aws-sdk/credential-providers packages are required but not installed. Please run: npm install @aws-sdk/client-bedrock-runtime @aws-sdk/credential-providers');
  }
}

// Extended config for AWS Bedrock
export interface BedrockConfig extends ProviderConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

// Convert messages format to Bedrock format
function convertMessagesToBedrock(messages: Message[]): { system?: string; messages: any[] } {
  const bedrockMessages: any[] = [];
  let systemMessage: string | undefined;
  
  for (const message of messages) {
    if (message.role === 'system') {
      // Bedrock handles system message separately
      systemMessage = message.content;
      continue;
    }
    
    if (message.role === 'tool') {
      // Convert tool response to Bedrock format
      bedrockMessages.push({
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
      bedrockMessages.push({
        role: message.role,
        content: [
          {
            type: 'text',
            text: message.content
          }
        ]
      });
    }
  }
  
  return {
    system: systemMessage,
    messages: bedrockMessages
  };
}

// Convert tools format to Bedrock format
function convertToolsToBedrock(tools?: any[]): any[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters
  }));
}

export class AWSBedrockProvider extends BaseProvider {
  readonly name = 'aws-bedrock';
  readonly displayName = 'AWS Bedrock';
  readonly models = PROVIDER_MODELS['aws-bedrock'];

  private client: any = null;
  private region: string = 'us-east-1'; // Default region

  getRequiredConfigFields(): string[] {
    // AWS credentials can be provided via multiple methods
    // Environment variables are preferred, so no fields are strictly required
    return [];
  }

  validateConfig(config: Partial<BedrockConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check if we have environment variables or explicit credentials
    const hasEnvCredentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
    const hasExplicitCredentials = config.accessKeyId && config.secretAccessKey;
    
    if (!hasEnvCredentials && !hasExplicitCredentials) {
      // This is just a warning - we'll try other credential sources too
      console.debug('No explicit credentials found. Will attempt to use AWS credential chain (environment variables, profiles, IAM roles).');
    }
    
    // Validate region format if provided
    if (config.region && !/^[a-z0-9-]+$/.test(config.region)) {
      errors.push('Invalid AWS region format');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async validateCredentials(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!this.client) {
      errors.push('AWS Bedrock client not initialized');
      return { valid: false, errors };
    }
    
    try {
      // Try to make a simple call to validate credentials
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const bedrockModule = await dynamicImport('@aws-sdk/client-bedrock-runtime');
      const { InvokeModelCommand } = bedrockModule;
      
      // Test with a minimal valid request to check credentials
      const testCommand = new InvokeModelCommand({
        modelId: 'anthropic.claude-sonnet-4-v1',
        contentType: 'application/json',
        body: JSON.stringify({
          max_tokens: 1,
          messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }]
        })
      });
      
      // This will fail due to minimal request, but we can catch auth-specific errors
      await this.client.send(testCommand);
      return { valid: true, errors: [] };
    } catch (error: any) {
      if (error && typeof error === 'object') {
        if (error.name === 'UnrecognizedClientException' || 
            error.name === 'InvalidSignatureException' ||
            error.name === 'AccessDeniedException') {
          errors.push('AWS credentials are invalid or insufficient permissions for Bedrock access');
        } else if (error.name === 'CredentialsProviderError') {
          errors.push('AWS credentials could not be loaded');
        } else if (error.$metadata?.httpStatusCode === 403) {
          errors.push('AWS credentials valid but insufficient permissions for Bedrock');
        } else if (error.$metadata?.httpStatusCode === 401) {
          errors.push('AWS credentials are invalid');
        } else {
          // If it's a validation error or other non-auth error, credentials are probably OK
          return { valid: true, errors: [] };
        }
      } else {
        errors.push(`Credential validation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      return { valid: false, errors };
    }
  }

  async getConfigurationGuidance(): Promise<string[]> {
    const guidance: string[] = [];
    
    const hasEnvCredentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
    const hasRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
    
    if (!hasEnvCredentials) {
      guidance.push('Set AWS credentials using environment variables:');
      guidance.push('  export AWS_ACCESS_KEY_ID=your_access_key');
      guidance.push('  export AWS_SECRET_ACCESS_KEY=your_secret_key');
      guidance.push('Or configure AWS profile using: aws configure');
    }
    
    if (!hasRegion) {
      guidance.push('Set AWS region using environment variable:');
      guidance.push('  export AWS_REGION=us-east-1');
    }
    
    guidance.push('Ensure you have permission to use Amazon Bedrock in your AWS account');
    guidance.push('Claude models may require additional access requests in AWS Console');
    
    return guidance;
  }

  async initialize(config: BedrockConfig): Promise<void> {
    await super.initialize(config);
    
    // Set region from config or environment variable
    this.region = config.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    
    // Prepare credentials if explicitly provided
    let credentials: any = undefined;
    if (config.accessKeyId && config.secretAccessKey) {
      credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      };
    }
    
    try {
      this.client = await createBedrockClient(this.region, credentials);
      console.debug(`AWS Bedrock client initialized for region: ${this.region}`);
    } catch (error) {
      throw new Error(`Failed to initialize AWS Bedrock client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  checkCompatibility(model: string): { compatible: boolean; issues: string[] } {
    const modelConfig = getModelParameterConfig(model);
    const issues: string[] = [];
    
    // Check if model is in our supported list
    const supportedModelIds = this.models.map(m => m.id);
    if (!supportedModelIds.includes(model)) {
      issues.push(`Model ${model} is not in supported model list`);
    }
    
    // Bedrock has different parameter structure (no 'model' parameter)
    const testParams: any = {
      messages: [],
      temperature: 1,
      max_tokens: 1000
    };
    
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
      throw new Error('AWS Bedrock provider not initialized');
    }

    try {
      const model = options.model || this.config.model || DEFAULT_MODELS['aws-bedrock'];
      const maxTokens = options.maxTokens || 4000;
      
      // Convert messages to Bedrock format
      const { system, messages: bedrockMessages } = convertMessagesToBedrock(messages);
      
      // Convert tools to Bedrock format
      const bedrockTools = convertToolsToBedrock(options.tools);
      
      // Build request payload for Bedrock Claude models
      const requestBody: any = {
        max_tokens: maxTokens,
        messages: bedrockMessages,
        temperature: options.temperature || 1,
      };
      
      if (system) {
        requestBody.system = system;
      }
      
      if (bedrockTools) {
        requestBody.tools = bedrockTools;
      }
      
      // Validate parameters before sending request
      const validation = validateModelParameters(model, requestBody);
      if (!validation.valid) {
        throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Import InvokeModelCommand dynamically
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const bedrockModule = await dynamicImport('@aws-sdk/client-bedrock-runtime');
      const { InvokeModelCommand } = bedrockModule;
      
      const command = new InvokeModelCommand({
        modelId: model,
        contentType: 'application/json',
        body: JSON.stringify(requestBody)
      });

      const response = await this.client.send(command);
      
      // Parse response
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      let content = '';
      let toolCalls: any[] = [];
      
      // Process response content (Bedrock format similar to Anthropic)
      if (responseBody.content) {
        for (const block of responseBody.content) {
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
        usage: responseBody.usage ? {
          prompt_tokens: responseBody.usage.input_tokens || 0,
          completion_tokens: responseBody.usage.output_tokens || 0,
          total_tokens: (responseBody.usage.input_tokens || 0) + (responseBody.usage.output_tokens || 0)
        } : undefined,
        finishReason: responseBody.stop_reason
      };
    } catch (error: any) {
      let errorMessage = 'Unknown error occurred';
      
      if (error && typeof error === 'object') {
        if ('$metadata' in error && error.$metadata.httpStatusCode) {
          const statusCode = error.$metadata.httpStatusCode;
          errorMessage = `AWS Bedrock API Error (${statusCode}): ${error.message || 'Unknown error'}`;
          
          // Provide specific guidance for common errors
          if (statusCode === 403) {
            errorMessage += '. Please check your AWS credentials and ensure you have access to Amazon Bedrock.';
          } else if (statusCode === 400) {
            errorMessage += '. Please check your request parameters.';
          }
        } else if (error.name === 'AccessDeniedException') {
          errorMessage = `AWS Access Denied: ${error.message}. Please check your AWS credentials and Bedrock permissions.`;
        } else if (error.message) {
          errorMessage = `AWS Bedrock Error: ${error.message}`;
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