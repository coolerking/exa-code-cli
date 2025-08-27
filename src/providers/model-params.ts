export interface ModelParameterConfig {
  model: string;
  useMaxCompletionTokens: boolean;
  supportedParams: string[];
  restrictions?: {
    maxTokens?: number;
    temperatureRange?: [number, number];
  };
}

export const MODEL_PARAMETER_CONFIGS: Record<string, ModelParameterConfig> = {
  // OpenAI o-series models - use max_completion_tokens
  'o3-mini': {
    model: 'o3-mini',
    useMaxCompletionTokens: true,
    supportedParams: ['model', 'messages', 'max_completion_tokens', 'temperature', 'tools', 'tool_choice', 'stream'],
    restrictions: {
      maxTokens: 65536,
      temperatureRange: [0, 2]
    }
  },
  
  'o4-mini': {
    model: 'o4-mini', 
    useMaxCompletionTokens: true,
    supportedParams: ['model', 'messages', 'max_completion_tokens', 'temperature', 'tools', 'tool_choice', 'stream'],
    restrictions: {
      maxTokens: 65536,
      temperatureRange: [0, 2]
    }
  },
  
  'gpt-5': {
    model: 'gpt-5',
    useMaxCompletionTokens: true, // Assume o-series pattern for safety
    supportedParams: ['model', 'messages', 'max_completion_tokens', 'temperature', 'tools', 'tool_choice', 'stream'],
    restrictions: {
      maxTokens: 32768,
      temperatureRange: [0, 2]
    }
  },
  
  // Traditional GPT models - use max_tokens
  'gpt-4': {
    model: 'gpt-4',
    useMaxCompletionTokens: false,
    supportedParams: ['model', 'messages', 'max_tokens', 'temperature', 'tools', 'tool_choice', 'stream'],
    restrictions: {
      maxTokens: 8192,
      temperatureRange: [0, 2]
    }
  },
  
  'gpt-4-turbo': {
    model: 'gpt-4-turbo',
    useMaxCompletionTokens: false,
    supportedParams: ['model', 'messages', 'max_tokens', 'temperature', 'tools', 'tool_choice', 'stream'],
    restrictions: {
      maxTokens: 4096,
      temperatureRange: [0, 2]
    }
  },
  
  'gpt-3.5-turbo': {
    model: 'gpt-3.5-turbo',
    useMaxCompletionTokens: false,
    supportedParams: ['model', 'messages', 'max_tokens', 'temperature', 'tools', 'tool_choice', 'stream'],
    restrictions: {
      maxTokens: 4096,
      temperatureRange: [0, 2]
    }
  }
};

export function getModelParameterConfig(model: string): ModelParameterConfig {
  const config = MODEL_PARAMETER_CONFIGS[model];
  
  if (config) {
    return config;
  }
  
  // Fallback logic based on model naming patterns
  if (model.startsWith('o3') || model.includes('o3-') || 
      model.startsWith('o4') || model.includes('o4-') ||
      model.startsWith('o1') || model.includes('o1-')) {
    return {
      model: model,
      useMaxCompletionTokens: true,
      supportedParams: ['model', 'messages', 'max_completion_tokens', 'temperature', 'tools', 'tool_choice', 'stream'],
      restrictions: {
        maxTokens: 32768,
        temperatureRange: [0, 2]
      }
    };
  }
  
  // Default fallback to traditional parameters
  return {
    model: model,
    useMaxCompletionTokens: false,
    supportedParams: ['model', 'messages', 'max_tokens', 'temperature', 'tools', 'tool_choice', 'stream'],
    restrictions: {
      maxTokens: 4096,
      temperatureRange: [0, 2]
    }
  };
}

export function validateModelParameters(model: string, params: Record<string, any>): { valid: boolean; errors: string[] } {
  const config = getModelParameterConfig(model);
  const errors: string[] = [];
  
  // Check for unsupported parameters
  const paramKeys = Object.keys(params);
  const unsupported = paramKeys.filter(key => !config.supportedParams.includes(key));
  
  if (unsupported.length > 0) {
    errors.push(`Unsupported parameters for model ${model}: ${unsupported.join(', ')}`);
  }
  
  // Validate token parameter usage
  if (config.useMaxCompletionTokens && params.max_tokens) {
    errors.push(`Model ${model} requires max_completion_tokens, not max_tokens`);
  }
  
  if (!config.useMaxCompletionTokens && params.max_completion_tokens) {
    errors.push(`Model ${model} requires max_tokens, not max_completion_tokens`);
  }
  
  // Validate restrictions
  if (config.restrictions) {
    const tokenParam = config.useMaxCompletionTokens ? 'max_completion_tokens' : 'max_tokens';
    const tokenValue = params[tokenParam];
    
    if (tokenValue && config.restrictions.maxTokens && tokenValue > config.restrictions.maxTokens) {
      errors.push(`Token limit ${tokenValue} exceeds maximum ${config.restrictions.maxTokens} for model ${model}`);
    }
    
    if (params.temperature !== undefined && config.restrictions.temperatureRange) {
      const [min, max] = config.restrictions.temperatureRange;
      if (params.temperature < min || params.temperature > max) {
        errors.push(`Temperature ${params.temperature} outside valid range [${min}, ${max}] for model ${model}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}