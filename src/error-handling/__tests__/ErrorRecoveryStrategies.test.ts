/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest'
import {EventEmitter} from 'events'
import {ErrorRecoveryStrategies} from '../ErrorRecoveryStrategies'
import {ErrorCategory, ClassifiedError, ErrorSeverity, ErrorContext} from '../ErrorHandler'

// Mock types for dependencies
interface MockConnectionMonitor {
  reconnect: ReturnType<typeof vi.fn>
  getConnectionState: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}

interface MockFallbackManager {
  executeFallback: ReturnType<typeof vi.fn>
  isServiceAvailable: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}

interface MockRetryPolicy {
  execute: ReturnType<typeof vi.fn>
  shouldRetry: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}

interface MockCircuitBreaker {
  execute: ReturnType<typeof vi.fn>
  isOpen: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}

interface MockReplayEngine {
  replay: ReturnType<typeof vi.fn>
  canReplay: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}

interface MockTranscriptReconciler {
  reconcile: ReturnType<typeof vi.fn>
  verifyIntegrity: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}

interface MockStatusNotifier {
  notify: ReturnType<typeof vi.fn>
  setStatus: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}

// Mock dependencies
const mockConnectionMonitor: MockConnectionMonitor = {
  reconnect: vi.fn(),
  getConnectionState: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
}

const mockFallbackManager: MockFallbackManager = {
  executeFallback: vi.fn(),
  isServiceAvailable: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
}

const mockRetryPolicy: MockRetryPolicy = {
  execute: vi.fn(),
  shouldRetry: vi.fn(),
  reset: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
}

const mockCircuitBreaker: MockCircuitBreaker = {
  execute: vi.fn(),
  isOpen: vi.fn(),
  reset: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
}

const mockReplayEngine: MockReplayEngine = {
  replay: vi.fn(),
  canReplay: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
}

const mockTranscriptReconciler: MockTranscriptReconciler = {
  reconcile: vi.fn(),
  verifyIntegrity: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
}

const mockStatusNotifier: MockStatusNotifier = {
  notify: vi.fn(),
  setStatus: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
}

