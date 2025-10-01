import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {ErrorTelemetrySystem} from '../ErrorTelemetrySystem'
import type {ErrorMetric, AlertRule, TelemetryConfig} from '../ErrorTelemetrySystem'

// Mock console.log to prevent test output noise
vi.mock('console', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}))

describe('ErrorTelemetrySystem', () => {
  let telemetrySystem: ErrorTelemetrySystem
  let mockConfig: TelemetryConfig

  beforeEach(() => {
    mockConfig = {
      retentionPeriodMs: 24 * 60 * 60 * 1000, // 24 hours
      aggregationIntervalMs: 60 * 1000, // 1 minute
      alertEvaluationIntervalMs: 30 * 1000, // 30 seconds
      maxMetricsInMemory: 10000,
      enableRealTimeUpdates: true,
      exportBatchSize: 1000,
      patternDetectionConfig: {
        spikeDetection: {
          enabled: true,
          windowSizeMs: 5 * 60 * 1000, // 5 minutes
          thresholdMultiplier: 3.0,
          minOccurrences: 5
        },
        anomalyDetection: {
          enabled: true,
          windowSizeMs: 30 * 60 * 1000, // 30 minutes
          sensitivityThreshold: 2.0,
          minHistoricalSamples: 10
        }
      }
    }

    telemetrySystem = new ErrorTelemetrySystem(mockConfig)
  })

  afterEach(() => {
    telemetrySystem.stop()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with default config when none provided', () => {
      const defaultSystem = new ErrorTelemetrySystem()
      expect(defaultSystem).toBeInstanceOf(ErrorTelemetrySystem)
    })

    it('should start and stop correctly', async () => {
      await telemetrySystem.start()
      expect(telemetrySystem.isRunning()).toBe(true)

      telemetrySystem.stop()
      expect(telemetrySystem.isRunning()).toBe(false)
    })
  })

  describe('Metric Collection', () => {
    beforeEach(async () => {
      await telemetrySystem.start()
    })

    it('should collect error metrics', () => {
      const testMetric: ErrorMetric = {
        timestamp: Date.now(),
        errorType: 'TRANSCRIPTION_ERROR',
        category: 'transcription',
        severity: 'high',
        message: 'Test transcription error',
        component: 'transcription-service',
        userId: 'test-user',
        sessionId: 'test-session',
        metadata: {testData: 'value'}
      }

      telemetrySystem.recordError(testMetric)
      const stats = telemetrySystem.getStatistics()

      expect(stats.totalErrors).toBe(1)
      expect(stats.errorsByCategory.transcription).toBe(1)
      expect(stats.errorsBySeverity.high).toBe(1)
    })

    it('should maintain metrics within memory limits', () => {
      const smallConfig = {...mockConfig, maxMetricsInMemory: 5}
      const limitedSystem = new ErrorTelemetrySystem(smallConfig)

      // Add more metrics than the limit
      for (let i = 0; i < 10; i++) {
        limitedSystem.recordError({
          timestamp: Date.now() + i,
          errorType: `ERROR_${i}`,
          category: 'test',
          severity: 'medium',
          message: `Test error ${i}`,
          component: 'test-component'
        })
      }

      const metrics = limitedSystem.getMetrics()
      expect(metrics.length).toBeLessThanOrEqual(5)

      limitedSystem.stop()
    })

    it('should filter metrics by time range', () => {
      const now = Date.now()
      const oldMetric: ErrorMetric = {
        timestamp: now - 2 * 60 * 60 * 1000, // 2 hours ago
        errorType: 'OLD_ERROR',
        category: 'test',
        severity: 'low',
        message: 'Old error',
        component: 'test-component'
      }

      const recentMetric: ErrorMetric = {
        timestamp: now - 5 * 60 * 1000, // 5 minutes ago
        errorType: 'RECENT_ERROR',
        category: 'test',
        severity: 'high',
        message: 'Recent error',
        component: 'test-component'
      }

      telemetrySystem.recordError(oldMetric)
      telemetrySystem.recordError(recentMetric)

      const recentMetrics = telemetrySystem.getMetrics({
        startTime: now - 30 * 60 * 1000, // 30 minutes ago
        endTime: now
      })

      expect(recentMetrics).toHaveLength(1)
      expect(recentMetrics[0].errorType).toBe('RECENT_ERROR')
    })
  })

  describe('Statistics Generation', () => {
    beforeEach(async () => {
      await telemetrySystem.start()

      // Add test data
      const testMetrics: ErrorMetric[] = [
        {
          timestamp: Date.now(),
          errorType: 'TYPE_A',
          category: 'audio',
          severity: 'high',
          message: 'Audio error 1',
          component: 'audio-processor'
        },
        {
          timestamp: Date.now() + 1000,
          errorType: 'TYPE_B',
          category: 'audio',
          severity: 'medium',
          message: 'Audio error 2',
          component: 'audio-processor'
        },
        {
          timestamp: Date.now() + 2000,
          errorType: 'TYPE_A',
          category: 'transcription',
          severity: 'high',
          message: 'Transcription error',
          component: 'transcription-service'
        }
      ]

      testMetrics.forEach(metric => telemetrySystem.recordError(metric))
    })

    it('should generate accurate statistics', () => {
      const stats = telemetrySystem.getStatistics()

      expect(stats.totalErrors).toBe(3)
      expect(stats.errorsByCategory.audio).toBe(2)
      expect(stats.errorsByCategory.transcription).toBe(1)
      expect(stats.errorsBySeverity.high).toBe(2)
      expect(stats.errorsBySeverity.medium).toBe(1)
      expect(stats.topErrorTypes).toContainEqual(
        expect.objectContaining({type: 'TYPE_A', count: 2})
      )
    })

    it('should calculate error rate correctly', () => {
      const stats = telemetrySystem.getStatistics()
      expect(stats.errorRate).toBeGreaterThan(0)
    })

    it('should identify most affected components', () => {
      const stats = telemetrySystem.getStatistics()
      expect(stats.topComponents).toContainEqual(
        expect.objectContaining({component: 'audio-processor', count: 2})
      )
    })
  })

  describe('Pattern Detection', () => {
    beforeEach(async () => {
      await telemetrySystem.start()
    })

    it('should detect error spikes', async () => {
      // Simulate a spike by adding many errors in a short time
      const now = Date.now()
      for (let i = 0; i < 10; i++) {
        telemetrySystem.recordError({
          timestamp: now + i * 1000,
          errorType: 'SPIKE_ERROR',
          category: 'test',
          severity: 'high',
          message: `Spike error ${i}`,
          component: 'test-component'
        })
      }

      // Wait for pattern detection
      await new Promise(resolve => setTimeout(resolve, 100))

      const patterns = telemetrySystem.getDetectedPatterns()
      const spikePattern = patterns.find(p => p.type === 'spike')

      expect(spikePattern).toBeDefined()
      expect(spikePattern?.confidence).toBeGreaterThan(0.7)
    })

    it('should detect recurring patterns', async () => {
      const now = Date.now()

      // Create a recurring pattern every 5 minutes
      for (let i = 0; i < 5; i++) {
        telemetrySystem.recordError({
          timestamp: now + i * 5 * 60 * 1000,
          errorType: 'RECURRING_ERROR',
          category: 'test',
          severity: 'medium',
          message: 'Recurring error',
          component: 'test-component'
        })
      }

      await new Promise(resolve => setTimeout(resolve, 100))

      const patterns = telemetrySystem.getDetectedPatterns()
      const recurringPattern = patterns.find(p => p.type === 'recurring')

      expect(recurringPattern).toBeDefined()
    })

    it('should detect cascading failures', async () => {
      const now = Date.now()

      // Simulate cascading failure across components
      const components = ['component-1', 'component-2', 'component-3']
      components.forEach((component, index) => {
        telemetrySystem.recordError({
          timestamp: now + index * 10000, // 10 seconds apart
          errorType: 'CASCADE_ERROR',
          category: 'system',
          severity: 'critical',
          message: `Cascading error in ${component}`,
          component
        })
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      const patterns = telemetrySystem.getDetectedPatterns()
      const cascadingPattern = patterns.find(p => p.type === 'cascading')

      expect(cascadingPattern).toBeDefined()
      expect(cascadingPattern?.affectedComponents).toEqual(components)
    })
  })

  describe('Alert System', () => {
    beforeEach(async () => {
      await telemetrySystem.start()
    })

    it('should add and manage alert rules', () => {
      const alertRule: AlertRule = {
        id: 'test-rule',
        name: 'Test Alert Rule',
        description: 'Test alert for high error rate',
        condition: 'rate',
        threshold: 5,
        timeWindowMs: 5 * 60 * 1000,
        severity: 'high',
        category: 'test',
        actions: [
          {
            type: 'log',
            config: {message: 'High error rate detected'}
          }
        ],
        enabled: true,
        cooldownMs: 60 * 1000
      }

      telemetrySystem.addAlertRule(alertRule)
      const rules = telemetrySystem.getAlertRules()

      expect(rules).toHaveLength(1)
      expect(rules[0].id).toBe('test-rule')
    })

    it('should trigger alerts when conditions are met', async () => {
      const alertRule: AlertRule = {
        id: 'rate-rule',
        name: 'Rate Alert',
        description: 'Alert on error rate',
        condition: 'rate',
        threshold: 2, // 2 errors per minute
        timeWindowMs: 60 * 1000, // 1 minute
        severity: 'medium',
        actions: [
          {
            type: 'log',
            config: {message: 'Error rate threshold exceeded'}
          }
        ],
        enabled: true,
        cooldownMs: 30 * 1000
      }

      telemetrySystem.addAlertRule(alertRule)

      // Add enough errors to trigger the alert
      const now = Date.now()
      for (let i = 0; i < 5; i++) {
        telemetrySystem.recordError({
          timestamp: now + i * 1000,
          errorType: 'RATE_ERROR',
          category: 'test',
          severity: 'medium',
          message: `Rate error ${i}`,
          component: 'test-component'
        })
      }

      // Wait for alert evaluation
      await new Promise(resolve => setTimeout(resolve, 200))

      const activeAlerts = telemetrySystem.getActiveAlerts()
      expect(activeAlerts.length).toBeGreaterThan(0)
    })

    it('should remove resolved alerts', async () => {
      const alertRule: AlertRule = {
        id: 'temp-rule',
        name: 'Temporary Alert',
        description: 'Temporary alert',
        condition: 'rate',
        threshold: 10,
        timeWindowMs: 60 * 1000,
        severity: 'low',
        actions: [
          {
            type: 'log',
            config: {message: 'Temporary alert'}
          }
        ],
        enabled: true,
        cooldownMs: 1000 // Short cooldown for testing
      }

      telemetrySystem.addAlertRule(alertRule)

      // Trigger alert
      for (let i = 0; i < 15; i++) {
        telemetrySystem.recordError({
          timestamp: Date.now() + i * 100,
          errorType: 'TEMP_ERROR',
          category: 'test',
          severity: 'low',
          message: `Temp error ${i}`,
          component: 'test-component'
        })
      }

      await new Promise(resolve => setTimeout(resolve, 100))
      let activeAlerts = telemetrySystem.getActiveAlerts()
      expect(activeAlerts.length).toBeGreaterThan(0)

      // Wait for alert to resolve (no new errors)
      await new Promise(resolve => setTimeout(resolve, 1200))
      activeAlerts = telemetrySystem.getActiveAlerts()
      expect(activeAlerts.length).toBe(0)
    })
  })

  describe('Dashboard System', () => {
    beforeEach(async () => {
      await telemetrySystem.start()
    })

    it('should provide dashboard data', () => {
      // Add some test data
      telemetrySystem.recordError({
        timestamp: Date.now(),
        errorType: 'DASHBOARD_ERROR',
        category: 'ui',
        severity: 'medium',
        message: 'Dashboard test error',
        component: 'dashboard'
      })

      const dashboardData = telemetrySystem.getDashboardData()

      expect(dashboardData.systemHealth).toBeDefined()
      expect(dashboardData.errorRates).toBeDefined()
      expect(dashboardData.topIssues).toBeDefined()
      expect(dashboardData.recentAlerts).toBeDefined()
      expect(dashboardData.recoveryMetrics).toBeDefined()
    })

    it('should calculate system health score', () => {
      const dashboardData = telemetrySystem.getDashboardData()
      expect(dashboardData.systemHealth.overallScore).toBeGreaterThanOrEqual(0)
      expect(dashboardData.systemHealth.overallScore).toBeLessThanOrEqual(100)
    })
  })

  describe('Data Export', () => {
    beforeEach(async () => {
      await telemetrySystem.start()

      // Add test data
      for (let i = 0; i < 5; i++) {
        telemetrySystem.recordError({
          timestamp: Date.now() + i * 1000,
          errorType: 'EXPORT_ERROR',
          category: 'export',
          severity: 'low',
          message: `Export error ${i}`,
          component: 'export-service'
        })
      }
    })

    it('should export metrics to JSON', async () => {
      const exportData = await telemetrySystem.exportData('json')
      const parsedData = JSON.parse(exportData)

      expect(parsedData.metadata).toBeDefined()
      expect(parsedData.metrics).toBeDefined()
      expect(parsedData.statistics).toBeDefined()
      expect(Array.isArray(parsedData.metrics)).toBe(true)
    })

    it('should export metrics to CSV', async () => {
      const exportData = await telemetrySystem.exportData('csv')

      expect(exportData).toContain('timestamp,errorType,category')
      expect(exportData.split('\n').length).toBeGreaterThan(1)
    })

    it('should respect date range in export', async () => {
      const now = Date.now()
      const exportData = await telemetrySystem.exportData('json', {
        startTime: now - 30 * 1000,
        endTime: now + 30 * 1000
      })

      const parsedData = JSON.parse(exportData)
      expect(parsedData.metrics.length).toBeGreaterThan(0)
    })
  })

  describe('Memory Management', () => {
    it('should clean up old metrics automatically', async () => {
      const shortRetentionConfig = {
        ...mockConfig,
        retentionPeriodMs: 1000, // 1 second
        aggregationIntervalMs: 500 // 0.5 seconds
      }

      const shortRetentionSystem = new ErrorTelemetrySystem(shortRetentionConfig)
      await shortRetentionSystem.start()

      // Add old metric
      shortRetentionSystem.recordError({
        timestamp: Date.now() - 2000, // 2 seconds ago
        errorType: 'OLD_ERROR',
        category: 'test',
        severity: 'low',
        message: 'Old error',
        component: 'test-component'
      })

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 1200))

      const metrics = shortRetentionSystem.getMetrics()
      expect(metrics.find(m => m.errorType === 'OLD_ERROR')).toBeUndefined()

      shortRetentionSystem.stop()
    })
  })

  describe('Integration Points', () => {
    beforeEach(async () => {
      await telemetrySystem.start()
    })

    it('should handle high-frequency error recording', () => {
      const startTime = performance.now()

      // Record 1000 errors rapidly
      for (let i = 0; i < 1000; i++) {
        telemetrySystem.recordError({
          timestamp: Date.now() + i,
          errorType: 'RAPID_ERROR',
          category: 'performance',
          severity: 'medium',
          message: `Rapid error ${i}`,
          component: 'performance-test'
        })
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000) // 1 second

      const stats = telemetrySystem.getStatistics()
      expect(stats.totalErrors).toBe(1000)
    })

    it('should maintain data consistency under concurrent access', async () => {
      const promises: Promise<void>[] = []

      // Simulate concurrent error recording
      for (let i = 0; i < 10; i++) {
        promises.push(
          new Promise<void>(resolve => {
            setTimeout(() => {
              for (let j = 0; j < 10; j++) {
                telemetrySystem.recordError({
                  timestamp: Date.now(),
                  errorType: `CONCURRENT_ERROR_${i}_${j}`,
                  category: 'concurrency',
                  severity: 'medium',
                  message: `Concurrent error ${i}-${j}`,
                  component: 'concurrency-test'
                })
              }
              resolve()
            }, Math.random() * 100)
          })
        )
      }

      await Promise.all(promises)

      const stats = telemetrySystem.getStatistics()
      expect(stats.totalErrors).toBe(100)
    })
  })
})
