/**
 * Consolidated Memory Manager
 * Unifies all memory management functionality across the application
 */

export interface MemoryUsage {
  used: number
  total: number
  limit: number
  percentage: number
}

export interface MemoryThresholds {
  warning: number // bytes
  critical: number // bytes
  cleanup: number // bytes
}

export type CleanupTask = {
  id: string
  name: string
  execute: () => void | Promise<void>
  priority: 'low' | 'medium' | 'high'
}

export class ConsolidatedMemoryManager {
  private static instance: ConsolidatedMemoryManager | null = null
  private cleanupTasks: Map<string, CleanupTask> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null
  private monitoringInterval: NodeJS.Timeout | null = null
  private isMonitoring = false
  
  private readonly defaultThresholds: MemoryThresholds = {
    warning: 100 * 1024 * 1024, // 100MB
    critical: 200 * 1024 * 1024, // 200MB
    cleanup: 150 * 1024 * 1024   // 150MB
  }

  private constructor() {
    this.startMonitoring()
  }

  public static getInstance(): ConsolidatedMemoryManager {
    if (!ConsolidatedMemoryManager.instance) {
      ConsolidatedMemoryManager.instance = new ConsolidatedMemoryManager()
    }
    return ConsolidatedMemoryManager.instance
  }

  /**
   * Get current memory usage information
   */
  public getMemoryUsage(): MemoryUsage | null {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const memory = (performance as unknown as {memory?: {
        usedJSHeapSize: number
        totalJSHeapSize: number
        jsHeapSizeLimit: number
      }}).memory
      if (memory) {
        return {
          used: memory.usedJSHeapSize,
          total: memory.totalJSHeapSize,
          limit: memory.jsHeapSizeLimit,
          percentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
        }
      }
    }
    
