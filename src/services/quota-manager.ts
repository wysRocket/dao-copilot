/**
 * Quota Management Service
 * Handles API quota tracking and intelligent fallback decisions
 */

interface QuotaError {
  timestamp: number
  provider: string
  errorCode?: string
  errorMessage?: string
}

interface QuotaStatus {
  provider: string
  recentErrors: QuotaError[]
  isBlocked: boolean
  nextRetryTime: number
  totalErrors: number
}

export class QuotaManager {
  private static instance: QuotaManager | null = null
  private quotaErrors: Map<string, QuotaError[]> = new Map()
  private readonly QUOTA_ERROR_WINDOW = 5 * 60 * 1000 // 5 minute window
  private readonly MAX_ERRORS_PER_WINDOW = 3
  private readonly BLOCK_DURATION = 10 * 60 * 1000 // 10 minute block
  private readonly MAX_STORED_ERRORS = 100

  private constructor() {
    // Private constructor for singleton pattern
    this.startCleanupInterval()
  }

  public static getInstance(): QuotaManager {
    if (!QuotaManager.instance) {
      QuotaManager.instance = new QuotaManager()
    }
    return QuotaManager.instance
  }

  /**
   * Record a quota error for a specific provider
   */
  public recordQuotaError(provider: string, errorCode?: string, errorMessage?: string): void {
    const error: QuotaError = {
      timestamp: Date.now(),
      provider,
      errorCode,
      errorMessage
    }

    // Get existing errors for provider
    const providerErrors = this.quotaErrors.get(provider) || []
    
    // Add new error
    providerErrors.push(error)
    
    // Keep only recent errors within the storage limit
    const recentErrors = providerErrors
      .filter(err => Date.now() - err.timestamp < this.QUOTA_ERROR_WINDOW)
      .slice(-this.MAX_STORED_ERRORS)
    
    this.quotaErrors.set(provider, recentErrors)

    console.warn(`🚫 Quota error recorded for ${provider}:`, {
      errorCode,
      errorMessage,
      recentErrorCount: recentErrors.length
    })
  }

  /**
   * Check if a provider should be blocked due to recent quota errors
   */
  public shouldBlockProvider(provider: string): boolean {
    const recentErrors = this.getRecentErrors(provider)
    const now = Date.now()
    
    // Check if we're within a block period
    if (recentErrors.length >= this.MAX_ERRORS_PER_WINDOW) {
      const latestError = Math.max(...recentErrors.map(e => e.timestamp))
      const blockEndTime = latestError + this.BLOCK_DURATION
      
      if (now < blockEndTime) {
        console.log(`🚫 Provider ${provider} blocked until ${new Date(blockEndTime).toLocaleTimeString()}`)
        return true
      }
    }
    
    return false
  }

  /**
   * Get quota status for a provider
   */
  public getQuotaStatus(provider: string): QuotaStatus {
    const allErrors = this.quotaErrors.get(provider) || []
    const recentErrors = this.getRecentErrors(provider)
    const isBlocked = this.shouldBlockProvider(provider)
    
    let nextRetryTime = 0
    if (isBlocked && recentErrors.length > 0) {
      const latestError = Math.max(...recentErrors.map(e => e.timestamp))
      nextRetryTime = latestError + this.BLOCK_DURATION
    }
    
    return {
      provider,
      recentErrors,
      isBlocked,
      nextRetryTime,
      totalErrors: allErrors.length
    }
  }

  /**
   * Get recent errors for a provider within the error window
   */
  private getRecentErrors(provider: string): QuotaError[] {
    const errors = this.quotaErrors.get(provider) || []
    const now = Date.now()
    
    return errors.filter(error => now - error.timestamp < this.QUOTA_ERROR_WINDOW)
  }

  /**
   * Clear errors for a provider (useful for testing or manual reset)
   */
  public clearErrors(provider: string): void {
    this.quotaErrors.delete(provider)
    console.log(`🔄 Cleared quota errors for provider: ${provider}`)
  }

  /**
   * Clear all errors for all providers
   */
  public clearAllErrors(): void {
    this.quotaErrors.clear()
    console.log('🔄 Cleared all quota errors')
  }

  /**
   * Get summary of all quota statuses
   */
  public getAllQuotaStatuses(): Map<string, QuotaStatus> {
    const statuses = new Map<string, QuotaStatus>()
    
    for (const provider of this.quotaErrors.keys()) {
      statuses.set(provider, this.getQuotaStatus(provider))
    }
    
    return statuses
  }

  /**
   * Get time until provider is unblocked (0 if not blocked)
   */
  public getTimeUntilUnblocked(provider: string): number {
    const status = this.getQuotaStatus(provider)
    if (!status.isBlocked) return 0
    
    return Math.max(0, status.nextRetryTime - Date.now())
  }

  /**
   * Start cleanup interval to remove old errors
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupOldErrors()
    }, 60000) // Cleanup every minute
  }

  /**
   * Remove errors older than the error window
   */
  private cleanupOldErrors(): void {
    const now = Date.now()
    const cutoffTime = now - this.QUOTA_ERROR_WINDOW
    
    for (const [provider, errors] of this.quotaErrors.entries()) {
      const filteredErrors = errors.filter(error => error.timestamp > cutoffTime)
      
      if (filteredErrors.length === 0) {
        this.quotaErrors.delete(provider)
      } else if (filteredErrors.length !== errors.length) {
        this.quotaErrors.set(provider, filteredErrors)
      }
    }
  }

  /**
   * Check if an error message indicates a quota issue
   */
  public static isQuotaError(error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const quotaIndicators = [
      'quota',
      'rate limit',
      'too many requests', 
      '429',
      '1011',
      'exceeded',
      'usage limit'
    ]
    
    return quotaIndicators.some(indicator => 
      errorMessage.toLowerCase().includes(indicator.toLowerCase())
    )
  }

  /**
   * Extract error code from various error types
   */
  public static extractErrorCode(error: unknown): string | undefined {
    if (error && typeof error === 'object') {
      const errorObj = error as {
        code?: string | number
        status?: string | number
        statusCode?: string | number
        response?: { status?: string | number }
      }
      
      return String(
        errorObj.code || 
        errorObj.status || 
        errorObj.statusCode || 
        errorObj.response?.status || 
        'unknown'
      )
    }
    
    return undefined
  }
}

export default QuotaManager
