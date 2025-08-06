/**
 * Tests for Performance-Optimized Transcription Rendering System
 */

import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest'
import {TranscriptionPerformanceMonitor} from '../../services/TranscriptionPerformanceMonitor'

// Mock performance.now for consistent testing
const mockPerformanceNow = vi.fn()
vi.stubGlobal('performance', {now: mockPerformanceNow})

describe('TranscriptionPerformanceMonitor', () => {
  let monitor: TranscriptionPerformanceMonitor
  let currentTime: number

  beforeEach(() => {
    currentTime = 1000
    mockPerformanceNow.mockImplementation(() => currentTime)
    monitor = new TranscriptionPerformanceMonitor()
  })

  afterEach(() => {
    monitor.stopMonitoring()
    vi.clearAllMocks()
  })

  describe('Basic Functionality', () => {
    it('should initialize with default thresholds', () => {
      const monitor = new TranscriptionPerformanceMonitor()
      expect(monitor).toBeDefined()
    })

    it('should start and stop monitoring', () => {
      monitor.startMonitoring(100)
      expect(monitor['isMonitoring']).toBe(true)

      monitor.stopMonitoring()
      expect(monitor['isMonitoring']).toBe(false)
    })

    it('should accept custom thresholds', () => {
      const customThresholds = {
        maxRenderTime: 20,
        maxMemoryUsage: 50,
        minFrameRate: 25
      }
      const customMonitor = new TranscriptionPerformanceMonitor(customThresholds)
      expect(customMonitor['thresholds'].maxRenderTime).toBe(20)
      expect(customMonitor['thresholds'].maxMemoryUsage).toBe(50)
      expect(customMonitor['thresholds'].minFrameRate).toBe(25)
    })
  })

  describe('Render Recording', () => {
    beforeEach(() => {
      monitor.startMonitoring()
    })

    it('should record render performance', () => {
      monitor.recordRender(10, 50, 25)

      const stats = monitor.getStats()
      expect(stats.totalRenders).toBe(1)
      expect(stats.averageRenderTime).toBe(10)
      expect(stats.peakRenderTime).toBe(10)
    })

    it('should track multiple renders', () => {
      monitor.recordRender(10, 50, 25)
      currentTime += 100
      monitor.recordRender(15, 60, 30)
      currentTime += 100
      monitor.recordRender(12, 55, 28)

      const stats = monitor.getStats()
      expect(stats.totalRenders).toBe(3)
      expect(stats.averageRenderTime).toBeCloseTo(12.33, 1)
      expect(stats.peakRenderTime).toBe(15)
    })

    it('should estimate memory usage based on segment count', () => {
      monitor.recordRender(10, 100, 50)

      const snapshots = monitor.getRecentSnapshots(1)
      expect(snapshots[0].memoryUsage).toBeGreaterThan(0)
      expect(snapshots[0].segmentCount).toBe(100)
      expect(snapshots[0].visibleSegments).toBe(50)
    })

    it('should calculate frame rates', () => {
      monitor.recordRender(10, 50, 25)
      currentTime += 16.67 // ~60 FPS
      monitor.recordRender(12, 52, 26)

      const snapshots = monitor.getRecentSnapshots(2)
      expect(snapshots[1].frameRate).toBeCloseTo(60, 0)
    })
  })

  describe('Performance Alerts', () => {
    beforeEach(() => {
      monitor.startMonitoring()
    })

    it('should create alerts for excessive render time', () => {
      monitor.recordRender(25, 50, 25) // Exceeds default 16ms threshold

      const alerts = monitor.getActiveAlerts()
      expect(alerts).toHaveLength(1)
      expect(alerts[0].type).toBe('critical')
      expect(alerts[0].category).toBe('performance')
      expect(alerts[0].message).toContain('Render time exceeded threshold')
    })

    it('should create alerts for high memory usage', () => {
      monitor.recordRender(10, 200000, 1000) // Large segment count = high memory

      const alerts = monitor.getActiveAlerts()
      expect(alerts.some(alert => alert.category === 'memory')).toBe(true)
    })

    it('should create alerts for low frame rate', () => {
      monitor.recordRender(10, 50, 25)
      currentTime += 100 // 10 FPS
      monitor.recordRender(12, 52, 26)

      const alerts = monitor.getActiveAlerts()
      expect(alerts.some(alert => alert.category === 'responsiveness')).toBe(true)
    })

    it('should clear alerts', () => {
      monitor.recordRender(25, 50, 25) // Create alert
      expect(monitor.getActiveAlerts()).toHaveLength(1)

      monitor.clearAlerts()
      expect(monitor.getActiveAlerts()).toHaveLength(0)
    })
  })

  describe('Statistics and Analysis', () => {
    beforeEach(() => {
      monitor.startMonitoring()
    })

    it('should provide comprehensive statistics', () => {
      // Record some performance data
      monitor.recordRender(10, 50, 25)
      currentTime += 20
      monitor.recordRender(15, 60, 30)
      currentTime += 20
      monitor.recordRender(12, 55, 28)

      const stats = monitor.getStats()
      expect(stats.averageRenderTime).toBeCloseTo(12.33, 1)
      expect(stats.peakRenderTime).toBe(15)
      expect(stats.totalRenders).toBe(3)
      expect(stats.averageFrameRate).toBeGreaterThan(0)
    })

    it('should handle empty snapshots gracefully', () => {
      const stats = monitor.getStats()
      expect(stats.averageRenderTime).toBe(0)
      expect(stats.peakRenderTime).toBe(0)
      expect(stats.totalRenders).toBe(0)
    })

    it('should limit snapshot history', () => {
      // Record more than 1000 snapshots
      for (let i = 0; i < 1100; i++) {
        monitor.recordRender(10, 50, 25)
        currentTime += 10
      }

      const snapshots = monitor['snapshots']
      expect(snapshots.length).toBeLessThanOrEqual(1000)
    })

    it('should provide recent snapshots', () => {
      for (let i = 0; i < 100; i++) {
        monitor.recordRender(10 + i, 50, 25)
        currentTime += 10
      }

      const recentSnapshots = monitor.getRecentSnapshots(10)
      expect(recentSnapshots).toHaveLength(10)
      expect(recentSnapshots[9].renderTime).toBe(109) // Last recorded
    })
  })

  describe('Performance Recommendations', () => {
    beforeEach(() => {
      monitor.startMonitoring()
    })

    it('should recommend virtual scrolling for slow renders', () => {
      // Record slow renders
      monitor.recordRender(25, 50, 25)
      monitor.recordRender(30, 60, 30)

      const recommendations = monitor.getRecommendations()
      expect(recommendations.some(rec => rec.includes('virtual scrolling'))).toBe(true)
    })

    it('should recommend memory management for high usage', () => {
      // Record high memory usage scenarios
      monitor.recordRender(10, 500000, 1000)

      const recommendations = monitor.getRecommendations()
      expect(
        recommendations.some(rec => rec.includes('garbage collection') || rec.includes('memory'))
      ).toBe(true)
    })

    it('should recommend throttling for low frame rates', () => {
      // Simulate low frame rate
      monitor.recordRender(10, 50, 25)
      currentTime += 100 // 10 FPS
      monitor.recordRender(10, 50, 25)

      const recommendations = monitor.getRecommendations()
      expect(
        recommendations.some(rec => rec.includes('throttle') || rec.includes('Web Workers'))
      ).toBe(true)
    })
  })

  describe('Trend Analysis', () => {
    beforeEach(() => {
      monitor.startMonitoring()
    })

    it('should detect improving performance trends', () => {
      // Record more samples to ensure sufficient data for trend analysis
      // Record older degraded performance first
      for (let i = 0; i < 15; i++) {
        monitor.recordRender(25, 50, 25) // Poor performance
        currentTime += 20
      }
      // Then record newer improved performance
      for (let i = 0; i < 15; i++) {
        monitor.recordRender(10, 50, 25) // Good performance
        currentTime += 20
      }

      const report = monitor.generateReport()
      expect(report.trends.renderTimeTrend).toBe('improving')
    })

    it('should detect degrading performance trends', () => {
      // Record older good performance first
      for (let i = 0; i < 15; i++) {
        monitor.recordRender(10, 50, 25) // Good performance
        currentTime += 20
      }
      // Then record newer degraded performance
      for (let i = 0; i < 15; i++) {
        monitor.recordRender(25, 50, 25) // Poor performance
        currentTime += 20
      }

      const report = monitor.generateReport()
      expect(report.trends.renderTimeTrend).toBe('degrading')
    })

    it('should detect stable performance', () => {
      // Record consistent performance
      for (let i = 0; i < 20; i++) {
        monitor.recordRender(10, 50, 25) // Stable render times
        currentTime += 20
      }

      const report = monitor.generateReport()
      expect(report.trends.renderTimeTrend).toBe('stable')
    })

    it('should detect memory growth', () => {
      // Simulate stable memory first
      for (let i = 0; i < 15; i++) {
        monitor.recordRender(10, 1000, 25) // Stable segment count
        currentTime += 1000 // 1 second intervals
      }
      // Then growing memory usage
      for (let i = 0; i < 15; i++) {
        monitor.recordRender(10, 2000 + i * 200, 25) // Growing segment count
        currentTime += 1000 // 1 second intervals
      }

      const report = monitor.generateReport()
      expect(report.trends.memoryTrend).toBe('growing')
    })
  })

  describe('Performance Report Generation', () => {
    beforeEach(() => {
      monitor.startMonitoring()
    })

    it('should generate comprehensive performance report', () => {
      // Add some performance data
      monitor.recordRender(15, 100, 50)
      currentTime += 20
      monitor.recordRender(12, 120, 60)
      currentTime += 20
      monitor.recordRender(18, 110, 55)

      const report = monitor.generateReport()

      expect(report.summary).toBeDefined()
      expect(report.recommendations).toBeDefined()
      expect(report.alerts).toBeDefined()
      expect(report.trends).toBeDefined()

      expect(report.trends.renderTimeTrend).toMatch(/improving|stable|degrading/)
      expect(report.trends.memoryTrend).toMatch(/stable|growing|degrading/)
      expect(report.trends.frameRateTrend).toMatch(/improving|stable|degrading/)
    })

    it('should handle empty data gracefully', () => {
      const report = monitor.generateReport()

      expect(report.summary.totalRenders).toBe(0)
      // When there's no data, there may still be default recommendations
      expect(Array.isArray(report.recommendations)).toBe(true)
      expect(report.alerts).toHaveLength(0)
    })
  })

  describe('Configuration Updates', () => {
    it('should update thresholds', () => {
      const newThresholds = {
        maxRenderTime: 25,
        maxMemoryUsage: 200
      }

      monitor.updateThresholds(newThresholds)
      expect(monitor['thresholds'].maxRenderTime).toBe(25)
      expect(monitor['thresholds'].maxMemoryUsage).toBe(200)
      // Should preserve other defaults
      expect(monitor['thresholds'].minFrameRate).toBe(30)
    })

    it('should apply new thresholds to alerts', () => {
      monitor.startMonitoring()

      // Set high threshold
      monitor.updateThresholds({maxRenderTime: 50})
      monitor.recordRender(40, 50, 25) // Below new threshold

      expect(monitor.getActiveAlerts()).toHaveLength(0)

      // Lower threshold
      monitor.updateThresholds({maxRenderTime: 20})
      monitor.recordRender(25, 50, 25) // Above new threshold

      expect(monitor.getActiveAlerts()).toHaveLength(1)
    })
  })
})
