import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ProviderType } from '../../../providers/factory.js';

interface ProviderInfo {
  id: ProviderType;
  name: string;
  description: string;
  fields: Array<{
    key: string;
    label: string;
    placeholder: string;
    required: boolean;
  }>;
}

const PROVIDER_CONFIGS: ProviderInfo[] = [
  {
    id: 'groq',
    name: 'Groq Cloud',
    description: 'Get your API key from https://console.groq.com/keys',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'gsk_...', required: true }
    ]
  },
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Get your API key from https://aistudio.google.com/app/apikey',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'AIza...', required: true }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI API',
    description: 'Get your API key from https://platform.openai.com/api-keys',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'sk-...', required: true }
    ]
  },
  {
    id: 'azure',
    name: 'Azure OpenAI Service',
    description: 'Get credentials from your Azure OpenAI resource',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'Your Azure OpenAI API key', required: true },
      { key: 'endpoint', label: 'Endpoint', placeholder: 'https://your-resource.openai.azure.com', required: true },
      { key: 'deploymentName', label: 'Deployment Name', placeholder: 'gpt-4o-deployment', required: true },
      { key: 'apiVersion', label: 'API Version', placeholder: '2024-10-21 (optional)', required: false }
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic API',
    description: 'Get your API key from https://console.anthropic.com/keys',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'sk-ant-...', required: true }
    ]
  },
  {
    id: 'openrouter',
    name: 'OpenRouter API',
    description: 'Get your API key from https://openrouter.ai/keys',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'sk-or-...', required: true }
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama Local',
    description: 'Connect to your local Ollama server',
    fields: [
      { key: 'endpoint', label: 'Endpoint URL', placeholder: 'http://192.168.11.11:11434', required: true }
    ]
  }
];

interface ProviderLoginProps {
  selectedProvider: ProviderType | null; // null means show provider selection
  onSubmit: (provider: ProviderType, credentials: Record<string, string>) => void;
  onCancel: () => void;
}

export default function ProviderLogin({ selectedProvider, onSubmit, onCancel }: ProviderLoginProps) {
  const [providerIndex, setProviderIndex] = useState(0);
  const [inputValues, setInputValues] = useState<Record<string, string>>(() => {
    // Initialize with default values for Ollama
    if (selectedProvider === 'ollama') {
      return { endpoint: 'http://192.168.11.11:11434' };
    }
    return {} as Record<string, string>;
  });
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);

  const isProviderSelection = selectedProvider === null;
  const currentProvider = isProviderSelection ? null : PROVIDER_CONFIGS.find(p => p.id === selectedProvider);
  
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.ctrl && input === 'c') {
      onCancel();
      return;
    }

    if (isProviderSelection) {
      // Provider selection mode
      if (key.return) {
        const selected = PROVIDER_CONFIGS[providerIndex];
        // This is wrong - we need to show credential input, not submit empty credentials
        // For now, we'll call onSubmit with empty credentials which should NOT save anything
        // but trigger the parent to show credential input for the selected provider
        onSubmit(selected.id, {}); // This should trigger a re-render with selectedProvider set
        return;
      }

      if (key.upArrow) {
        setProviderIndex(prev => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setProviderIndex(prev => Math.min(PROVIDER_CONFIGS.length - 1, prev + 1));
        return;
      }
    } else {
      // Credential input mode
      if (key.return) {
        if (currentProvider) {
          // Validate required fields
          const missingFields = currentProvider.fields
            .filter(field => field.required && !inputValues[field.key])
            .map(field => field.label);
          
          if (missingFields.length > 0) {
            // TODO: Show validation error
            return;
          }
          
          onSubmit(selectedProvider!, inputValues);
        }
        return;
      }

      if (key.tab || key.downArrow) {
        if (currentProvider) {
          setCurrentFieldIndex(prev => Math.min(currentProvider.fields.length - 1, prev + 1));
        }
        return;
      }

      if (key.upArrow) {
        setCurrentFieldIndex(prev => Math.max(0, prev - 1));
        return;
      }

      // Handle text input - improved for better usability
      if (currentProvider && input && input.length >= 1) {
        const currentField = currentProvider.fields[currentFieldIndex];
        if (currentField) {
          // Handle single character input
          if (input.length === 1) {
            setInputValues(prev => ({
              ...prev,
              [currentField.key]: (prev[currentField.key] || '') + input
            }));
          } else {
            // Handle pasted or multi-character input
            setInputValues(prev => ({
              ...prev,
              [currentField.key]: input
            }));
          }
        }
      }

      // Handle backspace
      if (key.backspace && currentProvider) {
        const currentField = currentProvider.fields[currentFieldIndex];
        if (currentField) {
          setInputValues(prev => ({
            ...prev,
            [currentField.key]: (prev[currentField.key] || '').slice(0, -1)
          }));
        }
      }

      // Handle Ctrl+A (select all) and Ctrl+V (paste) conceptually
      if (key.ctrl && input === 'a' && currentProvider) {
        const currentField = currentProvider.fields[currentFieldIndex];
        if (currentField) {
          // Clear field to simulate select all + replace
          setInputValues(prev => ({
            ...prev,
            [currentField.key]: ''
          }));
        }
      }
    }
  });

  if (isProviderSelection) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color="cyan" bold>Select Provider to Configure</Text>
        </Box>
        
        <Box marginBottom={1}>
          <Text color="gray" dimColor>
            Choose which provider you want to set up credentials for.
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          {PROVIDER_CONFIGS.map((provider, index) => (
            <Box key={provider.id} marginBottom={1}>
              <Text 
                color={index === providerIndex ? 'black' : 'white'}
                backgroundColor={index === providerIndex ? 'cyan' : undefined}
                bold={index === providerIndex}
              >
                {index === providerIndex ? <Text bold>{">"}</Text> : "  "} {""}
                {provider.name}
              </Text>
              {index === providerIndex && (
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

  // Credential input mode
  if (!currentProvider) {
    return (
      <Box>
        <Text color="red">Error: Unknown provider</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="cyan" bold>Configure {currentProvider.name}</Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text color="gray" dimColor>
          {currentProvider.description}
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {currentProvider.fields.map((field, index) => (
          <Box key={field.key} marginBottom={1}>
            <Box marginBottom={0}>
              <Text color={index === currentFieldIndex ? 'cyan' : 'white'} bold>
                {field.label}{field.required ? ' *' : ''}:
              </Text>
            </Box>
            <Box>
              <Text 
                color={index === currentFieldIndex ? 'black' : (inputValues[field.key] ? 'white' : 'gray')}
                backgroundColor={index === currentFieldIndex ? 'cyan' : undefined}
              >
                {inputValues[field.key] ? inputValues[field.key] : field.placeholder}
                {index === currentFieldIndex ? '█' : ''}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Tab/↑↓: Navigate fields  Enter: Save  Esc: Cancel
        </Text>
      </Box>
      
      <Box marginTop={1}>
        <Text color="yellow" dimColor>
          * Required fields
        </Text>
      </Box>
    </Box>
  );
}
