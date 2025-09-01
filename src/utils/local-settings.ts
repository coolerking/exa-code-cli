import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProviderType } from '../providers/factory.js';

interface ProviderConfig {
  apiKey?: string;
  endpoint?: string; // For Azure OpenAI
  deploymentName?: string; // For Azure OpenAI deployment name
  apiVersion?: string; // For Azure OpenAI API version
  defaultModel?: string;
}

interface Config {
  // Legacy fields for backward compatibility
  groqApiKey?: string;
  defaultModel?: string;
  exaProxy?: string;
  
  // New multi-provider fields
  defaultProvider?: ProviderType;
  providers?: {
    groq?: ProviderConfig;
    openai?: ProviderConfig;
    azure?: ProviderConfig;
    anthropic?: ProviderConfig;
    openrouter?: ProviderConfig;
    ollama?: ProviderConfig;
  };
}

const CONFIG_DIR = '.exa'; // In home directory
const CONFIG_FILE = 'local-settings.json';

export class ConfigManager {
  private configPath: string;

  constructor() {
    const homeDir = os.homedir();
    this.configPath = path.join(homeDir, CONFIG_DIR, CONFIG_FILE);
  }

  private ensureConfigDir(): void {
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  private readConfig(): Config {
    try {
      if (!fs.existsSync(this.configPath)) {
        return {};
      }
      const configData = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.warn('Failed to read config file:', error);
      return {};
    }
  }

  private writeConfig(config: Config): void {
    this.ensureConfigDir();
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), {
      mode: 0o600 // Read/write for owner only
    });
    // Ensure restrictive perms even if file already existed
    try {
      fs.chmodSync(this.configPath, 0o600);
    } catch {
      // noop (esp. on Windows where chmod may not be supported)
    }
  }

  // Legacy methods for backward compatibility
  public getApiKey(): string | null {
    const config = this.readConfig();
    return config.groqApiKey || this.getProviderApiKey('groq');
  }

  public setApiKey(apiKey: string): void {
    this.setProviderApiKey('groq', apiKey);
    // Also set legacy field for backward compatibility
    try {
      const config = this.readConfig();
      config.groqApiKey = apiKey;
      this.writeConfig(config);
    } catch (error) {
      throw new Error(`Failed to save API key: ${error}`);
    }
  }

  public clearApiKey(): void {
    this.clearProviderApiKey('groq');
    // Also clear legacy field
    try {
      const config = this.readConfig();
      delete config.groqApiKey;

      if (Object.keys(config).length === 0) {
        if (fs.existsSync(this.configPath)) {
          fs.unlinkSync(this.configPath);
        }
      } else {
        this.writeConfig(config);
      }
    } catch (error) {
      console.warn('Failed to clear API key:', error);
    }
  }

  // New multi-provider methods
  public getDefaultProvider(): ProviderType {
    const config = this.readConfig();
    return config.defaultProvider || 'groq';
  }

  public setDefaultProvider(provider: ProviderType): void {
    try {
      const config = this.readConfig();
      config.defaultProvider = provider;
      this.writeConfig(config);
    } catch (error) {
      throw new Error(`Failed to save default provider: ${error}`);
    }
  }

  public getProviderConfig(provider: ProviderType): ProviderConfig | null {
    const config = this.readConfig();
    return config.providers?.[provider] || null;
  }

  public getProviderApiKey(provider: ProviderType): string | null {
    // Check environment variables first
    const envKey = this.getEnvVarForProvider(provider, 'apiKey');
    if (envKey) {
      return envKey;
    }

    // Then check config file
    const providerConfig = this.getProviderConfig(provider);
    return providerConfig?.apiKey || null;
  }

  public setProviderApiKey(provider: ProviderType, apiKey: string): void {
    try {
      const config = this.readConfig();
      if (!config.providers) {
        config.providers = {};
      }
      if (!config.providers[provider]) {
        config.providers[provider] = {};
      }
      config.providers[provider]!.apiKey = apiKey;
      this.writeConfig(config);
    } catch (error) {
      throw new Error(`Failed to save ${provider} API key: ${error}`);
    }
  }

  public clearProviderApiKey(provider: ProviderType): void {
    try {
      const config = this.readConfig();
      if (config.providers?.[provider]) {
        delete config.providers[provider]!.apiKey;
        
        // Remove provider section if it's empty
        const providerConfig = config.providers[provider];
        if (providerConfig && Object.keys(providerConfig).length === 0) {
          delete config.providers[provider];
        }
        
        // Remove providers section if it's empty
        if (config.providers && Object.keys(config.providers).length === 0) {
          delete config.providers;
        }
        
        this.writeConfig(config);
      }
    } catch (error) {
      console.warn(`Failed to clear ${provider} API key:`, error);
    }
  }

  public getProviderEndpoint(provider: ProviderType): string | null {
    // Check environment variables first
    const envEndpoint = this.getEnvVarForProvider(provider, 'endpoint');
    if (envEndpoint) {
      return envEndpoint;
    }

    // Then check config file
    const providerConfig = this.getProviderConfig(provider);
    return providerConfig?.endpoint || null;
  }

  public setProviderEndpoint(provider: ProviderType, endpoint: string): void {
    try {
      const config = this.readConfig();
      if (!config.providers) {
        config.providers = {};
      }
      if (!config.providers[provider]) {
        config.providers[provider] = {};
      }
      config.providers[provider]!.endpoint = endpoint;
      this.writeConfig(config);
    } catch (error) {
      throw new Error(`Failed to save ${provider} endpoint: ${error}`);
    }
  }

  public getProviderDefaultModel(provider: ProviderType): string | null {
    const providerConfig = this.getProviderConfig(provider);
    return providerConfig?.defaultModel || null;
  }

  public setProviderDefaultModel(provider: ProviderType, model: string): void {
    try {
      const config = this.readConfig();
      if (!config.providers) {
        config.providers = {};
      }
      if (!config.providers[provider]) {
        config.providers[provider] = {};
      }
      config.providers[provider]!.defaultModel = model;
      this.writeConfig(config);
    } catch (error) {
      throw new Error(`Failed to save ${provider} default model: ${error}`);
    }
  }

  public getProviderDeploymentName(provider: ProviderType): string | null {
    // Check environment variables first
    const envDeployment = this.getEnvVarForProvider(provider, 'deploymentName');
    if (envDeployment) {
      return envDeployment;
    }

    // Then check config file
    const providerConfig = this.getProviderConfig(provider);
    return providerConfig?.deploymentName || null;
  }

  public setProviderDeploymentName(provider: ProviderType, deploymentName: string): void {
    try {
      const config = this.readConfig();
      if (!config.providers) {
        config.providers = {};
      }
      if (!config.providers[provider]) {
        config.providers[provider] = {};
      }
      config.providers[provider]!.deploymentName = deploymentName;
      this.writeConfig(config);
    } catch (error) {
      throw new Error(`Failed to save ${provider} deployment name: ${error}`);
    }
  }

  public getProviderApiVersion(provider: ProviderType): string | null {
    // Check environment variables first
    const envVersion = this.getEnvVarForProvider(provider, 'apiVersion');
    if (envVersion) {
      return envVersion;
    }

    // Then check config file
    const providerConfig = this.getProviderConfig(provider);
    return providerConfig?.apiVersion || null;
  }

  public setProviderApiVersion(provider: ProviderType, apiVersion: string): void {
    try {
      const config = this.readConfig();
      if (!config.providers) {
        config.providers = {};
      }
      if (!config.providers[provider]) {
        config.providers[provider] = {};
      }
      config.providers[provider]!.apiVersion = apiVersion;
      this.writeConfig(config);
    } catch (error) {
      throw new Error(`Failed to save ${provider} API version: ${error}`);
    }
  }

  private getEnvVarForProvider(provider: ProviderType, field: 'apiKey' | 'endpoint' | 'deploymentName' | 'apiVersion'): string | null {
    const envVars: Record<ProviderType, Record<string, string>> = {
      groq: {
        apiKey: 'GROQ_API_KEY',
        endpoint: '',
        deploymentName: '',
        apiVersion: ''
      },
      openai: {
        apiKey: 'OPENAI_API_KEY',
        endpoint: '',
        deploymentName: '',
        apiVersion: ''
      },
      azure: {
        apiKey: 'AZURE_OPENAI_API_KEY',
        endpoint: 'AZURE_OPENAI_ENDPOINT',
        deploymentName: 'AZURE_OPENAI_DEPLOYMENT_NAME',
        apiVersion: 'AZURE_OPENAI_API_VERSION'
      },
      anthropic: {
        apiKey: 'ANTHROPIC_API_KEY',
        endpoint: '',
        deploymentName: '',
        apiVersion: ''
      },
      openrouter: {
        apiKey: 'OPENROUTER_API_KEY',
        endpoint: '',
        deploymentName: '',
        apiVersion: ''
      },
      ollama: {
        apiKey: '',
        endpoint: 'OLLAMA_ENDPOINT',
        deploymentName: '',
        apiVersion: ''
      }
    };

    const envVarName = envVars[provider]?.[field];
    return envVarName ? process.env[envVarName] || null : null;
  }

  public getDefaultModel(): string | null {
    const config = this.readConfig();
    return config.defaultModel || null;
  }

  public setDefaultModel(model: string): void {
    try {
      const config = this.readConfig();
      config.defaultModel = model;
      this.writeConfig(config);
    } catch (error) {
      throw new Error(`Failed to save default model: ${error}`);
    }
  }

  public getProxy(): string | null {
    const config = this.readConfig();
    return config.exaProxy || null;
  }

  public setProxy(proxy: string): void {
    try {
      // Validate proxy input
      const trimmed = proxy?.trim?.() ?? '';
      if (!trimmed) {
        throw new Error('Proxy must be a non-empty string');
      }
      
      // Validate URL format and protocol
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(trimmed);
      } catch {
        throw new Error(`Invalid proxy URL: ${trimmed}`);
      }
      
      const allowedProtocols = new Set(['http:', 'https:', 'socks:', 'socks4:', 'socks5:']);
      if (!allowedProtocols.has(parsedUrl.protocol)) {
        throw new Error(`Unsupported proxy protocol: ${parsedUrl.protocol}`);
      }
      
      const config = this.readConfig();
      config.exaProxy = trimmed;
      this.writeConfig(config);
    } catch (error) {
      // Preserve original error via cause for better debugging
      throw new Error(`Failed to save proxy: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public clearProxy(): void {
    try {
      const config = this.readConfig();
      delete config.exaProxy;

      if (Object.keys(config).length === 0) {
        if (fs.existsSync(this.configPath)) {
          fs.unlinkSync(this.configPath);
        }
      } else {
        this.writeConfig(config);
      }
    } catch (error) {
      console.warn('Failed to clear proxy:', error);
    }
  }
}