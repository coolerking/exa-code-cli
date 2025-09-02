import { getMCPClientManager } from './client-manager.js';

export interface MCPError {
  type: 'connection' | 'timeout' | 'tool_not_found' | 'execution' | 'config' | 'unknown';
  serverName?: string;
  toolName?: string;
  message: string;
  originalError?: any;
  timestamp: string;
}

export interface MCPHealthStatus {
  serverName: string;
  connected: boolean;
  lastError?: MCPError;
  toolCount: number;
  lastHealthCheck: string;
}

class MCPErrorHandler {
  private errorHistory: MCPError[] = [];
  private healthStatus: Map<string, MCPHealthStatus> = new Map();
  private retryAttempts: Map<string, number> = new Map();
  private maxRetries = 3;
  private retryDelay = 5000; // 5 seconds

  /**
   * Classify and handle MCP errors
   */
  handleError(error: any, serverName?: string, toolName?: string): MCPError {
    const mcpError: MCPError = {
      type: this.classifyError(error, serverName, toolName),
      serverName,
      toolName,
      message: this.extractErrorMessage(error),
      originalError: error,
      timestamp: new Date().toISOString()
    };

    // Store error in history
    this.errorHistory.push(mcpError);
    
    // Keep only last 100 errors
    if (this.errorHistory.length > 100) {
      this.errorHistory = this.errorHistory.slice(-100);
    }

    // Update health status
    if (serverName) {
      this.updateHealthStatus(serverName, false, mcpError);
    }

    return mcpError;
  }

  /**
   * Classify error type based on error content
   */
  private classifyError(error: any, serverName?: string, toolName?: string): MCPError['type'] {
    const message = this.extractErrorMessage(error).toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }

    if (message.includes('connection') || message.includes('connect') || 
        message.includes('econnrefused') || message.includes('enotfound')) {
      return 'connection';
    }

    if (message.includes('tool') && message.includes('not found')) {
      return 'tool_not_found';
    }

    if (message.includes('config') || message.includes('invalid') || 
        message.includes('missing required')) {
      return 'config';
    }

    if (toolName && serverName) {
      return 'execution';
    }

    if (serverName) {
      return 'connection';
    }