describe('ErrorRecoveryStrategies', () => {
  let recoveryStrategies: ErrorRecoveryStrategies

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mock returns
    mockConnectionMonitor.getConnectionState.mockReturnValue({connected: false})
    mockFallbackManager.isServiceAvailable.mockReturnValue(false)
    mockRetryPolicy.shouldRetry.mockReturnValue(true)
    mockCircuitBreaker.isOpen.mockReturnValue(false)
    mockReplayEngine.canReplay.mockReturnValue(true)
    mockTranscriptReconciler.verifyIntegrity.mockReturnValue(true)

    recoveryStrategies = new ErrorRecoveryStrategies({
      maxConcurrentRecoveries: 5,
      recoveryTimeoutMs: 30000,
      retryDelayMs: 1000,
      maxRetryAttempts: 3
    })

    await recoveryStrategies.initialize({
      connectionMonitor: mockConnectionMonitor as any,
      fallbackManager: mockFallbackManager as any,
      retryPolicy: mockRetryPolicy as any,
      circuitBreaker: mockCircuitBreaker as any,
      replayEngine: mockReplayEngine as any,
      transcriptReconciler: mockTranscriptReconciler as any,
      statusNotifier: mockStatusNotifier as any
    })
  })

  afterEach(() => {
    recoveryStrategies.destroy()
  })

  describe('Constructor & Initialization', () => {
    it('should initialize with configuration', () => {
      expect(recoveryStrategies).toBeInstanceOf(EventEmitter)
      expect(recoveryStrategies['config']).toBeDefined()
      expect(recoveryStrategies['config'].maxConcurrentRecoveries).toBe(5)
    })

    it('should initialize recovery statistics', () => {
      const stats = recoveryStrategies.getRecoveryStatistics()
      expect(stats.totalRecoveries).toBe(0)
      expect(stats.successfulRecoveries).toBe(0)
      expect(stats.failedRecoveries).toBe(0)
    })
  })

  describe('Network Recovery', () => {
    it('should execute network recovery successfully', async () => {
      const networkError: ClassifiedError = {
        originalError: new Error('Network error'),
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        confidence: 0.9,
        metadata: {errorCode: 'NETWORK_TIMEOUT'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'test_operation',
        userAgent: 'test',
        sessionId: 'session123'
      }

      mockConnectionMonitor.reconnect.mockResolvedValue(true)

      const result = await recoveryStrategies.executeRecovery(networkError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('network_recovery')
      expect(mockConnectionMonitor.reconnect).toHaveBeenCalled()
      expect(mockStatusNotifier.notify).toHaveBeenCalledWith('Network recovery attempt started')
    })

    it('should handle network recovery failure', async () => {
      const networkError: ClassifiedError = {
        originalError: new Error('Network error'),
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.CRITICAL,
        confidence: 0.9,
        metadata: {errorCode: 'NETWORK_TIMEOUT'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'test_operation',
        userAgent: 'test',
        sessionId: 'session123'
      }

      mockConnectionMonitor.reconnect.mockResolvedValue(false)

      const result = await recoveryStrategies.executeRecovery(networkError, context)

      expect(result.success).toBe(false)
      expect(result.reason).toContain('Network recovery failed')
      expect(mockConnectionMonitor.reconnect).toHaveBeenCalled()
    })
  })

  describe('WebSocket Recovery', () => {
    it('should execute WebSocket recovery with fallback protocol', async () => {
      const wsError: ClassifiedError = {
        originalError: new Error('WebSocket error'),
        category: ErrorCategory.WEBSOCKET,
        severity: ErrorSeverity.HIGH,
        confidence: 0.95,
        metadata: {errorCode: 'WS_CONNECTION_LOST'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'websocket_connect',
        userAgent: 'test',
        sessionId: 'session123'
      }

      mockFallbackManager.executeFallback.mockResolvedValue(true)

      const result = await recoveryStrategies.executeRecovery(wsError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('websocket_recovery')
      expect(mockFallbackManager.executeFallback).toHaveBeenCalledWith('websocket_fallback')
      expect(mockStatusNotifier.notify).toHaveBeenCalledWith('WebSocket recovery attempt started')
    })

    it('should handle WebSocket recovery with protocol downgrade', async () => {
      const wsError: ClassifiedError = {
        originalError: new Error('WebSocket protocol error'),
        category: ErrorCategory.WEBSOCKET,
        severity: ErrorSeverity.MEDIUM,
        confidence: 0.8,
        metadata: {errorCode: 'WS_PROTOCOL_ERROR'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'websocket_upgrade',
        userAgent: 'test',
        sessionId: 'session123'
      }

      const result = await recoveryStrategies.executeRecovery(wsError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('websocket_recovery')
      expect(result.actions).toContain('protocol_downgrade')
    })
  })

  describe('Authentication Recovery', () => {
    it('should execute authentication recovery with token refresh', async () => {
      const authError: ClassifiedError = {
        originalError: new Error('Authentication failed'),
        category: ErrorCategory.AUTH,
        severity: ErrorSeverity.HIGH,
        confidence: 0.9,
        metadata: {errorCode: 'TOKEN_EXPIRED'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'api_call',
        userAgent: 'test',
        sessionId: 'session123'
      }

      const result = await recoveryStrategies.executeRecovery(authError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('auth_recovery')
      expect(result.actions).toContain('token_refresh')
      expect(mockStatusNotifier.notify).toHaveBeenCalledWith(
        'Authentication recovery attempt started'
      )
    })

    it('should handle authentication recovery with re-authentication', async () => {
      const authError: ClassifiedError = {
        originalError: new Error('Authentication failed'),
        category: ErrorCategory.AUTH,
        severity: ErrorSeverity.CRITICAL,
        confidence: 0.95,
        metadata: {errorCode: 'INVALID_CREDENTIALS'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'login',
        userAgent: 'test',
        sessionId: 'session123'
      }

      const result = await recoveryStrategies.executeRecovery(authError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('auth_recovery')
      expect(result.actions).toContain('full_reauth')
    })
  })

  describe('API Recovery', () => {
    it('should execute API recovery with rate limit handling', async () => {
      const apiError: ClassifiedError = {
        originalError: new Error('Rate limit exceeded'),
        category: ErrorCategory.API,
        severity: ErrorSeverity.MEDIUM,
        confidence: 0.9,
        metadata: {errorCode: 'RATE_LIMIT_EXCEEDED', retryAfter: 60}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'api_request',
        userAgent: 'test',
        sessionId: 'session123'
      }

      const result = await recoveryStrategies.executeRecovery(apiError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('api_recovery')
      expect(result.actions).toContain('rate_limit_wait')
      expect(mockStatusNotifier.notify).toHaveBeenCalledWith('API recovery attempt started')
    })

    it('should execute API recovery with quota management', async () => {
      const apiError: ClassifiedError = {
        originalError: new Error('Quota exceeded'),
        category: ErrorCategory.API,
        severity: ErrorSeverity.HIGH,
        confidence: 0.85,
        metadata: {errorCode: 'QUOTA_EXCEEDED'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'api_request',
        userAgent: 'test',
        sessionId: 'session123'
      }

      const result = await recoveryStrategies.executeRecovery(apiError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('api_recovery')
      expect(result.actions).toContain('quota_management')
    })
  })

  describe('Transcription Recovery', () => {
    it('should execute transcription recovery with service restart', async () => {
      const transcriptionError: ClassifiedError = {
        originalError: new Error('Transcription service error'),
        category: ErrorCategory.TRANSCRIPTION,
        severity: ErrorSeverity.HIGH,
        confidence: 0.9,
        metadata: {errorCode: 'SERVICE_UNAVAILABLE'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'transcription_start',
        userAgent: 'test',
        sessionId: 'session123'
      }

      mockReplayEngine.replay.mockResolvedValue(true)

      const result = await recoveryStrategies.executeRecovery(transcriptionError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('transcription_recovery')
      expect(result.actions).toContain('service_restart')
      expect(mockStatusNotifier.notify).toHaveBeenCalledWith(
        'Transcription recovery attempt started'
      )
    })

    it('should execute transcription recovery with audio buffer recovery', async () => {
      const transcriptionError: ClassifiedError = {
        originalError: new Error('Audio buffer lost'),
        category: ErrorCategory.TRANSCRIPTION,
        severity: ErrorSeverity.MEDIUM,
        confidence: 0.8,
        metadata: {errorCode: 'AUDIO_BUFFER_LOST'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'audio_process',
        userAgent: 'test',
        sessionId: 'session123'
      }

      const result = await recoveryStrategies.executeRecovery(transcriptionError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('transcription_recovery')
      expect(result.actions).toContain('buffer_recovery')
    })
  })

  describe('Resource Recovery', () => {
    it('should execute resource recovery with cleanup', async () => {
      const resourceError: ClassifiedError = {
        originalError: new Error('Memory exhausted'),
        category: ErrorCategory.RESOURCE,
        severity: ErrorSeverity.CRITICAL,
        confidence: 0.9,
        metadata: {errorCode: 'MEMORY_EXHAUSTED', memoryUsage: 95}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'audio_processing',
        userAgent: 'test',
        sessionId: 'session123'
      }

      const result = await recoveryStrategies.executeRecovery(resourceError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('resource_recovery')
      expect(result.actions).toContain('memory_cleanup')
      expect(mockStatusNotifier.notify).toHaveBeenCalledWith('Resource recovery attempt started')
    })

    it('should execute resource recovery with process optimization', async () => {
      const resourceError: ClassifiedError = {
        originalError: new Error('CPU overload'),
        category: ErrorCategory.RESOURCE,
        severity: ErrorSeverity.HIGH,
        confidence: 0.85,
        metadata: {errorCode: 'CPU_OVERLOAD', cpuUsage: 98}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'real_time_processing',
        userAgent: 'test',
        sessionId: 'session123'
      }

      const result = await recoveryStrategies.executeRecovery(resourceError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('resource_recovery')
      expect(result.actions).toContain('process_optimization')
    })
  })

  describe('Data Integrity Recovery', () => {
    it('should execute data integrity recovery with reconciliation', async () => {
      const dataError: ClassifiedError = {
        originalError: new Error('Data corruption detected'),
        category: ErrorCategory.DATA_INTEGRITY,
        severity: ErrorSeverity.HIGH,
        confidence: 0.9,
        metadata: {errorCode: 'DATA_CORRUPTION', affectedRecords: 5}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'data_validation',
        userAgent: 'test',
        sessionId: 'session123'
      }

      mockTranscriptReconciler.reconcile.mockResolvedValue(true)

      const result = await recoveryStrategies.executeRecovery(dataError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('data_integrity_recovery')
      expect(result.actions).toContain('data_reconciliation')
      expect(mockTranscriptReconciler.reconcile).toHaveBeenCalled()
      expect(mockStatusNotifier.notify).toHaveBeenCalledWith(
        'Data integrity recovery attempt started'
      )
    })

    it('should execute data integrity recovery with backup restore', async () => {
      const dataError: ClassifiedError = {
        originalError: new Error('Critical data loss'),
        category: ErrorCategory.DATA_INTEGRITY,
        severity: ErrorSeverity.CRITICAL,
        confidence: 0.95,
        metadata: {errorCode: 'DATA_LOSS', lostRecords: 50}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'data_persist',
        userAgent: 'test',
        sessionId: 'session123'
      }

      const result = await recoveryStrategies.executeRecovery(dataError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('data_integrity_recovery')
      expect(result.actions).toContain('backup_restore')
    })
  })

  describe('System Recovery', () => {
    it('should execute system recovery with full restart', async () => {
      const systemError: ClassifiedError = {
        originalError: new Error('System failure'),
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        confidence: 0.9,
        metadata: {errorCode: 'SYSTEM_FAILURE'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'system_check',
        userAgent: 'test',
        sessionId: 'session123'
      }

      const result = await recoveryStrategies.executeRecovery(systemError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('system_recovery')
      expect(result.actions).toContain('full_restart')
      expect(mockStatusNotifier.notify).toHaveBeenCalledWith('System recovery attempt started')
    })

    it('should execute system recovery with component restart', async () => {
      const systemError: ClassifiedError = {
        originalError: new Error('Component failure'),
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        confidence: 0.8,
        metadata: {errorCode: 'COMPONENT_FAILURE', component: 'audio_processor'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'component_check',
        userAgent: 'test',
        sessionId: 'session123'
      }

      const result = await recoveryStrategies.executeRecovery(systemError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('system_recovery')
      expect(result.actions).toContain('component_restart')
    })
  })

  describe('Unknown Category Recovery', () => {
    it('should execute generic recovery for unknown categories', async () => {
      const unknownError: ClassifiedError = {
        originalError: new Error('Unknown error'),
        category: 'UNKNOWN' as ErrorCategory,
        severity: ErrorSeverity.MEDIUM,
        confidence: 0.3,
        metadata: {}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'unknown_operation',
        userAgent: 'test',
        sessionId: 'session123'
      }

      const result = await recoveryStrategies.executeRecovery(unknownError, context)

      expect(result.success).toBe(true)
      expect(result.strategy).toBe('generic_recovery')
      expect(result.actions).toContain('basic_retry')
      expect(mockStatusNotifier.notify).toHaveBeenCalledWith('Generic recovery attempt started')
    })
  })

  describe('Recovery Statistics', () => {
    it('should track recovery statistics correctly', async () => {
      const networkError: ClassifiedError = {
        originalError: new Error('Network error'),
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        confidence: 0.9,
        metadata: {errorCode: 'NETWORK_TIMEOUT'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'test_operation',
        userAgent: 'test',
        sessionId: 'session123'
      }

      mockConnectionMonitor.reconnect.mockResolvedValue(true)

      await recoveryStrategies.executeRecovery(networkError, context)

      const stats = recoveryStrategies.getRecoveryStatistics()
      expect(stats.totalRecoveries).toBe(1)
      expect(stats.successfulRecoveries).toBe(1)
      expect(stats.failedRecoveries).toBe(0)

      const categoryStats = stats.categoryStats.get(ErrorCategory.NETWORK)
      expect(categoryStats?.recoveryCount).toBe(1)
      expect(categoryStats?.successCount).toBe(1)
    })

    it('should reset recovery statistics', () => {
      recoveryStrategies.resetStatistics()

      const stats = recoveryStrategies.getRecoveryStatistics()
      expect(stats.totalRecoveries).toBe(0)
      expect(stats.successfulRecoveries).toBe(0)
      expect(stats.failedRecoveries).toBe(0)
      expect(stats.categoryStats.size).toBe(0)
    })
  })

  describe('Events', () => {
    it('should emit recovery started event', async () => {
      const eventSpy = vi.fn()
      recoveryStrategies.on('recoveryStarted', eventSpy)

      const networkError: ClassifiedError = {
        originalError: new Error('Network error'),
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        confidence: 0.9,
        metadata: {errorCode: 'NETWORK_TIMEOUT'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'test_operation',
        userAgent: 'test',
        sessionId: 'session123'
      }

      await recoveryStrategies.executeRecovery(networkError, context)

      expect(eventSpy).toHaveBeenCalledWith({
        category: ErrorCategory.NETWORK,
        strategy: 'network_recovery',
        context
      })
    })

    it('should emit recovery completed event', async () => {
      const eventSpy = vi.fn()
      recoveryStrategies.on('recoveryCompleted', eventSpy)

      const networkError: ClassifiedError = {
        originalError: new Error('Network error'),
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        confidence: 0.9,
        metadata: {errorCode: 'NETWORK_TIMEOUT'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'test_operation',
        userAgent: 'test',
        sessionId: 'session123'
      }

      mockConnectionMonitor.reconnect.mockResolvedValue(true)

      await recoveryStrategies.executeRecovery(networkError, context)

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          strategy: 'network_recovery',
          category: ErrorCategory.NETWORK
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle exceptions during recovery gracefully', async () => {
      const networkError: ClassifiedError = {
        originalError: new Error('Network error'),
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        confidence: 0.9,
        metadata: {errorCode: 'NETWORK_TIMEOUT'}
      }

      const context: ErrorContext = {
        timestamp: Date.now(),
        operation: 'test_operation',
        userAgent: 'test',
        sessionId: 'session123'
      }

      mockConnectionMonitor.reconnect.mockRejectedValue(new Error('Recovery failed'))

      const result = await recoveryStrategies.executeRecovery(networkError, context)

      expect(result.success).toBe(false)
      expect(result.reason).toContain('Recovery execution failed')
      expect(result.error).toBeDefined()
    })
  })

  describe('Cleanup', () => {
    it('should clean up resources on destroy', () => {
      const removeAllListenersSpy = vi.spyOn(recoveryStrategies, 'removeAllListeners')

      recoveryStrategies.destroy()

      expect(removeAllListenersSpy).toHaveBeenCalled()
    })
  })
})
