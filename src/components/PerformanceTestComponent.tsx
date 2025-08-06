/**
 * Performance Testing Component for Transcription Startup
 * React component to test and validate startup optimizations
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import OptimizedStartupManager, { 
  StartupPhase, 
  type StartupOptimizationConfig, 
  type StartupMetrics 
} from '../services/optimized-startup-manager'
import { GeminiLiveConfig } from '../services/gemini-live-websocket'

interface PerformanceTestResult {
  testName: string
  totalTime: number
  websocketTime: number
  audioTime: number
  transcriptionTime: number
  optimizationsApplied: string[]
  bottlenecks: string[]
  speedupPercentage?: number
  timestamp: Date
}

interface PerformanceTestComponentProps {
  geminiConfig: GeminiLiveConfig
  className?: string
}

export const PerformanceTestComponent: React.FC<PerformanceTestComponentProps> = ({
  geminiConfig,
  className = ''
}) => {
  const [isRunning, setIsRunning] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<StartupPhase>(StartupPhase.IDLE)
  const [testResults, setTestResults] = useState<PerformanceTestResult[]>([])
  const [selectedOptimizations, setSelectedOptimizations] = useState<StartupOptimizationConfig>({
    enableParallelInitialization: true,
    enablePreWarming: true,
    enableConnectionPooling: true,
    enableAudioPreInitialization: true,
    enableTranscriptionPreWarming: true,
    connectionTimeout: 3000,
    audioInitTimeout: 1000,
    transcriptionInitTimeout: 500
  })

  const startupManagerRef = useRef<OptimizedStartupManager | null>(null)
  const baselineResult = useRef<PerformanceTestResult | null>(null)

  // Initialize startup manager when component mounts
  useEffect(() => {
    return () => {
      if (startupManagerRef.current) {
        startupManagerRef.current.destroy()
      }
    }
  }, [])

  /**
   * Run a single performance test with given configuration
   */
  const runPerformanceTest = useCallback(async (
    testName: string,
    config: StartupOptimizationConfig
  ): Promise<PerformanceTestResult> => {
    setIsRunning(true)
    setCurrentPhase(StartupPhase.INITIALIZING)

    try {
      // Create new startup manager for this test
      if (startupManagerRef.current) {
        startupManagerRef.current.destroy()
      }

      startupManagerRef.current = new OptimizedStartupManager(config)

      // Set up event listeners
      startupManagerRef.current.on('phaseChange', (phase: StartupPhase) => {
        setCurrentPhase(phase)
      })

      // Run the startup sequence
      const metrics = await startupManagerRef.current.startOptimizedSequence(geminiConfig)

      // Create test result
      const result: PerformanceTestResult = {
        testName,
        totalTime: metrics.totalStartupTime,
        websocketTime: metrics.websocketConnectionTime || 0,
        audioTime: metrics.audioInitializationTime || 0,
        transcriptionTime: metrics.transcriptionInitializationTime || 0,
        optimizationsApplied: metrics.optimizationsApplied || [],
        bottlenecks: metrics.bottlenecksIdentified || [],
        timestamp: new Date()
      }

      // Calculate speedup percentage if we have a baseline
      if (baselineResult.current) {
        const speedup = ((baselineResult.current.totalTime - result.totalTime) / baselineResult.current.totalTime) * 100
        result.speedupPercentage = Math.max(0, speedup)
      }

      return result

    } catch (error) {
      throw new Error(`Performance test failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsRunning(false)
      setCurrentPhase(StartupPhase.IDLE)
    }
  }, [geminiConfig])

  /**
   * Run baseline test (no optimizations)
   */
  const runBaselineTest = useCallback(async () => {
    const baselineConfig: StartupOptimizationConfig = {
      enableParallelInitialization: false,
      enablePreWarming: false,
      enableConnectionPooling: false,
      enableAudioPreInitialization: false,
      enableTranscriptionPreWarming: false,
      connectionTimeout: 8000,
      audioInitTimeout: 5000,
      transcriptionInitTimeout: 3000
    }

    try {
      const result = await runPerformanceTest('Baseline (No Optimizations)', baselineConfig)
      baselineResult.current = result
      setTestResults(prev => [result, ...prev])
    } catch (error) {
      console.error('Baseline test failed:', error)
      alert(`Baseline test failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [runPerformanceTest])

  /**
   * Run parallel initialization test
   */
  const runParallelTest = useCallback(async () => {
    const parallelConfig: StartupOptimizationConfig = {
      enableParallelInitialization: true,
      enablePreWarming: false,
      enableConnectionPooling: true,
      enableAudioPreInitialization: true,
      enableTranscriptionPreWarming: false,
      connectionTimeout: 6000,
      audioInitTimeout: 3000,
      transcriptionInitTimeout: 3000
    }

    try {
      const result = await runPerformanceTest('Parallel Initialization', parallelConfig)
      setTestResults(prev => [result, ...prev])
    } catch (error) {
      console.error('Parallel test failed:', error)
      alert(`Parallel test failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [runPerformanceTest])

  /**
   * Run pre-warming test
   */
  const runPreWarmingTest = useCallback(async () => {
    const preWarmConfig: StartupOptimizationConfig = {
      enableParallelInitialization: true,
      enablePreWarming: true,
      enableConnectionPooling: true,
      enableAudioPreInitialization: true,
      enableTranscriptionPreWarming: true,
      connectionTimeout: 3000,
      audioInitTimeout: 1000,
      transcriptionInitTimeout: 500
    }

    try {
      const result = await runPerformanceTest('Pre-warmed Services', preWarmConfig)
      setTestResults(prev => [result, ...prev])
    } catch (error) {
      console.error('Pre-warming test failed:', error)
      alert(`Pre-warming test failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [runPerformanceTest])

  /**
   * Run custom test with selected optimizations
   */
  const runCustomTest = useCallback(async () => {
    try {
      const result = await runPerformanceTest('Custom Configuration', selectedOptimizations)
      setTestResults(prev => [result, ...prev])
    } catch (error) {
      console.error('Custom test failed:', error)
      alert(`Custom test failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [runPerformanceTest, selectedOptimizations])

  /**
   * Clear all test results
   */
  const clearResults = useCallback(() => {
    setTestResults([])
    baselineResult.current = null
  }, [])

  /**
   * Format time in milliseconds to readable string
   */
  const formatTime = (timeMs: number): string => {
    if (timeMs < 1000) {
      return `${timeMs.toFixed(0)}ms`
    }
    return `${(timeMs / 1000).toFixed(2)}s`
  }

  /**
   * Get phase color for UI
   */
  const getPhaseColor = (phase: StartupPhase): string => {
    switch (phase) {
      case StartupPhase.IDLE: return 'text-gray-500'
      case StartupPhase.INITIALIZING: return 'text-blue-500'
      case StartupPhase.WEBSOCKET_CONNECTING: return 'text-yellow-500'
      case StartupPhase.AUDIO_INITIALIZING: return 'text-purple-500'
      case StartupPhase.TRANSCRIPTION_INITIALIZING: return 'text-orange-500'
      case StartupPhase.READY: return 'text-green-500'
      case StartupPhase.ERROR: return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  return (
    <div className={`performance-test-component p-6 bg-white rounded-lg shadow-lg ${className}`}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Transcription Startup Performance Testing
        </h2>
        <p className="text-gray-600">
          Test and validate startup optimizations to reduce delay from 18+ seconds to under 5 seconds
        </p>
      </div>

      {/* Current Status */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-gray-700">Current Phase:</span>
            <span className={`ml-2 font-semibold ${getPhaseColor(currentPhase)}`}>
              {currentPhase.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          {isRunning && (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
              <span className="text-sm text-blue-600">Running test...</span>
            </div>
          )}
        </div>
      </div>

      {/* Test Controls */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Tests</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={runBaselineTest}
            disabled={isRunning}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Run Baseline Test
          </button>
          <button
            onClick={runParallelTest}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Parallel Init
          </button>
          <button
            onClick={runPreWarmingTest}
            disabled={isRunning}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Pre-warming
          </button>
          <button
            onClick={runCustomTest}
            disabled={isRunning}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Custom Config
          </button>
        </div>
      </div>

      {/* Custom Configuration */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Custom Test Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={selectedOptimizations.enableParallelInitialization}
                onChange={(e) => setSelectedOptimizations(prev => ({
                  ...prev,
                  enableParallelInitialization: e.target.checked
                }))}
                className="mr-2"
              />
              <span className="text-sm">Enable Parallel Initialization (~40% improvement)</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={selectedOptimizations.enablePreWarming}
                onChange={(e) => setSelectedOptimizations(prev => ({
                  ...prev,
                  enablePreWarming: e.target.checked
                }))}
                className="mr-2"
              />
              <span className="text-sm">Enable Pre-warming (~75% improvement)</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={selectedOptimizations.enableAudioPreInitialization}
                onChange={(e) => setSelectedOptimizations(prev => ({
                  ...prev,
                  enableAudioPreInitialization: e.target.checked
                }))}
                className="mr-2"
              />
              <span className="text-sm">Enable Audio Pre-initialization</span>
            </label>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Connection Timeout (ms)
              </label>
              <input
                type="number"
                value={selectedOptimizations.connectionTimeout}
                onChange={(e) => setSelectedOptimizations(prev => ({
                  ...prev,
                  connectionTimeout: parseInt(e.target.value)
                }))}
                className="w-full px-3 py-1 border border-gray-300 rounded text-sm"
                min="1000"
                max="10000"
                step="500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Audio Init Timeout (ms)
              </label>
              <input
                type="number"
                value={selectedOptimizations.audioInitTimeout}
                onChange={(e) => setSelectedOptimizations(prev => ({
                  ...prev,
                  audioInitTimeout: parseInt(e.target.value)
                }))}
                className="w-full px-3 py-1 border border-gray-300 rounded text-sm"
                min="500"
                max="5000"
                step="250"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Test Results */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Test Results</h3>
          {testResults.length > 0 && (
            <button
              onClick={clearResults}
              className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
            >
              Clear Results
            </button>
          )}
        </div>

        {testResults.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <p className="text-gray-500">No test results yet. Run a test to see performance metrics.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {testResults.map((result, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900">{result.testName}</h4>
                  <div className="flex items-center space-x-4">
                    {result.speedupPercentage !== undefined && (
                      <span className={`px-2 py-1 rounded text-sm font-medium ${
                        result.speedupPercentage > 0 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {result.speedupPercentage > 0 ? '+' : ''}{result.speedupPercentage.toFixed(1)}% speedup
                      </span>
                    )}
                    <span className="text-sm text-gray-500">
                      {result.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatTime(result.totalTime)}
                    </div>
                    <div className="text-sm text-gray-600">Total Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-yellow-600">
                      {formatTime(result.websocketTime)}
                    </div>
                    <div className="text-sm text-gray-600">WebSocket</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-purple-600">
                      {formatTime(result.audioTime)}
                    </div>
                    <div className="text-sm text-gray-600">Audio Init</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-orange-600">
                      {formatTime(result.transcriptionTime)}
                    </div>
                    <div className="text-sm text-gray-600">Transcription</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-700">Optimizations:</span>
                  {result.optimizationsApplied.length > 0 ? (
                    result.optimizationsApplied.map((opt, i) => (
                      <span key={i} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                        {opt.replace('_', ' ')}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-500">None</span>
                  )}
                </div>

                {result.bottlenecks.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-sm font-medium text-gray-700">Bottlenecks:</span>
                    {result.bottlenecks.map((bottleneck, i) => (
                      <span key={i} className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                        {bottleneck.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance Insights */}
      {testResults.length > 0 && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-semibold text-blue-900 mb-2">Performance Insights</h4>
          <div className="text-sm text-blue-800 space-y-1">
            {testResults.some(r => r.speedupPercentage && r.speedupPercentage > 50) && (
              <p>✅ Excellent performance improvement detected! Consider implementing these optimizations.</p>
            )}
            {testResults.some(r => r.bottlenecks.includes('slow_websocket_connection')) && (
              <p>⚠️ WebSocket connection appears to be a bottleneck. Consider connection pooling or authentication optimization.</p>
            )}
            {testResults.some(r => r.bottlenecks.includes('slow_audio_initialization')) && (
              <p>⚠️ Audio initialization is slow. Enable pre-initialization for better performance.</p>
            )}
            <p>💡 Best results typically come from combining parallel initialization with pre-warming optimizations.</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default PerformanceTestComponent
