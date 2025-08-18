/**
 * ZeroLatencyTranscription - Complete ultra-fast transcription system
 *
 * This component eliminates transcription delays by integrating:
 * - UltraFastWebSocketManager for instant message handling
 * - InstantTranscriptionRenderer for zero-lag rendering
 * - React 18 concurrent features for smooth updates
 * - Aggressive performance optimizations
 * - Real-time metrics and monitoring
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useTransition,
  useDeferredValue
} from 'react'
import {
  UltraFastWebSocketManager,
  getUltraFastWebSocketManager
} from '../services/UltraFastWebSocketManager'
import {
  InstantTranscriptionRenderer,
  UltraOptimizedTranscriptionRenderer
} from './InstantTranscriptionRenderer'
import {cn} from '../utils/tailwind'

export interface ZeroLatencyTranscriptionProps {
  // Connection settings
  websocketUrl?: string
  autoConnect?: boolean

  // Performance options
  useUltraOptimized?: boolean
  enableMetrics?: boolean
  maxBuffer?: number

  // Visual options
  showConnectionStatus?: boolean
  showMetrics?: boolean
  className?: string

  // Callbacks
  onTranscriptionUpdate?: (text: string, isPartial: boolean) => void
  onPerformanceUpdate?: (metrics: any) => void
  onError?: (error: Error) => void
}

interface TranscriptionState {
  currentText: string
  isPartial: boolean
  isActive: boolean
  confidence: number
  source: string
}

interface PerformanceState {
  latency: number
  renderTime: number
  messagesPerSecond: number
  totalMessages: number
  errors: number
  connectionHealth: number
}

/**
 * Custom hook for ultra-fast transcription state management
 */
function useZeroLatencyTranscription(websocketManager: UltraFastWebSocketManager) {
  const [transcription, setTranscription] = useState<TranscriptionState>({
    currentText: '',
    isPartial: false,
    isActive: false,
    confidence: 0,
    source: ''
  })

  const [performance, setPerformance] = useState<PerformanceState>({
    latency: 0,
    renderTime: 0,
    messagesPerSecond: 0,
    totalMessages: 0,
    errors: 0,
    connectionHealth: 100
  })

  const [isPending, startTransition] = useTransition()
  const bufferRef = useRef<string>('')
  const lastUpdateRef = useRef<number>(0)

  // Optimized transcription update with batching
  const updateTranscription = useCallback(
    (text: string, isPartial: boolean, metadata: any = {}) => {
      const now = performance.now()

      // Ultra-fast state update with React 18 transitions
      startTransition(() => {
        setTranscription(prev => ({
          ...prev,
          currentText: text,
          isPartial,
          isActive: isPartial || now - lastUpdateRef.current < 1000,
          confidence: metadata.confidence || prev.confidence,
          source: metadata.source || prev.source
        }))
      })

      // Update performance metrics
      const timeSinceLastUpdate = now - lastUpdateRef.current
      lastUpdateRef.current = now

      setPerformance(prev => ({
        ...prev,
        latency: timeSinceLastUpdate,
        totalMessages: prev.totalMessages + 1,
        messagesPerSecond: timeSinceLastUpdate > 0 ? 1000 / timeSinceLastUpdate : 0
      }))
    },
    []
  )

  // Set up WebSocket event listeners
  useEffect(() => {
    console.log('🔗 Setting up ultra-fast WebSocket listeners')

    const handleTranscription = (data: any) => {
      updateTranscription(data.text, false, data)
    }

    const handlePartial = (data: any) => {
      updateTranscription(data.text, true, data)
    }

    const handleComplete = (data: any) => {
      updateTranscription(data.text, false, data)
      setTimeout(() => {
        setTranscription(prev => ({...prev, isActive: false}))
      }, 500)
    }

    const handleError = (error: any) => {
      setPerformance(prev => ({...prev, errors: prev.errors + 1}))
      console.error('WebSocket error:', error)
    }

    // Register listeners
    websocketManager.on('transcription', handleTranscription)
    websocketManager.on('partial', handlePartial)
    websocketManager.on('complete', handleComplete)
    websocketManager.on('error', handleError)

    // Cleanup
    return () => {
      websocketManager.off('transcription', handleTranscription)
      websocketManager.off('partial', handlePartial)
      websocketManager.off('complete', handleComplete)
      websocketManager.off('error', handleError)
    }
  }, [websocketManager, updateTranscription])

  return {
    transcription,
    performance,
    isPending,
    updateTranscription
  }
}

