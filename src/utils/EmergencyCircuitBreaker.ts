/**
 * Enhanced Emergency Circuit Breaker for Stack Overflow Protection
 *
 * This is an enhanced implementation with dynamic thresholds, performance monitoring,
 * and advanced call tracking to prevent "Maximum call stack size exceeded" errors
 * while providing detailed diagnostics and visualization capabilities.
 */

import {DuplicateRequestDetector} from './DuplicateRequestDetector'

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number
    totalJSHeapSize: number
    jsHeapSizeLimit: number
  }
}

interface CallStackFrame {
  functionName: string
  timestamp: number
  depth: number
  arguments?: unknown[]
  argumentTypes?: string[]
  callPath?: string
  performanceMetrics?: {
    memoryUsage: number
    cpuLoad: number
    averageResponseTime: number
  }
}

interface SystemMetrics {
  memoryUsage: number
  cpuLoad: number
  averageResponseTime: number
  timestamp: number
}

interface EmergencyBreaker {
  callDepth: number
  currentDepth: number
  maxDepth: number
  threshold: number
  dynamicThreshold: number
  isOpen: boolean
  errorCount: number
  lastResetTime: number
  lastError?: number
  callHistory: CallStackFrame[]
  performanceHistory: SystemMetrics[]
  callPatterns: Map<string, number>
}

interface ThresholdLevels {
  info: number // 50% of max depth
  warning: number // 70% of max depth
  critical: number // 90% of max depth
}

class EmergencyCircuitBreaker {
  private static instance: EmergencyCircuitBreaker
  private breakers = new Map<string, EmergencyBreaker>()

  // Base emergency thresholds - now dynamic
  private readonly BASE_MAX_CALL_DEPTH = 50
  private readonly MIN_CALL_DEPTH = 20 // Never go below this
  private readonly MAX_CALL_DEPTH = 100 // Never go above this
  private readonly MAX_ERRORS = 3
  private readonly RESET_TIMEOUT = 30000 // 30 seconds
  private readonly EMERGENCY_TIMEOUT = 5000 // 5 seconds for emergency mode
  private readonly PERFORMANCE_HISTORY_SIZE = 100

  // Performance monitoring
  private systemMetrics: SystemMetrics[] = []
  private performanceMonitoringEnabled = true
  private duplicateDetector: DuplicateRequestDetector

  constructor() {
    this.duplicateDetector = DuplicateRequestDetector.getInstance({
      maxRequestsPerWindow: 20,
      windowSizeMs: 1000,
      cooldownPeriodMs: 5000,
      duplicateWindowMs: 1000
    })
  }

  static getInstance(): EmergencyCircuitBreaker {
    if (!EmergencyCircuitBreaker.instance) {
      EmergencyCircuitBreaker.instance = new EmergencyCircuitBreaker()
    }
    return EmergencyCircuitBreaker.instance
  }

  /**
   * Get current system performance metrics
   */
  private getCurrentSystemMetrics(): SystemMetrics {
    const memoryUsage = this.getMemoryUsage()
    const cpuLoad = this.getCpuLoad()
    const avgResponseTime = this.getAverageResponseTime()

    return {
      memoryUsage,
      cpuLoad,
      averageResponseTime: avgResponseTime,
      timestamp: Date.now()
    }
  }

