import test from 'ava';
import { AWSBedrockProvider, BedrockConfig } from '../aws-bedrock.js';
import { Message, ChatOptions } from '../base.js';

// Mock AWS SDK modules
const mockBedrockClient = {
  send: async () => ({
    body: new TextEncoder().encode(JSON.stringify({
      content: [{ type: 'text', text: 'Test response' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: 'end_turn'
    }))
  })
};

const mockCredentials = {
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret'
};

const mockSDKModules = {
  '@aws-sdk/client-bedrock-runtime': {
    BedrockRuntimeClient: class {
      constructor(config: any) {
        return mockBedrockClient;
      }
    },
    InvokeModelCommand: class {
      constructor(params: any) {
        this.params = params;
      }
      params: any;
    }
  },
  '@aws-sdk/credential-providers': {
    fromEnv: () => mockCredentials,
    fromIni: () => mockCredentials,
    fromInstanceMetadata: () => mockCredentials
  }
};

// Mock dynamic import
const originalImport = globalThis.Function.prototype;
test.before(() => {
  (globalThis as any).Function = function(name: string, code: string) {
    if (name === 'specifier' && code === 'return import(specifier)') {
      return async (specifier: string) => {
        const module = mockSDKModules[specifier as keyof typeof mockSDKModules];
        if (module) return module;
        throw new Error(`Module not found: ${specifier}`);
      };
    }
    return originalImport.call(this, name, code);
  };
});

test.after(() => {
  (globalThis as any).Function = originalImport;
});

test('AWSBedrockProvider - constructor', t => {
  const provider = new AWSBedrockProvider();
  
  t.is(provider.name, 'aws-bedrock');
  t.is(provider.displayName, 'AWS Bedrock');
  t.true(Array.isArray(provider.models));
  t.true(provider.models.length > 0);
});

test('AWSBedrockProvider - getRequiredConfigFields', t => {
  const provider = new AWSBedrockProvider();
  const fields = provider.getRequiredConfigFields();
  
  t.true(Array.isArray(fields));
  // AWS credentials can be provided via multiple methods, so no fields are strictly required
  t.is(fields.length, 0);
});

test('AWSBedrockProvider - validateConfig with valid region', t => {
  const provider = new AWSBedrockProvider();
  const config: BedrockConfig = {
    apiKey: 'dummy', // Not used but required by base interface
    region: 'us-east-1'
  };
  
  const result = provider.validateConfig(config);
  t.true(result.valid);
  t.is(result.errors.length, 0);
});

test('AWSBedrockProvider - validateConfig with invalid region', t => {
  const provider = new AWSBedrockProvider();
  const config: BedrockConfig = {
    apiKey: 'dummy',
    region: 'invalid_region_format!'
  };
  
  const result = provider.validateConfig(config);
  t.false(result.valid);
  t.true(result.errors.some(error => error.includes('Invalid AWS region format')));
});

test('AWSBedrockProvider - validateConfig with explicit credentials', t => {
  const provider = new AWSBedrockProvider();
  const config: BedrockConfig = {
    apiKey: 'dummy',
    region: 'us-west-2',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret'
  };
  
  const result = provider.validateConfig(config);
  t.true(result.valid);
  t.is(result.errors.length, 0);
});

test('AWSBedrockProvider - initialize with environment region', async t => {
  process.env.AWS_REGION = 'eu-west-1';
  
  const provider = new AWSBedrockProvider();
  const config: BedrockConfig = {
    apiKey: 'dummy'
  };
  
  await t.notThrowsAsync(async () => {
    await provider.initialize(config);
  });
  
  t.true(provider.isConfigured());
  
  delete process.env.AWS_REGION;
});

test('AWSBedrockProvider - initialize with explicit credentials', async t => {
  const provider = new AWSBedrockProvider();
  const config: BedrockConfig = {
    apiKey: 'dummy',
    region: 'us-east-1',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret'
  };
  
  await t.notThrowsAsync(async () => {
    await provider.initialize(config);
  });
  
  t.true(provider.isConfigured());
});

test('AWSBedrockProvider - checkCompatibility with supported model', t => {
  const provider = new AWSBedrockProvider();
  const result = provider.checkCompatibility('anthropic.claude-sonnet-4-v1');
  
  t.true(result.compatible);
  t.is(result.issues.length, 0);
});

test('AWSBedrockProvider - checkCompatibility with unsupported model', t => {
  const provider = new AWSBedrockProvider();
  const result = provider.checkCompatibility('unsupported-model');
  
  t.false(result.compatible);
  t.true(result.issues.some(issue => issue.includes('not in supported model list')));
});

test('AWSBedrockProvider - getConfigurationGuidance', async t => {
  // Clear environment variables
  const originalEnv = { ...process.env };
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_REGION;
  delete process.env.AWS_DEFAULT_REGION;
  
  const provider = new AWSBedrockProvider();
  const guidance = await provider.getConfigurationGuidance();
  
  t.true(Array.isArray(guidance));
  t.true(guidance.length > 0);
  t.true(guidance.some(g => g.includes('AWS_ACCESS_KEY_ID')));
  t.true(guidance.some(g => g.includes('AWS_SECRET_ACCESS_KEY')));
  t.true(guidance.some(g => g.includes('AWS_REGION')));
  
  // Restore environment
  process.env = originalEnv;
});

test('AWSBedrockProvider - chat with minimal configuration', async t => {
  const provider = new AWSBedrockProvider();
  const config: BedrockConfig = {
    apiKey: 'dummy',
    region: 'us-east-1'
  };
  
  await provider.initialize(config);
  
  const messages: Message[] = [
    { role: 'user', content: 'Hello' }
  ];
  
  const options: ChatOptions = {
    model: 'anthropic.claude-sonnet-4-v1',
    maxTokens: 100,
    temperature: 0.7
  };
  
  const response = await provider.chat(messages, options);
  
  t.is(typeof response.content, 'string');
  t.is(response.content, 'Test response');
  t.is(typeof response.usage, 'object');
  t.is(response.usage?.prompt_tokens, 10);
  t.is(response.usage?.completion_tokens, 5);
  t.is(response.usage?.total_tokens, 15);
  t.is(response.finishReason, 'end_turn');
});

test('AWSBedrockProvider - chat with system message', async t => {
  const provider = new AWSBedrockProvider();
  const config: BedrockConfig = {
    apiKey: 'dummy',
    region: 'us-east-1'
  };
  
  await provider.initialize(config);
  
  const messages: Message[] = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello' }
  ];
  
  const options: ChatOptions = {
    model: 'anthropic.claude-sonnet-4-v1',
    maxTokens: 100
  };
  
  const response = await provider.chat(messages, options);
  
  t.is(typeof response.content, 'string');
  t.is(response.content, 'Test response');
});

test('AWSBedrockProvider - chat with tools', async t => {
  const provider = new AWSBedrockProvider();
  const config: BedrockConfig = {
    apiKey: 'dummy',
    region: 'us-east-1'
  };
  
  await provider.initialize(config);
  
  const messages: Message[] = [
    { role: 'user', content: 'What is the weather?' }
  ];
  
  const tools = [{
    function: {
      name: 'get_weather',
      description: 'Get current weather',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' }
        }
      }
    }
  }];
  
  const options: ChatOptions = {
    model: 'anthropic.claude-sonnet-4-v1',
    maxTokens: 100,
    tools
  };
  
  const response = await provider.chat(messages, options);
  
  t.is(typeof response.content, 'string');
});

test('AWSBedrockProvider - chat without initialization should throw', async t => {
  const provider = new AWSBedrockProvider();
  
  const messages: Message[] = [
    { role: 'user', content: 'Hello' }
  ];
  
  const options: ChatOptions = {
    model: 'anthropic.claude-sonnet-4-v1'
  };
  
  await t.throwsAsync(async () => {
    await provider.chat(messages, options);
  }, { message: /not initialized/ });
});

test('AWSBedrockProvider - chat with default model', async t => {
  const provider = new AWSBedrockProvider();
  const config: BedrockConfig = {
    apiKey: 'dummy',
    region: 'us-east-1'
  };
  
  await provider.initialize(config);
  
  const messages: Message[] = [
    { role: 'user', content: 'Hello' }
  ];
  
  // No model specified - should use default
  const options: ChatOptions = {
    maxTokens: 100
  };
  
  const response = await provider.chat(messages, options);
  
  t.is(typeof response.content, 'string');
  t.is(response.content, 'Test response');
});