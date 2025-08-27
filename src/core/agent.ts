import { executeTool } from '../tools/tools.js';
import { validateReadBeforeEdit, getReadBeforeEditError } from '../tools/validators.js';
import { ALL_TOOL_SCHEMAS, DANGEROUS_TOOLS, APPROVAL_REQUIRED_TOOLS } from '../tools/tool-schemas.js';
import { ConfigManager } from '../utils/local-settings.js';
import { ProviderFactory, ProviderType, registerAllProviders } from '../providers/factory.js';
import { IProvider } from '../providers/base.js';
import { DEFAULT_MODELS } from '../providers/models.js';
import fs from 'fs';
import path from 'path';

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export class Agent {
  private provider: IProvider | null = null;
  private currentProviderType: ProviderType;
  private messages: Message[] = [];
  private model: string;
  private temperature: number;
  private sessionAutoApprove: boolean = false;
  private systemMessage: string;
  private configManager: ConfigManager;
  private proxyOverride?: string;
  private onToolStart?: (name: string, args: Record<string, any>) => void;
  private onToolEnd?: (name: string, result: any) => void;
  private onToolApproval?: (toolName: string, toolArgs: Record<string, any>) => Promise<{ approved: boolean; autoApproveSession?: boolean }>;
  private onThinkingText?: (content: string, reasoning?: string) => void;
  private onFinalMessage?: (content: string, reasoning?: string) => void;
  private onMaxIterations?: (maxIterations: number) => Promise<boolean>;
  private onApiUsage?: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; total_time?: number }) => void;
  private onError?: (error: string) => Promise<boolean>;
  private requestCount: number = 0;
  private currentAbortController: AbortController | null = null;
  private isInterrupted: boolean = false;

  private constructor(
    model: string,
    temperature: number,
    systemMessage: string | null,
    debug?: boolean,
    proxyOverride?: string
  ) {
    this.model = model;
    this.temperature = temperature;
    this.configManager = new ConfigManager();
    this.proxyOverride = proxyOverride;
    this.currentProviderType = this.configManager.getDefaultProvider();
    
    // Set debug mode
    debugEnabled = debug || false;

    // Build system message
    if (systemMessage) {
      this.systemMessage = systemMessage;
    } else {
      this.systemMessage = this.buildDefaultSystemMessage();
    }

    // Add system message to conversation
    this.messages.push({ role: 'system', content: this.systemMessage });

    // Load project context if available
    this.loadProjectContext();
  }

  private loadProjectContext(): void {
    try {
      const explicitContextFile = process.env.EXA_CONTEXT_FILE;
      const baseDir = process.env.EXA_CONTEXT_DIR || process.cwd();
      const contextPath = explicitContextFile || path.join(baseDir, '.exa', 'context.md');
      const contextLimit = parseInt(process.env.EXA_CONTEXT_LIMIT || '20000', 10);
      if (fs.existsSync(contextPath)) {
        const ctx = fs.readFileSync(contextPath, 'utf-8');
        const trimmed = ctx.length > contextLimit ? ctx.slice(0, contextLimit) + '\n... [truncated]' : ctx;
        const contextSource = explicitContextFile ? contextPath : '.exa/context.md';
        this.messages.push({
          role: 'system',
          content: `Project context loaded from ${contextSource}. Use this as high-level reference when reasoning about the repository.\n\n${trimmed}`
        });
      }
    } catch (error) {
      if (debugEnabled) {
        debugLog('Failed to load project context:', error);
      }
    }
  }

  static async create(
    model: string,
    temperature: number,
    systemMessage: string | null,
    debug?: boolean,
    proxyOverride?: string
  ): Promise<Agent> {
    // Ensure providers are registered
    await registerAllProviders();
    
    // Check for default model in config if model not explicitly provided
    const configManager = new ConfigManager();
    const defaultProvider = configManager.getDefaultProvider();
    const defaultModel = configManager.getProviderDefaultModel(defaultProvider) || DEFAULT_MODELS[defaultProvider];
    const selectedModel = model || defaultModel;
    
    const agent = new Agent(
      selectedModel,
      temperature,
      systemMessage,
      debug,
      proxyOverride
    );
    
    // Initialize provider
    await agent.initializeCurrentProvider();
    
    return agent;
  }

  private async initializeCurrentProvider(): Promise<void> {
    try {
      this.provider = await ProviderFactory.createProvider(this.currentProviderType);
      
      // Get provider configuration
      const config = this.getProviderConfig(this.currentProviderType);
      
      // Check compatibility if provider supports it
      if (this.provider.checkCompatibility) {
        const compatibility = this.provider.checkCompatibility(this.model);
        if (!compatibility.compatible) {
          debugLog(`Model ${this.model} compatibility issues:`, compatibility.issues);
          console.warn(`Model ${this.model} may have compatibility issues: ${compatibility.issues.join(', ')}`);
        }
      }
      
      // Initialize provider
      await this.provider.initialize(config);
      
      debugLog(`Initialized ${this.currentProviderType} provider successfully`);
    } catch (error) {
      debugLog(`Failed to initialize ${this.currentProviderType} provider:`, error);
      
      // If this is not the fallback provider, try to fallback to groq
      if (this.currentProviderType !== 'groq') {
        debugLog('Attempting fallback to groq provider');
        try {
          this.currentProviderType = 'groq';
          this.model = DEFAULT_MODELS.groq;
          this.configManager.setDefaultProvider('groq');
          this.configManager.setProviderDefaultModel('groq', this.model);
          
          this.provider = await ProviderFactory.createProvider('groq');
          const fallbackConfig = this.getProviderConfig('groq');
          await this.provider.initialize(fallbackConfig);
          
          debugLog('Successfully fell back to groq provider');
          return;
        } catch (fallbackError) {
          debugLog('Fallback to groq also failed:', fallbackError);
        }
      }
      
      throw new Error(`Failed to initialize ${this.currentProviderType} provider: ${error}`);
    }
  }

  private getProviderConfig(providerType: ProviderType): any {
    const apiKey = this.configManager.getProviderApiKey(providerType);
    if (!apiKey) {
      throw new Error(`No API key found for ${providerType} provider. Please use /login ${providerType} to set your credentials.`);
    }

    const config: any = {
      apiKey,
      model: this.model
    };

    // Add provider-specific configuration
    switch (providerType) {
      case 'azure':
        const endpoint = this.configManager.getProviderEndpoint(providerType);
        const deploymentName = this.configManager.getProviderDeploymentName(providerType);
        const apiVersion = this.configManager.getProviderApiVersion(providerType);
        
        if (!endpoint) {
          throw new Error(`No endpoint found for Azure OpenAI. Please use /login azure to set your credentials.`);
        }
        if (!deploymentName) {
          throw new Error(`No deployment name found for Azure OpenAI. Please use /login azure to set your credentials.`);
        }
        
        config.endpoint = endpoint;
        config.deploymentName = deploymentName;
        config.apiVersion = apiVersion || '2024-10-21';
        break;
      
      default:
        // Other providers only need API key
        break;
    }

    return config;
  }

  public async switchProvider(providerType: ProviderType, model?: string): Promise<void> {
    debugLog(`Switching to provider: ${providerType}, model: ${model}`);
    
    // Save current state in case we need to rollback
    const previousProviderType = this.currentProviderType;
    const previousModel = this.model;
    
    try {
      // Update provider type
      this.currentProviderType = providerType;
      this.configManager.setDefaultProvider(providerType);
      
      // Update model if provided
      if (model) {
        this.model = model;
        this.configManager.setProviderDefaultModel(providerType, model);
      } else {
        // Use default model for new provider
        const defaultModel = this.configManager.getProviderDefaultModel(providerType) || DEFAULT_MODELS[providerType];
        this.model = defaultModel;
      }
      
      // Clear current provider
      this.provider = null;
      
      // Initialize new provider
      await this.initializeCurrentProvider();
      
      // Update system message to reflect new provider
      this.systemMessage = this.buildDefaultSystemMessage();
      
      // Update the system message in the conversation
      const systemMsgIndex = this.messages.findIndex(msg => msg.role === 'system' && msg.content.includes('coding assistant'));
      if (systemMsgIndex >= 0) {
        this.messages[systemMsgIndex].content = this.systemMessage;
      }
      
      debugLog(`Successfully switched to ${providerType} provider with model ${this.model}`);
    } catch (error) {
      // Rollback to previous state
      debugLog(`Failed to switch to ${providerType}, rolling back to ${previousProviderType}`);
      this.currentProviderType = previousProviderType;
      this.model = previousModel;
      this.configManager.setDefaultProvider(previousProviderType);
      this.configManager.setProviderDefaultModel(previousProviderType, previousModel);
      
      // Try to restore previous provider
      try {
        this.provider = await ProviderFactory.createProvider(previousProviderType);
        const config = this.getProviderConfig(previousProviderType);
        await this.provider.initialize(config);
        debugLog(`Rolled back to ${previousProviderType} provider successfully`);
      } catch (rollbackError) {
        debugLog('Failed to rollback, system may be in inconsistent state:', rollbackError);
      }
      
      throw error;
    }
  }

  private buildDefaultSystemMessage(): string {
    const providerName = this.provider?.displayName || this.currentProviderType;
    return `You are a coding assistant powered by ${this.model} on ${providerName}. Tools are available to you. Use tools to complete tasks.

CRITICAL: For ANY implementation request (building apps, creating components, writing code), you MUST use tools to create actual files. NEVER provide text-only responses for coding tasks that require implementation.

Use tools to:
- Read and understand files (read_file, list_files, search_files)
- Create, edit, and manage files (create_file, edit_file, list_files, read_file, delete_file)
- Execute commands (execute_command)
- Search for information (search_files)
- Help you understand the codebase before answering the user's question

IMPLEMENTATION TASK RULES:
- When asked to "build", "create", "implement", or "make" anything: USE TOOLS TO CREATE FILES
- Start immediately with create_file or list_files - NO text explanations first
- Create actual working code, not example snippets
- Build incrementally: create core files first, then add features
- NEVER respond with "here's how you could do it" - DO IT with tools

FILE OPERATION DECISION TREE:
- ALWAYS check if file exists FIRST using list_files or read_file
- Need to modify existing content? → read_file first, then edit_file (never create_file)
- Need to create something new? → list_files to check existence first, then create_file
- File exists but want to replace completely? → create_file with overwrite=true
- Unsure if file exists? → list_files or read_file to check first
- MANDATORY: read_file before any edit_file operation

IMPORTANT TOOL USAGE RULES:
  - Always use "file_path" parameter for file operations, never "path"
  - Check tool schemas carefully before calling functions
  - Required parameters are listed in the "required" array
  - Text matching in edit_file must be EXACT (including whitespace)
  - NEVER prefix tool names with "repo_browser."

COMMAND EXECUTION SAFETY:
  - Only use execute_command for commands that COMPLETE QUICKLY (tests, builds, short scripts)
  - NEVER run commands that start long-running processes (servers, daemons, web apps)
  - Examples of AVOIDED commands: "flask app.py", "npm start", "python -m http.server"
  - Examples of SAFE commands: "python test_script.py", "npm test", "ls -la", "git status"
  - If a long-running command is needed to complete the task, provide it to the user at the end of the response, not as a tool call, with a description of what it's for.

IMPORTANT: When creating files, keep them focused and reasonably sized. For large applications:
1. Start with a simple, minimal version first
2. Create separate files for different components
3. Build incrementally rather than generating massive files at once

Be direct and efficient.

Don't generate markdown tables.

When asked about your identity, you should identify yourself as a coding assistant running on the ${this.model} model via ${providerName}.`;
  }

  public setToolCallbacks(callbacks: {
    onToolStart?: (name: string, args: Record<string, any>) => void;
    onToolEnd?: (name: string, result: any) => void;
    onToolApproval?: (toolName: string, toolArgs: Record<string, any>) => Promise<{ approved: boolean; autoApproveSession?: boolean }>;
    onThinkingText?: (content: string) => void;
    onFinalMessage?: (content: string) => void;
    onMaxIterations?: (maxIterations: number) => Promise<boolean>;
    onApiUsage?: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; total_time?: number }) => void;
    onError?: (error: string) => Promise<boolean>;
  }) {
    this.onToolStart = callbacks.onToolStart;
    this.onToolEnd = callbacks.onToolEnd;
    this.onToolApproval = callbacks.onToolApproval;
    this.onThinkingText = callbacks.onThinkingText;
    this.onFinalMessage = callbacks.onFinalMessage;
    this.onMaxIterations = callbacks.onMaxIterations;
    this.onApiUsage = callbacks.onApiUsage;
    this.onError = callbacks.onError;
  }

  public getCurrentProvider(): ProviderType {
    return this.currentProviderType;
  }

  public async configureProvider(providerType: ProviderType, credentials: Record<string, string>): Promise<void> {
    // Save credentials to configuration
    if (credentials.apiKey) {
      this.configManager.setProviderApiKey(providerType, credentials.apiKey);
    }
    if (credentials.endpoint) {
      this.configManager.setProviderEndpoint(providerType, credentials.endpoint);
    }
    if (credentials.deploymentName) {
      this.configManager.setProviderDeploymentName(providerType, credentials.deploymentName);
    }
    if (credentials.apiVersion) {
      this.configManager.setProviderApiVersion(providerType, credentials.apiVersion);
    }

    // If this is the current provider, reinitialize it
    if (providerType === this.currentProviderType) {
      await this.initializeCurrentProvider();
    }
  }

  public getCurrentModel(): string {
    return this.model;
  }

  public clearHistory(): void {
    // Reset messages to only contain system messages
    this.messages = this.messages.filter(msg => msg.role === 'system');
  }

  public setModel(model: string): void {
    this.model = model;
    // Save as default model for current provider
    this.configManager.setProviderDefaultModel(this.currentProviderType, model);
    // Update system message to reflect new model
    this.systemMessage = this.buildDefaultSystemMessage();
    // Update the system message in the conversation
    const systemMsgIndex = this.messages.findIndex(msg => msg.role === 'system' && msg.content.includes('coding assistant'));
    if (systemMsgIndex >= 0) {
      this.messages[systemMsgIndex].content = this.systemMessage;
    }
  }

  public setSessionAutoApprove(enabled: boolean): void {
    this.sessionAutoApprove = enabled;
  }

  public interrupt(): void {
    debugLog('Interrupting current request');
    this.isInterrupted = true;
    
    if (this.currentAbortController) {
      debugLog('Aborting current API request');
      this.currentAbortController.abort();
    }
    
    // Add interruption message to conversation
    this.messages.push({
      role: 'system',
      content: 'User has interrupted the request.'
    });
  }

  async chat(userInput: string): Promise<void> {
    // Reset interrupt flag at the start of a new chat
    this.isInterrupted = false;
    
    // Check if provider is initialized
    if (!this.provider) {
      throw new Error(`${this.currentProviderType} provider not initialized. Please check your configuration.`);
    }

    // Add user message
    this.messages.push({ role: 'user', content: userInput });

    const maxIterations = 50;
    let iteration = 0;

    while (true) { // Outer loop for iteration reset
      while (iteration < maxIterations) {
        // Check for interruption before each iteration
        if (this.isInterrupted) {
          debugLog('Chat loop interrupted by user');
          this.currentAbortController = null;
          return;
        }
        
        try {
          debugLog(`Making API call using ${this.currentProviderType} provider with model:`, this.model);
          debugLog('Messages count:', this.messages.length);
          debugLog('Last few messages:', this.messages.slice(-3));
          
          this.requestCount++;
          
          // Create AbortController for this request
          this.currentAbortController = new AbortController();
          
          const response = await this.provider.chat(this.messages, {
            model: this.model,
            tools: ALL_TOOL_SCHEMAS,
            toolChoice: 'auto',
            temperature: this.temperature,
            maxTokens: 8000
          });

          debugLog('API response received:', response);
          debugLog('Response usage:', response.usage);
          debugLog('Response finish_reason:', response.finishReason);
          
          // Pass usage data to callback if available
          if (response.usage && this.onApiUsage) {
            this.onApiUsage({
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
              total_time: response.usage.total_time
            });
          }
          
          debugLog('Message content length:', response.content?.length || 0);
          debugLog('Message has tool_calls:', !!response.toolCalls);
          debugLog('Message tool_calls count:', response.toolCalls?.length || 0);

          // Handle tool calls if present
          if (response.toolCalls && response.toolCalls.length > 0) {
            // Show thinking text or reasoning if present
            if (response.content || response.reasoning) {
              if (this.onThinkingText) {
                this.onThinkingText(response.content || '', response.reasoning);
              }
            }

            // Add assistant message to history
            const assistantMsg: Message = {
              role: 'assistant',
              content: response.content || ''
            };
            assistantMsg.tool_calls = response.toolCalls;
            this.messages.push(assistantMsg);

            // Execute tool calls
            for (const toolCall of response.toolCalls) {
              // Check for interruption before each tool execution
              if (this.isInterrupted) {
                debugLog('Tool execution interrupted by user');
                this.currentAbortController = null;
                return;
              }
              
              const result = await this.executeToolCall(toolCall);

              // Add tool result to conversation (including rejected ones)
              this.messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result)
              });

              // Check if user rejected the tool, if so, stop processing
              if (result.userRejected) {
                // Add a note to the conversation that the user rejected the tool
                this.messages.push({
                  role: 'system',
                  content: `The user rejected the ${toolCall.function.name} tool execution. The response has been terminated. Please wait for the user's next instruction.`
                });
                return;
              }
            }

            // Continue loop to get model response to tool results
            iteration++;
            continue;
          }

          // No tool calls, this is the final response
          const content = response.content || '';
          debugLog('Final response - no tool calls detected');
          debugLog('Final content length:', content.length);
          debugLog('Final content preview:', content.substring(0, 200));
          
          if (this.onFinalMessage) {
            debugLog('Calling onFinalMessage callback');
            this.onFinalMessage(content, response.reasoning);
          } else {
            debugLog('No onFinalMessage callback set');
          }

          // Add final response to conversation history
          this.messages.push({
            role: 'assistant',
            content: content
          });

          debugLog('Final response added to conversation history, exiting chat loop');
          this.currentAbortController = null; // Clear abort controller
          return; // Successfully completed, exit both loops

        } catch (error) {
          this.currentAbortController = null; // Clear abort controller
          
          // Check if this is an abort error due to user interruption
          if (error instanceof Error && (
            error.message.includes('Request was aborted') ||
            error.message.includes('The operation was aborted') ||
            error.name === 'AbortError'
          )) {
            debugLog('API request aborted due to user interruption');
            // Don't add error message if it's an interruption - the interrupt message was already added
            return;
          }
          
          debugLog('Error occurred during API call:', error);
          debugLog('Error details:', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack available'
          });
          
          // Add API error as context message instead of terminating chat
          let errorMessage = 'Unknown error occurred';
          let is401Error = false;
          
          if (error instanceof Error) {
            errorMessage = `Error: ${error.message}`;
            // Check for authentication errors
            if (error.message.includes('401') || error.message.includes('invalid API key') || error.message.includes('authentication')) {
              is401Error = true;
            }
          } else {
            errorMessage = `Error: ${String(error)}`;
          }
          
          // For 401 errors (invalid API key), don't retry - terminate immediately
          if (is401Error) {
            throw new Error(`${errorMessage}. Please check your ${this.currentProviderType} API key and use /login ${this.currentProviderType} to set a valid key.`);
          }
          
          // Ask user if they want to retry via callback
          if (this.onError) {
            const shouldRetry = await this.onError(errorMessage);
            if (shouldRetry) {
              // User wants to retry - continue the loop without adding error to conversation
              iteration++;
              continue;
            } else {
              // User chose not to retry - add error message and return
              this.messages.push({
                role: 'system',
                content: `Request failed with error: ${errorMessage}. User chose not to retry.`
              });
              return;
            }
          } else {
            // No error callback available - use old behavior
            // Add error context to conversation for model to see and potentially recover
            this.messages.push({
              role: 'system',
              content: `Previous API request failed with error: ${errorMessage}. Please try a different approach or ask the user for clarification.`
            });
            
            // Continue conversation loop to let model attempt recovery
            iteration++;
            continue;
          }
        }
      }

      // Hit max iterations, ask user if they want to continue
      if (iteration >= maxIterations) {
        let shouldContinue = false;
        if (this.onMaxIterations) {
          shouldContinue = await this.onMaxIterations(maxIterations);
        }
        if (shouldContinue) {
          iteration = 0; // Reset iteration counter
          continue; // Continue the outer loop
        } else {
          return; // Exit both loops
        }
      }
    }
  }

  private async executeToolCall(toolCall: any): Promise<Record<string, any>> {
    try {
      // Strip 'repo_browser.' prefix if present (some models hallucinate this)
      let toolName = toolCall.function.name;
      if (toolName.startsWith('repo_browser.')) {
        toolName = toolName.substring('repo_browser.'.length);
      }

      // Handle truncated tool calls
      let toolArgs: any;
      try {
        toolArgs = JSON.parse(toolCall.function.arguments);
      } catch (error) {
        return {
          error: `Tool arguments truncated: ${error}. Please break this into smaller pieces or use shorter content.`,
          success: false
        };
      }

      // Notify UI about tool start
      if (this.onToolStart) {
        this.onToolStart(toolName, toolArgs);
      }

      // Check read-before-edit for edit tools
      if (toolName === 'edit_file' && toolArgs.file_path) {
        if (!validateReadBeforeEdit(toolArgs.file_path)) {
          const errorMessage = getReadBeforeEditError(toolArgs.file_path);
          const result = { error: errorMessage, success: false };
          if (this.onToolEnd) {
            this.onToolEnd(toolName, result);
          }
          return result;
        }
      }

      // Check if tool needs approval (only after validation passes)
      const isDangerous = DANGEROUS_TOOLS.includes(toolName);
      const requiresApproval = APPROVAL_REQUIRED_TOOLS.includes(toolName);
      const needsApproval = isDangerous || requiresApproval;
      
      // For APPROVAL_REQUIRED_TOOLS, check if session auto-approval is enabled
      const canAutoApprove = requiresApproval && !isDangerous && this.sessionAutoApprove;
            
      if (needsApproval && !canAutoApprove) {
        let approvalResult: { approved: boolean; autoApproveSession?: boolean };
        
        if (this.onToolApproval) {
          // Check for interruption before waiting for approval
          if (this.isInterrupted) {
            const result = { error: 'Tool execution interrupted by user', success: false, userRejected: true };
            if (this.onToolEnd) {
              this.onToolEnd(toolName, result);
            }
            return result;
          }
          
          approvalResult = await this.onToolApproval(toolName, toolArgs);
          
          // Check for interruption after approval process
          if (this.isInterrupted) {
            const result = { error: 'Tool execution interrupted by user', success: false, userRejected: true };
            if (this.onToolEnd) {
              this.onToolEnd(toolName, result);
            }
            return result;
          }
        } else {
          // No approval callback available, reject by default
          approvalResult = { approved: false };
        }
        
        // Enable session auto-approval if requested (only for APPROVAL_REQUIRED_TOOLS)
        if (approvalResult.autoApproveSession && requiresApproval && !isDangerous) {
          this.sessionAutoApprove = true;
        }
        
        if (!approvalResult.approved) {
          const result = { error: 'Tool execution canceled by user', success: false, userRejected: true };
          if (this.onToolEnd) {
            this.onToolEnd(toolName, result);
          }
          return result;
        }
      }
    
      // Execute tool
      const result = await executeTool(toolName, toolArgs);

      // Notify UI about tool completion
      if (this.onToolEnd) {
        this.onToolEnd(toolName, result);
      }

      return result;

    } catch (error) {
      const errorMsg = `Tool execution error: ${error}`;
      return { error: errorMsg, success: false };
    }
  }
}

// Debug logging to file
const DEBUG_LOG_FILE = path.join(process.cwd(), 'debug-agent.log');
let debugLogCleared = false;
let debugEnabled = false;

function debugLog(message: string, data?: any) {
  if (!debugEnabled) return;
  
  // Clear log file on first debug log of each session
  if (!debugLogCleared) {
    fs.writeFileSync(DEBUG_LOG_FILE, '');
    debugLogCleared = true;
  }
  
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
  fs.appendFileSync(DEBUG_LOG_FILE, logEntry);
}