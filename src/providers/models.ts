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
    { id: 'o3-mini', name: 'o3-mini', description: 'Fast reasoning model (verified)' },
    { id: 'o4-mini', name: 'o4-mini', description: 'Next-generation mini model' },
    { id: 'gpt-5', name: 'GPT-5', description: 'Next-generation flagship model' },
  ] as ModelInfo[],

  azure: [
    { id: 'o3-mini', name: 'o3-mini', description: 'Fast reasoning model (verified, requires deployment)' },
    { id: 'o4-mini', name: 'o4-mini', description: 'Next-generation mini model (requires deployment)' },
    { id: 'gpt-5', name: 'GPT-5', description: 'Next-generation flagship model (requires deployment)' },
  ] as ModelInfo[],

  openrouter: [
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', description: 'Fast, capable model (default)' },
    { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', description: 'Fastest and cheapest model' },
    { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek Chat v3.1', description: 'Advanced reasoning model' },
  ] as ModelInfo[],

  ollama: [
    { id: 'gemma3:270m', name: 'Gemma 3 270M', description: 'Lightweight Google model (default)' },
    { id: 'gpt-oss:20b', name: 'GPT OSS 20B', description: 'Medium-sized capable model' },
    { id: 'gpt-oss:120b', name: 'GPT OSS 120B', description: 'Large high-performance model' },
  ] as ModelInfo[],
} as const;

// Default models for each provider
export const DEFAULT_MODELS = {
  groq: 'moonshotai/kimi-k2-instruct',
  openai: 'o3-mini',
  azure: 'o3-mini',
  openrouter: 'openai/gpt-oss-120b',
  ollama: 'gemma3:270m',
} as const;