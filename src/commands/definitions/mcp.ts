import { CommandDefinition, CommandContext } from '../base.js';
import { getMCPClientManager } from '../../mcp/client-manager.js';
import { getMCPErrorHandler } from '../../mcp/error-handling.js';

export const mcpCommand: CommandDefinition = {
  command: 'mcp',
  description: 'Model Context Protocol (MCP) server management',
  handler: ({ addMessage, args }: CommandContext) => {
    // If no arguments provided, show general MCP status
    if (!args || args.length === 0) {
      showMCPStatus(addMessage);
      return;
    }

    const subCommand = args[0].toLowerCase();

    switch (subCommand) {
      case 'status':
        showMCPStatus(addMessage);
        break;
      
      case 'tools':
        showMCPTools(addMessage);
        break;
      
      case 'servers':
        showMCPServers(addMessage);
        break;
      
      case 'list':
        showMCPList(addMessage);
        break;
      
      case 'health':
        showMCPHealth(addMessage);
        break;
      
      case 'errors':
        showMCPErrors(addMessage, args[1] ? parseInt(args[1]) : 10);
        break;
      
      case 'refresh':
        refreshMCPServers(addMessage);
        break;
      
      case 'help':
      default:
        showMCPHelp(addMessage);
        break;
    }
  }
};

