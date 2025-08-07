/**
 * React Hook for Optimized WebSocket Transcription
 * Provides easy integration with the optimized WebSocket service
 */

import {useEffect, useRef, useState, useCallback} from 'react'
import {
  OptimizedTranscriptionWebSocket,
  type OptimizedWebSocketConfig,
  type ConnectionMetrics,
  WebSocketState
} from '../services/optimized-transcription-websocket'

export interface UseOptimizedWebSocketOptions {
  autoConnect?: boolean
  autoReconnect?: boolean
  enableLogging?: boolean
  onTranscription?: (data: TranscriptionData) => void
  onError?: (error: any) => void
  onStateChange?: (state: WebSocketState) => void
}

export interface TranscriptionData {
  text: string
  confidence?: number
  isPartial?: boolean
  timestamp: number
}

export interface WebSocketHookResult {
  state: WebSocketState
  metrics: ConnectionMetrics | null
  connect: () => Promise<void>
  disconnect: () => void
  sendAudio: (audioData: Float32Array | ArrayBuffer) => void
  isConnected: boolean
  isConnecting: boolean
  hasError: boolean
  errorMessage: string | null
}

export const useOptimizedWebSocket = (
  config: OptimizedWebSocketConfig,
  options: UseOptimizedWebSocketOptions = {}
): WebSocketHookResult => {
  const {
    autoConnect = false,
    autoReconnect = true,
    enableLogging = true,
    onTranscription,
    onError,
    onStateChange
  } = options

  const [state, setState] = useState<WebSocketState>(WebSocketState.DISCONNECTED)
  const [metrics, setMetrics] = useState<ConnectionMetrics | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const wsRef = useRef<OptimizedTranscriptionWebSocket | null>(null)
  const configRef = useRef(config)

  // Update config reference when it changes
  useEffect(() => {
    configRef.current = config
  }, [config])

  /**
   * Initialize WebSocket service
   */
  const initializeWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.destroy()
    }

    const ws = new OptimizedTranscriptionWebSocket({
      ...configRef.current,
      reconnectAttempts: autoReconnect ? configRef.current.reconnectAttempts || 5 : 0
    })

    // Event listeners
    ws.on('connected', (connectionMetrics: ConnectionMetrics) => {
      setState(WebSocketState.CONNECTED)
      setMetrics(connectionMetrics)
      setErrorMessage(null)

      if (enableLogging) {
        console.log('🔌 WebSocket connected with metrics:', connectionMetrics)
      }
    })

    ws.on('disconnected', (event: CloseEvent) => {
      setState(WebSocketState.DISCONNECTED)

      if (enableLogging) {
        console.log('🔌 WebSocket disconnected:', event.reason)
      }
    })

    ws.on('transcription', (data: TranscriptionData) => {
      if (enableLogging && !data.isPartial) {
        console.log('📝 Transcription:', data.text)
      }

      onTranscription?.(data)
    })

    ws.on('error', (error: any) => {
      setState(WebSocketState.ERROR)
      setErrorMessage(error?.message || 'WebSocket error occurred')

      if (enableLogging) {
        console.error('❌ WebSocket error:', error)
      }

      onError?.(error)
    })

    ws.on('ready', () => {
      if (enableLogging) {
        console.log('✅ WebSocket ready for transcription')
      }
    })

    wsRef.current = ws
    return ws
  }, [autoReconnect, enableLogging, onTranscription, onError])

  /**
   * Connect to WebSocket
   */
  const connect = useCallback(async () => {
    if (!wsRef.current) {
      initializeWebSocket()
    }

    if (
      wsRef.current &&
      state !== WebSocketState.CONNECTED &&
      state !== WebSocketState.CONNECTING
    ) {
      setState(WebSocketState.CONNECTING)
      setErrorMessage(null)

      try {
        await wsRef.current.connect()
      } catch (error) {
        setState(WebSocketState.ERROR)
        setErrorMessage(error instanceof Error ? error.message : 'Connection failed')
        throw error
      }
    }
  }, [state, initializeWebSocket])

  /**
   * Disconnect from WebSocket
   */
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.disconnect()
      setState(WebSocketState.DISCONNECTED)
      setErrorMessage(null)
    }
  }, [])

  /**
   * Send audio data
   */
  const sendAudio = useCallback(
    (audioData: Float32Array | ArrayBuffer) => {
      if (wsRef.current && state === WebSocketState.CONNECTED) {
        wsRef.current.sendAudioData(audioData)
      } else if (enableLogging) {
        console.warn('Cannot send audio: WebSocket not connected')
      }
    },
    [state, enableLogging]
  )

  /**
   * Update metrics periodically
   */
  useEffect(() => {
    const updateMetrics = () => {
      if (wsRef.current && state === WebSocketState.CONNECTED) {
        const currentMetrics = wsRef.current.getMetrics()
        setMetrics(currentMetrics)
      }
    }

    const interval = setInterval(updateMetrics, 1000)
    return () => clearInterval(interval)
  }, [state])

  /**
   * Notify state changes
   */
  useEffect(() => {
    onStateChange?.(state)
  }, [state, onStateChange])

  /**
   * Auto-connect on mount if enabled
   */
  useEffect(() => {
    if (autoConnect) {
      connect().catch(error => {
        if (enableLogging) {
          console.error('Auto-connect failed:', error)
        }
      })
    }

    // Initialize WebSocket even if not auto-connecting
    if (!wsRef.current) {
      initializeWebSocket()
    }
  }, [autoConnect, connect, enableLogging, initializeWebSocket])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.destroy()
        wsRef.current = null
      }
    }
  }, [])

  // Derived state
  const isConnected = state === WebSocketState.CONNECTED
  const isConnecting = state === WebSocketState.CONNECTING
  const hasError = state === WebSocketState.ERROR

  return {
    state,
    metrics,
    connect,
    disconnect,
    sendAudio,
    isConnected,
    isConnecting,
    hasError,
    errorMessage
  }
}

