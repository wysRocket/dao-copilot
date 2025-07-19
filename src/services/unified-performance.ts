/**
 * Unified Performance Service
 * Consolidates audio, transcription, and application performance monitoring
 */

import {PerformanceMonitor, MemoryManager} from '../utils/performance'

export interface TranscriptionPerformanceMetrics {
  // Audio Processing
  audioProcessingTime: number
  audioAnalysisTime: number
  bufferChunks: number
  totalAudioBytes: number
  
  // Network & API
  apiLatency: number
  webSocketLatency?: number
  batchApiLatency?: number
  
  // Memory
  memoryBeforeTranscription: number
  memoryAfterTranscription: number
  memoryIncrease: number
  
  // Quality
  confidence?: number
  textLength: number
  wordsPerMinute?: number
  
  // Session
  sessionStartTime: number
  totalDuration: number
  source: 'websocket' | 'batch' | 'proxy'
}

export interface PerformanceThresholds {
  maxAudioProcessingTime: number // ms
  maxApiLatency: number // ms
  maxMemoryIncrease: number // bytes
  minConfidence: number // 0-1
  maxSessionDuration: number // ms
}

export class UnifiedPerformanceService {
  private static instance: UnifiedPerformanceService | null = null
  private performanceMonitor: PerformanceMonitor
  private transcriptionMetrics: TranscriptionPerformanceMetrics[] = []
  private readonly maxMetricsHistory = 100
  
  private readonly defaultThresholds: PerformanceThresholds = {
    maxAudioProcessingTime: 5000, // 5 seconds
    maxApiLatency: 10000, // 10 seconds
    maxMemoryIncrease: 50 * 1024 * 1024, // 50MB
    minConfidence: 0.7,
    maxSessionDuration: 60000 // 1 minute
  }

  private constructor() {
    this.performanceMonitor = PerformanceMonitor.getInstance()
  }

  public static getInstance(): UnifiedPerformanceService {
    if (!UnifiedPerformanceService.instance) {
      UnifiedPerformanceService.instance = new UnifiedPerformanceService()
    }
    return UnifiedPerformanceService.instance
  }