    // Fallback for Node.js environment
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage()
      return {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        limit: memUsage.heapTotal * 2, // Estimate
        percentage: (memUsage.heapUsed / (memUsage.heapTotal * 2)) * 100
      }
    }
    
    return null
  }

  /**
   * Register a cleanup task
   */
  public registerCleanupTask(task: CleanupTask): () => void {
    this.cleanupTasks.set(task.id, task)
    console.log(`🧹 Registered cleanup task: ${task.name} (${task.priority} priority)`)
    
    // Return unregister function
    return () => {
      this.cleanupTasks.delete(task.id)
      console.log(`🗑️ Unregistered cleanup task: ${task.name}`)
    }
  }

  /**
   * Execute cleanup tasks based on priority
   */
  public async executeCleanup(priorityLevel: 'low' | 'medium' | 'high' = 'medium'): Promise<void> {
    console.log(`🧹 Starting memory cleanup (${priorityLevel} priority)`)
    
    const priorities = priorityLevel === 'low' ? ['low'] 
                    : priorityLevel === 'medium' ? ['low', 'medium']
                    : ['low', 'medium', 'high']
    
    const tasksToRun = Array.from(this.cleanupTasks.values())
      .filter(task => priorities.includes(task.priority))
      .sort((a, b) => {
        const priorityOrder = {low: 1, medium: 2, high: 3}
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      })
    
    console.log(`🧹 Executing ${tasksToRun.length} cleanup tasks`)
    
    for (const task of tasksToRun) {
      try {
        console.log(`🧹 Running cleanup task: ${task.name}`)
        await task.execute()
      } catch (error) {
        console.warn(`⚠️ Cleanup task ${task.name} failed:`, error)
      }
    }
    
    // Force garbage collection if available
    this.triggerGarbageCollection()
    
    console.log(`✅ Memory cleanup completed`)
  }

  /**
   * Trigger garbage collection if available
   */
  public triggerGarbageCollection(): void {
    // Browser environment
    const windowWithGC = window as unknown as {gc?: () => void}
    if (typeof window !== 'undefined' && windowWithGC.gc) {
      console.log('🗑️ Triggering browser garbage collection')
      windowWithGC.gc()
      return
    }
    
    // Node.js environment
    const globalWithGC = global as unknown as {gc?: () => void}
    if (typeof global !== 'undefined' && globalWithGC.gc) {
      console.log('🗑️ Triggering Node.js garbage collection')
      globalWithGC.gc()
      return
    }
    
    console.log('ℹ️ Garbage collection not available in this environment')
  }

  /**
   * Start automatic memory monitoring
   */
  public startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) return
    
    console.log('👁️ Starting automatic memory monitoring')
    this.isMonitoring = true
    
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryThresholds()
    }, intervalMs)
  }

  /**
   * Stop automatic memory monitoring
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) return
    
    console.log('⏹️ Stopping memory monitoring')
    this.isMonitoring = false
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
  }

  /**
   * Check memory usage against thresholds and take action
   */
  private checkMemoryThresholds(): void {
    const memoryUsage = this.getMemoryUsage()
    if (!memoryUsage) return
    
    const usedMB = memoryUsage.used / 1024 / 1024
    const percentageUsed = memoryUsage.percentage
    
    if (memoryUsage.used > this.defaultThresholds.critical) {
      console.warn(`🚨 CRITICAL memory usage: ${usedMB.toFixed(2)}MB (${percentageUsed.toFixed(1)}%)`)
      this.executeCleanup('high')
    } else if (memoryUsage.used > this.defaultThresholds.cleanup) {
      console.warn(`⚠️ High memory usage: ${usedMB.toFixed(2)}MB (${percentageUsed.toFixed(1)}%) - running cleanup`)
      this.executeCleanup('medium')
    } else if (memoryUsage.used > this.defaultThresholds.warning) {
      console.log(`📊 Memory usage warning: ${usedMB.toFixed(2)}MB (${percentageUsed.toFixed(1)}%)`)
    }
  }

  /**
   * Get memory statistics and recommendations
   */
  public getMemoryReport(): {
    usage: MemoryUsage | null
    status: 'excellent' | 'good' | 'warning' | 'critical'
    recommendations: string[]
    registeredTasks: number
  } {
    const usage = this.getMemoryUsage()
    let status: 'excellent' | 'good' | 'warning' | 'critical' = 'excellent'
    const recommendations: string[] = []
    
    if (usage) {
      const usedMB = usage.used / 1024 / 1024
      
      if (usage.used > this.defaultThresholds.critical) {
        status = 'critical'
        recommendations.push(`Critical memory usage: ${usedMB.toFixed(2)}MB`)
        recommendations.push('Consider closing unused windows or clearing data')
      } else if (usage.used > this.defaultThresholds.cleanup) {
        status = 'warning'
        recommendations.push(`High memory usage: ${usedMB.toFixed(2)}MB`)
        recommendations.push('Automatic cleanup will run soon')
      } else if (usage.used > this.defaultThresholds.warning) {
        status = 'good'
        recommendations.push(`Moderate memory usage: ${usedMB.toFixed(2)}MB`)
      } else {
        recommendations.push(`Excellent memory usage: ${usedMB.toFixed(2)}MB`)
      }
    } else {
      recommendations.push('Memory monitoring not available in this environment')
    }
    
    return {
      usage,
      status,
      recommendations,
      registeredTasks: this.cleanupTasks.size
    }
  }

  /**
   * Clean up and shutdown the memory manager
   */
  public shutdown(): void {
    console.log('🔄 Shutting down memory manager')
    
    this.stopMonitoring()
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    
    // Run final cleanup
    this.executeCleanup('high')
    
    // Clear all tasks
    this.cleanupTasks.clear()
    
    ConsolidatedMemoryManager.instance = null
  }
}

// Export singleton instance
export const memoryManager = ConsolidatedMemoryManager.getInstance()

// Export class for type checking
export default ConsolidatedMemoryManager