/**
 * Hook for WebSocket metrics monitoring
 */
export const useWebSocketMetrics = (ws: WebSocketHookResult) => {
  const [performanceData, setPerformanceData] = useState({
    averageLatency: 0,
    messagesPerSecond: 0,
    errorRate: 0,
    connectionUptime: 0
  })

  useEffect(() => {
    if (ws.metrics) {
      setPerformanceData({
        averageLatency: ws.metrics.averageLatency,
        messagesPerSecond: ws.metrics.messagesPerSecond,
        errorRate: ws.metrics.errorRate * 100, // Convert to percentage
        connectionUptime: Date.now() - (ws.metrics.connectionTime || 0)
      })
    }
  }, [ws.metrics])

  const getPerformanceStatus = () => {
    const {averageLatency, errorRate} = performanceData

    if (errorRate > 5) return 'poor'
    if (averageLatency > 500) return 'slow'
    if (averageLatency > 200) return 'good'
    return 'excellent'
  }

  const getRecommendations = () => {
    const recommendations: string[] = []
    const {averageLatency, errorRate, messagesPerSecond} = performanceData

    if (averageLatency > 300) {
      recommendations.push('High latency detected - check network connection')
    }

    if (errorRate > 3) {
      recommendations.push('High error rate - consider connection pooling')
    }

    if (messagesPerSecond < 1 && ws.isConnected) {
      recommendations.push('Low message throughput - check audio processing')
    }

    return recommendations
  }

  return {
    performanceData,
    performanceStatus: getPerformanceStatus(),
    recommendations: getRecommendations()
  }
}

/**
 * Component for displaying WebSocket connection status
 */
export interface WebSocketStatusProps {
  websocket: WebSocketHookResult
  showMetrics?: boolean
  compact?: boolean
}

export const WebSocketStatus: React.FC<WebSocketStatusProps> = ({
  websocket,
  showMetrics = true,
  compact = false
}) => {
  const metrics = useWebSocketMetrics(websocket)

  const getStatusColor = () => {
    switch (websocket.state) {
      case WebSocketState.CONNECTED:
        return '#28a745'
      case WebSocketState.CONNECTING:
        return '#ffc107'
      case WebSocketState.RECONNECTING:
        return '#fd7e14'
      case WebSocketState.ERROR:
        return '#dc3545'
      default:
        return '#6c757d'
    }
  }

  const getStatusIcon = () => {
    switch (websocket.state) {
      case WebSocketState.CONNECTED:
        return '🟢'
      case WebSocketState.CONNECTING:
        return '🟡'
      case WebSocketState.RECONNECTING:
        return '🟠'
      case WebSocketState.ERROR:
        return '🔴'
      default:
        return '⚫'
    }
  }

  if (compact) {
    return (
      <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
        <span>{getStatusIcon()}</span>
        <span style={{color: getStatusColor(), fontWeight: 'bold'}}>
          {websocket.state.toUpperCase()}
        </span>
        {websocket.metrics && (
          <span style={{fontSize: '12px', color: '#6c757d'}}>
            {websocket.metrics.averageLatency.toFixed(0)}ms
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        padding: '12px',
        backgroundColor: '#f8f9fa'
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
        <span style={{fontSize: '18px'}}>{getStatusIcon()}</span>
        <strong style={{color: getStatusColor()}}>{websocket.state.toUpperCase()}</strong>
        {websocket.errorMessage && (
          <span style={{color: '#dc3545', fontSize: '12px'}}>{websocket.errorMessage}</span>
        )}
      </div>

      {showMetrics && websocket.metrics && (
        <div style={{fontSize: '12px', color: '#6c757d'}}>
          <div>Latency: {websocket.metrics.averageLatency.toFixed(1)}ms</div>
          <div>Throughput: {websocket.metrics.messagesPerSecond.toFixed(1)} msg/s</div>
          <div>Error Rate: {(websocket.metrics.errorRate * 100).toFixed(1)}%</div>
          <div>Performance: {metrics.performanceStatus}</div>
        </div>
      )}

      {metrics.recommendations.length > 0 && (
        <div style={{marginTop: '8px', fontSize: '11px', color: '#fd7e14'}}>
          💡 {metrics.recommendations[0]}
        </div>
      )}
    </div>
  )
}
