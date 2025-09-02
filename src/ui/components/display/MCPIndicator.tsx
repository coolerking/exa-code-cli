import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { getMCPClientManager } from '../../../mcp/client-manager.js';

interface MCPIndicatorProps {
  showDetailed?: boolean;
}

interface MCPStatus {
  connectedServers: number;
  totalServers: number;
  totalTools: number;
  hasErrors: boolean;
}

export default function MCPIndicator({ showDetailed = false }: MCPIndicatorProps) {
  const [mcpStatus, setMcpStatus] = useState<MCPStatus>({
    connectedServers: 0,
    totalServers: 0,
    totalTools: 0,
    hasErrors: false
  });

  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const updateMCPStatus = () => {
      try {
        const mcpManager = getMCPClientManager();
        const serverStatus = mcpManager.getServerStatus();
        
        const connectedServers = serverStatus.filter(s => s.connected).length;
        const totalTools = serverStatus.reduce((sum, s) => sum + s.toolCount, 0);
        const hasErrors = serverStatus.some(s => !s.connected);
        
        setMcpStatus({
          connectedServers,
          totalServers: serverStatus.length,
          totalTools,
          hasErrors
        });

        if (!isInitialized && serverStatus.length > 0) {
          // Initialize MCP connections if not already done
          mcpManager.initializeClients().catch(() => {
            // Errors are handled by the error handler
          });
          setIsInitialized(true);
        }
      } catch (error) {
        // Handle errors silently
        setMcpStatus({
          connectedServers: 0,
          totalServers: 0,
          totalTools: 0,
          hasErrors: false
        });
      }
    };

    // Initial update
    updateMCPStatus();

    // Update periodically
    const interval = setInterval(updateMCPStatus, 5000); // Every 5 seconds

    return () => clearInterval(interval);
  }, [isInitialized]);

  // Don't show anything if no servers configured
  if (mcpStatus.totalServers === 0) {
    return null;
  }

  const statusColor = mcpStatus.hasErrors ? 'red' : mcpStatus.connectedServers > 0 ? 'green' : 'yellow';
  const statusIcon = mcpStatus.hasErrors ? '⚠️' : mcpStatus.connectedServers > 0 ? '✅' : '⏳';

  if (showDetailed) {
    return (
      <Box flexDirection="column" paddingX={1} marginBottom={1}>
        <Box>
          <Text color={statusColor} bold>
            {statusIcon} MCP: {mcpStatus.connectedServers}/{mcpStatus.totalServers} servers
          </Text>
          {mcpStatus.totalTools > 0 && (
            <Text color="gray" dimColor>
              {' '}• {mcpStatus.totalTools} tools
            </Text>
          )}
        </Box>
        {mcpStatus.hasErrors && (
          <Text color="yellow" dimColor>
            Use /mcp health to diagnose connection issues
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Text color={statusColor} dimColor>
        {statusIcon} {mcpStatus.connectedServers}/{mcpStatus.totalServers} MCP
      </Text>
      {mcpStatus.totalTools > 0 && (
        <Text color="gray" dimColor>
          • {mcpStatus.totalTools} tools
        </Text>
      )}
    </Box>
  );
}