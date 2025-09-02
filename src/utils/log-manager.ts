import fs from 'fs';
import path from 'path';

export class LogManager {
  private logDir: string;
  private logFile: string;
  private currentDate: string;

  constructor() {
    this.logDir = path.join(process.cwd(), '.exa');
    this.currentDate = this.getDateString();
    this.logFile = path.join(this.logDir, `${this.currentDate}_exa.log`);
    this.ensureLogDir();
  }

  /**
   * Get current date in YYYYMMDD format
   */
  private getDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0].replace(/-/g, '');
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Get timestamp string for log entries
   */
  private getTimestamp(): string {
    return new Date().toISOString().replace('T', ' ').split('.')[0];
  }

  /**
   * Write log entry to file
   */
  private writeLogEntry(level: string, message: string, serverName?: string): void {
    try {
      const timestamp = this.getTimestamp();
      const serverPrefix = serverName ? `[${serverName}] ` : '';
      const logEntry = `${timestamp} ${level}: ${serverPrefix}${message}\n`;
      
      // Check if date has changed and update log file if needed
      const currentDate = this.getDateString();
      if (currentDate !== this.currentDate) {
        this.currentDate = currentDate;
        this.logFile = path.join(this.logDir, `${this.currentDate}_exa.log`);
      }
      
      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      // Silently handle log write errors to avoid breaking the main application
      console.warn(`Failed to write log: ${error}`);
    }
  }

  /**
   * Log MCP server output
   */
  logMCPOutput(serverName: string, output: string): void {
    // Filter out empty lines and split multi-line output
    const lines = output.split('\n').filter(line => line.trim().length > 0);
    
    for (const line of lines) {
      this.writeLogEntry('MCP', line, serverName);
    }
  }

  /**
   * Log MCP server debug information
   */
  logMCPDebug(serverName: string, message: string): void {
    this.writeLogEntry('DEBUG', message, serverName);
  }

  /**
   * Log MCP server info
   */
  logMCPInfo(serverName: string, message: string): void {
    this.writeLogEntry('INFO', message, serverName);
  }

  /**
   * Log MCP server error
   */
  logMCPError(serverName: string, message: string): void {
    this.writeLogEntry('ERROR', message, serverName);
  }

  /**
   * Log general application info
   */
  logInfo(message: string): void {
    this.writeLogEntry('INFO', message);
  }

  /**
   * Log general application debug
   */
  logDebug(message: string): void {
    this.writeLogEntry('DEBUG', message);
  }

  /**
   * Check if a line should be redirected to file instead of console
   */
  shouldRedirectToFile(line: string): boolean {
    // Check for various log patterns that should go to file
    const fileLogPatterns = [
      /^\d{2}:\d{2}:\d{2}\s+(INFO|DEBUG|WARN|ERROR):/,  // Timestamp logs
      /^\[LOG\]/,                                        // [LOG] prefixed logs
      /^\[DEBUG\]/,                                     // [DEBUG] prefixed logs
      /^\[SYNC-DEBUG\]/,                                // [SYNC-DEBUG] prefixed logs
      /^\[EMBEDDING\]/,                                 // [EMBEDDING] prefixed logs
      /^\[WORKSPACE\]/,                                 // [WORKSPACE] prefixed logs
      /^\[SNAPSHOT-DEBUG\]/,                            // [SNAPSHOT-DEBUG] prefixed logs
      /^\[MCP\]/,                                       // [MCP] prefixed logs
      /^\[CIPHER-MCP\]/,                                // [CIPHER-MCP] prefixed logs
      /^🔍|🚀|🔧|✅|📄|🚫|🔌|📋|⚠️.*Environment|Debug:|Configuration|Initializing|Starting/  // Emoji debug logs
    ];

    return fileLogPatterns.some(pattern => pattern.test(line.trim()));
  }

  /**
   * Filter and redirect output - console or file
   */
  filterAndRedirectOutput(serverName: string, data: string): void {
    const lines = data.toString().split('\n');
    
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      
      if (this.shouldRedirectToFile(line)) {
        // Redirect to file
        this.logMCPOutput(serverName, line);
      } else {
        // Keep on console (for important status messages)
        console.log(line);
      }
    }
  }

  /**
   * Get current log file path
   */
  getLogFilePath(): string {
    return this.logFile;
  }

  /**
   * Get log directory path  
   */
  getLogDirPath(): string {
    return this.logDir;
  }

  /**
   * Temporarily override console methods to capture MCP server output
   */
  captureConsoleOutput(serverName: string, callback: () => Promise<void>): Promise<void> {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    // Override console methods
    console.log = (...args: any[]) => {
      const message = args.join(' ');
      if (this.shouldRedirectToFile(message)) {
        this.logMCPOutput(serverName, message);
      } else {
        originalLog(...args);
      }
    };

    console.error = (...args: any[]) => {
      const message = args.join(' ');
      this.logMCPError(serverName, message);
    };

    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      this.logMCPInfo(serverName, `WARN: ${message}`);
    };

    return callback().finally(() => {
      // Restore original console methods
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    });
  }
}

// Global instance
let globalLogManager: LogManager | null = null;

export function getLogManager(): LogManager {
  if (!globalLogManager) {
    globalLogManager = new LogManager();
  }
  return globalLogManager;
}