  /**
   * Calculate dynamic threshold based on system performance
   */
  private calculateDynamicThreshold(breaker: EmergencyBreaker): number {
    const currentMetrics = this.getCurrentSystemMetrics()

    // Store metrics in system history
    this.systemMetrics.push(currentMetrics)
    if (this.systemMetrics.length > this.PERFORMANCE_HISTORY_SIZE) {
      this.systemMetrics.shift()
    }

    // Store metrics in breaker history
    breaker.performanceHistory.push(currentMetrics)
    if (breaker.performanceHistory.length > this.PERFORMANCE_HISTORY_SIZE) {
      breaker.performanceHistory.shift()
    }

    let adjustedThreshold = this.BASE_MAX_CALL_DEPTH

    // Adjust based on memory pressure
    if (currentMetrics.memoryUsage > 150 * 1024 * 1024) {
      // 150MB
      adjustedThreshold = Math.floor(adjustedThreshold * 0.7) // Reduce by 30%
    } else if (currentMetrics.memoryUsage < 50 * 1024 * 1024) {
      // 50MB
      adjustedThreshold = Math.floor(adjustedThreshold * 1.2) // Increase by 20%
    }

    // Adjust based on CPU load
    if (currentMetrics.cpuLoad > 80) {
      adjustedThreshold = Math.floor(adjustedThreshold * 0.8) // Reduce by 20%
    }

    // Adjust based on response times
    if (currentMetrics.averageResponseTime > 5000) {
      // 5 seconds
      adjustedThreshold = Math.floor(adjustedThreshold * 0.6) // Reduce by 40%
    }

    // Ensure threshold stays within bounds
    adjustedThreshold = Math.max(
      this.MIN_CALL_DEPTH,
      Math.min(this.MAX_CALL_DEPTH, adjustedThreshold)
    )

    // Update breaker's dynamic threshold
    breaker.dynamicThreshold = adjustedThreshold

    return adjustedThreshold
  }

  /**
   * Get threshold levels for logging
   */
  private getThresholdLevels(maxDepth: number): ThresholdLevels {
    return {
      info: Math.floor(maxDepth * 0.5), // 50% of max depth
      warning: Math.floor(maxDepth * 0.7), // 70% of max depth
      critical: Math.floor(maxDepth * 0.9) // 90% of max depth
    }
  }

  /**
   * Enhanced call guard with dynamic thresholds, detailed tracking, and duplicate detection
   */
  emergencyCallGuard(functionName: string, args?: unknown[]): boolean {
    const breaker = this.getOrCreateBreaker(functionName)

    // Check if circuit is open
    if (breaker.isOpen) {
      const now = Date.now()
      if (breaker.lastError && now - breaker.lastError < this.RESET_TIMEOUT) {
        console.warn(`🚨 EMERGENCY: Circuit breaker OPEN for ${functionName}. Blocking call.`)
        return false // Block the call
      } else {
        // Reset the breaker
        this.resetBreaker(functionName)
      }
    }

    // Calculate dynamic threshold
    const dynamicThreshold = this.calculateDynamicThreshold(breaker)
    const thresholds = this.getThresholdLevels(dynamicThreshold)

    // Track call depth
    breaker.currentDepth++

    // Build call path for better debugging
    const callPath = this.buildCallPath(breaker.callHistory, functionName)

    // Enhanced call frame with arguments and performance metrics
    const callFrame: CallStackFrame = {
      functionName,
      timestamp: Date.now(),
      depth: breaker.currentDepth,
      arguments: args ? this.sanitizeArguments(args) : undefined,
      argumentTypes: args ? args.map(arg => typeof arg) : undefined,
      callPath,
      performanceMetrics: this.performanceMonitoringEnabled
        ? this.getCurrentSystemMetrics()
        : undefined
    }

    breaker.callHistory.push(callFrame)

    // Update call patterns for analysis
    const pattern = this.generateCallPattern(callFrame)
    breaker.callPatterns.set(pattern, (breaker.callPatterns.get(pattern) || 0) + 1)

    // Tiered logging based on depth thresholds
    if (breaker.currentDepth >= thresholds.critical) {
      console.error(
        `🚨 CRITICAL: Call depth ${breaker.currentDepth}/${dynamicThreshold} (${Math.round((breaker.currentDepth / dynamicThreshold) * 100)}%) for ${functionName}`
      )
      console.error(`🚨 Call path: ${callPath}`)
    } else if (breaker.currentDepth >= thresholds.warning) {
      console.warn(
        `⚠️ WARNING: Call depth ${breaker.currentDepth}/${dynamicThreshold} (${Math.round((breaker.currentDepth / dynamicThreshold) * 100)}%) for ${functionName}`
      )
      console.warn(`⚠️ Call path: ${callPath}`)
    } else if (breaker.currentDepth >= thresholds.info) {
      console.info(
        `ℹ️ INFO: Call depth ${breaker.currentDepth}/${dynamicThreshold} (${Math.round((breaker.currentDepth / dynamicThreshold) * 100)}%) for ${functionName}`
      )
    }

    // Emergency depth check with dynamic threshold
    if (breaker.currentDepth > dynamicThreshold) {
      console.error(
        `🚨 EMERGENCY: Call depth ${breaker.currentDepth} exceeded dynamic maximum ${dynamicThreshold} for ${functionName}`
      )
      console.error(
        `🚨 System metrics: Memory=${Math.round(this.getMemoryUsage() / 1024 / 1024)}MB, CPU=${this.getCpuLoad()}%`
      )
      this.tripBreaker(
        functionName,
        new Error(`Emergency depth limit exceeded: ${breaker.currentDepth}/${dynamicThreshold}`)
      )
      return false
    }

    // Enhanced rapid call detection with pattern analysis
    const recentCalls = breaker.callHistory.filter(call => Date.now() - call.timestamp < 1000)
    if (recentCalls.length > 20) {
      const patterns = this.analyzeCallPatterns(recentCalls)
      console.error(
        `🚨 EMERGENCY: Rapid repeated calls detected for ${functionName}: ${recentCalls.length} calls in 1 second`
      )
      console.error(`🚨 Call patterns:`, patterns)
      this.tripBreaker(
        functionName,
        new Error(`Rapid repeated calls detected: ${recentCalls.length}`)
      )
      return false
    }

    return true // Allow the call
  }

