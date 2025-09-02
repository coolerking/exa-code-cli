import { getMCPClientManager, MCPToolInfo } from './client-manager.js';
import { ToolResult, createToolResponse } from '../tools/tools.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Check if a tool name is an MCP tool (prefixed with server name)
 */
export function isMCPTool(toolName: string): boolean {
  return toolName.includes('__mcp__') || toolName.startsWith('mcp_');
}

/**
 * Parse MCP tool name to extract server name and tool name
 * Supports formats:
 * - mcp_servername_toolname
 * - toolname__mcp__servername
 */
export function parseMCPToolName(toolName: string): { serverName: string; toolName: string } | null {
  // Format: mcp_servername_toolname
  if (toolName.startsWith('mcp_')) {
    const parts = toolName.slice(4).split('_');
    if (parts.length >= 2) {
      const serverName = parts[0];
      const actualToolName = parts.slice(1).join('_');
      return { serverName, toolName: actualToolName };
    }
  }
  
  // Format: toolname__mcp__servername
  if (toolName.includes('__mcp__')) {
    const [actualToolName, , serverName] = toolName.split('__');
    if (actualToolName && serverName) {
      return { serverName, toolName: actualToolName };
    }
  }
  
  return null;
}

/**
 * Execute an MCP tool
 */
export async function executeMCPTool(toolName: string, toolArgs: Record<string, any>): Promise<ToolResult> {
  try {
    const parsedName = parseMCPToolName(toolName);
    if (!parsedName) {
      return createToolResponse(false, undefined, '', `Invalid MCP tool name format: ${toolName}`);
    }

    const { serverName, toolName: actualToolName } = parsedName;
    const mcpManager = getMCPClientManager();

    // Call the tool
    const result: CallToolResult = await mcpManager.callTool(serverName, actualToolName, toolArgs);

    // Convert MCP result to ToolResult format
    return convertMCPResult(result, serverName, actualToolName);

  } catch (error) {
    return createToolResponse(
      false, 
      undefined, 
      '', 
      `MCP tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Convert MCP CallToolResult to ToolResult
 */
function convertMCPResult(mcpResult: CallToolResult, serverName: string, toolName: string): ToolResult {
  try {
    // MCP tools can return different content types
    if (mcpResult.content && Array.isArray(mcpResult.content)) {
      // Handle multiple content blocks
      const textContent = mcpResult.content
        .filter(content => content.type === 'text')
        .map(content => (content as any).text)
        .join('\n');

      const imageContent = mcpResult.content
        .filter(content => content.type === 'image')
        .map(content => ({
          type: 'image',
          data: (content as any).data,
          mimeType: (content as any).mimeType
        }));

      return createToolResponse(
        true,
        {
          text: textContent,
          images: imageContent,
          raw: mcpResult,
          serverName,
          toolName
        },
        `MCP tool '${toolName}' executed successfully on server '${serverName}'`
      );
    } else {
      // Simple content
      return createToolResponse(
        true,
        {
          content: mcpResult.content,
          raw: mcpResult,
          serverName,
          toolName
        },
        `MCP tool '${toolName}' executed successfully on server '${serverName}'`
      );
    }
  } catch (error) {
    return createToolResponse(
      false,
      undefined,
      '',
      `Failed to process MCP tool result: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get all available MCP tools in a format compatible with tool schemas
 */
export function getMCPToolSchemas(): Array<{
  name: string;
  description: string;
  parameters: any;
  serverName: string;
}> {
  const mcpManager = getMCPClientManager();
  const allTools = mcpManager.getAllTools();
  
  return allTools.map(({ serverName, tool }) => ({
    name: `mcp_${serverName}_${tool.name}`,
    description: `[MCP:${serverName}] ${tool.description || tool.name}`,
    parameters: tool.inputSchema || { type: 'object', properties: {}, additionalProperties: true },
    serverName
  }));
}

/**
 * Get available MCP tools as a summary for display
 */
export function getMCPToolsSummary(): Array<{
  serverName: string;
  toolName: string;
  mcpToolName: string;
  description: string;
}> {
  const mcpManager = getMCPClientManager();
  const allTools = mcpManager.getAllTools();
  
  return allTools.map(({ serverName, tool }) => ({
    serverName,
    toolName: tool.name,
    mcpToolName: `mcp_${serverName}_${tool.name}`,
    description: tool.description || tool.name
  }));
}

/**
 * Initialize MCP clients and return connection status
 */
export async function initializeMCPTools(): Promise<{
  success: boolean;
  connectedServers: number;
  totalTools: number;
  errors: string[];
}> {
  try {
    const mcpManager = getMCPClientManager();
    await mcpManager.initializeClients();
    
    const status = mcpManager.getServerStatus();
    const connectedServers = status.filter(s => s.connected).length;
    const totalTools = status.reduce((sum, s) => sum + s.toolCount, 0);
    const errors = status
      .filter(s => !s.connected && s.lastError)
      .map(s => `${s.name}: ${s.lastError}`);
    
    return {
      success: connectedServers > 0 || status.length === 0,
      connectedServers,
      totalTools,
      errors
    };
  } catch (error) {
    return {
      success: false,
      connectedServers: 0,
      totalTools: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

/**
 * Refresh MCP connections and return updated status
 */
export async function refreshMCPTools(): Promise<{
  success: boolean;
  connectedServers: number;
  totalTools: number;
  errors: string[];
}> {
  try {
    const mcpManager = getMCPClientManager();
    await mcpManager.refreshServers();
    
    const status = mcpManager.getServerStatus();
    const connectedServers = status.filter(s => s.connected).length;
    const totalTools = status.reduce((sum, s) => sum + s.toolCount, 0);
    const errors = status
      .filter(s => !s.connected && s.lastError)
      .map(s => `${s.name}: ${s.lastError}`);
    
    return {
      success: true,
      connectedServers,
      totalTools,
      errors
    };
  } catch (error) {
    return {
      success: false,
      connectedServers: 0,
      totalTools: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}