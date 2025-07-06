import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {AppLogger, createLogger, measurePerformance} from '../../../../services/logging/index'
import winston from 'winston'

// Test message interface
interface TestLogMessage {
  level: string
  message: string
  service?: string
  component?: string
  requestId?: string
  userId?: string
  connectionId?: string
  event?: string
  method?: string
  path?: string
  statusCode?: number
  duration?: number
  operation?: string
  severity?: string
  errorName?: string
  errorMessage?: string
  error?: string
  timestamp?: string
  [key: string]: unknown
}

describe('Logging Service', () => {
  let testLogger: AppLogger
  let logMessages: TestLogMessage[] = []

  beforeEach(() => {
    // Create a test logger with memory transport
    logMessages = []
    const memoryTransport = new winston.transports.Stream({
      stream: {
        write: (message: string) => {
          logMessages.push(JSON.parse(message) as TestLogMessage)
        }
      } as NodeJS.WritableStream,
      format: winston.format.json()
    })

    testLogger = new AppLogger({
      enableFileLogging: false,
      enableConsoleLogging: false
    })

    // Add memory transport for testing
    testLogger.getWinstonLogger().add(memoryTransport)
  })

  afterEach(() => {
    logMessages = []
  })

  describe('Basic Logging', () => {
    it('should log info messages correctly', () => {
      testLogger.info('Test info message', {metadata: {testKey: 'testValue'}})

      expect(logMessages).toHaveLength(1)
      expect(logMessages[0].level).toBe('info')
      expect(logMessages[0].message).toBe('Test info message')
      expect(logMessages[0].metadata).toEqual({testKey: 'testValue'})
      expect(logMessages[0].service).toBe('dao-copilot')
    })

    it('should log error messages with stack traces', () => {
      const testError = new Error('Test error')
      testLogger.error('Test error message', testError)

      expect(logMessages).toHaveLength(1)
      expect(logMessages[0].level).toBe('error')
      expect(logMessages[0].message).toBe('Test error message')
      expect(logMessages[0].errorName).toBe('Error')
      expect(logMessages[0].errorMessage).toBe('Test error')
      expect(logMessages[0].error).toContain('Error: Test error')
    })

    it('should log at different levels', () => {
      testLogger.debug('Debug message')
      testLogger.info('Info message')
      testLogger.warn('Warning message')
      testLogger.error('Error message')

      expect(logMessages).toHaveLength(4)
      expect(logMessages.map(m => m.level)).toEqual(['debug', 'info', 'warn', 'error'])
    })
  })

  describe('Context Management', () => {
    it('should set and use persistent context', () => {
      testLogger.setContext({requestId: 'test-123', userId: 'user-456'})
      testLogger.info('Test message')

      expect(logMessages[0].requestId).toBe('test-123')
      expect(logMessages[0].userId).toBe('user-456')
    })

    it('should create child loggers with inherited context', () => {
      testLogger.setContext({requestId: 'parent-123'})
      const childLogger = testLogger.child({component: 'child'})

      childLogger.info('Child message')

      expect(logMessages[0].requestId).toBe('parent-123')
      expect(logMessages[0].component).toBe('child')
    })

    it('should clear context', () => {
      testLogger.setContext({requestId: 'test-123'})
      testLogger.clearContext()
      testLogger.info('Test message')

      expect(logMessages[0].requestId).toBeUndefined()
    })
  })

  describe('Specialized Logging Methods', () => {
    it('should log WebSocket events with proper context', () => {
      testLogger.websocket('connection_opened', 'conn-123', {
        metadata: {remoteAddress: '127.0.0.1'}
      })

      expect(logMessages[0].component).toBe('websocket')
      expect(logMessages[0].connectionId).toBe('conn-123')
      expect(logMessages[0].event).toBe('connection_opened')
      expect(logMessages[0].metadata).toEqual({remoteAddress: '127.0.0.1'})
    })

    it('should log transcription events', () => {
      testLogger.transcription('transcription_started', {duration: 1500})

      expect(logMessages[0].component).toBe('transcription')
      expect(logMessages[0].event).toBe('transcription_started')
      expect(logMessages[0].duration).toBe(1500)
    })

    it('should log API requests with proper formatting', () => {
      testLogger.apiRequest('GET', '/api/health', 200, 150)

      expect(logMessages[0].component).toBe('api')
      expect(logMessages[0].method).toBe('GET')
      expect(logMessages[0].path).toBe('/api/health')
      expect(logMessages[0].statusCode).toBe(200)
      expect(logMessages[0].duration).toBe(150)
      expect(logMessages[0].level).toBe('info')
    })

    it('should log API errors with warn/error levels', () => {
      testLogger.apiRequest('POST', '/api/upload', 400, 100)
      testLogger.apiRequest('GET', '/api/data', 500, 200)

      expect(logMessages[0].level).toBe('warn') // 400 status
      expect(logMessages[1].level).toBe('error') // 500 status
    })

    it('should log security events', () => {
      testLogger.security('unauthorized_access_attempt', {ip: '192.168.1.1'})

      expect(logMessages[0].component).toBe('security')
      expect(logMessages[0].event).toBe('unauthorized_access_attempt')
      expect(logMessages[0].severity).toBe('high')
      expect(logMessages[0].level).toBe('warn')
    })

    it('should log performance metrics', () => {
      testLogger.timing('database_query', 250, {metadata: {query: 'SELECT * FROM users'}})

      expect(logMessages[0].operation).toBe('database_query')
      expect(logMessages[0].duration).toBe(250)
      expect(logMessages[0].metadata).toEqual({query: 'SELECT * FROM users'})
      expect(logMessages[0].message).toContain('completed in 250ms')
    })
  })

  describe('Performance Measurement', () => {
    it('should measure synchronous function performance', () => {
      const result = measurePerformance('test_operation', () => {
        return 'test result'
      })

      expect(result).toBe('test result')
      expect(logMessages).toHaveLength(1)
      expect(logMessages[0].operation).toBe('test_operation')
      expect(logMessages[0].duration).toBeGreaterThanOrEqual(0)
    })

    it('should measure asynchronous function performance', async () => {
      const result = await measurePerformance('async_operation', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'async result'
      })

      expect(result).toBe('async result')
      expect(logMessages).toHaveLength(1)
      expect(logMessages[0].operation).toBe('async_operation')
      expect(logMessages[0].duration).toBeGreaterThanOrEqual(10)
    })

    it('should log errors in performance measurement', async () => {
      await expect(
        measurePerformance('failing_operation', () => {
          throw new Error('Test error')
        })
      ).rejects.toThrow('Test error')

      expect(logMessages).toHaveLength(1)
      expect(logMessages[0].level).toBe('error')
      expect(logMessages[0].message).toContain('failed after')
    })
  })

  describe('Logger Factory', () => {
    it('should create logger with initial context', () => {
      const contextLogger = createLogger({component: 'test', requestId: 'req-123'})

      // Add memory transport to the new logger for testing
      const testMessages: TestLogMessage[] = []
      const memoryTransport = new winston.transports.Stream({
        stream: {
          write: (message: string) => {
            testMessages.push(JSON.parse(message) as TestLogMessage)
          }
        } as NodeJS.WritableStream,
        format: winston.format.json()
      })

      contextLogger.getWinstonLogger().add(memoryTransport)
      contextLogger.info('Test message')

      expect(testMessages).toHaveLength(1)
      expect(testMessages[0].component).toBe('test')
      expect(testMessages[0].requestId).toBe('req-123')
    })
  })
})