    return 'unknown';
  }

  /**
   * Extract meaningful error message
   */
  private extractErrorMessage(error: any): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      return error.message;
    }

    if (error && typeof error === 'object') {
      if (error.message) {
        return error.message;
      }
      if (error.error) {
        return this.extractErrorMessage(error.error);
      }
      if (error.code) {
        return `Error code: ${error.code}`;
      }
    }

    return 'Unknown error occurred';
  }

  /**
   * Update health status for a server
   */
  private updateHealthStatus(serverName: string, connected: boolean, error?: MCPError): void {
    const mcpManager = getMCPClientManager();
    const serverStatus = mcpManager.getServerStatus().find(s => s.name === serverName);
    
    const healthStatus: MCPHealthStatus = {
      serverName,
      connected,
      lastError: error,
      toolCount: serverStatus?.toolCount || 0,
      lastHealthCheck: new Date().toISOString()
    };

    this.healthStatus.set(serverName, healthStatus);
  }

  /**
   * Attempt to reconnect to a server with retry logic
   */
  async attemptReconnection(serverName: string): Promise<boolean> {
    const currentAttempts = this.retryAttempts.get(serverName) || 0;
    
    if (currentAttempts >= this.maxRetries) {
      console.warn(`Max retry attempts (${this.maxRetries}) reached for MCP server '${serverName}'`);
      return false;
    }

    try {
      console.log(`Attempting to reconnect to MCP server '${serverName}' (attempt ${currentAttempts + 1}/${this.maxRetries})`);
      
      // Wait before retry
      if (currentAttempts > 0) {
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * currentAttempts));
      }

      const mcpManager = getMCPClientManager();
      await mcpManager.reconnectToServer(serverName);
      
      // Reset retry counter on success
      this.retryAttempts.delete(serverName);
      this.updateHealthStatus(serverName, true);
      
      console.log(`✓ Successfully reconnected to MCP server '${serverName}'`);
      return true;
    } catch (error) {
      this.retryAttempts.set(serverName, currentAttempts + 1);
      this.handleError(error, serverName);
      return false;
    }
  }

  /**
   * Get recent errors for a server
   */
  getServerErrors(serverName: string, limit: number = 10): MCPError[] {
    return this.errorHistory
      .filter(error => error.serverName === serverName)
      .slice(-limit)
      .reverse(); // Most recent first
  }

  /**
   * Get all recent errors
   */
  getAllErrors(limit: number = 20): MCPError[] {
    return this.errorHistory
      .slice(-limit)
      .reverse(); // Most recent first
  }

  /**
   * Get health status for all servers
   */
  getHealthStatus(): MCPHealthStatus[] {
    // Update health status from current MCP manager state
    const mcpManager = getMCPClientManager();
    const currentStatus = mcpManager.getServerStatus();
    
    for (const status of currentStatus) {
      if (!this.healthStatus.has(status.name)) {
        this.updateHealthStatus(status.name, status.connected);
      } else {
        const existing = this.healthStatus.get(status.name)!;
        existing.connected = status.connected;
        existing.toolCount = status.toolCount;
        existing.lastHealthCheck = new Date().toISOString();
        
        if (!status.connected && status.lastError) {
          existing.lastError = {
            type: 'connection',
            serverName: status.name,
            message: status.lastError,
            timestamp: new Date().toISOString()
          };
        }
      }
    }

    return Array.from(this.healthStatus.values());
  }

  /**
   * Clear error history
   */
  clearErrorHistory(serverName?: string): void {
    if (serverName) {
      this.errorHistory = this.errorHistory.filter(error => error.serverName !== serverName);
      this.retryAttempts.delete(serverName);
    } else {
      this.errorHistory = [];
      this.retryAttempts.clear();
    }
  }

  /**
   * Generate error recovery suggestions
   */
  getRecoverySuggestions(error: MCPError): string[] {
    const suggestions: string[] = [];

    switch (error.type) {
      case 'connection':
        suggestions.push('Check if the MCP server is running');
        suggestions.push('Verify the server command and arguments');
        suggestions.push('Check network connectivity for HTTP/SSE servers');
        suggestions.push(`Try reconnecting: exa mcp enable ${error.serverName}`);
        break;

      case 'timeout':
        suggestions.push('Increase the timeout value in server configuration');
        suggestions.push('Check if the server is overloaded or slow to respond');
        suggestions.push('Verify network stability for remote servers');
        break;

      case 'tool_not_found':
        suggestions.push(`Verify that tool '${error.toolName}' exists on server '${error.serverName}'`);
        suggestions.push('Check server documentation for available tools');
        suggestions.push('Try refreshing the server connection');
        break;

      case 'execution':
        suggestions.push('Check tool arguments and parameter format');
        suggestions.push('Verify tool permissions and requirements');
        suggestions.push('Review server logs for more details');
        break;

      case 'config':
        suggestions.push('Check MCP server configuration syntax');
        suggestions.push('Verify all required parameters are provided');
        suggestions.push('Review environment variables and paths');
        break;

      default:
        suggestions.push('Check server logs for more information');
        suggestions.push('Try restarting the MCP server');
        suggestions.push('Contact server administrator if the issue persists');
    }

    return suggestions;
  }

  /**
   * Generate health report
   */
  generateHealthReport(): {
    summary: {
      totalServers: number;
      connectedServers: number;
      totalTools: number;
      recentErrors: number;
    };
    servers: Array<{
      name: string;
      status: 'healthy' | 'degraded' | 'unhealthy';
      connected: boolean;
      toolCount: number;
      lastError?: string;
      retryAttempts: number;
    }>;
    recentErrors: MCPError[];
  } {
    const healthStatus = this.getHealthStatus();
    const recentErrors = this.getAllErrors(10);

    const summary = {
      totalServers: healthStatus.length,
      connectedServers: healthStatus.filter(s => s.connected).length,
      totalTools: healthStatus.reduce((sum, s) => sum + s.toolCount, 0),
      recentErrors: recentErrors.length
    };

    const servers = healthStatus.map(health => {
      const retryAttempts = this.retryAttempts.get(health.serverName) || 0;
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (health.connected && !health.lastError) {
        status = 'healthy';
      } else if (health.connected && health.lastError) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        name: health.serverName,
        status,
        connected: health.connected,
        toolCount: health.toolCount,
        lastError: health.lastError?.message,
        retryAttempts
      };
    });

    return {
      summary,
      servers,
      recentErrors
    };
  }
}

// Global error handler instance
let globalErrorHandler: MCPErrorHandler | null = null;

export function getMCPErrorHandler(): MCPErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = new MCPErrorHandler();
  }
  return globalErrorHandler;
}

/**
 * Convenience function to handle and log MCP errors
 */
export function handleMCPError(error: any, serverName?: string, toolName?: string): MCPError {
  const errorHandler = getMCPErrorHandler();
  const mcpError = errorHandler.handleError(error, serverName, toolName);
  
  // Log error to console
  console.error(`MCP Error [${mcpError.type}${serverName ? `, server: ${serverName}` : ''}${toolName ? `, tool: ${toolName}` : ''}]: ${mcpError.message}`);
  
  return mcpError;
}

/**
 * Convenience function to attempt server recovery
 */
export async function attemptMCPRecovery(serverName: string): Promise<boolean> {
  const errorHandler = getMCPErrorHandler();
  return await errorHandler.attemptReconnection(serverName);
}