  /**
   * Enhanced transcription call guard with duplicate detection and circuit breaker protection
   */
  transcriptionCallGuard(
    functionName: string,
    audioData?: ArrayBuffer | Buffer,
    args?: unknown[]
  ): {
    isAllowed: boolean
    reason?: string
    isDuplicate?: boolean
    isThrottled?: boolean
    isCircuitOpen?: boolean
  } {
    // First, check the circuit breaker
    const circuitAllowed = this.emergencyCallGuard(functionName, args)
    if (!circuitAllowed) {
      return {
        isAllowed: false,
        reason: 'Circuit breaker protection activated',
        isCircuitOpen: true
      }
    }

    // If we have audio data, check for duplicates/throttling
    if (audioData && audioData.byteLength > 0) {
      const duplicateCheck = this.duplicateDetector.checkRequest(
        audioData,
        {
          sourceType: 'transcription',
          timestamp: Date.now(),
          format: 'audio'
        },
        functionName
      )

      if (!duplicateCheck.isAllowed) {
        console.warn(`🚫 BLOCKED: ${functionName} - ${duplicateCheck.reason}`)

        // Update circuit breaker with rapid request information
        if (duplicateCheck.isThrottled) {
          const breaker = this.getOrCreateBreaker(functionName)
          breaker.errorCount++
          console.warn(
            `⚠️ RAPID REQUESTS: ${functionName} error count increased to ${breaker.errorCount}`
          )
        }

        return {
          isAllowed: false,
          reason: duplicateCheck.reason,
          isDuplicate: duplicateCheck.isDuplicate,
          isThrottled: duplicateCheck.isThrottled
        }
      }

      console.info(
        `✅ TRANSCRIPTION: ${functionName} request approved (ID: ${duplicateCheck.requestId})`
      )
    }

    return {
      isAllowed: true
    }
  }

  /**
   * Get comprehensive protection status including duplicate detection stats
   */
  getProtectionStatus(): {
    circuitBreaker: Record<string, unknown>
    duplicateDetection: {
      totalRequests: number
      uniquePatterns: number
      throttledPatterns: number
      memoryUsage: {
        requestsCount: number
        patternsCount: number
        estimatedSizeKB: number
      }
      recentActivity: {
        last5Minutes: number
        lastHour: number
        duplicatesBlocked: number
        throttledRequests: number
      }
    }
  } {
    return {
      circuitBreaker: this.getEmergencyStatus(),
      duplicateDetection: this.duplicateDetector.getStatistics()
    }
  }

