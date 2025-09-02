import test from 'ava';
import { getMCPClientManager } from '../client-manager.js';
import { isMCPTool, parseMCPToolName, executeMCPTool } from '../tools-integration.js';
import { handleMCPError, getMCPErrorHandler } from '../error-handling.js';
import { ConfigManager } from '../../utils/local-settings.js';

test('isMCPTool correctly identifies MCP tools', t => {
  t.true(isMCPTool('mcp_server_tool'));
  t.true(isMCPTool('tool__mcp__server'));
  t.false(isMCPTool('regular_tool'));
  t.false(isMCPTool('read_file'));
});

test('parseMCPToolName correctly parses tool names', t => {
  // Format: mcp_servername_toolname
  const parsed1 = parseMCPToolName('mcp_myserver_mytool');
  t.truthy(parsed1);
  t.is(parsed1!.serverName, 'myserver');
  t.is(parsed1!.toolName, 'mytool');

  // Format: toolname__mcp__servername
  const parsed2 = parseMCPToolName('mytool__mcp__myserver');
  t.truthy(parsed2);
  t.is(parsed2!.serverName, 'myserver');
  t.is(parsed2!.toolName, 'mytool');

  // Complex tool names
  const parsed3 = parseMCPToolName('mcp_complex_server_complex_tool_name');
  t.truthy(parsed3);
  t.is(parsed3!.serverName, 'complex');
  t.is(parsed3!.toolName, 'server_complex_tool_name');

  // Invalid formats
  t.is(parseMCPToolName('invalid_tool'), null);
  t.is(parseMCPToolName('mcp_'), null);
  t.is(parseMCPToolName('__mcp__'), null);
});

test('MCP error classification works correctly', t => {
  const errorHandler = getMCPErrorHandler();

  // Connection error
  const connError = errorHandler.handleError(new Error('ECONNREFUSED'), 'testserver');
  t.is(connError.type, 'connection');
  t.is(connError.serverName, 'testserver');

  // Timeout error
  const timeoutError = errorHandler.handleError(new Error('Request timed out'), 'testserver');
  t.is(timeoutError.type, 'timeout');

  // Tool not found error
  const toolError = errorHandler.handleError(new Error('Tool not found'), 'testserver', 'testtool');
  t.is(toolError.type, 'tool_not_found');
  t.is(toolError.toolName, 'testtool');

  // Config error
  const configError = errorHandler.handleError(new Error('Invalid configuration'));
  t.is(configError.type, 'config');
});

test('MCP error recovery suggestions are generated', t => {
  const errorHandler = getMCPErrorHandler();

  const connectionError = {
    type: 'connection' as const,
    serverName: 'testserver',
    message: 'Connection failed',
    timestamp: new Date().toISOString()
  };

  const suggestions = errorHandler.getRecoverySuggestions(connectionError);
  t.true(suggestions.length > 0);
  t.true(suggestions.some(s => s.includes('Check if the MCP server is running')));
  t.true(suggestions.some(s => s.includes(`exa mcp enable ${connectionError.serverName}`)));
});

test('MCPClientManager handles server configuration correctly', t => {
  const manager = getMCPClientManager();
  const status = manager.getServerStatus();
  
  // Should return empty array if no servers configured
  t.true(Array.isArray(status));
  
  const allTools = manager.getAllTools();
  t.true(Array.isArray(allTools));
});

test('ConfigManager MCP integration works', t => {
  const configManager = new ConfigManager();
  
  // Should return empty config by default
  const mcpConfig = configManager.getMCPConfig();
  t.is(typeof mcpConfig, 'object');
  
  const servers = configManager.getMCPServers();
  t.is(typeof servers, 'object');
  
  const serverList = configManager.getMCPServerList();
  t.true(Array.isArray(serverList));
});

test('executeMCPTool handles invalid tool names correctly', async t => {
  const result = await executeMCPTool('invalid_tool_name', {});
  t.false(result.success);
  t.truthy(result.error);
  t.true(result.error!.includes('Invalid MCP tool name format'));
});

test('MCP health report generation works', t => {
  const errorHandler = getMCPErrorHandler();
  const healthReport = errorHandler.generateHealthReport();
  
  t.is(typeof healthReport, 'object');
  t.is(typeof healthReport.summary, 'object');
  t.true(Array.isArray(healthReport.servers));
  t.true(Array.isArray(healthReport.recentErrors));
  
  t.is(typeof healthReport.summary.totalServers, 'number');
  t.is(typeof healthReport.summary.connectedServers, 'number');
  t.is(typeof healthReport.summary.totalTools, 'number');
  t.is(typeof healthReport.summary.recentErrors, 'number');
});

test('Error history management works correctly', t => {
  const errorHandler = getMCPErrorHandler();
  
  // Clear history first
  errorHandler.clearErrorHistory();
  
  // Add some errors
  errorHandler.handleError(new Error('Test error 1'), 'server1');
  errorHandler.handleError(new Error('Test error 2'), 'server2');
  
  const allErrors = errorHandler.getAllErrors(10);
  t.is(allErrors.length, 2);
  
  const server1Errors = errorHandler.getServerErrors('server1');
  t.is(server1Errors.length, 1);
  t.is(server1Errors[0].serverName, 'server1');
  
  // Clear specific server errors
  errorHandler.clearErrorHistory('server1');
  const remainingErrors = errorHandler.getAllErrors(10);
  t.is(remainingErrors.length, 1);
  t.is(remainingErrors[0].serverName, 'server2');
  
  // Clear all errors
  errorHandler.clearErrorHistory();
  const noErrors = errorHandler.getAllErrors(10);
  t.is(noErrors.length, 0);
});