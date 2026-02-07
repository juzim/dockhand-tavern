/**
 * Logger utility with configurable log levels
 */

type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

class Logger {
  private level: LogLevel;
  private levelValue: number;

  constructor() {
    const envLevel = (process.env.LOG_LEVEL?.toLowerCase() || 'info') as LogLevel;
    
    // Validate log level
    if (!LOG_LEVELS.hasOwnProperty(envLevel)) {
      console.error(`Invalid LOG_LEVEL "${envLevel}". Using "info" instead.`);
      console.error(`Valid levels: silent, error, warn, info, debug`);
      this.level = 'info';
    } else {
      this.level = envLevel;
    }
    
    this.levelValue = LOG_LEVELS[this.level];
  }

  private formatTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (this.levelValue < LOG_LEVELS[level]) {
      return; // Log level too low, skip
    }

    const timestamp = this.formatTimestamp();
    const levelTag = level.toUpperCase().padEnd(5, ' ');
    
    // For errors, check if last argument is an Error object
    if (level === 'error' && args.length > 0 && args[args.length - 1] instanceof Error) {
      const error = args.pop() as Error;
      console.error(`${timestamp} ${levelTag} ${message}`, ...args);
      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      // Map to appropriate console method
      switch (level) {
        case 'error':
          console.error(`${timestamp} ${levelTag} ${message}`, ...args);
          break;
        case 'warn':
          console.warn(`${timestamp} ${levelTag} ${message}`, ...args);
          break;
        case 'debug':
          console.debug(`${timestamp} ${levelTag} ${message}`, ...args);
          break;
        default:
          console.log(`${timestamp} ${levelTag} ${message}`, ...args);
      }
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }
}

// Export singleton instance
export const logger = new Logger();
