/**
 * Logging Utility for Gemini Live API
 * Centralized logging with multiple outputs and formatting
 */

import EventEmitter from 'eventemitter3'
import {LogLevel, LogEntry} from './gemini-error-handler'

export interface LoggerConfig {
  level: LogLevel
  enableConsole: boolean
  enableFile: boolean
  fileName?: string
  maxFileSize?: number
  maxFiles?: number
  includeTimestamp: boolean
  includeLevel: boolean
  includeContext: boolean
  colorize: boolean
}

export interface LogOutput {
  write(entry: LogEntry): void
  flush?(): void
  close?(): void
}

/**
 * Console Log Output
 */
export class ConsoleLogOutput implements LogOutput {
  private colorize: boolean

  constructor(colorize = true) {
    this.colorize = colorize
  }

  write(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString()
    const levelName = LogLevel[entry.level]
    const prefix = `[${timestamp}] [${levelName}] [Gemini]`

    let output = `${prefix} ${entry.message}`

    if (entry.context && Object.keys(entry.context).length > 0) {
      output += ` ${JSON.stringify(entry.context)}`
    }

    if (this.colorize && typeof process !== 'undefined' && process.stdout?.isTTY) {
      output = this.colorizeOutput(output, entry.level)
    }

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(output)
        break
      case LogLevel.WARN:
        console.warn(output)
        break
      case LogLevel.INFO:
        console.info(output)
        break
      case LogLevel.DEBUG:
      case LogLevel.TRACE:
        console.debug(output)
        break
    }
  }

  private colorizeOutput(output: string, level: LogLevel): string {
    const colors = {
      [LogLevel.ERROR]: '\x1b[31m', // Red
      [LogLevel.WARN]: '\x1b[33m', // Yellow
      [LogLevel.INFO]: '\x1b[36m', // Cyan
      [LogLevel.DEBUG]: '\x1b[37m', // White
      [LogLevel.TRACE]: '\x1b[90m' // Gray
    }

    const reset = '\x1b[0m'
    return `${colors[level]}${output}${reset}`
  }
}

/**
 * Memory Log Output (for testing and debugging)
 */
export class MemoryLogOutput implements LogOutput {
  private entries: LogEntry[] = []
  private maxEntries: number

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries
  }

  write(entry: LogEntry): void {
    this.entries.push(entry)

    if (this.entries.length > this.maxEntries) {
      this.entries.shift()
    }
  }

  getEntries(): LogEntry[] {
    return [...this.entries]
  }

  clear(): void {
    this.entries.length = 0
  }

  flush(): void {
    // Memory output doesn't need flushing
  }

  close(): void {
    this.clear()
  }
}

/**
 * File Log Output (for Node.js environments)
 */
export class FileLogOutput implements LogOutput {
  private fileName: string
  private disabled = false

  constructor(fileName: string) {
    this.fileName = fileName
    // File logging will be handled by external tools in production
    this.disabled = typeof window !== 'undefined' // Disable in browser
  }

  write(entry: LogEntry): void {
    if (this.disabled) return

    try {
      const timestamp = new Date(entry.timestamp).toISOString()
      const levelName = LogLevel[entry.level]
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
      const logLine = `[${timestamp}] [${levelName}] ${entry.message}${contextStr}\n`

      // In a real implementation, this would write to file
      // For now, we'll just log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`FILE LOG: ${logLine.trim()}`)
      }
    } catch (error) {
      console.error('Failed to write to log file:', error)
    }
  }

  flush(): void {
    // No-op for simplified implementation
  }

  close(): void {
    // No-op for simplified implementation
  }
}

/**
 * Enhanced Logger with Multiple Outputs
 */
export class GeminiLogger extends EventEmitter {
  private config: LoggerConfig
  private outputs: LogOutput[] = []
  private buffer: LogEntry[] = []
  private bufferSize = 100
  private flushInterval: NodeJS.Timeout | null = null

  constructor(config: Partial<LoggerConfig> = {}) {
    super()

    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      enableFile: false,
      fileName: './logs/gemini.log',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      includeTimestamp: true,
      includeLevel: true,
      includeContext: true,
      colorize: true,
      ...config
    }

    this.setupOutputs()
    this.startBufferFlush()
  }

  private setupOutputs(): void {
    if (this.config.enableConsole) {
      this.outputs.push(new ConsoleLogOutput(this.config.colorize))
    }

    if (this.config.enableFile && this.config.fileName) {
      this.outputs.push(new FileLogOutput(this.config.fileName))
    }
  }

  private startBufferFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flush()
    }, 1000) // Flush every second
  }

  /**
   * Add custom log output
   */
  addOutput(output: LogOutput): void {
    this.outputs.push(output)
  }

  /**
   * Remove log output
   */
  removeOutput(output: LogOutput): void {
    const index = this.outputs.indexOf(output)
    if (index > -1) {
      this.outputs.splice(index, 1)
    }
  }

  /**
   * Log an entry
   */
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (level > this.config.level) {
      return
    }

    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      level,
      message,
      timestamp: Date.now(),
      context
    }

    // Buffer the entry
    this.buffer.push(entry)

    // Flush if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      this.flush()
    }

    // Emit event
    this.emit('log', entry)
  }

  /**
   * Flush buffered entries
   */
  flush(): void {
    if (this.buffer.length === 0) {
      return
    }

    const entries = [...this.buffer]
    this.buffer.length = 0

    entries.forEach(entry => {
      this.outputs.forEach(output => {
        try {
          output.write(entry)
        } catch (error) {
          console.error('Log output error:', error)
        }
      })
    })

    // Flush outputs
    this.outputs.forEach(output => {
      try {
        output.flush?.()
      } catch (error) {
        console.error('Log output flush error:', error)
      }
    })
  }

  /**
   * Log error
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context)
  }

  /**
   * Log warning
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context)
  }

  /**
   * Log info
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context)
  }

  /**
   * Log debug
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * Log trace
   */
  trace(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, context)
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level
  }

  /**
   * Enable/disable console output
   */
  setConsoleEnabled(enabled: boolean): void {
    this.config.enableConsole = enabled
    this.outputs = this.outputs.filter(output => !(output instanceof ConsoleLogOutput))

    if (enabled) {
      this.outputs.push(new ConsoleLogOutput(this.config.colorize))
    }
  }

  /**
   * Clean up and close
   */
  close(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }

    this.flush()

    this.outputs.forEach(output => {
      try {
        output.close?.()
      } catch (error) {
        console.error('Error closing log output:', error)
      }
    })

    this.outputs.length = 0
    this.removeAllListeners()
  }
}

// Create default logger instance
export const logger = new GeminiLogger({
  level: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  enableConsole: true,
  enableFile: process.env.NODE_ENV === 'production',
  fileName: './logs/gemini.log'
})

export default logger
