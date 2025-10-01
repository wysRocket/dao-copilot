import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {UserErrorMessageSystem} from '../UserErrorMessageSystem'
import {ErrorHandlingIntegration} from '../ErrorHandlingIntegration'
import type {
  UserErrorMessageConfig,
  ErrorDisplayOptions,
  SupportedLocale,
  LocalizedErrorMessage
} from '../UserErrorMessageSystem'
import type {ClassifiedError, ErrorContext} from '../../types/error-types'

// Mock console to prevent test output noise
vi.mock('console', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}))

describe('UserErrorMessageSystem', () => {
  let messageSystem: UserErrorMessageSystem
  let mockConfig: UserErrorMessageConfig

  beforeEach(() => {
    mockConfig = {
      defaultLocale: 'en',
      defaultDisplayOptions: {
        showTechnicalDetails: false,
        maxMessageLength: 500,
        includeSuggestedActions: true,
        includeHelpLinks: true,
        locale: 'en',
        userLevel: 'basic'
      },
      enableAnalytics: true,
      maxCachedMessages: 1000,
      enableAutoDismissal: true,
      autoDismissalTimeoutMs: 5000
    }

    messageSystem = new UserErrorMessageSystem(mockConfig)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const defaultSystem = new UserErrorMessageSystem()
      expect(defaultSystem).toBeInstanceOf(UserErrorMessageSystem)
    })

    it('should load default templates', () => {
      expect(messageSystem.isLocaleSupported('en')).toBe(true)
      expect(messageSystem.isLocaleSupported('es')).toBe(true)
      expect(messageSystem.isLocaleSupported('fr')).toBe(true)
    })

    it('should support all declared locales', () => {
      const supportedLocales: SupportedLocale[] = ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko']
      supportedLocales.forEach(locale => {
        expect(messageSystem.isLocaleSupported(locale)).toBe(true)
      })
    })
  })

  describe('Message Generation', () => {
    let testError: ClassifiedError
    let testContext: ErrorContext

    beforeEach(() => {
      testError = {
        type: 'CONNECTION_LOST',
        category: 'transcription',
        severity: 'high',
        message: 'Connection to transcription service lost',
        timestamp: Date.now()
      } as ClassifiedError

      testContext = {
        component: 'transcription-service',
        operation: 'websocket-connection',
        sessionId: 'test-session-123',
        metadata: {
          retryAttempt: 1,
          lastSuccessfulConnection: Date.now() - 30000
        }
      }
    })

    it('should generate user message for known error types', () => {
      const message = messageSystem.generateUserMessage(testError, testContext)

      expect(message).toBeDefined()
      expect(message.errorId).toBeDefined()
      expect(message.message).toContain('transcription service')
      expect(message.severity).toBe('high')
      expect(message.timestamp).toBeDefined()
      expect(message.suggestedActions).toHaveLength(2)
      expect(message.helpLinks).toHaveLength(1)
    })

    it('should generate fallback message for unknown error types', () => {
      const unknownError: ClassifiedError = {
        type: 'UNKNOWN_ERROR_TYPE',
        category: 'system',
        severity: 'medium',
        message: 'Unknown error occurred',
        timestamp: Date.now()
      }

      const message = messageSystem.generateUserMessage(unknownError, testContext)

      expect(message.message).toContain('error occurred')
      expect(message.suggestedActions).toContain('Try again')
    })

    it('should respect display options', () => {
      const options: Partial<ErrorDisplayOptions> = {
        showTechnicalDetails: true,
        maxMessageLength: 50,
        includeSuggestedActions: false,
        includeHelpLinks: false
      }

      const message = messageSystem.generateUserMessage(testError, testContext, options)

      expect(message.message.length).toBeLessThanOrEqual(53) // 50 + "..."
      expect(message.suggestedActions).toHaveLength(0)
      expect(message.helpLinks).toHaveLength(0)
      expect(message.technicalDetails).toBeDefined()
    })

    it('should generate localized messages', () => {
      const spanishOptions: Partial<ErrorDisplayOptions> = {locale: 'es'}
      const message = messageSystem.generateUserMessage(testError, testContext, spanishOptions)

      expect(message.message).toContain('transcripción')
    })

    it('should handle placeholder replacement', () => {
      const message = messageSystem.generateUserMessage(testError, testContext)

      // The template system should replace basic placeholders
      expect(message.message).not.toContain('{errorType}')
      expect(message.message).not.toContain('{component}')
    })
  })

  describe('Template Management', () => {
    it('should add custom templates', () => {
      const customTemplate = {
        id: 'custom.test_error',
        template: 'Custom error message for testing',
        severity: 'low' as const,
        category: 'system',
        actionRequired: false,
        suggestedActions: ['Test action'],
        helpLinks: [{text: 'Test Help', url: '/test-help'}]
      }

      messageSystem.addMessageTemplate('custom.test_error', 'en', customTemplate)

      const availableLocales = messageSystem.getAvailableLocales('custom.test_error')
      expect(availableLocales).toContain('en')
    })

    it('should get available locales for templates', () => {
      const locales = messageSystem.getAvailableLocales('transcription.connection_lost')
      expect(locales).toContain('en')
      expect(locales).toContain('es')
      expect(locales).toContain('fr')
    })
  })

  describe('Message Management', () => {
    let testMessage: LocalizedErrorMessage

    beforeEach(() => {
      const testError: ClassifiedError = {
        type: 'CONNECTION_LOST',
        category: 'transcription',
        severity: 'high',
        message: 'Test error',
        timestamp: Date.now()
      } as ClassifiedError

      testMessage = messageSystem.generateUserMessage(testError)
    })

    it('should track active messages', () => {
      const activeMessages = messageSystem.getActiveMessages()
      expect(activeMessages).toHaveLength(1)
      expect(activeMessages[0].errorId).toBe(testMessage.errorId)
    })

    it('should filter messages by severity', () => {
      const highSeverityMessages = messageSystem.getMessagesBySeverity('high')
      expect(highSeverityMessages).toHaveLength(1)
      expect(highSeverityMessages[0].severity).toBe('high')

      const lowSeverityMessages = messageSystem.getMessagesBySeverity('low')
      expect(lowSeverityMessages).toHaveLength(0)
    })

    it('should get action required messages', () => {
      const actionMessages = messageSystem.getActionRequiredMessages()
      expect(Array.isArray(actionMessages)).toBe(true)
    })

    it('should dismiss messages', () => {
      const dismissed = messageSystem.dismissMessage(testMessage.errorId)
      expect(dismissed).toBe(true)

      const activeMessages = messageSystem.getActiveMessages()
      expect(activeMessages).toHaveLength(0)
    })

    it('should clear all messages', () => {
      // Add another message
      const anotherError: ClassifiedError = {
        type: 'PROCESSING_FAILED',
        category: 'transcription',
        severity: 'medium',
        message: 'Another test error',
        timestamp: Date.now()
      } as ClassifiedError

      messageSystem.generateUserMessage(anotherError)

      expect(messageSystem.getActiveMessages()).toHaveLength(2)

      messageSystem.clearAllMessages()
      expect(messageSystem.getActiveMessages()).toHaveLength(0)
    })
  })

  describe('Analytics', () => {
    let testMessage: LocalizedErrorMessage

    beforeEach(() => {
      const testError: ClassifiedError = {
        type: 'CONNECTION_LOST',
        category: 'transcription',
        severity: 'high',
        message: 'Test error',
        timestamp: Date.now()
      } as ClassifiedError

      testMessage = messageSystem.generateUserMessage(testError)
    })

    it('should track user actions', () => {
      messageSystem.trackUserAction(testMessage.errorId, 'retry')

      const analytics = messageSystem.getMessageAnalytics(testMessage.errorId)
      expect(analytics?.actionsTaken).toBe(1)
    })

    it('should track help link clicks', () => {
      messageSystem.trackHelpLinkClick(testMessage.errorId, '/help/connection')

      const analytics = messageSystem.getMessageAnalytics(testMessage.errorId)
      expect(analytics?.helpLinksClicked).toBe(1)
    })

    it('should add user ratings', () => {
      messageSystem.addUserRating(testMessage.errorId, 4)

      const analytics = messageSystem.getMessageAnalytics(testMessage.errorId)
      expect(analytics?.userRatings).toContain(4)
    })

    it('should validate rating range', () => {
      expect(() => messageSystem.addUserRating(testMessage.errorId, 0)).toThrow()
      expect(() => messageSystem.addUserRating(testMessage.errorId, 6)).toThrow()
    })

    it('should generate analytics summary', () => {
      messageSystem.trackUserAction(testMessage.errorId, 'retry')
      messageSystem.addUserRating(testMessage.errorId, 5)
      messageSystem.dismissMessage(testMessage.errorId)

      const summary = messageSystem.getAnalyticsSummary()

      expect(summary.totalMessages).toBe(1)
      expect(summary.totalDismissals).toBe(1)
      expect(summary.totalActions).toBe(1)
      expect(summary.avgRating).toBe(5)
    })
  })

  describe('Configuration', () => {
    it('should update display options', () => {
      const newOptions: Partial<ErrorDisplayOptions> = {
        showTechnicalDetails: true,
        userLevel: 'advanced'
      }

      messageSystem.updateDisplayOptions(newOptions)

      // Generate a new message to test updated options
      const testError: ClassifiedError = {
        type: 'CONNECTION_LOST',
        category: 'transcription',
        severity: 'high',
        message: 'Test error',
        timestamp: Date.now()
      } as ClassifiedError

      const message = messageSystem.generateUserMessage(testError)
      expect(message.technicalDetails).toBeDefined()
    })
  })

  describe('Memory Management', () => {
    it('should clean up old cached messages', () => {
      const smallConfig: UserErrorMessageConfig = {
        ...mockConfig,
        maxCachedMessages: 2
      }

      const smallSystem = new UserErrorMessageSystem(smallConfig)

      // Generate more messages than the cache limit
      for (let i = 0; i < 5; i++) {
        const error: ClassifiedError = {
          type: 'TEST_ERROR',
          category: 'system',
          severity: 'low',
          message: `Test error ${i}`,
          timestamp: Date.now() + i
        }
        smallSystem.generateUserMessage(error)
      }

      // Trigger cleanup
      smallSystem.cleanupCache()

      // Should have fewer cached messages
      expect(smallSystem.getActiveMessages().length).toBeLessThanOrEqual(2)
    })
  })

  describe('Auto-Dismissal', () => {
    it('should auto-dismiss non-action-required messages', async () => {
      const shortDismissalConfig: UserErrorMessageConfig = {
        ...mockConfig,
        autoDismissalTimeoutMs: 100 // Very short timeout for testing
      }

      const autoSystem = new UserErrorMessageSystem(shortDismissalConfig)

      const testError: ClassifiedError = {
        type: 'CONNECTION_LOST',
        category: 'transcription',
        severity: 'low', // Low severity, non-action-required
        message: 'Test error',
        timestamp: Date.now()
      } as ClassifiedError

      autoSystem.generateUserMessage(testError)
      expect(autoSystem.getActiveMessages()).toHaveLength(1)

      // Wait for auto-dismissal
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(autoSystem.getActiveMessages()).toHaveLength(0)
    })
  })

  describe('Event Emission', () => {
    it('should emit events for message lifecycle', done => {
      let eventCount = 0

      messageSystem.on('messageGenerated', () => {
        eventCount++
        if (eventCount === 1) {
          messageSystem.on('messageDismissed', () => {
            eventCount++
            if (eventCount === 2) done()
          })

          // Generate and then dismiss a message
          const testError: ClassifiedError = {
            type: 'CONNECTION_LOST',
            category: 'transcription',
            severity: 'high',
            message: 'Test error',
            timestamp: Date.now()
          } as ClassifiedError

          const message = messageSystem.generateUserMessage(testError)
          messageSystem.dismissMessage(message.errorId)
        }
      })

      // Generate initial message
      const testError: ClassifiedError = {
        type: 'CONNECTION_LOST',
        category: 'transcription',
        severity: 'high',
        message: 'Test error',
        timestamp: Date.now()
      } as ClassifiedError

      messageSystem.generateUserMessage(testError)
    })
  })

  describe('Internationalization', () => {
    const testError: ClassifiedError = {
      type: 'MICROPHONE_UNAVAILABLE',
      category: 'audio',
      severity: 'critical',
      message: 'Microphone access denied',
      timestamp: Date.now()
    } as ClassifiedError

    const localeTests = [
      {locale: 'es' as SupportedLocale, expectedText: 'micrófono'},
      {locale: 'fr' as SupportedLocale, expectedText: 'microphone'},
      {locale: 'de' as SupportedLocale, expectedText: 'Mikrofon'},
      {locale: 'zh' as SupportedLocale, expectedText: '麦克风'},
      {locale: 'ja' as SupportedLocale, expectedText: 'マイク'},
      {locale: 'ko' as SupportedLocale, expectedText: '마이크'}
    ]

    localeTests.forEach(({locale, expectedText}) => {
      it(`should generate ${locale} localized messages`, () => {
        const message = messageSystem.generateUserMessage(testError, undefined, {locale})
        expect(message.message.toLowerCase()).toContain(expectedText.toLowerCase())
      })
    })
  })
})

