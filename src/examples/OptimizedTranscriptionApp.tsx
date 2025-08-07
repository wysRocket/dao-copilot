/**
 * Implementation Example: Optimized Transcription App
 * Demonstrates how to integrate startup optimizations for ~75% performance improvement
 */

import React, {useEffect, useState} from 'react'
import useOptimizedStartup, {useStartupMetricsHistory} from '../hooks/useOptimizedStartup'
import PerformanceTestComponent from '../components/PerformanceTestComponent'
import {OptimizedTranscriptDisplay} from '../components/OptimizedTranscriptDisplay'
import {StartupPhase} from '../services/optimized-startup-manager'
import {GeminiLiveConfig} from '../services/gemini-live-websocket'

// Example Gemini configuration - replace with your actual config
const EXAMPLE_GEMINI_CONFIG: GeminiLiveConfig = {
  apiKey: process.env.REACT_APP_GEMINI_API_KEY || 'your-api-key-here',
  model: 'gemini-live-2.5-flash-preview',
  responseModalities: ['TEXT'],
  systemInstruction: 'You are a helpful assistant providing live transcription.',
  connectionTimeout: 3000, // Optimized timeout
  heartbeatInterval: 15000, // Optimized heartbeat
  reconnectAttempts: 2 // Reduced for faster failure
}

