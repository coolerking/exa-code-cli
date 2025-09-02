#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager, MCPServerConfig } from '../utils/local-settings.js';

const configManager = new ConfigManager();

/**
 * Create and configure the MCP command and its subcommands
 */
export function createMCPCommand(): Command {
  const mcpCommand = new Command('mcp');
  mcpCommand.description('Model Context Protocol (MCP) server management');

  // exa mcp add command
  mcpCommand
    .command('add <name> [command...]')
    .description('Add a new MCP server configuration')
    .option('-t, --transport <type>', 'Transport type (stdio, sse, http)', 'stdio')
    .option('-u, --url <url>', 'Server URL (for HTTP/SSE transport)')
    .option('-e, --env <key=value...>', 'Environment variables', [])
    .option('-a, --args <args...>', 'Additional command arguments', [])
    .option('--timeout <ms>', 'Connection timeout in milliseconds', parseInt)
    .option('--disabled', 'Add server in disabled state')
    .action(async (name: string, command: string[], options) => {
      try {
        // Validate transport type
        if (!['stdio', 'sse', 'http'].includes(options.transport)) {
          console.log(chalk.red('Invalid transport type. Must be one of: stdio, sse, http'));
          process.exit(1);
        }

        // Validate URL for HTTP/SSE transport
        if ((options.transport === 'http' || options.transport === 'sse') && !options.url) {
          console.log(chalk.red(`URL is required for ${options.transport} transport`));
          process.exit(1);
        }

        // Validate command for stdio transport
        if (options.transport === 'stdio' && (!command || command.length === 0)) {
          console.log(chalk.red('Command is required for stdio transport'));
          process.exit(1);
        }

        // Parse environment variables
        const env: Record<string, string> = {};
        if (options.env && options.env.length > 0) {
          for (const envVar of options.env) {
            const [key, ...valueParts] = envVar.split('=');
            if (!key || valueParts.length === 0) {
              console.log(chalk.red(`Invalid environment variable format: ${envVar}. Use key=value format.`));
              process.exit(1);
            }
            env[key] = valueParts.join('=');
          }
        }

        // Check if server already exists
        const existing = configManager.getMCPServer(name);
        if (existing) {
          console.log(chalk.yellow(`MCP server '${name}' already exists. Use 'exa mcp remove ${name}' first to replace it.`));
          process.exit(1);
        }

        // Create server configuration
        const serverConfig: MCPServerConfig = {
          transport: options.transport as 'stdio' | 'sse' | 'http',
          enabled: !options.disabled
        };

        if (options.transport === 'stdio') {
          serverConfig.command = command;
          if (options.args && options.args.length > 0) {
            serverConfig.args = options.args;
          }
        } else {
          serverConfig.url = options.url;
        }

        if (Object.keys(env).length > 0) {
          serverConfig.env = env;
        }

        if (options.timeout) {
          serverConfig.timeout = options.timeout;
        }

        // Add server
        configManager.addMCPServer(name, serverConfig);

        console.log(chalk.green(`✓ MCP server '${name}' added successfully`));
        console.log(chalk.gray(`  Transport: ${serverConfig.transport}`));
        if (serverConfig.command) {
          console.log(chalk.gray(`  Command: ${serverConfig.command.join(' ')}`));
        }
        if (serverConfig.url) {
          console.log(chalk.gray(`  URL: ${serverConfig.url}`));
        }
        console.log(chalk.gray(`  Status: ${serverConfig.enabled ? 'enabled' : 'disabled'}`));
      } catch (error) {
        console.log(chalk.red(`Failed to add MCP server: ${error}`));
        process.exit(1);
      }
    });

  // exa mcp list command
  mcpCommand
    .command('list')
    .description('List all configured MCP servers')
    .option('-v, --verbose', 'Show detailed configuration')
    .action((options) => {
      try {
        const servers = configManager.getMCPServerList();
        
        if (servers.length === 0) {
          console.log(chalk.yellow('No MCP servers configured'));
          console.log(chalk.gray('Use "exa mcp add <name> <command>" to add a server'));
          return;
        }

        console.log(chalk.blue(`Found ${servers.length} MCP server${servers.length > 1 ? 's' : ''}:`));
        console.log();

        for (const { name, config } of servers) {
          const status = config.enabled ? chalk.green('enabled') : chalk.red('disabled');
          console.log(`${chalk.bold(name)} (${status})`);
          
          if (options.verbose) {
            console.log(chalk.gray(`  Transport: ${config.transport}`));
            if (config.command) {
              console.log(chalk.gray(`  Command: ${config.command.join(' ')}`));
            }
            if (config.args) {
              console.log(chalk.gray(`  Args: ${config.args.join(' ')}`));
            }
            if (config.url) {
              console.log(chalk.gray(`  URL: ${config.url}`));
            }
            if (config.env && Object.keys(config.env).length > 0) {
              console.log(chalk.gray(`  Environment: ${Object.entries(config.env).map(([k, v]) => `${k}=${v}`).join(', ')}`));
            }
            if (config.timeout) {
              console.log(chalk.gray(`  Timeout: ${config.timeout}ms`));
            }
            console.log();
          }
        }
      } catch (error) {
        console.log(chalk.red(`Failed to list MCP servers: ${error}`));
        process.exit(1);
      }
    });

  // exa mcp get command
  mcpCommand
    .command('get <name>')
    .description('Get detailed configuration for a specific MCP server')
    .action((name: string) => {
      try {
        const server = configManager.getMCPServer(name);
        
        if (!server) {
          console.log(chalk.red(`MCP server '${name}' not found`));
          console.log(chalk.gray('Use "exa mcp list" to see available servers'));
          process.exit(1);
        }

        const status = server.enabled ? chalk.green('enabled') : chalk.red('disabled');
        console.log(`${chalk.bold(name)} (${status})`);
        console.log(chalk.gray(`Transport: ${server.transport}`));
        
        if (server.command) {
          console.log(chalk.gray(`Command: ${server.command.join(' ')}`));
        }
        if (server.args) {
          console.log(chalk.gray(`Args: ${server.args.join(' ')}`));
        }
        if (server.url) {
          console.log(chalk.gray(`URL: ${server.url}`));
        }
        if (server.env && Object.keys(server.env).length > 0) {
          console.log(chalk.gray(`Environment:`));
          for (const [key, value] of Object.entries(server.env)) {
            console.log(chalk.gray(`  ${key}=${value}`));
          }
        }
        if (server.timeout) {
          console.log(chalk.gray(`Timeout: ${server.timeout}ms`));
        }
      } catch (error) {
        console.log(chalk.red(`Failed to get MCP server: ${error}`));
        process.exit(1);
      }
    });

  // exa mcp remove command
  mcpCommand
    .command('remove <name>')
    .description('Remove an MCP server configuration')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (name: string, options) => {
      try {
        const server = configManager.getMCPServer(name);
        
        if (!server) {
          console.log(chalk.red(`MCP server '${name}' not found`));
          process.exit(1);
        }

        if (!options.yes) {
          // In a real CLI, you'd use a library like inquirer for prompts
          // For now, we'll require the -y flag
          console.log(chalk.yellow(`To remove MCP server '${name}', use the -y flag:`));
          console.log(chalk.gray(`exa mcp remove ${name} -y`));
          return;
        }

        const removed = configManager.removeMCPServer(name);
        
        if (removed) {
          console.log(chalk.green(`✓ MCP server '${name}' removed successfully`));
        } else {
          console.log(chalk.red(`Failed to remove MCP server '${name}'`));
          process.exit(1);
        }
      } catch (error) {
        console.log(chalk.red(`Failed to remove MCP server: ${error}`));
        process.exit(1);
      }
    });

  // exa mcp enable command
  mcpCommand
    .command('enable <name>')
    .description('Enable an MCP server')
    .action((name: string) => {
      try {
        const enabled = configManager.enableMCPServer(name);
        
        if (enabled) {
          console.log(chalk.green(`✓ MCP server '${name}' enabled`));
        } else {
          console.log(chalk.red(`MCP server '${name}' not found`));
          process.exit(1);
        }
      } catch (error) {
        console.log(chalk.red(`Failed to enable MCP server: ${error}`));
        process.exit(1);
      }
    });

  // exa mcp disable command
  mcpCommand
    .command('disable <name>')
    .description('Disable an MCP server')
    .action((name: string) => {
      try {
        const disabled = configManager.disableMCPServer(name);
        
        if (disabled) {
          console.log(chalk.green(`✓ MCP server '${name}' disabled`));
        } else {
          console.log(chalk.red(`MCP server '${name}' not found`));
          process.exit(1);
        }
      } catch (error) {
        console.log(chalk.red(`Failed to disable MCP server: ${error}`));
        process.exit(1);
      }
    });

  return mcpCommand;
}