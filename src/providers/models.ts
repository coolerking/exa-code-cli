import { ModelInfo } from './base.js';

// Model configurations for each provider
// Easily modifiable without touching provider code

export const PROVIDER_MODELS = {
  groq: [
    { id: 'moonshotai/kimi-k2-instruct', name: 'Kimi K2 Instruct', description: 'Most capable model' },
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', description: 'Fast, capable, and cheap model' },
    { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', description: 'Fastest and cheapest model' },
    { id: 'qwen/qwen3-32b', name: 'Qwen 3 32B', description: '' },
    { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', description: '' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', description: '' },
  ] as ModelInfo[],

  openai: [
    { id: 'o3-mini', name: 'o3-mini', description: 'Fast reasoning model (default)' },
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable model' },
    { id: 'o3', name: 'o3', description: 'Advanced reasoning model' },
    { id: 'o3-pro', name: 'o3-pro', description: 'Professional reasoning model' },
    { id: 'o4-mini', name: 'o4-mini', description: 'Next-generation mini model' },
    { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Enhanced GPT-4 model' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', description: 'Compact GPT-4.1' },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 nano', description: 'Ultra-compact GPT-4.1' },
    { id: 'gpt-5', name: 'GPT-5', description: 'Next-generation flagship model' },
    { id: 'gpt-5-mini', name: 'GPT-5 mini', description: 'Compact GPT-5' },
    { id: 'gpt-5-nano', name: 'GPT-5 nano', description: 'Ultra-compact GPT-5' },
  ] as ModelInfo[],

  azure: [
    { id: 'o3-mini', name: 'o3-mini', description: 'Fast reasoning model (default, requires deployment)' },
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable model (requires deployment)' },
    { id: 'o3', name: 'o3', description: 'Advanced reasoning model (requires deployment)' },
    { id: 'o3-pro', name: 'o3-pro', description: 'Professional reasoning model (requires deployment)' },
    { id: 'o4-mini', name: 'o4-mini', description: 'Next-generation mini model (requires deployment)' },
    { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Enhanced GPT-4 model (requires deployment)' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', description: 'Compact GPT-4.1 (requires deployment)' },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 nano', description: 'Ultra-compact GPT-4.1 (requires deployment)' },
    { id: 'gpt-5', name: 'GPT-5', description: 'Next-generation flagship model (requires deployment)' },
    { id: 'gpt-5-mini', name: 'GPT-5 mini', description: 'Compact GPT-5 (requires deployment)' },
    { id: 'gpt-5-nano', name: 'GPT-5 nano', description: 'Ultra-compact GPT-5 (requires deployment)' },
  ] as ModelInfo[],

  openrouter: [
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', description: 'Fast, capable model (default)' },
    { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', description: 'Fastest and cheapest model' },
    { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek Chat v3.1', description: 'Advanced reasoning model' },
  ] as ModelInfo[],
} as const;

// Default models for each provider
export const DEFAULT_MODELS = {
  groq: 'moonshotai/kimi-k2-instruct',
  openai: 'o3-mini',
  azure: 'o3-mini',
  openrouter: 'openai/gpt-oss-120b',
} as const;