import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { 
  CallToolResult, 
  CallToolResultSchema,
  ListToolsResultSchema,
  Tool 
} from '@modelcontextprotocol/sdk/types.js';
import { ConfigManager, MCPServerConfig } from '../utils/local-settings.js';
import { handleMCPError } from './error-handling.js';
import { getLogManager } from '../utils/log-manager.js';

export interface MCPClientInfo {
  name: string;
  client: Client;
  config: MCPServerConfig;
  connected: boolean;
  tools: Tool[];
  lastError?: string;
}

export interface MCPToolInfo {
  serverName: string;
  tool: Tool;
}

export class MCPClientManager {
  private clients: Map<string, MCPClientInfo> = new Map();
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
  }

  /**
   * Initialize all enabled MCP servers
   */
  async initializeClients(): Promise<void> {
    const servers = this.configManager.getMCPServers();
    
    for (const [name, config] of Object.entries(servers)) {
      if (config.enabled !== false) { // Default to enabled if not explicitly disabled
        try {
          await this.connectToServer(name, config);
        } catch (error) {
          handleMCPError(error, name);
        }
      }
    }
  }

  /**
   * Connect to a specific MCP server
   */
  private async connectToServer(name: string, config: MCPServerConfig): Promise<void> {
    const logManager = getLogManager();
    
    try {
      // Use console capture to redirect MCP server logs during connection
      await logManager.captureConsoleOutput(name, async () => {
      let client: Client;
      let transport: StdioClientTransport | SSEClientTransport;

      switch (config.transport) {
        case 'stdio':
          if (!config.command || config.command.trim() === '') {
            throw new Error('Command is required for stdio transport');
          }

          const args = [...(config.args || [])];
          const env: Record<string, string> = {};
          
          // Copy process.env, filtering out undefined values
          for (const [key, value] of Object.entries(process.env)) {
            if (value !== undefined) {
              env[key] = value;
            }
          }
          
          // Add config env
          if (config.env) {
            Object.assign(env, config.env);
          }

          transport = new StdioClientTransport({
            command: config.command,
            args: args,
            env,
            stderr: 'pipe'  // Enable stderr capture for log redirection
          });

          // Capture and redirect stderr output from MCP server
          const logManager = getLogManager();
          if (transport.stderr) {
            transport.stderr.on('data', (data: Buffer) => {
              logManager.filterAndRedirectOutput(name, data.toString());
            });
          }
          break;

        case 'sse':
          if (!config.url) {
            throw new Error('URL is required for SSE transport');
          }
          transport = new SSEClientTransport(new URL(config.url));
          break;

        case 'http':
          // HTTP transport would be implemented similarly to SSE
          // For now, we'll use SSE as a fallback
          if (!config.url) {
            throw new Error('URL is required for HTTP transport');
          }
          transport = new SSEClientTransport(new URL(config.url));
          break;

        default:
          throw new Error(`Unsupported transport type: ${config.transport}`);
      }

      client = new Client({
        name: 'exa-code-cli',
        version: '1.0.2'
      }, {
        capabilities: {
          tools: {}
        }
      });

      // Set timeout if specified
      const timeout = config.timeout || this.configManager.getMCPConfig().globalTimeout || 30000;

      // Connect with timeout
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), timeout)
        )
      ]);

      // Get available tools
      const toolsResult = await client.request({ method: 'tools/list' }, ListToolsResultSchema);

      const clientInfo: MCPClientInfo = {
        name,
        client,
        config,
        connected: true,
        tools: toolsResult.tools || []
      };

      this.clients.set(name, clientInfo);

      // Log successful connection (keep on console - important status)
      console.log(`✓ Connected to MCP server '${name}' (${clientInfo.tools.length} tools available)`);
      
        // Also log to file for record keeping  
        logManager.logInfo(`Connected to MCP server '${name}' with ${clientInfo.tools.length} tools`);
      });
    } catch (error) {
      const clientInfo: MCPClientInfo = {
        name,
        client: undefined as any, // Will not be used when connected = false
        config,
        connected: false,
        tools: [],
        lastError: error instanceof Error ? error.message : String(error)
      };

      this.clients.set(name, clientInfo);
      
      // Log connection error to file
      logManager.logMCPError(name, `Connection failed: ${error instanceof Error ? error.message : String(error)}`);
      
      throw error;
    }
  }

  /**
   * Disconnect from a specific server
   */
  async disconnectFromServer(name: string): Promise<void> {
    const clientInfo = this.clients.get(name);
    if (clientInfo && clientInfo.connected) {
      try {
        await clientInfo.client.close();
      } catch (error) {
        console.warn(`Error closing connection to '${name}': ${error}`);
      }
    }
    this.clients.delete(name);
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.keys()).map(name => 
      this.disconnectFromServer(name)
    );
    await Promise.allSettled(disconnectPromises);
  }

  /**
   * Get all available tools from all connected servers
   */
  getAllTools(): MCPToolInfo[] {
    const tools: MCPToolInfo[] = [];

    for (const [serverName, clientInfo] of this.clients.entries()) {
      if (clientInfo.connected) {
        for (const tool of clientInfo.tools) {
          tools.push({
            serverName,
            tool
          });
        }
      }
    }

    return tools;
  }

  /**
   * Get tools from a specific server
   */
  getServerTools(serverName: string): Tool[] {
    const clientInfo = this.clients.get(serverName);
    return (clientInfo && clientInfo.connected) ? clientInfo.tools : [];
  }

  /**
   * Find a tool by name across all servers
   */
  findTool(toolName: string): MCPToolInfo | null {
    for (const [serverName, clientInfo] of this.clients.entries()) {
      if (clientInfo.connected) {
        const tool = clientInfo.tools.find(t => t.name === toolName);
        if (tool) {
          return { serverName, tool };
        }
      }
    }
    return null;
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverName: string, toolName: string, arguments_: any = {}): Promise<CallToolResult> {
    const clientInfo = this.clients.get(serverName);
    
    if (!clientInfo) {
      throw new Error(`MCP server '${serverName}' not found`);
    }

    if (!clientInfo.connected) {
      throw new Error(`MCP server '${serverName}' is not connected: ${clientInfo.lastError || 'Unknown error'}`);
    }

    // Verify tool exists
    const tool = clientInfo.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found on server '${serverName}'`);
    }

    try {
      const result = await clientInfo.client.request({
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: arguments_
        }
      }, CallToolResultSchema);

      return result;
    } catch (error) {
      const mcpError = handleMCPError(error, serverName, toolName);
      throw new Error(mcpError.message);
    }
  }

  /**
   * Get connection status for all servers
   */
  getServerStatus(): Array<{
    name: string;
    connected: boolean;
    toolCount: number;
    lastError?: string;
    config: MCPServerConfig;
  }> {
    return Array.from(this.clients.entries()).map(([name, info]) => ({
      name,
      connected: info.connected,
      toolCount: info.tools.length,
      lastError: info.lastError,
      config: info.config
    }));
  }

  /**
   * Reconnect to a specific server
   */
  async reconnectToServer(serverName: string): Promise<void> {
    const clientInfo = this.clients.get(serverName);
    if (!clientInfo) {
      throw new Error(`MCP server '${serverName}' not found`);
    }

    // Disconnect first if connected
    if (clientInfo.connected) {
      await this.disconnectFromServer(serverName);
    }

    // Reconnect
    await this.connectToServer(serverName, clientInfo.config);
  }

  /**
   * Refresh server configuration and reconnect if needed
   */
  async refreshServers(): Promise<void> {
    // Get current configuration
    const currentServers = this.configManager.getMCPServers();
    const currentServerNames = new Set(Object.keys(currentServers));
    const connectedServerNames = new Set(this.clients.keys());

    // Disconnect from servers that are no longer configured
    for (const serverName of connectedServerNames) {
      if (!currentServerNames.has(serverName)) {
        await this.disconnectFromServer(serverName);
      }
    }

    // Connect to new or updated servers
    for (const [serverName, config] of Object.entries(currentServers)) {
      if (config.enabled !== false) {
        const existingInfo = this.clients.get(serverName);
        
        // Connect if not connected, or reconnect if config changed
        if (!existingInfo || !existingInfo.connected || 
            JSON.stringify(existingInfo.config) !== JSON.stringify(config)) {
          
          if (existingInfo) {
            await this.disconnectFromServer(serverName);
          }
          
          try {
            await this.connectToServer(serverName, config);
          } catch (error) {
            console.warn(`Failed to connect to MCP server '${serverName}': ${error}`);
          }
        }
      } else {
        // Disconnect if disabled
        const existingInfo = this.clients.get(serverName);
        if (existingInfo && existingInfo.connected) {
          await this.disconnectFromServer(serverName);
        }
      }
    }
  }
}

// Global instance
let globalMCPClientManager: MCPClientManager | null = null;

export function getMCPClientManager(): MCPClientManager {
  if (!globalMCPClientManager) {
    globalMCPClientManager = new MCPClientManager();
  }
  return globalMCPClientManager;
}