/**
 * Connection status indicator
 */
const ConnectionStatus: React.FC<{
  isConnected: boolean
  metrics: PerformanceState
  className?: string
}> = ({isConnected, metrics, className}) => (
  <div className={cn('flex items-center space-x-3 text-xs', className)}>
    <div className="flex items-center space-x-1">
      <div
        className={cn('h-2 w-2 rounded-full transition-colors duration-200', {
          'animate-pulse bg-green-400': isConnected,
          'bg-red-400': !isConnected
        })}
      />
      <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
        {isConnected ? 'Connected' : 'Disconnected'}
      </span>
    </div>

    {isConnected && (
      <>
        <div className="text-blue-400">{metrics.latency.toFixed(1)}ms</div>
        <div className="text-purple-400">{metrics.messagesPerSecond.toFixed(1)}/s</div>
        <div className="text-yellow-400">{metrics.totalMessages} msgs</div>
      </>
    )}
  </div>
)

/**
 * Performance metrics display
 */
const PerformanceMetrics: React.FC<{
  metrics: PerformanceState
  wsMetrics: any
  className?: string
}> = ({metrics, wsMetrics, className}) => (
  <div className={cn('space-y-1 rounded bg-black/50 p-2 text-xs', className)}>
    <div className="font-medium text-green-400">Performance Metrics</div>
    <div className="grid grid-cols-2 gap-2 text-gray-300">
      <div>
        Latency: <span className="text-blue-400">{metrics.latency.toFixed(2)}ms</span>
      </div>
      <div>
        Render: <span className="text-purple-400">{metrics.renderTime.toFixed(2)}ms</span>
      </div>
      <div>
        Rate: <span className="text-yellow-400">{metrics.messagesPerSecond.toFixed(1)}/s</span>
      </div>
      <div>
        Total: <span className="text-cyan-400">{metrics.totalMessages}</span>
      </div>
      <div>
        Pool Lat:{' '}
        <span className="text-green-400">{wsMetrics.poolAverageLatency?.toFixed(2)}ms</span>
      </div>
      <div>
        Conns: <span className="text-orange-400">{wsMetrics.connectionCount}</span>
      </div>
    </div>
    {metrics.errors > 0 && <div className="text-red-400">Errors: {metrics.errors}</div>}
  </div>
)

/**
 * Main ZeroLatencyTranscription component
 */