  /**
   * Get memory usage in bytes (fallback implementation)
   */
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage()
      return usage.heapUsed + usage.external
    }

    // Browser fallback - estimate based on performance
    if (typeof performance !== 'undefined' && (performance as PerformanceWithMemory).memory) {
      return (performance as PerformanceWithMemory).memory?.usedJSHeapSize || 0
    }

    // Default fallback
    return 50 * 1024 * 1024 // 50MB estimate
  }

  /**
   * Get CPU load percentage estimate
   */
  private getCpuLoad(): number {
    if (typeof process !== 'undefined' && process.cpuUsage) {
      const usage = process.cpuUsage()
      // Simple heuristic based on CPU usage
      const totalUsage = usage.user + usage.system
      return Math.min(100, (totalUsage / 1000000) * 10) // Rough percentage
    }

    // Browser fallback - estimate based on performance
    if (typeof performance !== 'undefined' && performance.now) {
      const start = performance.now()
      // Simple CPU-intensive operation to measure load
      for (let i = 0; i < 10000; i++) {
        Math.random()
      }
      const elapsed = performance.now() - start
      return Math.min(100, elapsed * 2) // Rough estimate
    }

    return 20 // Default low load estimate
  }

  /**
   * Get average response time from recent operations
   */
  private getAverageResponseTime(): number {
    const recentMetrics = this.systemMetrics.slice(-10) // Last 10 metrics
    if (recentMetrics.length === 0) return 1000 // 1 second default

    const avgResponseTime =
      recentMetrics.reduce((sum, metric) => sum + metric.averageResponseTime, 0) /
      recentMetrics.length

    return avgResponseTime || 1000
  }

  /**
   * Build call path string for debugging
   */
  private buildCallPath(callHistory: CallStackFrame[], currentFunction: string): string {
    const recentCalls = callHistory.slice(-5) // Last 5 calls
    const path = recentCalls.map(call => call.functionName).join(' → ')
    return path ? `${path} → ${currentFunction}` : currentFunction
  }

  /**
   * Sanitize arguments for logging (remove sensitive data)
   */
  private sanitizeArguments(args: unknown[]): unknown[] {
    return args.map(arg => {
      if (arg === null || arg === undefined) return arg

      if (typeof arg === 'string') {
        // Truncate long strings and remove potential sensitive data
        if (arg.length > 100) return arg.substring(0, 100) + '...'
        if (arg.includes('key') || arg.includes('token') || arg.includes('password')) {
          return '[REDACTED]'
        }
        return arg
      }

      if (typeof arg === 'object') {
        if (arg instanceof Buffer) return `[Buffer ${arg.length} bytes]`
        if (arg instanceof ArrayBuffer) return `[ArrayBuffer ${arg.byteLength} bytes]`
        if (Array.isArray(arg)) return `[Array ${arg.length} items]`
        return '[Object]'
      }

      return arg
    })
  }

  /**
   * Generate call pattern string for analysis
   */
  private generateCallPattern(callFrame: CallStackFrame): string {
    const argTypes = callFrame.argumentTypes?.join(',') || ''
    return `${callFrame.functionName}(${argTypes})@depth:${callFrame.depth}`
  }

  /**
   * Analyze call patterns to identify recursion
   */
  private analyzeCallPatterns(recentCalls: CallStackFrame[]): Record<string, number> {
    const patterns: Record<string, number> = {}

    for (const call of recentCalls) {
      const pattern = this.generateCallPattern(call)
      patterns[pattern] = (patterns[pattern] || 0) + 1
    }

    return patterns
  }

  /**
   * Get visualization data for call stack patterns
   */
  getCallStackVisualization(functionName?: string): {
    functionName: string
    timeline: Array<{timestamp: number; depth: number; function: string}>
    patterns: Record<string, number>
    maxDepth: number
    averageDepth: number
  }[] {
    const visualizations: Array<{
      functionName: string
      timeline: Array<{timestamp: number; depth: number; function: string}>
      patterns: Record<string, number>
      maxDepth: number
      averageDepth: number
    }> = []

    const functions = functionName ? [functionName] : Array.from(this.breakers.keys())

    for (const fn of functions) {
      const breaker = this.breakers.get(fn)
      if (!breaker) continue

      const timeline = breaker.callHistory.map(call => ({
        timestamp: call.timestamp,
        depth: call.depth,
        function: call.functionName
      }))

      const depths = breaker.callHistory.map(call => call.depth)
      const averageDepth =
        depths.length > 0 ? depths.reduce((sum, depth) => sum + depth, 0) / depths.length : 0

      visualizations.push({
        functionName: fn,
        timeline,
        patterns: Object.fromEntries(breaker.callPatterns),
        maxDepth: breaker.maxDepth,
        averageDepth
      })
    }

    return visualizations
  }

  /**
   * Get performance metrics summary
   */
  getPerformanceMetrics(): {
    systemMetrics: SystemMetrics[]
    memoryTrend: 'rising' | 'falling' | 'stable'
    cpuTrend: 'rising' | 'falling' | 'stable'
    responseTrend: 'rising' | 'falling' | 'stable'
    recommendations: string[]
  } {
    const recent = this.systemMetrics.slice(-10)
    if (recent.length < 2) {
      return {
        systemMetrics: this.systemMetrics,
        memoryTrend: 'stable',
        cpuTrend: 'stable',
        responseTrend: 'stable',
        recommendations: []
      }
    }

    const first = recent[0]
    const last = recent[recent.length - 1]

    const memoryTrend = this.getTrend(first.memoryUsage, last.memoryUsage)
    const cpuTrend = this.getTrend(first.cpuLoad, last.cpuLoad)
    const responseTrend = this.getTrend(first.averageResponseTime, last.averageResponseTime)

    const recommendations: string[] = []

    if (memoryTrend === 'rising' && last.memoryUsage > 100 * 1024 * 1024) {
      recommendations.push('Memory usage is rising - consider implementing cleanup strategies')
    }

    if (cpuTrend === 'rising' && last.cpuLoad > 70) {
      recommendations.push('CPU load is high - consider reducing call depth thresholds')
    }

    if (responseTrend === 'rising' && last.averageResponseTime > 3000) {
      recommendations.push('Response times are increasing - system may be under stress')
    }

    return {
      systemMetrics: this.systemMetrics,
      memoryTrend,
      cpuTrend,
      responseTrend,
      recommendations
    }
  }

  /**
   * Helper to determine trend direction
   */
  private getTrend(start: number, end: number): 'rising' | 'falling' | 'stable' {
    const change = (end - start) / start
    if (change > 0.1) return 'rising'
    if (change < -0.1) return 'falling'
    return 'stable'
  }

  /**
   * Report errors that occurred during function execution
   */
  reportError(functionName: string, error: Error): void {
    console.error(`🚨 EMERGENCY: Error in ${functionName}:`, error.message)

    // Check if this is a stack overflow error
    if (
      error.message.includes('Maximum call stack size exceeded') ||
      error.name === 'RangeError' ||
      error.message.includes('call stack')
    ) {
      console.error(
        `🚨 EMERGENCY: Stack overflow detected in ${functionName}! Tripping breaker immediately.`
      )
      this.tripBreaker(functionName, error)
    } else {
      // Regular error handling
      const breaker = this.getOrCreateBreaker(functionName)
      breaker.errorCount++

      if (breaker.errorCount >= this.MAX_ERRORS) {
        this.tripBreaker(functionName, error)
      }
    }
  }

  /**
   * Get emergency status for debugging
   */
  getEmergencyStatus(): Record<string, unknown> {
    const status: Record<string, unknown> = {}

    for (const [name, breaker] of this.breakers) {
      status[name] = {
        isOpen: breaker.isOpen,
        errorCount: breaker.errorCount,
        currentDepth: breaker.currentDepth,
        maxDepth: breaker.maxDepth,
        callHistoryLength: breaker.callHistory.length,
        lastError: breaker.lastError ? new Date(breaker.lastError).toISOString() : null
      }
    }

    return status
  }

  /**
   * Emergency reset - use only in extreme cases
   */
  emergencyReset(): void {
    console.warn('🚨 EMERGENCY RESET: Resetting all circuit breakers')
    this.breakers.clear()
  }

  /**
   * Manually reset a specific circuit breaker
   */
  manualReset(functionName: string): boolean {
    if (this.breakers.has(functionName)) {
      this.resetBreaker(functionName)
      console.info(`🔄 Manual reset performed for ${functionName} circuit breaker`)
      return true
    }
    return false
  }

  /**
   * Manually reset all circuit breakers
   */
  manualResetAll(): void {
    const resetCount = this.breakers.size
    for (const functionName of this.breakers.keys()) {
      this.resetBreaker(functionName)
    }
    console.info(`🔄 Manual reset performed for ${resetCount} circuit breakers`)
  }

  /**
   * Get list of currently tripped breakers
   */
  getTrippedBreakers(): string[] {
    return Array.from(this.breakers.entries())
      .filter(([, breaker]) => breaker.isOpen)
      .map(([name]) => name)
  }

  private getOrCreateBreaker(functionName: string): EmergencyBreaker {
    if (!this.breakers.has(functionName)) {
      this.breakers.set(functionName, {
        callDepth: 0,
        currentDepth: 0,
        maxDepth: 0,
        threshold: 50,
        dynamicThreshold: 50,
        isOpen: false,
        errorCount: 0,
        lastResetTime: Date.now(),
        callHistory: [],
        performanceHistory: [],
        callPatterns: new Map()
      })
    }
    return this.breakers.get(functionName)!
  }

  /**
   * Enhanced call completion with performance tracking
   */
  emergencyCallComplete(functionName: string): void {
    const breaker = this.getOrCreateBreaker(functionName)
    breaker.currentDepth = Math.max(0, breaker.currentDepth - 1)

    // Clean old history
    const now = Date.now()
    breaker.callHistory = breaker.callHistory.filter(
      call => now - call.timestamp < 10000 // Keep last 10 seconds
    )

    // Update performance metrics if enabled
    if (this.performanceMonitoringEnabled && breaker.callHistory.length > 0) {
      const lastCall = breaker.callHistory[breaker.callHistory.length - 1]
      if (lastCall && lastCall.performanceMetrics) {
        // Record completion time for response time calculation
        lastCall.performanceMetrics.cpuLoad = now - lastCall.timestamp
        lastCall.performanceMetrics.averageResponseTime = now - lastCall.timestamp
      }
    }
  }

  private tripBreaker(functionName: string, error: Error): void {
    const breaker = this.getOrCreateBreaker(functionName)
    breaker.isOpen = true
    breaker.lastError = Date.now()
    breaker.maxDepth = Math.max(breaker.maxDepth, breaker.currentDepth)

    console.error(`🚨 EMERGENCY: Circuit breaker TRIPPED for ${functionName}!`, {
      errorCount: breaker.errorCount,
      currentDepth: breaker.currentDepth,
      maxDepth: breaker.maxDepth,
      error: error.message,
      callHistoryLength: breaker.callHistory.length
    })

    // Force reset depth to prevent further issues
    breaker.currentDepth = 0

    // Emit emergency event
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent('emergency-circuit-breaker-trip', {
          detail: {functionName, error: error.message, breaker}
        })
      )
    }
  }

  private resetBreaker(functionName: string): void {
    const breaker = this.getOrCreateBreaker(functionName)
    breaker.isOpen = false
    breaker.errorCount = 0
    breaker.currentDepth = 0
    breaker.callHistory = []
    breaker.callPatterns.clear()

    console.info(`✅ Circuit breaker RESET for ${functionName}`)
  }
}