const OptimizedTranscriptionApp: React.FC = () => {
  const [showPerformanceTest, setShowPerformanceTest] = useState(false)
  const [isManualMode, setIsManualMode] = useState(false)

  // Use optimized startup hook with pre-configured optimizations
  const [startupState, startupActions] = useOptimizedStartup(EXAMPLE_GEMINI_CONFIG, {
    enableParallelInitialization: true,
    enablePreWarming: true,
    enableConnectionPooling: true,
    enableAudioPreInitialization: true,
    enableTranscriptionPreWarming: true,
    connectionTimeout: 3000,
    audioInitTimeout: 1000,
    transcriptionInitTimeout: 500,
    autoStartOnMount: !isManualMode, // Auto-start unless in manual mode
    enablePerformanceLogging: true,
    enableMetricsCollection: true,
    fallbackToSequential: true
  })

  // Get historical metrics for analysis
  const {
    metrics: historicalMetrics,
    clearHistory,
    getAverageMetrics,
    getBestPerformance
  } = useStartupMetricsHistory()

  // Calculate average performance improvement
  const averageMetrics = getAverageMetrics()
  const bestPerformance = getBestPerformance()

  /**
   * Format time for display
   */
  const formatTime = (timeMs?: number): string => {
    if (!timeMs) return 'N/A'
    if (timeMs < 1000) return `${timeMs.toFixed(0)}ms`
    return `${(timeMs / 1000).toFixed(2)}s`
  }

  /**
   * Get status color based on startup phase
   */
  const getStatusColor = (phase: StartupPhase): string => {
    switch (phase) {
      case StartupPhase.IDLE:
        return 'bg-gray-100 text-gray-800'
      case StartupPhase.INITIALIZING:
        return 'bg-blue-100 text-blue-800'
      case StartupPhase.WEBSOCKET_CONNECTING:
        return 'bg-yellow-100 text-yellow-800'
      case StartupPhase.AUDIO_INITIALIZING:
        return 'bg-purple-100 text-purple-800'
      case StartupPhase.TRANSCRIPTION_INITIALIZING:
        return 'bg-orange-100 text-orange-800'
      case StartupPhase.READY:
        return 'bg-green-100 text-green-800'
      case StartupPhase.ERROR:
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  /**
   * Calculate expected vs actual performance
   */
  const getPerformanceComparison = () => {
    if (!startupState.metrics?.totalStartupTime) return null

    const baselineTime = 18000 // 18 seconds (from your test results)
    const actualTime = startupState.metrics.totalStartupTime
    const improvementPercentage = ((baselineTime - actualTime) / baselineTime) * 100

    return {
      baselineTime,
      actualTime,
      improvementPercentage,
      targetMet: improvementPercentage >= 60 // Target: 60%+ improvement
    }
  }

  const performanceComparison = getPerformanceComparison()

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">
            Optimized Live Transcription Demo
          </h1>
          <p className="text-lg text-gray-600">
            Demonstrating startup performance optimizations: from 18+ seconds to under 5 seconds
          </p>
        </div>

        {/* Performance Overview */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Current Status */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Current Status</h3>

            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium text-gray-700">Phase:</span>
                <span
                  className={`ml-2 rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(startupState.currentPhase)}`}
                >
                  {startupState.currentPhase.replace('_', ' ').toUpperCase()}
                </span>
              </div>

              <div>
                <span className="text-sm font-medium text-gray-700">Progress:</span>
                <div className="mt-1">
                  <div className="h-2 rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                      style={{width: `${startupState.progress}%`}}
                    />
                  </div>
                  <span className="mt-1 text-xs text-gray-500">{startupState.progress}%</span>
                </div>
              </div>

              {startupState.estimatedTimeRemaining > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-700">ETA:</span>
                  <span className="ml-2 text-sm text-gray-600">
                    {formatTime(startupState.estimatedTimeRemaining)}
                  </span>
                </div>
              )}

              {startupState.error && (
                <div className="mt-3 rounded border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-800">{startupState.error.message}</p>
                </div>
              )}
            </div>
          </div>

          {/* Current Performance */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Current Performance</h3>

            {startupState.metrics ? (
              <div className="space-y-3">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {formatTime(startupState.metrics.totalStartupTime)}
                  </div>
                  <div className="text-sm text-gray-600">Total Startup Time</div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-lg font-semibold text-yellow-600">
                      {formatTime(startupState.metrics.websocketConnectionTime)}
                    </div>
                    <div className="text-xs text-gray-600">WebSocket</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-purple-600">
                      {formatTime(startupState.metrics.audioInitializationTime)}
                    </div>
                    <div className="text-xs text-gray-600">Audio</div>
                  </div>
                </div>

                {performanceComparison && (
                  <div className="mt-4 border-t pt-3">
                    <div className="text-center">
                      <div
                        className={`text-lg font-bold ${
                          performanceComparison.targetMet ? 'text-green-600' : 'text-orange-600'
                        }`}
                      >
                        {performanceComparison.improvementPercentage.toFixed(1)}% faster
                      </div>
                      <div className="text-xs text-gray-600">
                        vs {formatTime(performanceComparison.baselineTime)} baseline
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-gray-500">No metrics available yet</div>
            )}
          </div>

          {/* Historical Average */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Historical Performance
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({historicalMetrics.length} runs)
              </span>
            </h3>

            {historicalMetrics.length > 0 ? (
              <div className="space-y-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {formatTime(averageMetrics.totalStartupTime)}
                  </div>
                  <div className="text-sm text-gray-600">Average Startup</div>
                </div>

                {bestPerformance && (
                  <div className="text-center">
                    <div className="text-lg font-semibold text-blue-600">
                      {formatTime(bestPerformance.totalStartupTime)}
                    </div>
                    <div className="text-xs text-gray-600">Best Performance</div>
                  </div>
                )}

                <button
                  onClick={clearHistory}
                  className="mt-3 w-full rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
                >
                  Clear History
                </button>
              </div>
            ) : (
              <div className="text-center text-gray-500">No historical data available</div>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Controls</h3>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={startupActions.startOptimizedSequence}
              disabled={startupState.isStarting}
              className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {startupState.isStarting ? 'Starting...' : 'Start Optimized Sequence'}
            </button>

            <button
              onClick={startupActions.abortStartup}
              disabled={!startupState.isStarting}
              className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Abort Startup
            </button>

            <button
              onClick={startupActions.resetState}
              className="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
            >
              Reset State
            </button>

            <button
              onClick={startupActions.retryWithFallback}
              disabled={startupState.isStarting || !startupState.error}
              className="rounded bg-orange-500 px-4 py-2 text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Retry with Fallback
            </button>

            <button
              onClick={() => setShowPerformanceTest(!showPerformanceTest)}
              className="rounded bg-purple-500 px-4 py-2 text-white hover:bg-purple-600"
            >
              {showPerformanceTest ? 'Hide' : 'Show'} Performance Tests
            </button>
          </div>

          <div className="mt-4 flex items-center">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isManualMode}
                onChange={e => setIsManualMode(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Manual mode (disable auto-start)</span>
            </label>
          </div>
        </div>

        {/* Optimization Suggestions */}
        {startupState.optimizationSuggestions.length > 0 && (
          <div className="mb-8 rounded-lg border border-blue-200 bg-blue-50 p-6">
            <h3 className="mb-3 text-lg font-semibold text-blue-900">
              💡 Optimization Suggestions
            </h3>
            <ul className="space-y-2">
              {startupState.optimizationSuggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start text-sm text-blue-800">
                  <span className="mr-2">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Performance Test Component */}
        {showPerformanceTest && (
          <div className="mb-8">
            <PerformanceTestComponent geminiConfig={EXAMPLE_GEMINI_CONFIG} />
          </div>
        )}

        {/* Transcription Display */}
        {startupState.currentPhase === StartupPhase.READY && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Live Transcription</h3>
            <OptimizedTranscriptDisplay height={400} enableVirtualization={true} />
          </div>
        )}

        {/* Implementation Notes */}
        <div className="mt-8 rounded-lg bg-gray-100 p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Implementation Notes</h3>
          <div className="prose prose-sm text-gray-700">
            <p>
              <strong>Key Optimizations Applied:</strong>
            </p>
            <ul>
              <li>
                <strong>Parallel Initialization:</strong> WebSocket, audio, and transcription
                components initialize simultaneously rather than sequentially
              </li>
              <li>
                <strong>Component Pre-warming:</strong> Audio worklets and transcription buffers are
                pre-initialized to reduce startup latency
              </li>
              <li>
                <strong>Reduced Timeouts:</strong> Connection timeouts optimized from 8s to 3s,
                audio init from 5s to 1s
              </li>
              <li>
                <strong>Optimized Audio Context:</strong> Using 16kHz sample rate instead of 44.1kHz
                for faster initialization
              </li>
              <li>
                <strong>Intelligent Fallback:</strong> Automatically falls back to sequential
                initialization if parallel fails
              </li>
            </ul>

            <p>
              <strong>Expected Performance:</strong>
            </p>
            <ul>
              <li>Baseline (unoptimized): ~18 seconds</li>
              <li>Parallel initialization: ~10 seconds (40% improvement)</li>
              <li>Full optimization: ~5 seconds (75% improvement)</li>
            </ul>

            <p>
              <strong>Integration Tips:</strong>
            </p>
            <ul>
              <li>
                Use the <code>useOptimizedStartup</code> hook for easy integration
              </li>
              <li>
                Enable <code>autoStartOnMount</code> for immediate startup
              </li>
              <li>Monitor metrics to identify remaining bottlenecks</li>
              <li>Consider connection pooling for further WebSocket optimization</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OptimizedTranscriptionApp