export const ZeroLatencyTranscription: React.FC<ZeroLatencyTranscriptionProps> = ({
  websocketUrl = 'ws://localhost:8080',
  autoConnect = true,
  useUltraOptimized = true,
  enableMetrics = false,
  maxBuffer = 1000,
  showConnectionStatus = true,
  showMetrics = false,
  className,
  onTranscriptionUpdate,
  onPerformanceUpdate,
  onError
}) => {
  const [isConnected, setIsConnected] = useState(false)
  const [wsMetrics, setWsMetrics] = useState<any>({})

  // Initialize WebSocket manager
  const websocketManager = useMemo(() => {
    return getUltraFastWebSocketManager({
      url: websocketUrl,
      maxConnections: 3,
      batchDelay: 5, // Ultra-fast 5ms batching
      enableBinaryMode: true,
      enableCompression: true
    })
  }, [websocketUrl])

  // Use custom hook for transcription state
  const {transcription, performance, isPending, updateTranscription} =
    useZeroLatencyTranscription(websocketManager)

  // Use deferred value for smooth updates
  const deferredText = useDeferredValue(transcription.currentText)

  // Handle connection management
  useEffect(() => {
    const handleConnected = () => {
      setIsConnected(true)
      console.log('✅ ZeroLatencyTranscription: Connected')
    }

    const handleDisconnected = () => {
      setIsConnected(false)
      console.log('🔌 ZeroLatencyTranscription: Disconnected')
    }

    const handleError = (error: any) => {
      console.error('❌ ZeroLatencyTranscription: Error:', error)
      onError?.(error)
    }

    websocketManager.on('connected', handleConnected)
    websocketManager.on('disconnected', handleDisconnected)
    websocketManager.on('error', handleError)

    // Auto-connect if enabled
    if (autoConnect) {
      websocketManager.connect().catch(onError)
    }

    return () => {
      websocketManager.off('connected', handleConnected)
      websocketManager.off('disconnected', handleDisconnected)
      websocketManager.off('error', handleError)
    }
  }, [websocketManager, autoConnect, onError])

  // Update metrics periodically
  useEffect(() => {
    const metricsInterval = setInterval(() => {
      const newWsMetrics = websocketManager.getPerformanceMetrics()
      setWsMetrics(newWsMetrics)

      const combinedMetrics = {
        ...performance,
        ...newWsMetrics
      }

      onPerformanceUpdate?.(combinedMetrics)
    }, 100) // Update every 100ms

    return () => clearInterval(metricsInterval)
  }, [websocketManager, performance, onPerformanceUpdate])

  // Handle transcription updates
  useEffect(() => {
    onTranscriptionUpdate?.(transcription.currentText, transcription.isPartial)
  }, [transcription.currentText, transcription.isPartial, onTranscriptionUpdate])

  // Render performance callback
  const handleRenderPerformance = useCallback((renderMetrics: any) => {
    setPerformance(prev => ({
      ...prev,
      renderTime: renderMetrics.renderTime
    }))
  }, [])

  // Manual connection controls
  const handleConnect = useCallback(async () => {
    try {
      await websocketManager.connect()
    } catch (error) {
      onError?.(error as Error)
    }
  }, [websocketManager, onError])

  const handleDisconnect = useCallback(() => {
    websocketManager.disconnect()
  }, [websocketManager])

  // Test transcription simulation
  const handleTestTranscription = useCallback(() => {
    const testTexts = [
      'This is a test transcription...',
      'Testing ultra-fast rendering...',
      'Zero latency transcription system working...',
      'Performance optimization complete!'
    ]

    testTexts.forEach((text, index) => {
      setTimeout(() => {
        websocketManager.simulateTranscription(text, index < testTexts.length - 1)
      }, index * 500)
    })
  }, [websocketManager])

  return (
    <div className={cn('zero-latency-transcription relative', className)}>
      {/* Header with status and controls */}
      <div className="mb-4 flex items-center justify-between">
        {showConnectionStatus && (
          <ConnectionStatus isConnected={isConnected} metrics={performance} />
        )}

        {/* Connection controls */}
        <div className="flex items-center space-x-2">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              className="rounded bg-green-600 px-3 py-1 text-xs text-white transition-colors hover:bg-green-700"
            >
              Connect
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="rounded bg-red-600 px-3 py-1 text-xs text-white transition-colors hover:bg-red-700"
            >
              Disconnect
            </button>
          )}

          <button
            onClick={handleTestTranscription}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white transition-colors hover:bg-blue-700"
            disabled={!isConnected}
          >
            Test
          </button>
        </div>
      </div>

      {/* Main transcription display */}
      <div
        className={cn('relative min-h-[200px]', {
          'opacity-90': isPending
        })}
      >
        {useUltraOptimized ? (
          <UltraOptimizedTranscriptionRenderer
            text={deferredText}
            isPartial={transcription.isPartial}
            isActive={transcription.isActive}
            showMetrics={enableMetrics}
            onUpdate={handleRenderPerformance}
            className="ultra-fast-renderer"
          />
        ) : (
          <InstantTranscriptionRenderer
            text={deferredText}
            isPartial={transcription.isPartial}
            isActive={transcription.isActive}
            showMetrics={enableMetrics}
            onUpdate={handleRenderPerformance}
            className="instant-renderer"
          />
        )}
      </div>

      {/* Performance metrics overlay */}
      {showMetrics && (
        <div className="absolute right-0 top-0 z-10">
          <PerformanceMetrics metrics={performance} wsMetrics={wsMetrics} />
        </div>
      )}

      {/* Performance indicator */}
      {performance.latency > 0 && (
        <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
          <div>Last update: {performance.latency.toFixed(2)}ms ago</div>
          <div
            className={cn('font-medium', {
              'text-green-400': performance.latency < 50,
              'text-yellow-400': performance.latency >= 50 && performance.latency < 100,
              'text-red-400': performance.latency >= 100
            })}
          >
            {performance.latency < 50 ? 'Ultra Fast' : performance.latency < 100 ? 'Fast' : 'Slow'}
          </div>
        </div>
      )}
    </div>
  )
}

export default ZeroLatencyTranscription
