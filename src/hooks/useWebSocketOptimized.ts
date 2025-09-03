/**
 * WebSocket Performance Optimization Hook
 * 
 * Provides performance monitoring, connection management, and automatic
 * optimization for WebSocket-based answer streaming.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import EnhancedWebSocketManager, { ConnectionState, WebSocketConfig, WebSocketMessage } from '../services/EnhancedWebSocketManager'

export interface WebSocketPerformanceMetrics {
  // Connection metrics
  connectionUptime: number
  reconnectionCount: number
  currentLatency: number
  averageLatency: number
  connectionStability: number // 0-1 score
  
  // Message metrics
  messagesSent: number
  messagesReceived: number
  messageThroughput: number // messages per second
  averageMessageSize: number
  queueUtilization: number // 0-1 queue usage
  
  // Performance scores
  overallPerformance: number // 0-1 composite score
  connectionQuality: 'poor' | 'fair' | 'good' | 'excellent'
  
  // Error metrics
  errorRate: number
  lastError?: Error
}

export interface WebSocketOptimizationSuggestions {
  reconnectionStrategy: 'aggressive' | 'conservative' | 'adaptive'
  messageBuffering: boolean
  compressionEnabled: boolean
  heartbeatInterval: number
  maxQueueSize: number
}

export interface UseWebSocketOptimizedOptions extends Partial<WebSocketConfig> {
  // Performance options
  enableAutoOptimization: boolean
  performanceThreshold: number // minimum acceptable performance (0-1)
  latencyThreshold: number // maximum acceptable latency (ms)
  
  // Monitoring options
  metricsUpdateInterval: number
  enablePerformanceLogging: boolean
  
  // Adaptive options
  adaptiveReconnection: boolean
  adaptiveBatching: boolean
  adaptiveCompression: boolean
}

const DEFAULT_OPTIONS: UseWebSocketOptimizedOptions = {
  url: '',
  maxReconnectAttempts: 5,
  reconnectInterval: 1000,
  maxReconnectInterval: 30000,
  reconnectDecay: 1.5,
  connectionTimeout: 10000,
  heartbeatInterval: 30000,
  maxQueueSize: 100,
  maxMessageSize: 1024 * 1024,
  enableCompression: true,
  batchMessages: false,
  batchTimeout: 100,
  
  enableAutoOptimization: true,
  performanceThreshold: 0.7,
  latencyThreshold: 1000,
  metricsUpdateInterval: 5000,
  enablePerformanceLogging: false,
  adaptiveReconnection: true,
  adaptiveBatching: true,
  adaptiveCompression: true
}

export function useWebSocketOptimized(options: Partial<UseWebSocketOptimizedOptions> = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  // State
  const [isConnected, setIsConnected] = useState(false)
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    reconnectCount: 0
  })
  const [metrics, setMetrics] = useState<WebSocketPerformanceMetrics | null>(null)
  const [suggestions, setSuggestions] = useState<WebSocketOptimizationSuggestions | null>(null)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  
  // Refs
  const wsManager = useRef<EnhancedWebSocketManager | null>(null)
  const metricsHistory = useRef<WebSocketPerformanceMetrics[]>([])
  const latencyHistory = useRef<number[]>([])
  const connectionHistory = useRef<{ timestamp: number; connected: boolean }[]>([])
  const optimizationTimer = useRef<NodeJS.Timeout | null>(null)

  // Initialize WebSocket manager
  useEffect(() => {
    wsManager.current = new EnhancedWebSocketManager(opts)
    
    // Connection state handler
    wsManager.current.on('connection-state-change', (state: ConnectionState) => {
      setConnectionState(state)
      setIsConnected(state.status === 'connected')
      
      // Track connection history for stability calculation
      connectionHistory.current.push({
        timestamp: Date.now(),
        connected: state.status === 'connected'
      })
      
      // Keep only last hour of connection history
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      connectionHistory.current = connectionHistory.current.filter(
        entry => entry.timestamp > oneHourAgo
      )
      
      // Track latency history
      if (state.latency) {
        latencyHistory.current.push(state.latency)
        // Keep only last 100 latency measurements
        if (latencyHistory.current.length > 100) {
          latencyHistory.current = latencyHistory.current.slice(-100)
        }
      }
    })
    
    // Message handler
    wsManager.current.on('message', (message: WebSocketMessage) => {
      setLastMessage(message)
    })
    
    // Error handler
    wsManager.current.on('error', (error: Error) => {
      if (opts.enablePerformanceLogging) {
        console.error('WebSocket error:', error)
      }
    })
    
    return () => {
      wsManager.current?.destroy()
      if (optimizationTimer.current) {
        clearInterval(optimizationTimer.current)
      }
    }
  }, [])

  // Metrics calculation and optimization
  useEffect(() => {
    if (!wsManager.current) return
    
    const updateMetrics = () => {
      const rawMetrics = wsManager.current!.getPerformanceMetrics()
      const now = Date.now()
      
      // Calculate derived metrics
      const averageLatency = latencyHistory.current.length > 0
        ? latencyHistory.current.reduce((sum, lat) => sum + lat, 0) / latencyHistory.current.length
        : 0
      
      // Calculate connection stability (percentage of time connected in last hour)
      const connectionStability = connectionHistory.current.length > 0
        ? connectionHistory.current.filter(entry => entry.connected).length / connectionHistory.current.length
        : 0
      
      // Calculate queue utilization
      const queueUtilization = rawMetrics.queueSize / opts.maxQueueSize!
      
      // Calculate error rate (errors per minute)
      const errorRate = connectionState.lastError ? 
        (connectionState.reconnectCount / (rawMetrics.uptime / 60000)) : 0
      
      // Calculate performance scores
      const latencyScore = Math.max(0, 1 - (averageLatency / opts.latencyThreshold!))
      const stabilityScore = connectionStability
      const throughputScore = Math.min(1, rawMetrics.messagesPerSecond / 10) // Assume 10 msg/sec is ideal
      const queueScore = 1 - queueUtilization
      
      const overallPerformance = (latencyScore + stabilityScore + throughputScore + queueScore) / 4
      
      // Determine connection quality
      let connectionQuality: 'poor' | 'fair' | 'good' | 'excellent'
      if (overallPerformance > 0.8) connectionQuality = 'excellent'
      else if (overallPerformance > 0.6) connectionQuality = 'good'
      else if (overallPerformance > 0.4) connectionQuality = 'fair'
      else connectionQuality = 'poor'
      
      const newMetrics: WebSocketPerformanceMetrics = {
        connectionUptime: rawMetrics.uptime,
        reconnectionCount: connectionState.reconnectCount,
        currentLatency: connectionState.latency || 0,
        averageLatency,
        connectionStability,
        messagesSent: rawMetrics.sentMessageCount,
        messagesReceived: rawMetrics.receivedMessageCount,
        messageThroughput: rawMetrics.messagesPerSecond,
        averageMessageSize: rawMetrics.averageMessageSize,
        queueUtilization,
        overallPerformance,
        connectionQuality,
        errorRate,
        lastError: connectionState.lastError
      }
      
      setMetrics(newMetrics)
      
      // Add to history
      metricsHistory.current.push(newMetrics)
      if (metricsHistory.current.length > 100) {
        metricsHistory.current = metricsHistory.current.slice(-100)
      }
      
      // Generate optimization suggestions
      if (opts.enableAutoOptimization) {
        generateOptimizationSuggestions(newMetrics)
      }
    }
    
    // Update metrics immediately and then on interval
    updateMetrics()
    
    const interval = setInterval(updateMetrics, opts.metricsUpdateInterval)
    return () => clearInterval(interval)
  }, [connectionState, opts.metricsUpdateInterval, opts.enableAutoOptimization])

  // Generate optimization suggestions based on performance metrics
  const generateOptimizationSuggestions = useCallback((currentMetrics: WebSocketPerformanceMetrics) => {
    const suggestions: WebSocketOptimizationSuggestions = {
      reconnectionStrategy: 'adaptive',
      messageBuffering: false,
      compressionEnabled: opts.enableCompression!,
      heartbeatInterval: opts.heartbeatInterval!,
      maxQueueSize: opts.maxQueueSize!
    }
    
    // Adaptive reconnection strategy
    if (opts.adaptiveReconnection) {
      if (currentMetrics.connectionStability < 0.8) {
        suggestions.reconnectionStrategy = 'aggressive'
      } else if (currentMetrics.connectionStability > 0.95) {
        suggestions.reconnectionStrategy = 'conservative'
      }
    }
    
    // Adaptive message buffering
    if (opts.adaptiveBatching && currentMetrics.messageThroughput > 5) {
      suggestions.messageBuffering = true
    }
    
    // Adaptive compression
    if (opts.adaptiveCompression && currentMetrics.averageMessageSize > 1000) {
      suggestions.compressionEnabled = true
    }
    
    // Adjust heartbeat based on connection stability
    if (currentMetrics.connectionStability < 0.9) {
      suggestions.heartbeatInterval = Math.max(10000, opts.heartbeatInterval! / 2)
    } else if (currentMetrics.connectionStability > 0.98) {
      suggestions.heartbeatInterval = Math.min(60000, opts.heartbeatInterval! * 1.5)
    }
    
    // Adjust queue size based on utilization
    if (currentMetrics.queueUtilization > 0.8) {
      suggestions.maxQueueSize = Math.min(500, opts.maxQueueSize! * 1.5)
    } else if (currentMetrics.queueUtilization < 0.2) {
      suggestions.maxQueueSize = Math.max(50, opts.maxQueueSize! * 0.8)
    }
    
    setSuggestions(suggestions)
    
    // Auto-apply optimizations if performance is below threshold
    if (currentMetrics.overallPerformance < opts.performanceThreshold!) {
      applyOptimizations(suggestions)
    }
  }, [opts])

  // Apply optimization suggestions
  const applyOptimizations = useCallback((optimizations: WebSocketOptimizationSuggestions) => {
    if (!wsManager.current) return
    
    // Note: In a real implementation, you would need to recreate the WebSocket manager
    // with new configuration. For now, we'll just log the suggestions.
    if (opts.enablePerformanceLogging) {
      console.log('Applying WebSocket optimizations:', optimizations)
    }
    
    // This is where you would implement the actual optimization application
    // For example, reconnecting with new configuration parameters
  }, [opts.enablePerformanceLogging])

  // Public API methods
  const connect = useCallback(async () => {
    if (!wsManager.current) return
    try {
      await wsManager.current.connect()
    } catch (error) {
      if (opts.enablePerformanceLogging) {
        console.error('Connection failed:', error)
      }
      throw error
    }
  }, [opts.enablePerformanceLogging])

  const disconnect = useCallback(() => {
    wsManager.current?.disconnect()
  }, [])

  const sendMessage = useCallback(async (type: string, data: any, messageOptions?: Partial<WebSocketMessage>) => {
    if (!wsManager.current) {
      throw new Error('WebSocket manager not initialized')
    }
    
    try {
      await wsManager.current.sendMessage(type, data, messageOptions)
    } catch (error) {
      if (opts.enablePerformanceLogging) {
        console.error('Send message failed:', error)
      }
      throw error
    }
  }, [opts.enablePerformanceLogging])

  const getDetailedMetrics = useCallback(() => {
    return {
      current: metrics,
      history: [...metricsHistory.current],
      suggestions: suggestions,
      connectionHistory: [...connectionHistory.current],
      latencyHistory: [...latencyHistory.current]
    }
  }, [metrics, suggestions])

  const forceOptimization = useCallback(() => {
    if (metrics) {
      generateOptimizationSuggestions(metrics)
    }
  }, [metrics, generateOptimizationSuggestions])

  return {
    // Connection state
    isConnected,
    connectionState,
    
    // Metrics and performance
    metrics,
    suggestions,
    getDetailedMetrics,
    
    // Methods
    connect,
    disconnect,
    sendMessage,
    forceOptimization,
    applyOptimizations,
    
    // Last received message
    lastMessage
  }
}

export default useWebSocketOptimized