  /**
   * Start tracking a transcription session
   */
  public startTranscriptionSession(): {
    sessionId: string
    startTime: number
    initialMemory: number
  } {
    const sessionId = `transcription-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const startTime = Date.now()
    const memoryUsage = MemoryManager.getMemoryUsage()
    const initialMemory = memoryUsage ? memoryUsage.used : 0
    
    console.log(`🔍 Starting transcription performance tracking - Session: ${sessionId}`)
    
    return { sessionId, startTime, initialMemory }
  }

  /**
   * Record transcription completion metrics
   */
  public recordTranscriptionMetrics(
    sessionId: string,
    sessionStart: {sessionId: string; startTime: number; initialMemory: number},
    audioProcessingTime: number,
    apiLatency: number,
    result: {text: string; confidence?: number; source: string},
    additionalMetrics: Partial<TranscriptionPerformanceMetrics> = {}
  ): TranscriptionPerformanceMetrics {
    const endTime = Date.now()
    const memoryUsage = MemoryManager.getMemoryUsage()
    const finalMemory = memoryUsage ? memoryUsage.used : sessionStart.initialMemory
    
    const metrics: TranscriptionPerformanceMetrics = {
      audioProcessingTime,
      audioAnalysisTime: additionalMetrics.audioAnalysisTime || 0,
      bufferChunks: additionalMetrics.bufferChunks || 1,
      totalAudioBytes: additionalMetrics.totalAudioBytes || 0,
      
      apiLatency,
      webSocketLatency: result.source === 'websocket' ? apiLatency : undefined,
      batchApiLatency: result.source === 'batch' ? apiLatency : undefined,
      
      memoryBeforeTranscription: sessionStart.initialMemory,
      memoryAfterTranscription: finalMemory,
      memoryIncrease: finalMemory - sessionStart.initialMemory,
      
      confidence: result.confidence,
      textLength: result.text.length,
      wordsPerMinute: this.calculateWPM(result.text, endTime - sessionStart.startTime),
      
      sessionStartTime: sessionStart.startTime,
      totalDuration: endTime - sessionStart.startTime,
      source: result.source as 'websocket' | 'batch' | 'proxy',
      
      ...additionalMetrics
    }
    
    // Store metrics
    this.transcriptionMetrics.push(metrics)
    
    // Keep only recent metrics
    if (this.transcriptionMetrics.length > this.maxMetricsHistory) {
      this.transcriptionMetrics.shift()
    }
    
    // Log performance summary
    this.logPerformanceSummary(sessionId, metrics)
    
    // Check for performance issues
    this.checkPerformanceThresholds(metrics)
    
    return metrics
  }

  /**
   * Calculate words per minute
   */
  private calculateWPM(text: string, durationMs: number): number {
    if (durationMs === 0) return 0
    const words = text.trim().split(/\s+/).length
    const minutes = durationMs / (1000 * 60)
    return Math.round(words / minutes)
  }

  /**
   * Log performance summary
   */
  private logPerformanceSummary(sessionId: string, metrics: TranscriptionPerformanceMetrics): void {
    console.log(`📊 Transcription Performance Summary - Session: ${sessionId}:`, {
      duration: `${metrics.totalDuration}ms`,
      source: metrics.source,
      textLength: metrics.textLength,
      confidence: metrics.confidence?.toFixed(3) || 'N/A',
      wpm: metrics.wordsPerMinute || 'N/A',
      memoryIncrease: `${(metrics.memoryIncrease / 1024 / 1024).toFixed(2)}MB`,
      apiLatency: `${metrics.apiLatency}ms`,
      audioProcessing: `${metrics.audioProcessingTime}ms`
    })
  }

  /**
   * Check metrics against thresholds and warn about performance issues
   */
  private checkPerformanceThresholds(metrics: TranscriptionPerformanceMetrics): void {
    const issues: string[] = []
    
    if (metrics.audioProcessingTime > this.defaultThresholds.maxAudioProcessingTime) {
      issues.push(`Slow audio processing: ${metrics.audioProcessingTime}ms`)
    }
    
    if (metrics.apiLatency > this.defaultThresholds.maxApiLatency) {
      issues.push(`High API latency: ${metrics.apiLatency}ms`)
    }
    
    if (metrics.memoryIncrease > this.defaultThresholds.maxMemoryIncrease) {
      issues.push(`High memory usage: ${(metrics.memoryIncrease / 1024 / 1024).toFixed(2)}MB`)
    }
    
    if (metrics.confidence && metrics.confidence < this.defaultThresholds.minConfidence) {
      issues.push(`Low confidence: ${metrics.confidence.toFixed(3)}`)
    }
    
    if (metrics.totalDuration > this.defaultThresholds.maxSessionDuration) {
      issues.push(`Long session duration: ${metrics.totalDuration}ms`)
    }
    
    if (issues.length > 0) {
      console.warn('⚠️ Performance Issues Detected:', issues)
    }
  }

  /**
   * Get transcription performance statistics
   */
  public getTranscriptionStats(): {
    totalSessions: number
    averageDuration: number
    averageLatency: number
    averageConfidence: number
    memoryUsageStats: {min: number; max: number; avg: number}
    sourceBreakdown: Record<string, number>
    recentPerformance: TranscriptionPerformanceMetrics[]
  } {
    if (this.transcriptionMetrics.length === 0) {
      return {
        totalSessions: 0,
        averageDuration: 0,
        averageLatency: 0,
        averageConfidence: 0,
        memoryUsageStats: {min: 0, max: 0, avg: 0},
        sourceBreakdown: {},
        recentPerformance: []
      }
    }
    
    const metrics = this.transcriptionMetrics
    const validConfidences = metrics.filter(m => m.confidence !== undefined)
    
    const durations = metrics.map(m => m.totalDuration)
    const latencies = metrics.map(m => m.apiLatency)
    const memoryIncreases = metrics.map(m => m.memoryIncrease)
    
    const sourceBreakdown = metrics.reduce((acc, m) => {
      acc[m.source] = (acc[m.source] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    return {
      totalSessions: metrics.length,
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      averageConfidence: validConfidences.length > 0 
        ? validConfidences.reduce((a, b) => a + (b.confidence || 0), 0) / validConfidences.length 
        : 0,
      memoryUsageStats: {
        min: Math.min(...memoryIncreases),
        max: Math.max(...memoryIncreases),
        avg: memoryIncreases.reduce((a, b) => a + b, 0) / memoryIncreases.length
      },
      sourceBreakdown,
      recentPerformance: metrics.slice(-10) // Last 10 sessions
    }
  }

  /**
   * Generate performance report
   */
  public generatePerformanceReport(): string {
    const stats = this.getTranscriptionStats()
    const appMetrics = this.performanceMonitor.getMetrics()
    
    return `
🔍 Unified Performance Report - ${new Date().toLocaleString()}

📝 Transcription Performance:
  • Total Sessions: ${stats.totalSessions}
  • Average Duration: ${Math.round(stats.averageDuration)}ms
  • Average API Latency: ${Math.round(stats.averageLatency)}ms
  • Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%
  • Memory Usage: ${(stats.memoryUsageStats.avg / 1024 / 1024).toFixed(2)}MB avg
  • Sources: ${JSON.stringify(stats.sourceBreakdown)}

🖥️ Application Performance:
  • Total Metrics Collected: ${appMetrics.length}
  • Memory Monitoring: ${MemoryManager.getMemoryUsage() ? 'Active' : 'Inactive'}
  
💡 Performance Recommendations:
${this.generatePerformanceRecommendations(stats)}
    `.trim()
  }

  /**
   * Generate performance recommendations based on stats
   */
  private generatePerformanceRecommendations(stats: ReturnType<typeof this.getTranscriptionStats>): string {
    const recommendations: string[] = []
    
    if (stats.averageLatency > 5000) {
      recommendations.push('  • Consider optimizing audio processing or network connectivity')
    }
    
    if (stats.averageConfidence < 0.8) {
      recommendations.push('  • Audio quality may be impacting transcription accuracy')
    }
    
    if (stats.memoryUsageStats.avg > 20 * 1024 * 1024) {
      recommendations.push('  • High memory usage detected - consider implementing memory optimization')
    }
    
    if (stats.sourceBreakdown.batch && stats.sourceBreakdown.websocket) {
      const batchRatio = stats.sourceBreakdown.batch / stats.totalSessions
      if (batchRatio > 0.5) {
        recommendations.push('  • High batch API usage - check WebSocket connectivity')
      }
    }
    
    if (recommendations.length === 0) {
      recommendations.push('  • Performance looks good! 👍')
    }
    
    return recommendations.join('\n')
  }

  /**
   * Clear all performance metrics
   */
  public clearMetrics(): void {
    this.transcriptionMetrics = []
    console.log('🧹 Cleared all transcription performance metrics')
  }
}

export default UnifiedPerformanceService
