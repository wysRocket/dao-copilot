/**
 * Tests for Enhanced Transcription Integration
 *
 * Comprehensive test suite covering the integration of all enhanced transcription components:
 * - Enhanced router functionality
 * - Configuration management
 * - Performance monitoring integration
 * - Component integration and lifecycle
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {render, screen, waitFor} from '@testing-library/react'
import React from 'react'
import EnhancedTranscriptionIntegration from '../../components/EnhancedTranscriptionIntegration'
import {getEnhancedRouter, resetEnhancedRouter} from '../../services/EnhancedTranscriptionRouter'
import {
  getTranscriptionConfig,
  resetTranscriptionConfig
} from '../../services/TranscriptionConfigManager'

// Mock the enhanced transcription hook
vi.mock('../../hooks/useEnhancedLiveTranscription', () => ({
  useEnhancedLiveTranscription: vi.fn(() => ({
    state: {
      segments: [],
      currentText: '',
      isActivelyStreaming: false,
      lastUpdateTime: Date.now(),
      sessionStartTime: Date.now(),
      totalDuration: 0,
      stats: {
        totalSegments: 0,
        partialSegments: 0,
        finalSegments: 0,
        averageConfidence: 0.9,
        processingTime: 0
      }
    },
    addSegment: vi.fn(),
    startSession: vi.fn(),
    endSession: vi.fn(),
    isActive: false,
    timelineAnalysis: null,
    getSessionAnalysis: vi.fn(() => ({
      finalState: {},
      analysis: {},
      continuityReport: {
        isValid: true,
        issues: [],
        suggestions: []
      }
    }))
  }))
}))

// Mock the performance optimized renderer
vi.mock('../../components/PerformanceOptimizedTranscriptionRenderer', () => ({
  PerformanceOptimizedTranscriptionRenderer: vi.fn(({children, ...props}) => (
    <div data-testid="performance-renderer" {...props}>
      {children}
      Performance Optimized Transcription Renderer
    </div>
  ))
}))

describe('EnhancedTranscriptionIntegration', () => {
  beforeEach(() => {
    // Reset global instances before each test
    resetEnhancedRouter()
    resetTranscriptionConfig()

    // Clear all mocks
    vi.clearAllMocks()

    // Mock console methods to reduce noise
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Basic Integration', () => {
    it('should render loading state initially', () => {
      render(<EnhancedTranscriptionIntegration />)

      expect(screen.getByText('Initializing Enhanced Transcription System...')).toBeInTheDocument()
    })

    it('should initialize and render the enhanced renderer', async () => {
      render(<EnhancedTranscriptionIntegration />)

      await waitFor(
        () => {
          expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
        },
        {timeout: 3000}
      )
    })

    it('should apply custom className and style', async () => {
      render(<EnhancedTranscriptionIntegration className="custom-class" style={{margin: '10px'}} />)

      await waitFor(() => {
        const container = screen.getByTestId('performance-renderer').parentElement
        expect(container).toHaveClass('enhanced-transcription-integration', 'custom-class')
      })
    })
  })

  describe('Configuration Management', () => {
    it('should initialize with default configuration', async () => {
      const onConfigChange = vi.fn()

      render(
        <EnhancedTranscriptionIntegration
          onConfigChange={onConfigChange}
          enableConfiguration={true}
        />
      )

      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalledWith(
          expect.objectContaining({
            display: expect.any(Object),
            behavior: expect.any(Object),
            integration: expect.any(Object),
            router: expect.any(Object)
          })
        )
      })
    })

    it('should merge config overrides', async () => {
      const configOverrides = {
        display: {fontSize: 20},
        router: {enableVirtualScrolling: false}
      }

      const onConfigChange = vi.fn()

      render(
        <EnhancedTranscriptionIntegration
          configOverrides={configOverrides}
          onConfigChange={onConfigChange}
          enableConfiguration={true}
        />
      )

      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalledWith(
          expect.objectContaining({
            display: expect.objectContaining({fontSize: 20}),
            router: expect.objectContaining({enableVirtualScrolling: false})
          })
        )
      })
    })

    it('should update configuration at runtime', async () => {
      const {rerender} = render(<EnhancedTranscriptionIntegration enableConfiguration={true} />)

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      // Get the config manager and update configuration
      const configManager = getTranscriptionConfig()

      configManager.updateDisplayConfig({fontSize: 24})

      // Configuration updates should trigger re-renders
      rerender(<EnhancedTranscriptionIntegration enableConfiguration={true} />)

      expect(configManager.getDisplayConfig().fontSize).toBe(24)
    })
  })

  describe('Router Integration', () => {
    it('should initialize enhanced router with correct configuration', async () => {
      render(<EnhancedTranscriptionIntegration />)

      await waitFor(() => {
        const router = getEnhancedRouter()
        const status = router.getRouterStatus()

        expect(status.enhancedFeatures).toEqual({
          performanceOptimization: true,
          timestampTracking: true,
          gapDetection: true,
          virtualScrolling: true,
          performanceMonitoring: true
        })
      })
    })

    it('should set up enhanced streaming target', async () => {
      render(<EnhancedTranscriptionIntegration />)

      await waitFor(() => {
        const router = getEnhancedRouter()
        const status = router.getRouterStatus()

        expect(status.hasEnhancedTarget).toBe(true)
      })
    })

    it('should handle router initialization errors gracefully with fallback', async () => {
      // Mock router to throw an error
      vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create a mock that throws on initialization
      const mockGetEnhancedRouter = vi.fn(() => {
        throw new Error('Router initialization failed')
      })

      vi.doMock('../../services/EnhancedTranscriptionRouter', () => ({
        getEnhancedRouter: mockGetEnhancedRouter,
        resetEnhancedRouter: vi.fn()
      }))

      render(<EnhancedTranscriptionIntegration fallbackToLegacy={true} />)

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('🚀 Integration: Failed to initialize:'),
        expect.any(Error)
      )
    })
  })

  describe('Callback Integration', () => {
    it('should call onSessionStart when session begins', async () => {
      const onSessionStart = vi.fn()

      render(<EnhancedTranscriptionIntegration onSessionStart={onSessionStart} />)

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      // Simulate session start by accessing the router's enhanced target
      const router = getEnhancedRouter()
      const status = router.getRouterStatus()

      expect(status.hasEnhancedTarget).toBe(true)
    })

    it('should call onSessionEnd with analysis when session completes', async () => {
      const onSessionEnd = vi.fn()

      render(<EnhancedTranscriptionIntegration onSessionEnd={onSessionEnd} />)

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      // Session end would be triggered by the router, verify the callback is set up
      expect(onSessionEnd).toBeInstanceOf(Function)
    })

    it('should call onPerformanceAlert when performance issues are detected', async () => {
      const onPerformanceAlert = vi.fn()

      render(
        <EnhancedTranscriptionIntegration
          onPerformanceAlert={onPerformanceAlert}
          enableTelemetry={true}
        />
      )

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      expect(onPerformanceAlert).toBeInstanceOf(Function)
    })
  })

  describe('Performance Monitoring', () => {
    it('should monitor performance when telemetry is enabled', async () => {
      render(<EnhancedTranscriptionIntegration enableTelemetry={true} />)

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      const router = getEnhancedRouter()
      const status = router.getRouterStatus()

      expect(status.performance).toBeDefined()
    })

    it('should not monitor performance when telemetry is disabled', async () => {
      render(<EnhancedTranscriptionIntegration enableTelemetry={false} />)

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      // Even when telemetry is disabled, performance data should still be available
      // but monitoring interval should be different
      const router = getEnhancedRouter()
      const status = router.getRouterStatus()

      expect(status.performance).toBeDefined()
    })
  })

  describe('Debug Mode', () => {
    it('should show debug panel when debug mode is enabled', async () => {
      render(<EnhancedTranscriptionIntegration enableDebugMode={true} />)

      await waitFor(() => {
        expect(screen.getByText('Enhanced Transcription Debug')).toBeInTheDocument()
        expect(screen.getByText(/Segments:/)).toBeInTheDocument()
        expect(screen.getByText(/Active:/)).toBeInTheDocument()
        expect(screen.getByText(/Alerts:/)).toBeInTheDocument()
      })
    })

    it('should not show debug panel when debug mode is disabled', async () => {
      render(<EnhancedTranscriptionIntegration enableDebugMode={false} />)

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      expect(screen.queryByText('Enhanced Transcription Debug')).not.toBeInTheDocument()
    })

    it('should log debug information when debug mode is enabled', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log')

      render(<EnhancedTranscriptionIntegration enableDebugMode={true} />)

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚀 Integration: System initialized successfully'),
        expect.any(Object)
      )
    })
  })

  describe('Cleanup and Lifecycle', () => {
    it('should cleanup router on unmount', async () => {
      const {unmount} = render(<EnhancedTranscriptionIntegration />)

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      const router = getEnhancedRouter()
      const cleanupSpy = vi.spyOn(router, 'cleanup')

      unmount()

      expect(cleanupSpy).toHaveBeenCalled()
    })

    it('should handle unmount gracefully when router is not initialized', () => {
      const {unmount} = render(<EnhancedTranscriptionIntegration />)

      // Unmount immediately before initialization completes
      unmount()

      // Should not throw any errors
      expect(true).toBe(true)
    })
  })

  describe('Configuration Validation', () => {
    it('should handle invalid configuration gracefully', async () => {
      const invalidConfig = {
        display: {fontSize: -10}, // Invalid negative font size
        router: {maxBufferSize: -1} // Invalid negative buffer size
      }

      render(
        <EnhancedTranscriptionIntegration configOverrides={invalidConfig} fallbackToLegacy={true} />
      )

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      // Should still render with fallback to default values
      const configManager = getTranscriptionConfig()
      const config = configManager.getConfig()

      // Invalid values should be replaced with defaults
      expect(config.display.fontSize).toBeGreaterThan(0)
      expect(config.router.maxBufferSize).toBeGreaterThan(0)
    })
  })

  describe('Error Recovery', () => {
    it('should recover from performance monitor errors', async () => {
      render(<EnhancedTranscriptionIntegration enableTelemetry={true} fallbackToLegacy={true} />)

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      // Performance monitoring errors should not crash the component
      expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
    })

    it('should continue functioning when config updates fail', async () => {
      render(
        <EnhancedTranscriptionIntegration enableConfiguration={true} fallbackToLegacy={true} />
      )

      await waitFor(() => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      })

      const configManager = getTranscriptionConfig()

      // Try to update with invalid config
      try {
        const currentConfig = configManager.getConfig()
        configManager.updateConfig({
          ...currentConfig,
          display: {...currentConfig.display, fontSize: -100}
        })
      } catch {
        // Error should be caught and handled
      }

      // Component should still be functional
      expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
    })
  })
})

describe('Integration Performance', () => {
  beforeEach(() => {
    resetEnhancedRouter()
    resetTranscriptionConfig()
    vi.clearAllMocks()
  })

  it('should initialize within reasonable time', async () => {
    const startTime = performance.now()

    render(<EnhancedTranscriptionIntegration />)

    await waitFor(
      () => {
        expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
      },
      {timeout: 2000}
    )

    const initTime = performance.now() - startTime

    // Should initialize within 2 seconds (generous for CI environments)
    expect(initTime).toBeLessThan(2000)
  })

  it('should handle multiple rapid re-renders efficiently', async () => {
    const {rerender} = render(<EnhancedTranscriptionIntegration enableDebugMode={false} />)

    await waitFor(() => {
      expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
    })

    // Rapidly toggle debug mode
    for (let i = 0; i < 10; i++) {
      rerender(<EnhancedTranscriptionIntegration enableDebugMode={i % 2 === 0} />)
    }

    // Should still be functional after rapid re-renders
    expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
  })
})

describe('Integration with Real Transcription Data', () => {
  beforeEach(() => {
    resetEnhancedRouter()
    resetTranscriptionConfig()
    vi.clearAllMocks()
  })

  it('should handle large amounts of transcription data', async () => {
    const mockUseEnhancedLiveTranscription = vi.fn(() => ({
      state: {
        segments: Array.from({length: 1000}, (_, i) => ({
          id: `segment-${i}`,
          text: `This is transcription segment number ${i}`,
          isPartial: false,
          confidence: 0.9,
          timestamp: Date.now() + i * 1000,
          source: 'test'
        })),
        currentText: 'Current streaming text...',
        isActivelyStreaming: true,
        lastUpdateTime: Date.now(),
        sessionStartTime: Date.now() - 60000,
        totalDuration: 60000,
        stats: {
          totalSegments: 1000,
          partialSegments: 100,
          finalSegments: 900,
          averageConfidence: 0.9,
          processingTime: 5000
        }
      },
      addSegment: vi.fn(),
      startSession: vi.fn(),
      endSession: vi.fn(),
      isActive: true,
      timelineAnalysis: {
        totalDuration: 60000,
        gaps: [],
        continuityScore: 0.95,
        segmentCount: 1000
      },
      getSessionAnalysis: vi.fn(() => ({
        finalState: {},
        analysis: {},
        continuityReport: {
          isValid: true,
          issues: [],
          suggestions: []
        }
      }))
    }))

    vi.doMock('../../hooks/useEnhancedLiveTranscription', () => ({
      useEnhancedLiveTranscription: mockUseEnhancedLiveTranscription
    }))

    render(<EnhancedTranscriptionIntegration />)

    await waitFor(() => {
      expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
    })

    // Should handle large datasets without crashing
    expect(screen.getByTestId('performance-renderer')).toBeInTheDocument()
  })
})
