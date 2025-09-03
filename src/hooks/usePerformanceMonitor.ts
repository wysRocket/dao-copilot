/**
 * Answer Display Performance Monitor
 * 
 * Custom React hook for monitoring performance metrics of the real-time answer display system.
 * Tracks WebSocket latency, rendering performance, and memory usage.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export interface PerformanceMetrics {
  // WebSocket metrics
  connectionLatency: number
  messageLatency: number
  reconnectionCount: number
  messageQueueSize: number
  
  // Rendering metrics
  renderTime: number
  frameDrops: number
  memoryUsage: number
  
  // Answer display metrics
  answerStreamingRate: number // chars per second
  searchResponseTime: number
  totalAnswerTime: number
  
  // Error metrics
  errorCount: number
  lastErrorTime?: number
}

export interface PerformanceConfig {
  // Measurement intervals
  metricsInterval: number // ms
  latencyThreshold: number // ms
  memoryThreshold: number // MB
  
  // Sampling settings
  sampleSize: number
  enableDetailedMetrics: boolean
  
  // Thresholds for warnings
  maxFrameDrops: number
  maxReconnections: number
  maxErrorRate: number // errors per minute
}

export interface PerformanceAlert {
  type: 'warning' | 'error' | 'info'
  message: string
  metric: keyof PerformanceMetrics
  value: number
  threshold?: number
  timestamp: number
}

const defaultConfig: PerformanceConfig = {
  metricsInterval: 1000,
  latencyThreshold: 100,
  memoryThreshold: 50,
  sampleSize: 10,
  enableDetailedMetrics: true,
  maxFrameDrops: 5,
  maxReconnections: 3,
  maxErrorRate: 5
}

export function usePerformanceMonitor(config: Partial<PerformanceConfig> = {}) {
  const finalConfig = { ...defaultConfig, ...config }
  
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    connectionLatency: 0,
    messageLatency: 0,
    reconnectionCount: 0,
    messageQueueSize: 0,
    renderTime: 0,
    frameDrops: 0,
    memoryUsage: 0,
    answerStreamingRate: 0,
    searchResponseTime: 0,
    totalAnswerTime: 0,
    errorCount: 0
  })
  
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  
  // Refs for tracking metrics
  const metricsRef = useRef<PerformanceMetrics>(metrics)
  const samplesRef = useRef<Map<string, number[]>>(new Map())
  const timersRef = useRef<Map<string, number>>(new Map())
  const intervalRef = useRef<NodeJS.Timeout>()
  
  // Update metrics ref when state changes
  useEffect(() => {
    metricsRef.current = metrics
  }, [metrics])

  // Start performance monitoring
  const startMonitoring = useCallback(() => {
    if (isMonitoring) return
    
    setIsMonitoring(true)
    
    intervalRef.current = setInterval(() => {
      if (finalConfig.enableDetailedMetrics) {
        updateDetailedMetrics()
      }
      updateBasicMetrics()
      checkThresholds()
    }, finalConfig.metricsInterval)
  }, [isMonitoring, finalConfig])

  // Stop performance monitoring
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }
    setIsMonitoring(false)
  }, [])

  // Update basic performance metrics
  const updateBasicMetrics = useCallback(() => {
    const newMetrics = { ...metricsRef.current }
    
    // Memory usage (if available)
    if ('memory' in performance && (performance as any).memory) {
      const memInfo = (performance as any).memory
      newMetrics.memoryUsage = Math.round(memInfo.usedJSHeapSize / 1024 / 1024) // MB
    }
    
    setMetrics(newMetrics)
  }, [])

  // Update detailed performance metrics
  const updateDetailedMetrics = useCallback(() => {
    // Frame timing metrics
    if ('getEntriesByType' in performance) {
      const navigationEntries = performance.getEntriesByType('navigation')
      const paintEntries = performance.getEntriesByType('paint')
      
      // Calculate render time from paint entries
      if (paintEntries.length > 0) {
        const firstPaint = paintEntries.find(entry => entry.name === 'first-contentful-paint')
        if (firstPaint) {
          addSample('renderTime', firstPaint.startTime)
        }
      }
    }
  }, [])

  // Add sample to metrics history
  const addSample = useCallback((metric: string, value: number) => {
    const samples = samplesRef.current.get(metric) || []
    samples.push(value)
    
    if (samples.length > finalConfig.sampleSize) {
      samples.shift()
    }
    
    samplesRef.current.set(metric, samples)
  }, [finalConfig.sampleSize])

  // Calculate average from samples
  const getAverageFromSamples = useCallback((metric: string): number => {
    const samples = samplesRef.current.get(metric) || []
    if (samples.length === 0) return 0
    
    return samples.reduce((sum, value) => sum + value, 0) / samples.length
  }, [])

  // Check performance thresholds and generate alerts
  const checkThresholds = useCallback(() => {
    const newAlerts: PerformanceAlert[] = []
    const current = metricsRef.current
    
    // Check latency threshold
    if (current.messageLatency > finalConfig.latencyThreshold) {
      newAlerts.push({
        type: 'warning',
        message: `High message latency detected: ${current.messageLatency}ms`,
        metric: 'messageLatency',
        value: current.messageLatency,
        threshold: finalConfig.latencyThreshold,
        timestamp: Date.now()
      })
    }
    
    // Check memory threshold
    if (current.memoryUsage > finalConfig.memoryThreshold) {
      newAlerts.push({
        type: 'warning',
        message: `High memory usage: ${current.memoryUsage}MB`,
        metric: 'memoryUsage',
        value: current.memoryUsage,
        threshold: finalConfig.memoryThreshold,
        timestamp: Date.now()
      })
    }
    
    // Check frame drops
    if (current.frameDrops > finalConfig.maxFrameDrops) {
      newAlerts.push({
        type: 'warning',
        message: `High frame drops detected: ${current.frameDrops}`,
        metric: 'frameDrops',
        value: current.frameDrops,
        threshold: finalConfig.maxFrameDrops,
        timestamp: Date.now()
      })
    }
    
    // Check reconnection count
    if (current.reconnectionCount > finalConfig.maxReconnections) {
      newAlerts.push({
        type: 'error',
        message: `Excessive reconnections: ${current.reconnectionCount}`,
        metric: 'reconnectionCount',
        value: current.reconnectionCount,
        threshold: finalConfig.maxReconnections,
        timestamp: Date.now()
      })
    }
    
    if (newAlerts.length > 0) {
      setAlerts(prev => [...prev, ...newAlerts].slice(-20)) // Keep last 20 alerts
    }
  }, [finalConfig])

  // Metric tracking functions
  const trackWebSocketLatency = useCallback((startTime: number, endTime: number) => {
    const latency = endTime - startTime
    addSample('messageLatency', latency)
    
    setMetrics(prev => ({
      ...prev,
      messageLatency: getAverageFromSamples('messageLatency')
    }))
  }, [addSample, getAverageFromSamples])

  const trackConnectionLatency = useCallback((latency: number) => {
    addSample('connectionLatency', latency)
    
    setMetrics(prev => ({
      ...prev,
      connectionLatency: getAverageFromSamples('connectionLatency')
    }))
  }, [addSample, getAverageFromSamples])

  const trackReconnection = useCallback(() => {
    setMetrics(prev => ({
      ...prev,
      reconnectionCount: prev.reconnectionCount + 1
    }))
  }, [])

  const trackError = useCallback((error?: Error) => {
    setMetrics(prev => ({
      ...prev,
      errorCount: prev.errorCount + 1,
      lastErrorTime: Date.now()
    }))
  }, [])

  const trackAnswerStreaming = useCallback((charsReceived: number, timeElapsed: number) => {
    const rate = charsReceived / (timeElapsed / 1000) // chars per second
    addSample('answerStreamingRate', rate)
    
    setMetrics(prev => ({
      ...prev,
      answerStreamingRate: getAverageFromSamples('answerStreamingRate')
    }))
  }, [addSample, getAverageFromSamples])

  const trackSearchResponse = useCallback((responseTime: number) => {
    addSample('searchResponseTime', responseTime)
    
    setMetrics(prev => ({
      ...prev,
      searchResponseTime: getAverageFromSamples('searchResponseTime')
    }))
  }, [addSample, getAverageFromSamples])

  const trackAnswerComplete = useCallback((totalTime: number) => {
    addSample('totalAnswerTime', totalTime)
    
    setMetrics(prev => ({
      ...prev,
      totalAnswerTime: getAverageFromSamples('totalAnswerTime')
    }))
  }, [addSample, getAverageFromSamples])

  const updateMessageQueueSize = useCallback((size: number) => {
    setMetrics(prev => ({
      ...prev,
      messageQueueSize: size
    }))
  }, [])

  // Clear alerts
  const clearAlerts = useCallback(() => {
    setAlerts([])
  }, [])

  // Reset metrics
  const resetMetrics = useCallback(() => {
    setMetrics({
      connectionLatency: 0,
      messageLatency: 0,
      reconnectionCount: 0,
      messageQueueSize: 0,
      renderTime: 0,
      frameDrops: 0,
      memoryUsage: 0,
      answerStreamingRate: 0,
      searchResponseTime: 0,
      totalAnswerTime: 0,
      errorCount: 0
    })
    samplesRef.current.clear()
    timersRef.current.clear()
    clearAlerts()
  }, [clearAlerts])

  // Get performance summary
  const getPerformanceSummary = useCallback(() => {
    const current = metricsRef.current
    
    return {
      status: current.errorCount > 0 ? 'error' : 
              alerts.filter(a => a.type === 'warning').length > 0 ? 'warning' : 'good',
      score: Math.max(0, 100 - 
        (current.messageLatency > finalConfig.latencyThreshold ? 20 : 0) -
        (current.memoryUsage > finalConfig.memoryThreshold ? 20 : 0) -
        (current.frameDrops > finalConfig.maxFrameDrops ? 15 : 0) -
        (current.reconnectionCount > finalConfig.maxReconnections ? 25 : 0) -
        (current.errorCount > 0 ? 20 : 0)
      ),
      recommendations: generateRecommendations(current, finalConfig)
    }
  }, [alerts, finalConfig])

  // Generate performance recommendations
  const generateRecommendations = useCallback((
    metrics: PerformanceMetrics, 
    config: PerformanceConfig
  ): string[] => {
    const recommendations: string[] = []
    
    if (metrics.messageLatency > config.latencyThreshold) {
      recommendations.push('Consider reducing WebSocket message frequency or size')
    }
    
    if (metrics.memoryUsage > config.memoryThreshold) {
      recommendations.push('Memory usage is high. Consider clearing old answer history')
    }
    
    if (metrics.frameDrops > config.maxFrameDrops) {
      recommendations.push('Reduce animation complexity or disable animations for better performance')
    }
    
    if (metrics.reconnectionCount > config.maxReconnections) {
      recommendations.push('Check network stability and consider increasing connection timeout')
    }
    
    if (metrics.errorCount > 0) {
      recommendations.push('Review error logs and implement additional error handling')
    }
    
    return recommendations
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring()
    }
  }, [stopMonitoring])

  return {
    // State
    metrics,
    alerts,
    isMonitoring,
    
    // Control functions
    startMonitoring,
    stopMonitoring,
    resetMetrics,
    clearAlerts,
    
    // Tracking functions
    trackWebSocketLatency,
    trackConnectionLatency,
    trackReconnection,
    trackError,
    trackAnswerStreaming,
    trackSearchResponse,
    trackAnswerComplete,
    updateMessageQueueSize,
    
    // Analysis functions
    getPerformanceSummary,
    
    // Utils
    addSample,
    getAverageFromSamples
  }
}

export default usePerformanceMonitor