describe('ErrorHandlingIntegration', () => {
  let mockErrorHandler: {on: vi.Mock; emit: vi.Mock}
  let mockTelemetrySystem: {on: vi.Mock; trackMessage: vi.Mock}
  let userMessageSystem: UserErrorMessageSystem
  let integration: ErrorHandlingIntegration

  beforeEach(() => {
    mockErrorHandler = {
      on: vi.fn(),
      emit: vi.fn()
    }

    mockTelemetrySystem = {
      on: vi.fn(),
      emit: vi.fn(),
      isRunning: vi.fn().mockReturnValue(true),
      exportData: vi.fn().mockReturnValue('{"test": "data"}')
    }

    userMessageSystem = new UserErrorMessageSystem()

    integration = new ErrorHandlingIntegration(
      mockErrorHandler,
      mockTelemetrySystem,
      userMessageSystem,
      {
        enableAutoMessages: true,
        enableAnalytics: true,
        maxActiveMessages: 5
      }
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with provided systems', () => {
      expect(integration).toBeInstanceOf(ErrorHandlingIntegration)
      expect(mockErrorHandler.on).toHaveBeenCalledWith('errorClassified', expect.any(Function))
      expect(mockTelemetrySystem.on).toHaveBeenCalledWith('patternDetected', expect.any(Function))
    })
  })

  describe('Statistics', () => {
    it('should provide integration statistics', () => {
      const stats = integration.getStatistics()

      expect(stats).toHaveProperty('totalErrorsProcessed')
      expect(stats).toHaveProperty('totalMessagesGenerated')
      expect(stats).toHaveProperty('messagesBySeverity')
      expect(stats).toHaveProperty('userInteractionStats')
    })

    it('should provide health status', () => {
      const health = integration.getHealthStatus()

      expect(health).toHaveProperty('status')
      expect(health).toHaveProperty('components')
      expect(health).toHaveProperty('metrics')
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status)
    })
  })

  describe('Message Management', () => {
    it('should get active messages', () => {
      const messages = integration.getActiveMessages()
      expect(Array.isArray(messages)).toBe(true)
    })

    it('should dismiss all messages', () => {
      integration.dismissAllMessages()
      expect(integration.getActiveMessages()).toHaveLength(0)
    })
  })

  describe('Analytics Export', () => {
    it('should export comprehensive analytics', () => {
      const analytics = integration.exportAnalytics()

      expect(analytics).toHaveProperty('integration')
      expect(analytics).toHaveProperty('userMessages')
      expect(analytics).toHaveProperty('telemetry')
      expect(analytics).toHaveProperty('deduplication')
    })
  })

  describe('Deduplication', () => {
    it('should provide deduplication statistics', () => {
      const stats = integration.getDeduplicationStats()

      expect(stats).toHaveProperty('totalEntries')
      expect(stats).toHaveProperty('duplicatesSuppressed')
      expect(stats).toHaveProperty('avgDuplicateCount')
    })
  })

  describe('Manual Message Generation', () => {
    it('should generate messages manually', async () => {
      const testError: ClassifiedError = {
        type: 'TEST_ERROR',
        category: 'system',
        severity: 'medium',
        message: 'Manual test error',
        timestamp: Date.now()
      }

      const message = await integration.generateMessageForError(testError)

      expect(message).toBeDefined()
      expect(message.errorId).toBeDefined()
    })
  })

  describe('Configuration', () => {
    it('should update display options', () => {
      const newOptions: Partial<ErrorDisplayOptions> = {
        showTechnicalDetails: true,
        userLevel: 'advanced'
      }

      integration.updateDisplayOptions(newOptions)

      // Should not throw any errors
      expect(true).toBe(true)
    })

    it('should manage message filters', () => {
      const filter = (error: ClassifiedError) => error.severity === 'high'

      integration.addMessageFilter(filter)
      integration.clearMessageFilters()

      // Should not throw any errors
      expect(true).toBe(true)
    })
  })
})