// Emergency decorator for automatic protection
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function emergencyProtected(
  target: any,
  propertyName: string,
  descriptor: PropertyDescriptor
) {
  const method = descriptor.value
  const breaker = EmergencyCircuitBreaker.getInstance()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descriptor.value = function (...args: any[]) {
    const functionName = `${target.constructor.name}.${propertyName}`

    // Emergency guard with args
    if (!breaker.emergencyCallGuard(functionName, args)) {
      console.warn(`🚨 EMERGENCY: Blocked call to ${functionName} due to circuit breaker`)
      return Promise.reject(new Error(`Circuit breaker is open for ${functionName}`))
    }

    try {
      const result = method.apply(this, args)

      // Handle promises
      if (result && typeof result.then === 'function') {
        return (
          result
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then((value: any) => {
              breaker.emergencyCallComplete(functionName)
              return value
            })
            .catch((error: Error) => {
              breaker.reportError(functionName, error)
              breaker.emergencyCallComplete(functionName)
              throw error
            })
        )
      } else {
        breaker.emergencyCallComplete(functionName)
        return result
      }
    } catch (error) {
      breaker.reportError(functionName, error as Error)
      breaker.emergencyCallComplete(functionName)
      throw error
    }
  }

  return descriptor
}

export {EmergencyCircuitBreaker}
export default EmergencyCircuitBreaker
