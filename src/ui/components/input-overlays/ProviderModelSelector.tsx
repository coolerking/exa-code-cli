import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ProviderType } from '../../../providers/factory.js';
import { PROVIDER_MODELS } from '../../../providers/models.js';

interface ProviderInfo {
  id: ProviderType;
  name: string;
  description: string;
}

const AVAILABLE_PROVIDERS: ProviderInfo[] = [
  { id: 'groq', name: 'Groq Cloud', description: 'Fast inference with Groq models (default)' },
  { id: 'openai', name: 'OpenAI API', description: 'Official OpenAI models including o3-mini' },
  { id: 'azure', name: 'Azure OpenAI Service', description: 'Enterprise OpenAI models via Azure' },
  { id: 'anthropic', name: 'Anthropic API', description: 'Claude models for advanced reasoning and conversation' },
  { id: 'aws-bedrock', name: 'AWS Bedrock', description: 'AWS Bedrock経由でClaude models利用 - 企業向けセキュア接続' },
  { id: 'openrouter', name: 'OpenRouter API', description: 'Access to multiple AI models via OpenRouter' },
  { id: 'ollama', name: 'Ollama Local', description: 'Local LLM server via Ollama' },
  { id: 'google', name: 'Google Gemini', description: 'Gemini 2.5 Pro/Flash via Google AI' },
];

interface ProviderModelSelectorProps {
  onSubmit: (provider: ProviderType, model: string) => void;
  onCancel: () => void;
  currentProvider?: ProviderType;
  currentModel?: string;
}

type SelectorState = 'provider' | 'model';

export default function ProviderModelSelector({ 
  onSubmit, 
  onCancel, 
  currentProvider = 'groq', 
  currentModel 
}: ProviderModelSelectorProps) {
  const [state, setState] = useState<SelectorState>('provider');
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>(currentProvider);
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(() => {
    const currentIndex = AVAILABLE_PROVIDERS.findIndex(p => p.id === currentProvider);
    return currentIndex >= 0 ? currentIndex : 0;
  });
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);

  const currentProviderModels = PROVIDER_MODELS[selectedProvider as keyof typeof PROVIDER_MODELS] || [];

  useInput((input, key) => {
    if (key.escape) {
      if (state === 'model') {
        // Go back to provider selection
        setState('provider');
        return;
      } else {
        // Cancel completely
        onCancel();
        return;
      }
    }

    if (key.ctrl && input === 'c') {
      onCancel();
      return;
    }

    if (state === 'provider') {
      if (key.return) {
        const selected = AVAILABLE_PROVIDERS[selectedProviderIndex];
        setSelectedProvider(selected.id);
        setState('model');
        setSelectedModelIndex(0); // Reset model selection
        return;
      }

      if (key.upArrow) {
        setSelectedProviderIndex(prev => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setSelectedProviderIndex(prev => Math.min(AVAILABLE_PROVIDERS.length - 1, prev + 1));
        return;
      }
    } else if (state === 'model') {
      if (key.return) {
        const selectedModel = currentProviderModels[selectedModelIndex];
        if (selectedModel) {
          onSubmit(selectedProvider, selectedModel.id);
        }
        return;
      }

      if (key.upArrow) {
        setSelectedModelIndex(prev => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setSelectedModelIndex(prev => Math.min(currentProviderModels.length - 1, prev + 1));
        return;
      }
    }
  });

  if (state === 'provider') {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color="cyan" bold>Select Provider</Text>
        </Box>
        
        <Box marginBottom={1}>
          <Text color="gray" dimColor>
            Choose a provider for your conversation. The chat will be cleared when you switch providers.
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          {AVAILABLE_PROVIDERS.map((provider, index) => (
            <Box key={provider.id} marginBottom={index === AVAILABLE_PROVIDERS.length - 1 ? 0 : 1}>
              <Text 
                color={index === selectedProviderIndex ? 'black' : 'white'}
                backgroundColor={index === selectedProviderIndex ? 'cyan' : undefined}
                bold={index === selectedProviderIndex}
              >
                {index === selectedProviderIndex ? <Text bold>{">"}</Text> : "  "} {""}
                {provider.name}
                {provider.id === currentProvider ? ' (current)' : ''}
              </Text>
              {index === selectedProviderIndex && (
                <Box marginLeft={4} marginTop={0}>
                  <Text color="gray" dimColor>
                    {provider.description}
                  </Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>

        <Box marginTop={1}>
          <Text color="gray" dimColor>
            ↑↓: Navigate  Enter: Select  Esc: Cancel
          </Text>
        </Box>
      </Box>
    );
  }

  // Model selection state
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          Select Model - {AVAILABLE_PROVIDERS.find(p => p.id === selectedProvider)?.name}
        </Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text color="gray" dimColor>
          Choose a model for your conversation.
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {currentProviderModels.map((model, index) => (
          <Box key={model.id} marginBottom={index === currentProviderModels.length - 1 ? 0 : 1}>
            <Text 
              color={index === selectedModelIndex ? 'black' : 'white'}
              backgroundColor={index === selectedModelIndex ? 'cyan' : undefined}
              bold={index === selectedModelIndex}
            >
              {index === selectedModelIndex ? <Text bold>{">"}</Text> : "  "} {""}
              {model.name}
              {model.id === currentModel && selectedProvider === currentProvider ? ' (current)' : ''}
            </Text>
            {index === selectedModelIndex && model.description && (
              <Box marginLeft={4} marginTop={0}>
                <Text color="gray" dimColor>
                  {model.description}
                </Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓: Navigate  Enter: Select  Esc: Back to providers
        </Text>
      </Box>
    </Box>
  );
}
