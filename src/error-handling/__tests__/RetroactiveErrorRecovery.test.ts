/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest'
import {EventEmitter} from 'events'
import {RetroactiveErrorRecovery} from '../RetroactiveErrorRecovery'
import {ErrorCategory, ErrorSeverity, ClassifiedError, ErrorContext} from '../ErrorHandler'

// Mock dependencies
const mockErrorHandler = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  classifyError: vi.fn()
} as any

const mockRecoveryStrategies = {
  executeRecovery: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn()
} as any

// Test data factories
const createClassifiedError = (
  category: ErrorCategory = ErrorCategory.NETWORK,
  severity: ErrorSeverity = ErrorSeverity.HIGH,
  message: string = 'Test error'
): ClassifiedError => ({
  originalError: new Error(message),
  category,
  severity,
  confidence: 0.9,
  metadata: {errorCode: 'TEST_ERROR'}
})

const createErrorContext = (
  operation: string = 'test_operation',
  sessionId: string = 'session123'
): ErrorContext => ({
  timestamp: Date.now(),
  operation,
  userAgent: 'test',
  sessionId
})

describe('RetroactiveErrorRecovery', () => {
  let retroactiveRecovery: RetroactiveErrorRecovery

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock returns
    mockRecoveryStrategies.executeRecovery.mockResolvedValue({
      success: true,
      strategy: 'test_recovery',
      actions: ['test_action'],
      duration: 100,
      reason: undefined
    })

    retroactiveRecovery = new RetroactiveErrorRecovery(mockErrorHandler, mockRecoveryStrategies, {
      maxRetroactiveHours: 1,
      maxErrorsPerBatch: 5,
      retryIntervalMs: 100,
      maxRetryAttempts: 2,
      silentFailureThreshold: 5000,
      enableWalIntegration: true
    })
  })

  afterEach(() => {
    retroactiveRecovery.destroy()
  })

  describe('Constructor & Initialization', () => {
    it('should initialize with configuration', () => {
      expect(retroactiveRecovery).toBeInstanceOf(EventEmitter)
      expect(retroactiveRecovery['config'].maxRetroactiveHours).toBe(1)
      expect(retroactiveRecovery['config'].maxErrorsPerBatch).toBe(5)
    })

    it('should register event listeners on dependencies', () => {
      expect(mockErrorHandler.on).toHaveBeenCalledWith('errorClassified', expect.any(Function))
      expect(mockRecoveryStrategies.on).toHaveBeenCalledWith(
        'recoveryCompleted',
        expect.any(Function)
      )
    })

    it('should initialize statistics', () => {
      const stats = retroactiveRecovery.getRetroactiveStats()
      expect(stats.totalRetroactiveRecoveries).toBe(0)
      expect(stats.successfulRetroactiveRecoveries).toBe(0)
      expect(stats.silentFailuresDetected).toBe(0)
    })
  })

  describe('WAL Integration', () => {
    it('should store new errors in WAL when errorClassified event is emitted', () => {
      const classifiedError = createClassifiedError(
        ErrorCategory.TRANSCRIPTION,
        ErrorSeverity.CRITICAL
      )
      const context = createErrorContext('transcription_start')

      // Simulate the errorClassified event
      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(classifiedError, context)

      const walInfo = retroactiveRecovery.getWalInfo()
      expect(walInfo.totalEntries).toBe(1)

      const stats = retroactiveRecovery.getRetroactiveStats()
      expect(stats.walEntriesProcessed).toBe(1)
    })

    it('should update WAL entries on recovery completion', () => {
      const classifiedError = createClassifiedError()
      const context = createErrorContext()

      // Store error in WAL first
      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(classifiedError, context)

      // Simulate recovery completion
      const recoveryResult = {
        success: true,
        error: classifiedError,
        context,
        strategy: 'test_recovery'
      }

      const handleRecoveryCompletion =
        retroactiveRecovery['handleRecoveryCompletion'].bind(retroactiveRecovery)
      handleRecoveryCompletion(recoveryResult)

      const walInfo = retroactiveRecovery.getWalInfo()
      expect(walInfo.totalEntries).toBe(1)
      expect(walInfo.unrecoveredErrors).toBe(0) // Should be marked as recovered
    })

    it('should get comprehensive WAL information', () => {
      // Add multiple errors with different timestamps
      const errors = [
        createClassifiedError(ErrorCategory.NETWORK, ErrorSeverity.HIGH),
        createClassifiedError(ErrorCategory.TRANSCRIPTION, ErrorSeverity.CRITICAL),
        createClassifiedError(ErrorCategory.API, ErrorSeverity.MEDIUM)
      ]

      errors.forEach((error, index) => {
        const context = createErrorContext(`operation_${index}`)
        const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
        handleNewError(error, context)
      })

      const walInfo = retroactiveRecovery.getWalInfo()
      expect(walInfo.totalEntries).toBe(3)
      expect(walInfo.oldestEntry).toBeDefined()
      expect(walInfo.newestEntry).toBeDefined()
      expect(walInfo.unrecoveredErrors).toBe(3) // None recovered yet
    })
  })

  describe('Silent Failure Detection', () => {
    it('should detect errors with no recovery attempt as silent failures', () => {
      const classifiedError = createClassifiedError()
      const context = createErrorContext()

      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(classifiedError, context)

      const walInfo = retroactiveRecovery.getWalInfo()
      expect(walInfo.silentFailures).toBe(1)
    })

    it('should detect failed recovery attempts as silent failures after threshold', async () => {
      const classifiedError = createClassifiedError()
      const context = createErrorContext()

      // Store error with failed recovery
      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(classifiedError, context)

      // Simulate failed recovery
      const errorId = retroactiveRecovery['generateErrorId'](classifiedError, context)
      retroactiveRecovery['updateWalEntry'](errorId, {
        recoveryAttempted: true,
        recoverySuccess: false,
        lastRetryTimestamp: Date.now() - 10000 // 10 seconds ago
      })

      const walInfo = retroactiveRecovery.getWalInfo()
      expect(walInfo.silentFailures).toBe(1)
    })

    it('should detect critical transcription errors as silent failures', () => {
      const transcriptionError = createClassifiedError(
        ErrorCategory.TRANSCRIPTION,
        ErrorSeverity.CRITICAL,
        'Transcription service unavailable'
      )
      const context = createErrorContext('transcription_process')

      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(transcriptionError, context)

      const walInfo = retroactiveRecovery.getWalInfo()
      expect(walInfo.silentFailures).toBe(1)
    })
  })

  describe('Error Prioritization', () => {
    it('should prioritize errors by category according to configuration', () => {
      const errors = [
        {error: createClassifiedError(ErrorCategory.SYSTEM), timestamp: Date.now()},
        {error: createClassifiedError(ErrorCategory.TRANSCRIPTION), timestamp: Date.now()},
        {error: createClassifiedError(ErrorCategory.NETWORK), timestamp: Date.now()}
      ]

      const errorEntries = errors.map((e, index) => ({
        id: `error_${index}`,
        timestamp: e.timestamp,
        error: e.error,
        context: createErrorContext(),
        recoveryAttempted: false,
        retryCount: 0,
        silentFailure: true,
        metadata: {
          sessionId: 'session123',
          operation: 'test_operation',
          userAgent: 'test'
        }
      }))

      const prioritized = retroactiveRecovery['prioritizeErrorsForRecovery'](errorEntries)

      // Should be ordered: TRANSCRIPTION, NETWORK, SYSTEM (based on default priorities)
      expect(prioritized[0].error.category).toBe(ErrorCategory.TRANSCRIPTION)
      expect(prioritized[1].error.category).toBe(ErrorCategory.NETWORK)
      expect(prioritized[2].error.category).toBe(ErrorCategory.SYSTEM)
    })

    it('should prioritize by severity when categories are equal', () => {
      const errors = [
        {
          error: createClassifiedError(ErrorCategory.NETWORK, ErrorSeverity.LOW),
          timestamp: Date.now()
        },
        {
          error: createClassifiedError(ErrorCategory.NETWORK, ErrorSeverity.CRITICAL),
          timestamp: Date.now()
        },
        {
          error: createClassifiedError(ErrorCategory.NETWORK, ErrorSeverity.HIGH),
          timestamp: Date.now()
        }
      ]

      const errorEntries = errors.map((e, index) => ({
        id: `error_${index}`,
        timestamp: e.timestamp,
        error: e.error,
        context: createErrorContext(),
        recoveryAttempted: false,
        retryCount: 0,
        silentFailure: true,
        metadata: {
          sessionId: 'session123',
          operation: 'test_operation',
          userAgent: 'test'
        }
      }))

      const prioritized = retroactiveRecovery['prioritizeErrorsForRecovery'](errorEntries)

      // Should be ordered: CRITICAL, HIGH, LOW
      expect(prioritized[0].error.severity).toBe(ErrorSeverity.CRITICAL)
      expect(prioritized[1].error.severity).toBe(ErrorSeverity.HIGH)
      expect(prioritized[2].error.severity).toBe(ErrorSeverity.LOW)
    })
  })

  describe('Retroactive Recovery Execution', () => {
    it('should execute retroactive recovery successfully', async () => {
      // Add a silent failure to WAL
      const classifiedError = createClassifiedError(
        ErrorCategory.TRANSCRIPTION,
        ErrorSeverity.CRITICAL
      )
      const context = createErrorContext('transcription_failed')

      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(classifiedError, context)

      mockRecoveryStrategies.executeRecovery.mockResolvedValue({
        success: true,
        strategy: 'transcription_recovery',
        actions: ['service_restart'],
        duration: 150
      })

      const result = await retroactiveRecovery.executeRetroactiveRecovery()

      expect(result.success).toBe(true)
      expect(result.recoveredErrors).toBe(1)
      expect(result.failedRecoveries).toBe(0)
      expect(result.processedErrors).toHaveLength(1)
      expect(mockRecoveryStrategies.executeRecovery).toHaveBeenCalledWith(
        classifiedError,
        expect.objectContaining({
          operation: 'retroactive_transcription_failed',
          isRetroactiveRecovery: true
        })
      )
    })

    it('should handle recovery failures gracefully', async () => {
      const classifiedError = createClassifiedError()
      const context = createErrorContext()

      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(classifiedError, context)

      mockRecoveryStrategies.executeRecovery.mockResolvedValue({
        success: false,
        reason: 'Recovery failed - service unavailable',
        strategy: 'network_recovery'
      })

      const result = await retroactiveRecovery.executeRetroactiveRecovery()

      expect(result.success).toBe(false)
      expect(result.recoveredErrors).toBe(0)
      expect(result.failedRecoveries).toBe(1)
      expect(result.errors).toContain(
        expect.stringContaining('Recovery failed - service unavailable')
      )
    })

    it('should skip errors that exceed max retry attempts', async () => {
      const classifiedError = createClassifiedError()
      const context = createErrorContext()

      // Store error with high retry count
      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(classifiedError, context)

      const errorId = retroactiveRecovery['generateErrorId'](classifiedError, context)
      retroactiveRecovery['updateWalEntry'](errorId, {
        retryCount: 5 // Exceeds maxRetryAttempts (2)
      })

      const result = await retroactiveRecovery.executeRetroactiveRecovery()

      expect(result.skippedErrors).toBe(1)
      expect(result.recoveredErrors).toBe(0)
      expect(mockRecoveryStrategies.executeRecovery).not.toHaveBeenCalled()
    })

    it('should process errors in batches', async () => {
      // Add more errors than batch size
      const errors = Array.from({length: 8}, (_, i) =>
        createClassifiedError(ErrorCategory.NETWORK, ErrorSeverity.HIGH, `Error ${i}`)
      )

      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      errors.forEach(error => {
        handleNewError(error, createErrorContext(`operation_${errors.indexOf(error)}`))
      })

      mockRecoveryStrategies.executeRecovery.mockResolvedValue({
        success: true,
        strategy: 'network_recovery'
      })

      const batchStartedSpy = vi.fn()
      const batchCompletedSpy = vi.fn()
      retroactiveRecovery.on('batchProcessingStarted', batchStartedSpy)
      retroactiveRecovery.on('batchProcessingCompleted', batchCompletedSpy)

      const result = await retroactiveRecovery.executeRetroactiveRecovery()

      expect(result.recoveredErrors).toBe(8)
      expect(batchStartedSpy).toHaveBeenCalledTimes(2) // 8 errors / 5 batch size = 2 batches
      expect(batchCompletedSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('Category-Specific Recovery', () => {
    it('should recover specific error category', async () => {
      // Add errors from different categories
      const transcriptionError = createClassifiedError(ErrorCategory.TRANSCRIPTION)
      const networkError = createClassifiedError(ErrorCategory.NETWORK)

      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(transcriptionError, createErrorContext('transcription_op'))
      handleNewError(networkError, createErrorContext('network_op'))

      mockRecoveryStrategies.executeRecovery.mockResolvedValue({
        success: true,
        strategy: 'transcription_recovery'
      })

      const result = await retroactiveRecovery.recoverErrorCategory(ErrorCategory.TRANSCRIPTION)

      expect(result.recoveredErrors).toBe(1) // Only transcription error should be recovered
      expect(mockRecoveryStrategies.executeRecovery).toHaveBeenCalledTimes(1)
      expect(mockRecoveryStrategies.executeRecovery).toHaveBeenCalledWith(
        transcriptionError,
        expect.any(Object)
      )
    })

    it('should return successful result when no errors of category exist', async () => {
      const result = await retroactiveRecovery.recoverErrorCategory(ErrorCategory.TRANSCRIPTION)

      expect(result.success).toBe(true)
      expect(result.recoveredErrors).toBe(0)
      expect(result.processedErrors).toHaveLength(0)
    })
  })

  describe('Statistics and Monitoring', () => {
    it('should update statistics after retroactive recovery', async () => {
      const classifiedError = createClassifiedError()
      const context = createErrorContext()

      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(classifiedError, context)

      mockRecoveryStrategies.executeRecovery.mockResolvedValue({
        success: true,
        strategy: 'test_recovery'
      })

      await retroactiveRecovery.executeRetroactiveRecovery()

      const stats = retroactiveRecovery.getRetroactiveStats()
      expect(stats.totalRetroactiveRecoveries).toBe(1)
      expect(stats.successfulRetroactiveRecoveries).toBe(1)
      expect(stats.silentFailuresDetected).toBe(1)
    })

    it('should reset statistics correctly', () => {
      // Add some data first
      const classifiedError = createClassifiedError()
      const context = createErrorContext()
      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(classifiedError, context)

      retroactiveRecovery['recoveryStats'].totalRetroactiveRecoveries = 5
      retroactiveRecovery['recoveryStats'].successfulRetroactiveRecoveries = 3

      retroactiveRecovery.resetStats(false)

      const stats = retroactiveRecovery.getRetroactiveStats()
      expect(stats.totalRetroactiveRecoveries).toBe(0)
      expect(stats.successfulRetroactiveRecoveries).toBe(0)

      // WAL should still have entries
      const walInfo = retroactiveRecovery.getWalInfo()
      expect(walInfo.totalEntries).toBe(1)
    })

    it('should clear WAL when resetting with clearWal flag', () => {
      const classifiedError = createClassifiedError()
      const context = createErrorContext()
      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(classifiedError, context)

      retroactiveRecovery.resetStats(true)

      const walInfo = retroactiveRecovery.getWalInfo()
      expect(walInfo.totalEntries).toBe(0)
    })
  })

  describe('WAL Cleanup', () => {
    it('should clean up old WAL entries', async () => {
      const oldTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1000 // 8 days ago
      const recentTimestamp = Date.now() - 60 * 1000 // 1 minute ago

      // Add old entry directly to WAL
      retroactiveRecovery['walStorage'].set('old_error', {
        id: 'old_error',
        timestamp: oldTimestamp,
        error: createClassifiedError(),
        context: createErrorContext(),
        recoveryAttempted: false,
        retryCount: 0,
        silentFailure: true,
        metadata: {
          sessionId: 'session123',
          operation: 'old_operation',
          userAgent: 'test'
        }
      })

      // Add recent entry
      const recentError = createClassifiedError()
      const recentContext = createErrorContext()
      recentContext.timestamp = recentTimestamp
      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(recentError, recentContext)

      const result = await retroactiveRecovery.cleanupOldWalEntries()

      expect(result.removedEntries).toBe(1) // Only old entry should be removed
      expect(result.remainingEntries).toBe(1) // Recent entry should remain
    })
  })

  describe('Event Emissions', () => {
    it('should emit retroactiveRecoveryStarted event', async () => {
      const eventSpy = vi.fn()
      retroactiveRecovery.on('retroactiveRecoveryStarted', eventSpy)

      await retroactiveRecovery.executeRetroactiveRecovery()

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
          config: expect.any(Object)
        })
      )
    })

    it('should emit silentFailuresDetected event', async () => {
      const classifiedError = createClassifiedError()
      const context = createErrorContext()
      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(classifiedError, context)

      const eventSpy = vi.fn()
      retroactiveRecovery.on('silentFailuresDetected', eventSpy)

      await retroactiveRecovery.executeRetroactiveRecovery()

      expect(eventSpy).toHaveBeenCalledWith({
        count: 1,
        failures: expect.any(Array)
      })
    })

    it('should emit retroactiveRecoveryCompleted event', async () => {
      const eventSpy = vi.fn()
      retroactiveRecovery.on('retroactiveRecoveryCompleted', eventSpy)

      await retroactiveRecovery.executeRetroactiveRecovery()

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: expect.any(Boolean),
          recoveredErrors: expect.any(Number),
          totalProcessingTime: expect.any(Number)
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle exceptions during retroactive recovery execution', async () => {
      mockRecoveryStrategies.executeRecovery.mockRejectedValue(new Error('Recovery system failure'))

      const classifiedError = createClassifiedError()
      const context = createErrorContext()
      const handleNewError = retroactiveRecovery['handleNewError'].bind(retroactiveRecovery)
      handleNewError(classifiedError, context)

      const result = await retroactiveRecovery.executeRetroactiveRecovery()

      expect(result.success).toBe(false)
      expect(result.failedRecoveries).toBe(1)
      expect(result.errors).toContain(expect.stringContaining('Recovery system failure'))
    })

    it('should prevent concurrent retroactive recovery execution', async () => {
      retroactiveRecovery['isProcessing'] = true

      await expect(retroactiveRecovery.executeRetroactiveRecovery()).rejects.toThrow(
        'Retroactive recovery is already in progress'
      )
    })
  })

  describe('Cleanup', () => {
    it('should clean up resources on destroy', () => {
      const removeAllListenersSpy = vi.spyOn(retroactiveRecovery, 'removeAllListeners')

      retroactiveRecovery.destroy()

      expect(removeAllListenersSpy).toHaveBeenCalled()
      expect(retroactiveRecovery.getWalInfo().totalEntries).toBe(0)
      expect(retroactiveRecovery['isProcessing']).toBe(false)
    })
  })
})