function showMCPStatus(addMessage: (message: any) => void): void {
  try {
    const mcpManager = getMCPClientManager();
    const serverStatus = mcpManager.getServerStatus();
    
    const connectedServers = serverStatus.filter(s => s.connected).length;
    const totalTools = serverStatus.reduce((sum, s) => sum + s.toolCount, 0);
    
    let statusMessage = `## MCP Status\n\n`;
    statusMessage += `📊 **Summary**\n`;
    statusMessage += `- Servers: ${connectedServers}/${serverStatus.length} connected\n`;
    statusMessage += `- Tools: ${totalTools} total available\n\n`;

    if (serverStatus.length === 0) {
      statusMessage += `⚠️ No MCP servers configured.\n`;
      statusMessage += `Use CLI commands to add servers:\n`;
      statusMessage += `\`\`\`bash\n`;
      statusMessage += `exa mcp add myserver node server.js\n`;
      statusMessage += `\`\`\`\n\n`;
    } else {
      statusMessage += `🖥️ **Servers**\n`;
      for (const server of serverStatus) {
        const status = server.connected ? '🟢 Connected' : '🔴 Disconnected';
        statusMessage += `- **${server.name}**: ${status} (${server.toolCount} tools)\n`;
        if (!server.connected && server.lastError) {
          statusMessage += `  ❌ ${server.lastError}\n`;
        }
      }
      statusMessage += `\n`;
    }

    statusMessage += `💡 **Available Commands**\n`;
    statusMessage += `- \`/mcp tools\` - List all available MCP tools\n`;
    statusMessage += `- \`/mcp servers\` - Show detailed server information\n`;
    statusMessage += `- \`/mcp health\` - Show health status and diagnostics\n`;
    statusMessage += `- \`/mcp refresh\` - Refresh server connections\n`;

    addMessage({
      role: 'system',
      content: statusMessage
    });
  } catch (error) {
    addMessage({
      role: 'system',
      content: `❌ Error retrieving MCP status: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

function showMCPTools(addMessage: (message: any) => void): void {
  try {
    const mcpManager = getMCPClientManager();
    const allTools = mcpManager.getAllTools();
    
    let toolsMessage = `## MCP Tools\n\n`;
    
    if (allTools.length === 0) {
      toolsMessage += `⚠️ No MCP tools available.\n`;
      toolsMessage += `Make sure MCP servers are connected and providing tools.\n`;
    } else {
      // Group tools by server
      const toolsByServer = new Map<string, any[]>();
      for (const { serverName, tool } of allTools) {
        if (!toolsByServer.has(serverName)) {
          toolsByServer.set(serverName, []);
        }
        toolsByServer.get(serverName)!.push(tool);
      }

      toolsMessage += `🛠️ **${allTools.length} tools available from ${toolsByServer.size} server(s)**\n\n`;

      for (const [serverName, tools] of toolsByServer.entries()) {
        toolsMessage += `### 🖥️ ${serverName} (${tools.length} tools)\n`;
        for (const tool of tools) {
          const mcpToolName = `mcp_${serverName}_${tool.name}`;
          toolsMessage += `- **${tool.name}** (\`${mcpToolName}\`)\n`;
          if (tool.description) {
            toolsMessage += `  ${tool.description}\n`;
          }
        }
        toolsMessage += `\n`;
      }

      toolsMessage += `💡 **Usage**: Tools can be called automatically by the AI when needed.\n`;
      toolsMessage += `Tool names are prefixed with \`mcp_[server]_[tool]\` format.\n`;
    }

    addMessage({
      role: 'system',
      content: toolsMessage
    });
  } catch (error) {
    addMessage({
      role: 'system',
      content: `❌ Error retrieving MCP tools: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

function showMCPList(addMessage: (message: any) => void): void {
  try {
    const mcpManager = getMCPClientManager();
    const serverStatus = mcpManager.getServerStatus();
    
    let listMessage = `## MCP Server List\n\n`;
    
    if (serverStatus.length === 0) {
      listMessage += `📭 **No MCP servers configured**\n\n`;
      listMessage += `To add a server, use:\n`;
      listMessage += `\`\`\`bash\n`;
      listMessage += `exa mcp add <name> <command...>\n`;
      listMessage += `\`\`\`\n`;
    } else {
      const connectedServers = serverStatus.filter(s => s.connected).length;
      const totalTools = serverStatus.reduce((sum, s) => sum + s.toolCount, 0);
      
      listMessage += `📋 **${serverStatus.length} server(s) configured** (${connectedServers} connected, ${totalTools} tools)\n\n`;
      
      for (const server of serverStatus) {
        const statusIcon = server.connected ? '🟢' : '🔴';
        const statusText = server.connected ? 'Connected' : 'Disconnected';
        
        listMessage += `${statusIcon} **${server.name}** - ${statusText} (${server.toolCount} tools)\n`;
        listMessage += `   Transport: ${server.config.transport}`;
        
        if (server.config.command) {
          listMessage += `, Command: ${server.config.command.join(' ')}`;
        }
        if (server.config.url) {
          listMessage += `, URL: ${server.config.url}`;
        }
        
        listMessage += `\n`;
        
        if (!server.connected && server.lastError) {
          listMessage += `   ❌ Error: ${server.lastError}\n`;
        }
        
        listMessage += `\n`;
      }
    }

    addMessage({
      role: 'system',
      content: listMessage
    });
  } catch (error) {
    addMessage({
      role: 'system',
      content: `❌ Error retrieving MCP server list: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

function showMCPServers(addMessage: (message: any) => void): void {
  try {
    const mcpManager = getMCPClientManager();
    const serverStatus = mcpManager.getServerStatus();
    
    let serversMessage = `## MCP Servers\n\n`;
    
    if (serverStatus.length === 0) {
      serversMessage += `⚠️ No MCP servers configured.\n\n`;
      serversMessage += `**Add a server using CLI:**\n`;
      serversMessage += `\`\`\`bash\n`;
      serversMessage += `# stdio server\n`;
      serversMessage += `exa mcp add myserver node server.js\n\n`;
      serversMessage += `# HTTP server\n`;
      serversMessage += `exa mcp add httpserver --transport http --url http://localhost:3000/mcp\n`;
      serversMessage += `\`\`\`\n`;
    } else {
      for (const server of serverStatus) {
        const statusIcon = server.connected ? '🟢' : '🔴';
        const statusText = server.connected ? 'Connected' : 'Disconnected';
        
        serversMessage += `### ${statusIcon} ${server.name}\n`;
        serversMessage += `- **Status**: ${statusText}\n`;
        serversMessage += `- **Transport**: ${server.config.transport}\n`;
        
        if (server.config.command) {
          serversMessage += `- **Command**: ${server.config.command.join(' ')}\n`;
        }
        if (server.config.url) {
          serversMessage += `- **URL**: ${server.config.url}\n`;
        }
        if (server.config.args && server.config.args.length > 0) {
          serversMessage += `- **Args**: ${server.config.args.join(' ')}\n`;
        }
        if (server.config.env && Object.keys(server.config.env).length > 0) {
          const envVars = Object.entries(server.config.env).map(([k, v]) => `${k}=${v}`).join(', ');
          serversMessage += `- **Environment**: ${envVars}\n`;
        }
        if (server.config.timeout) {
          serversMessage += `- **Timeout**: ${server.config.timeout}ms\n`;
        }
        
        serversMessage += `- **Tools**: ${server.toolCount}\n`;
        serversMessage += `- **Enabled**: ${server.config.enabled !== false ? 'Yes' : 'No'}\n`;
        
        if (!server.connected && server.lastError) {
          serversMessage += `- **Error**: ${server.lastError}\n`;
        }
        
        serversMessage += `\n`;
      }

      serversMessage += `💡 **Management Commands:**\n`;
      serversMessage += `\`\`\`bash\n`;
      serversMessage += `exa mcp list          # List all servers\n`;
      serversMessage += `exa mcp get <name>    # Get server details\n`;
      serversMessage += `exa mcp enable <name> # Enable server\n`;
      serversMessage += `exa mcp disable <name># Disable server\n`;
      serversMessage += `exa mcp remove <name> # Remove server\n`;
      serversMessage += `\`\`\`\n`;
    }

    addMessage({
      role: 'system',
      content: serversMessage
    });
  } catch (error) {
    addMessage({
      role: 'system',
      content: `❌ Error retrieving MCP servers: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

function showMCPHealth(addMessage: (message: any) => void): void {
  try {
    const errorHandler = getMCPErrorHandler();
    const healthReport = errorHandler.generateHealthReport();
    
    let healthMessage = `## MCP Health Report\n\n`;
    
    // Summary
    healthMessage += `📊 **Summary**\n`;
    healthMessage += `- Total Servers: ${healthReport.summary.totalServers}\n`;
    healthMessage += `- Connected: ${healthReport.summary.connectedServers}\n`;
    healthMessage += `- Total Tools: ${healthReport.summary.totalTools}\n`;
    healthMessage += `- Recent Errors: ${healthReport.summary.recentErrors}\n\n`;

    // Server Health
    healthMessage += `🖥️ **Server Health**\n`;
    for (const server of healthReport.servers) {
      let statusIcon: string;
      switch (server.status) {
        case 'healthy':
          statusIcon = '🟢';
          break;
        case 'degraded':
          statusIcon = '🟡';
          break;
        case 'unhealthy':
          statusIcon = '🔴';
          break;
      }
      
      healthMessage += `- ${statusIcon} **${server.name}**: ${server.status}\n`;
      healthMessage += `  - Connected: ${server.connected ? 'Yes' : 'No'}\n`;
      healthMessage += `  - Tools: ${server.toolCount}\n`;
      
      if (server.retryAttempts > 0) {
        healthMessage += `  - Retry Attempts: ${server.retryAttempts}\n`;
      }
      
      if (server.lastError) {
        healthMessage += `  - Last Error: ${server.lastError}\n`;
      }
    }
    healthMessage += `\n`;

    // Recent Errors
    if (healthReport.recentErrors.length > 0) {
      healthMessage += `⚠️ **Recent Errors**\n`;
      for (const error of healthReport.recentErrors.slice(0, 5)) {
        const timestamp = new Date(error.timestamp).toLocaleTimeString();
        healthMessage += `- **${timestamp}** [${error.type}]`;
        if (error.serverName) {
          healthMessage += ` ${error.serverName}`;
        }
        if (error.toolName) {
          healthMessage += `:${error.toolName}`;
        }
        healthMessage += `\n  ${error.message}\n`;
      }
    }

    addMessage({
      role: 'system',
      content: healthMessage
    });
  } catch (error) {
    addMessage({
      role: 'system',
      content: `❌ Error generating MCP health report: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

function showMCPErrors(addMessage: (message: any) => void, limit: number = 10): void {
  try {
    const errorHandler = getMCPErrorHandler();
    const errors = errorHandler.getAllErrors(limit);
    
    let errorsMessage = `## MCP Error History\n\n`;
    
    if (errors.length === 0) {
      errorsMessage += `✅ No recent errors.\n`;
    } else {
      errorsMessage += `📋 **Last ${errors.length} errors:**\n\n`;
      
      for (const error of errors) {
        const timestamp = new Date(error.timestamp).toLocaleString();
        errorsMessage += `### ❌ ${error.type.toUpperCase()}\n`;
        errorsMessage += `- **Time**: ${timestamp}\n`;
        
        if (error.serverName) {
          errorsMessage += `- **Server**: ${error.serverName}\n`;
        }
        if (error.toolName) {
          errorsMessage += `- **Tool**: ${error.toolName}\n`;
        }
        
        errorsMessage += `- **Message**: ${error.message}\n`;
        
        // Add recovery suggestions
        const suggestions = errorHandler.getRecoverySuggestions(error);
        if (suggestions.length > 0) {
          errorsMessage += `- **Recovery Suggestions**:\n`;
          for (const suggestion of suggestions.slice(0, 3)) {
            errorsMessage += `  - ${suggestion}\n`;
          }
        }
        
        errorsMessage += `\n`;
      }
      
      errorsMessage += `💡 Use \`/mcp refresh\` to attempt reconnection to failed servers.\n`;
    }

    addMessage({
      role: 'system',
      content: errorsMessage
    });
  } catch (error) {
    addMessage({
      role: 'system',
      content: `❌ Error retrieving MCP errors: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

function refreshMCPServers(addMessage: (message: any) => void): void {
  try {
    addMessage({
      role: 'system',
      content: `🔄 Refreshing MCP server connections...`
    });

    const mcpManager = getMCPClientManager();
    
    // Refresh servers asynchronously
    mcpManager.refreshServers().then(() => {
      const serverStatus = mcpManager.getServerStatus();
      const connectedServers = serverStatus.filter(s => s.connected).length;
      const totalTools = serverStatus.reduce((sum, s) => sum + s.toolCount, 0);
      
      addMessage({
        role: 'system',
        content: `✅ MCP servers refreshed successfully!\n\n` +
                `📊 **Updated Status**\n` +
                `- Connected Servers: ${connectedServers}/${serverStatus.length}\n` +
                `- Available Tools: ${totalTools}\n\n` +
                `Use \`/mcp status\` to see detailed information.`
      });
    }).catch((error) => {
      addMessage({
        role: 'system',
        content: `❌ Error refreshing MCP servers: ${error instanceof Error ? error.message : String(error)}\n\n` +
                `Use \`/mcp health\` to diagnose connection issues.`
      });
    });
  } catch (error) {
    addMessage({
      role: 'system',
      content: `❌ Error initiating MCP refresh: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

function showMCPHelp(addMessage: (message: any) => void): void {
  const helpMessage = `## MCP Command Help\n\n` +
    `The \`/mcp\` command provides Model Context Protocol server management and monitoring.\n\n` +
    
    `**Available Subcommands:**\n` +
    `- \`/mcp\` or \`/mcp status\` - Show general MCP status\n` +
    `- \`/mcp list\` - List configured MCP servers\n` +
    `- \`/mcp tools\` - List all available MCP tools\n` +
    `- \`/mcp servers\` - Show detailed server information\n` +
    `- \`/mcp health\` - Show health status and diagnostics\n` +
    `- \`/mcp errors [limit]\` - Show recent errors (default: 10)\n` +
    `- \`/mcp refresh\` - Refresh server connections\n` +
    `- \`/mcp help\` - Show this help message\n\n` +
    
    `**CLI Management Commands:**\n` +
    `Use these commands in your terminal (not in the chat):\n` +
    `\`\`\`bash\n` +
    `exa mcp add <name> <command...>     # Add new MCP server\n` +
    `exa mcp list                        # List all configured servers\n` +
    `exa mcp get <name>                  # Get server details\n` +
    `exa mcp remove <name>               # Remove server\n` +
    `exa mcp enable <name>               # Enable server\n` +
    `exa mcp disable <name>              # Disable server\n` +
    `\`\`\`\n\n` +
    
    `**Examples:**\n` +
    `\`\`\`bash\n` +
    `# Add a stdio MCP server\n` +
    `exa mcp add myserver node server.js --env NODE_ENV=production\n\n` +
    `# Add an HTTP MCP server\n` +
    `exa mcp add webserver --transport http --url http://localhost:3000/mcp\n\n` +
    `# Check status in chat\n` +
    `/mcp status\n` +
    `/mcp tools\n` +
    `\`\`\`\n\n` +
    
    `**Notes:**\n` +
    `- MCP servers provide tools that can be used automatically by the AI\n` +
    `- Servers must be configured via CLI commands before they appear in chat\n` +
    `- Use \`/mcp refresh\` if servers become disconnected\n` +
    `- Tool names are automatically prefixed with \`mcp_[server]_[tool]\``;

  addMessage({
    role: 'system',
    content: helpMessage
  });
}