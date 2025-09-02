import test from 'ava';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigManager, MCPServerConfig } from '../local-settings.js';

// Create a test instance with a temporary config path
class TestConfigManager extends ConfigManager {
  private testConfigPath: string;

  constructor() {
    super();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exa-test-'));
    this.testConfigPath = path.join(tempDir, '.exa', 'local-settings.json');
    // Override the private configPath field using Object.defineProperty
    Object.defineProperty(this, 'configPath', {
      value: this.testConfigPath,
      writable: false
    });
  }

  cleanup() {
    try {
      const configDir = path.dirname(this.testConfigPath);
      if (fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

test('getMCPConfig returns empty object when no config exists', t => {
  const manager = new TestConfigManager();
  t.teardown(() => manager.cleanup());

  const mcpConfig = manager.getMCPConfig();
  t.deepEqual(mcpConfig, {});
});

test('getMCPServers returns empty object when no servers exist', t => {
  const manager = new TestConfigManager();
  t.teardown(() => manager.cleanup());

  const servers = manager.getMCPServers();
  t.deepEqual(servers, {});
});

test('addMCPServer adds server configuration correctly', t => {
  const manager = new TestConfigManager();
  t.teardown(() => manager.cleanup());

  const serverConfig: MCPServerConfig = {
    transport: 'stdio',
    command: ['node', 'server.js'],
    args: ['--verbose'],
    env: { NODE_ENV: 'development' },
    timeout: 5000
  };

  manager.addMCPServer('test-server', serverConfig);

  const retrievedServer = manager.getMCPServer('test-server');
  t.truthy(retrievedServer);
  t.is(retrievedServer!.transport, 'stdio');
  t.deepEqual(retrievedServer!.command, ['node', 'server.js']);
  t.deepEqual(retrievedServer!.args, ['--verbose']);
  t.deepEqual(retrievedServer!.env, { NODE_ENV: 'development' });
  t.is(retrievedServer!.timeout, 5000);
  t.is(retrievedServer!.enabled, true); // Should be enabled by default
});

test('addMCPServer with HTTP transport', t => {
  const manager = new TestConfigManager();
  t.teardown(() => manager.cleanup());

  const serverConfig: MCPServerConfig = {
    transport: 'http',
    url: 'http://localhost:3000/mcp'
  };

  manager.addMCPServer('http-server', serverConfig);

  const retrievedServer = manager.getMCPServer('http-server');
  t.truthy(retrievedServer);
  t.is(retrievedServer!.transport, 'http');
  t.is(retrievedServer!.url, 'http://localhost:3000/mcp');
  t.is(retrievedServer!.enabled, true);
});

test('removeMCPServer removes server correctly', t => {
  const manager = new TestConfigManager();
  t.teardown(() => manager.cleanup());

  const serverConfig: MCPServerConfig = {
    transport: 'stdio',
    command: ['node', 'server.js']
  };

  manager.addMCPServer('temp-server', serverConfig);
  
  // Verify server was added
  t.truthy(manager.getMCPServer('temp-server'));

  // Remove server
  const removed = manager.removeMCPServer('temp-server');
  t.true(removed);

  // Verify server was removed
  t.is(manager.getMCPServer('temp-server'), null);

  // Try to remove non-existent server
  const notRemoved = manager.removeMCPServer('non-existent');
  t.false(notRemoved);
});

test('enableMCPServer and disableMCPServer work correctly', t => {
  const manager = new TestConfigManager();
  t.teardown(() => manager.cleanup());

  const serverConfig: MCPServerConfig = {
    transport: 'stdio',
    command: ['node', 'server.js']
  };

  manager.addMCPServer('toggle-server', serverConfig);

  // Server should be enabled by default
  let server = manager.getMCPServer('toggle-server');
  t.is(server!.enabled, true);

  // Disable server
  const disabled = manager.disableMCPServer('toggle-server');
  t.true(disabled);

  server = manager.getMCPServer('toggle-server');
  t.is(server!.enabled, false);

  // Enable server
  const enabled = manager.enableMCPServer('toggle-server');
  t.true(enabled);

  server = manager.getMCPServer('toggle-server');
  t.is(server!.enabled, true);

  // Try to enable/disable non-existent server
  t.false(manager.enableMCPServer('non-existent'));
  t.false(manager.disableMCPServer('non-existent'));
});

test('setMCPGlobalTimeout sets timeout correctly', t => {
  const manager = new TestConfigManager();
  t.teardown(() => manager.cleanup());

  manager.setMCPGlobalTimeout(10000);

  const mcpConfig = manager.getMCPConfig();
  t.is(mcpConfig.globalTimeout, 10000);
});

test('setMCPDebugMode sets debug mode correctly', t => {
  const manager = new TestConfigManager();
  t.teardown(() => manager.cleanup());

  manager.setMCPDebugMode(true);

  const mcpConfig = manager.getMCPConfig();
  t.is(mcpConfig.debugMode, true);

  manager.setMCPDebugMode(false);

  const updatedConfig = manager.getMCPConfig();
  t.is(updatedConfig.debugMode, false);
});

test('getMCPServerList returns list of servers correctly', t => {
  const manager = new TestConfigManager();
  t.teardown(() => manager.cleanup());

  // Initially empty
  t.deepEqual(manager.getMCPServerList(), []);

  // Add servers
  const server1Config: MCPServerConfig = {
    transport: 'stdio',
    command: ['node', 'server1.js']
  };
  const server2Config: MCPServerConfig = {
    transport: 'http',
    url: 'http://localhost:3000/mcp'
  };

  manager.addMCPServer('server1', server1Config);
  manager.addMCPServer('server2', server2Config);

  const serverList = manager.getMCPServerList();
  t.is(serverList.length, 2);
  
  const serverNames = serverList.map(s => s.name).sort();
  t.deepEqual(serverNames, ['server1', 'server2']);

  const server1Entry = serverList.find(s => s.name === 'server1');
  t.truthy(server1Entry);
  t.is(server1Entry!.config.transport, 'stdio');
  t.deepEqual(server1Entry!.config.command, ['node', 'server1.js']);

  const server2Entry = serverList.find(s => s.name === 'server2');
  t.truthy(server2Entry);
  t.is(server2Entry!.config.transport, 'http');
  t.is(server2Entry!.config.url, 'http://localhost:3000/mcp');
});

test('multiple servers configuration is maintained correctly', t => {
  const manager = new TestConfigManager();
  t.teardown(() => manager.cleanup());

  // Add multiple servers
  manager.addMCPServer('server1', {
    transport: 'stdio',
    command: ['node', 'server1.js']
  });

  manager.addMCPServer('server2', {
    transport: 'http',
    url: 'http://localhost:3000/mcp'
  });

  manager.addMCPServer('server3', {
    transport: 'sse',
    url: 'ws://localhost:4000/sse'
  });

  // Set global configuration
  manager.setMCPGlobalTimeout(15000);
  manager.setMCPDebugMode(true);

  // Verify all configurations
  const servers = manager.getMCPServers();
  t.is(Object.keys(servers).length, 3);

  const mcpConfig = manager.getMCPConfig();
  t.is(mcpConfig.globalTimeout, 15000);
  t.is(mcpConfig.debugMode, true);

  // Remove one server
  manager.removeMCPServer('server2');

  const remainingServers = manager.getMCPServers();
  t.is(Object.keys(remainingServers).length, 2);
  t.truthy(remainingServers.server1);
  t.truthy(remainingServers.server3);
  t.falsy(remainingServers.server2);
});

test('error handling for invalid operations', t => {
  const manager = new TestConfigManager();
  t.teardown(() => manager.cleanup());

  // Test error handling by mocking filesystem operations
  const originalWriteConfig = (manager as any).writeConfig;
  (manager as any).writeConfig = () => {
    throw new Error('Mock filesystem error');
  };

  // Should throw error when trying to add server
  t.throws(() => {
    manager.addMCPServer('error-server', {
      transport: 'stdio',
      command: ['node', 'server.js']
    });
  }, { message: /Failed to add MCP server 'error-server'/ });

  // Should throw error when trying to set global timeout
  t.throws(() => {
    manager.setMCPGlobalTimeout(5000);
  }, { message: /Failed to set MCP global timeout/ });

  // Should throw error when trying to set debug mode
  t.throws(() => {
    manager.setMCPDebugMode(true);
  }, { message: /Failed to set MCP debug mode/ });

  // Restore original method
  (manager as any).writeConfig = originalWriteConfig;
});