import React, { useState, useEffect, useCallback } from 'react'
import { useTranscriptionStateContext } from '../contexts/TranscriptionStateContext'
import GlassCard from './GlassCard'
import GlassButton from './GlassButton'

export interface PerformanceMonitorProps {
  className?: string
  refreshInterval?: number // milliseconds
  historyLength?: number // number of data points to keep
  showLatencyChart?: boolean
  showThroughputMetrics?: boolean
  showNetworkMetrics?: boolean
  onPerformanceIssue?: (issue: PerformanceIssue) => void
}

interface PerformanceMetrics {
  latency: number // ms
  throughput: number // messages/second
  packetLoss: number // percentage
  jitter: number // ms
  bandwidth: number // kbps
  connectionQuality: number // 0-100 score
  timestamp: Date
}

interface PerformanceIssue {
  type: 'high_latency' | 'low_throughput' | 'packet_loss' | 'connection_unstable'
  severity: 'low' | 'medium' | 'high'
  message: string
  metrics: PerformanceMetrics
  threshold: number
  timestamp: Date
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  className = '',
  refreshInterval = 5000,
  historyLength = 20,
  showLatencyChart = true,
  showThroughputMetrics = true,
  showNetworkMetrics = true,
  onPerformanceIssue
}) => {
  const { state } = useTranscriptionStateContext()
  const [metricsHistory, setMetricsHistory] = useState<PerformanceMetrics[]>([])
  const [currentMetrics, setCurrentMetrics] = useState<PerformanceMetrics | null>(null)
  const [isMonitoring, setIsMonitoring] = useState(true)
  const [performanceIssues, setPerformanceIssues] = useState<PerformanceIssue[]>([])

  const connection = state.connection

  // Generate performance metrics (in real implementation, this would come from actual measurements)
  const generateMetrics = useCallback((): PerformanceMetrics => {
    const baseLatency = connection?.status === 'connected' ? 50 : 200
    const qualityMultiplier = connection?.quality === 'excellent' ? 0.8 :
                             connection?.quality === 'good' ? 1.0 :
                             connection?.quality === 'poor' ? 1.5 : 2.0

    return {
      latency: Math.round(baseLatency * qualityMultiplier + (Math.random() * 20 - 10)),
      throughput: Math.round(100 * (2 - qualityMultiplier) + (Math.random() * 20 - 10)),
      packetLoss: Math.max(0, Math.round((qualityMultiplier - 0.8) * 2 + (Math.random() * 2 - 1))),
      jitter: Math.round(5 * qualityMultiplier + (Math.random() * 5 - 2.5)),
      bandwidth: Math.round(1000 * (2 - qualityMultiplier) + (Math.random() * 200 - 100)),
      connectionQuality: Math.round(100 / qualityMultiplier),
      timestamp: new Date()
    }
  }, [connection?.status, connection?.quality])

  // Check for performance issues
  const checkPerformanceIssues = useCallback((metrics: PerformanceMetrics) => {
    const issues: PerformanceIssue[] = []

    // High latency check
    if (metrics.latency > 200) {
      issues.push({
        type: 'high_latency',
        severity: metrics.latency > 500 ? 'high' : 'medium',
        message: `High latency detected: ${metrics.latency}ms`,
        metrics,
        threshold: 200,
        timestamp: new Date()
      })
    }

    // Low throughput check
    if (metrics.throughput < 50) {
      issues.push({
        type: 'low_throughput',
        severity: metrics.throughput < 20 ? 'high' : 'medium',
        message: `Low throughput: ${metrics.throughput} msg/s`,
        metrics,
        threshold: 50,
        timestamp: new Date()
      })
    }

    // Packet loss check
    if (metrics.packetLoss > 3) {
      issues.push({
        type: 'packet_loss',
        severity: metrics.packetLoss > 10 ? 'high' : 'medium',
        message: `Packet loss detected: ${metrics.packetLoss}%`,
        metrics,
        threshold: 3,
        timestamp: new Date()
      })
    }

    // Connection quality check
    if (metrics.connectionQuality < 60) {
      issues.push({
        type: 'connection_unstable',
        severity: metrics.connectionQuality < 30 ? 'high' : 'medium',
        message: `Connection quality degraded: ${metrics.connectionQuality}%`,
        metrics,
        threshold: 60,
        timestamp: new Date()
      })
    }

    if (issues.length > 0) {
      setPerformanceIssues(prev => [...issues, ...prev].slice(0, 10)) // Keep last 10 issues
      issues.forEach(issue => onPerformanceIssue?.(issue))
    }
  }, [onPerformanceIssue])

  // Update metrics periodically
  useEffect(() => {
    if (!isMonitoring) return

    const interval = setInterval(() => {
      const metrics = generateMetrics()
      setCurrentMetrics(metrics)
      setMetricsHistory(prev => [...prev, metrics].slice(-historyLength))
      checkPerformanceIssues(metrics)
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [isMonitoring, refreshInterval, historyLength, generateMetrics, checkPerformanceIssues])

  // Initialize metrics
  useEffect(() => {
    const initialMetrics = generateMetrics()
    setCurrentMetrics(initialMetrics)
    setMetricsHistory([initialMetrics])
  }, [generateMetrics])

  const getMetricColor = (value: number, thresholds: { good: number; poor: number }, inverted = false): string => {
    if (inverted) {
      return value <= thresholds.good ? 'text-green-400' :
             value <= thresholds.poor ? 'text-yellow-400' : 'text-red-400'
    } else {
      return value >= thresholds.good ? 'text-green-400' :
             value >= thresholds.poor ? 'text-yellow-400' : 'text-red-400'
    }
  }

  const formatLatency = (ms: number): string => {
    return `${ms}ms`
  }

  const formatThroughput = (msgPerSec: number): string => {
    return `${msgPerSec}/s`
  }

  const formatBandwidth = (kbps: number): string => {
    if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`
    return `${kbps} kbps`
  }

  const getAverageMetric = (key: keyof PerformanceMetrics): number => {
    if (metricsHistory.length === 0) return 0
    const sum = metricsHistory.reduce((acc, m) => acc + (m[key] as number), 0)
    return sum / metricsHistory.length
  }

  const getLatencyStatus = (latency: number): { status: string; color: string } => {
    if (latency <= 100) return { status: 'Excellent', color: 'text-green-400' }
    if (latency <= 200) return { status: 'Good', color: 'text-blue-400' }
    if (latency <= 500) return { status: 'Fair', color: 'text-yellow-400' }
    return { status: 'Poor', color: 'text-red-400' }
  }

  if (!currentMetrics) return null

  const latencyStatus = getLatencyStatus(currentMetrics.latency)

  return (
    <GlassCard className={`p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Performance Monitor</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-sm opacity-75">
            {isMonitoring ? 'Monitoring' : 'Paused'}
          </span>
          <GlassButton
            onClick={() => setIsMonitoring(!isMonitoring)}
            className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-700"
          >
            {isMonitoring ? 'Pause' : 'Resume'}
          </GlassButton>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="p-3 bg-black/10 rounded">
          <div className="text-sm opacity-75">Latency</div>
          <div className={`text-xl font-bold ${latencyStatus.color}`}>
            {formatLatency(currentMetrics.latency)}
          </div>
          <div className="text-xs opacity-60">{latencyStatus.status}</div>
        </div>

        {showThroughputMetrics && (
          <div className="p-3 bg-black/10 rounded">
            <div className="text-sm opacity-75">Throughput</div>
            <div className={`text-xl font-bold ${getMetricColor(currentMetrics.throughput, { good: 80, poor: 50 })}`}>
              {formatThroughput(currentMetrics.throughput)}
            </div>
            <div className="text-xs opacity-60">Messages/sec</div>
          </div>
        )}

        <div className="p-3 bg-black/10 rounded">
          <div className="text-sm opacity-75">Packet Loss</div>
          <div className={`text-xl font-bold ${getMetricColor(currentMetrics.packetLoss, { good: 1, poor: 3 }, true)}`}>
            {currentMetrics.packetLoss}%
          </div>
          <div className="text-xs opacity-60">Lost packets</div>
        </div>

        <div className="p-3 bg-black/10 rounded">
          <div className="text-sm opacity-75">Quality</div>
          <div className={`text-xl font-bold ${getMetricColor(currentMetrics.connectionQuality, { good: 80, poor: 60 })}`}>
            {currentMetrics.connectionQuality}%
          </div>
          <div className="text-xs opacity-60">Connection score</div>
        </div>
      </div>

      {/* Latency Chart */}
      {showLatencyChart && metricsHistory.length > 1 && (
        <div className="mb-4">
          <div className="text-sm font-medium mb-2">Latency History</div>
          <div className="h-20 bg-black/10 rounded p-2 flex items-end space-x-1">
            {metricsHistory.slice(-20).map((metrics, index) => {
              const height = Math.min(100, (metrics.latency / 500) * 100)
              const color = metrics.latency <= 100 ? 'bg-green-500' :
                           metrics.latency <= 200 ? 'bg-blue-500' :
                           metrics.latency <= 500 ? 'bg-yellow-500' : 'bg-red-500'
              
              return (
                <div
                  key={index}
                  className={`flex-1 ${color} rounded-t transition-all`}
                  style={{ height: `${height}%` }}
                  title={`${formatLatency(metrics.latency)} at ${metrics.timestamp.toLocaleTimeString()}`}
                />
              )
            })}
          </div>
          <div className="text-xs opacity-60 mt-1">
            Avg: {formatLatency(Math.round(getAverageMetric('latency')))} | 
            Min: {formatLatency(Math.min(...metricsHistory.map(m => m.latency)))} | 
            Max: {formatLatency(Math.max(...metricsHistory.map(m => m.latency)))}
          </div>
        </div>
      )}

      {/* Network Metrics */}
      {showNetworkMetrics && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-3 bg-black/10 rounded">
            <div className="text-sm opacity-75">Jitter</div>
            <div className={`text-lg font-bold ${getMetricColor(currentMetrics.jitter, { good: 5, poor: 15 }, true)}`}>
              {formatLatency(currentMetrics.jitter)}
            </div>
            <div className="text-xs opacity-60">Latency variation</div>
          </div>
          <div className="p-3 bg-black/10 rounded">
            <div className="text-sm opacity-75">Bandwidth</div>
            <div className={`text-lg font-bold ${getMetricColor(currentMetrics.bandwidth, { good: 800, poor: 500 })}`}>
              {formatBandwidth(currentMetrics.bandwidth)}
            </div>
            <div className="text-xs opacity-60">Available bandwidth</div>
          </div>
        </div>
      )}

      {/* Recent Performance Issues */}
      {performanceIssues.length > 0 && (
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Recent Issues</div>
            <button
              onClick={() => setPerformanceIssues([])}
              className="text-xs opacity-60 hover:opacity-80 transition-opacity"
            >
              Clear
            </button>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {performanceIssues.slice(0, 3).map((issue, index) => (
              <div key={index} className={`p-2 rounded text-xs ${
                issue.severity === 'high' ? 'bg-red-900/20 border border-red-500/30' :
                issue.severity === 'medium' ? 'bg-yellow-900/20 border border-yellow-500/30' :
                'bg-blue-900/20 border border-blue-500/30'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{issue.message}</span>
                  <span className="opacity-60">
                    {issue.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Summary */}
      <div className="mt-4 text-xs opacity-60 text-center">
        Last updated: {currentMetrics.timestamp.toLocaleTimeString()} | 
        Samples: {metricsHistory.length}
      </div>
    </GlassCard>
  )
}

export default PerformanceMonitor
