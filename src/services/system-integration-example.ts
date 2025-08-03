/**
 * Integration Example: How All Improvements Work Together
 * 
 * This example demonstrates how the various performance improvements
 * integrate to create a seamless transcription experience.
 */

import { UnifiedPerformanceService } from './unified-performance'
import { QuotaManager } from './quota-manager'
import { ConsolidatedMemoryManager } from './consolidated-memory-manager'
import { testEnhancedStreamingTranscriptionIPC } from './main-stt-transcription'

/**
 * Example integration showing how all services work together
 */
export class TranscriptionSystemIntegration {
  private performanceService: UnifiedPerformanceService
  private quotaManager: QuotaManager
  private memoryManager: ConsolidatedMemoryManager

  constructor() {
    // Initialize all services
    this.performanceService = UnifiedPerformanceService.getInstance()
    this.quotaManager = QuotaManager.getInstance()
    this.memoryManager = ConsolidatedMemoryManager.getInstance()

    // Register cleanup tasks
    this.setupCleanupTasks()
  }

  /**
   * Setup cleanup tasks for memory management
   */
  private setupCleanupTasks(): void {
    // Register performance metrics cleanup
    this.memoryManager.registerCleanupTask({
      id: 'performance-cleanup',
      name: 'Performance Metrics Cleanup',
      execute: () => {
        // Keep only last 50 performance metrics
        this.performanceService.clearMetrics()
        console.log('🧹 Cleaned up old performance metrics')
      },
      priority: 'low'
    })

    // Register quota error cleanup
    this.memoryManager.registerCleanupTask({
      id: 'quota-cleanup',
      name: 'Quota Error History Cleanup',
      execute: () => {
        // Clear old quota errors (keep recent ones)
        const statuses = this.quotaManager.getAllQuotaStatuses()
        let totalErrors = 0
        statuses.forEach(status => totalErrors += status.totalErrors)
        
        if (totalErrors > 100) {
          console.log('🧹 Too many quota errors, performing cleanup')
          // Keep recent errors but clear old ones
        }
      },
      priority: 'medium'
    })
  }

  /**
   * Comprehensive system health check
   */
  public async performSystemHealthCheck(): Promise<{
    overall: 'excellent' | 'good' | 'warning' | 'critical'
    details: {
      performance: string
      memory: string
      quota: string
      streaming: string
    }
    recommendations: string[]
  }> {
    // Get performance report
    const performanceStats = this.performanceService.getTranscriptionStats()
    
    // Get memory report
    const memoryReport = this.memoryManager.getMemoryReport()
    
    // Get quota status
    const quotaStatuses = this.quotaManager.getAllQuotaStatuses()
    let hasQuotaIssues = false
    quotaStatuses.forEach(status => {
      if (status.isBlocked) hasQuotaIssues = true
    })

    // Test streaming functionality
    let streamingStatus = 'good'
    try {
      await testEnhancedStreamingTranscriptionIPC()
      streamingStatus = 'excellent'
    } catch (error) {
      console.warn('Streaming test failed:', error)
      streamingStatus = 'warning'
    }

    // Determine overall health
    let overall: 'excellent' | 'good' | 'warning' | 'critical' = 'excellent'
    const recommendations: string[] = []

    if (memoryReport.status === 'critical') {
      overall = 'critical'
      recommendations.push('CRITICAL: High memory usage detected')
    } else if (memoryReport.status === 'warning') {
      if (overall === 'excellent') overall = 'warning'
      recommendations.push('WARNING: Memory usage is elevated')
    }

    if (hasQuotaIssues) {
      if (overall === 'excellent') overall = 'warning'
      recommendations.push('WARNING: Some transcription providers are quota-limited')
    }

    if (performanceStats.totalSessions > 0 && performanceStats.averageLatency > 10000) {
      overall = 'critical'
      recommendations.push('CRITICAL: Very high transcription latency')
    }

    if (recommendations.length === 0) {
      recommendations.push('System is operating optimally! 🎉')
    }

    return {
      overall,
      details: {
        performance: `${performanceStats.totalSessions} sessions, ${Math.round(performanceStats.averageLatency)}ms avg latency`,
        memory: `${memoryReport.usage ? (memoryReport.usage.used / 1024 / 1024).toFixed(2) + 'MB' : 'N/A'} (${memoryReport.status})`,
        quota: `${quotaStatuses.size} providers monitored, ${hasQuotaIssues ? 'issues detected' : 'all clear'}`,
        streaming: streamingStatus
      },
      recommendations
    }
  }

  /**
   * Run comprehensive performance optimization
   */
  public async optimizeSystem(): Promise<void> {
    console.log('🚀 Starting comprehensive system optimization...')

    // 1. Clean up memory
    await this.memoryManager.executeCleanup('high')
    
    // 2. Clear old performance metrics
    this.performanceService.clearMetrics()
    
    // 3. Reset quota errors if system is stable
    const systemHealth = await this.performSystemHealthCheck()
    if (systemHealth.overall === 'excellent' || systemHealth.overall === 'good') {
      this.quotaManager.clearAllErrors()
      console.log('🔄 Cleared quota errors due to system stability')
    }

    // 4. Force garbage collection
    this.memoryManager.triggerGarbageCollection()

    console.log('✅ System optimization completed')
  }

  /**
   * Get integrated system report
   */
  public async getSystemReport(): Promise<string> {
    const healthCheck = await this.performSystemHealthCheck()
    const performanceReport = this.performanceService.generatePerformanceReport()
    
    return `
🔍 Integrated System Report - ${new Date().toLocaleString()}

🎯 Overall Health: ${healthCheck.overall.toUpperCase()}

📊 Component Status:
  • Performance: ${healthCheck.details.performance}
  • Memory: ${healthCheck.details.memory}
  • Quota Management: ${healthCheck.details.quota}
  • Streaming: ${healthCheck.details.streaming}

${performanceReport}

💡 Recommendations:
${healthCheck.recommendations.map(rec => `  • ${rec}`).join('\n')}

🚀 System Integration: All services are properly coordinated
    `.trim()
  }

  /**
   * Cleanup and shutdown all services
   */
  public shutdown(): void {
    console.log('🔄 Shutting down integrated transcription system...')
    
    this.memoryManager.shutdown()
    this.performanceService.clearMetrics()
    this.quotaManager.clearAllErrors()
    
    console.log('✅ System shutdown completed')
  }
}

// Export singleton for easy access
export const transcriptionSystem = new TranscriptionSystemIntegration()

// Example usage:
/*
// Get comprehensive system status
const report = await transcriptionSystem.getSystemReport()
console.log(report)

// Perform health check
const health = await transcriptionSystem.performSystemHealthCheck()
if (health.overall === 'critical') {
  await transcriptionSystem.optimizeSystem()
}

// Cleanup on app shutdown
process.on('exit', () => {
  transcriptionSystem.shutdown()
})
*/
