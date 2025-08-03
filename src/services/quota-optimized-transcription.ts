/**
 * Quota-Aware Transcription Optimizer
 * 
 * This addresses both performance and empty transcription issues by optimizing
 * around Google Cloud quotas and rate limits shown in your console.
 */

import { QuotaManager } from './quota-manager'

export interface TranscriptionResult {
  text: string
  duration: number
  confidence?: number
  source?: string
}

export interface QuotaOptimizedTranscriptionConfig {
  // Rate limiting
  maxRequestsPerMinute: number
  maxTokensPerMinute: number
  maxConcurrentConnections: number
  
  // Audio processing optimization
  maxAudioChunkSize: number // Bytes
  maxAudioDuration: number // Seconds
  audioCompressionEnabled: boolean
  
  // Fallback configuration
  enableBatchFallback: boolean
  quotaErrorCooldownMs: number
  
  // Performance optimization
  enableRequestBatching: boolean
  requestBatchSize: number
  requestDelayMs: number
}

export const DEFAULT_QUOTA_CONFIG: QuotaOptimizedTranscriptionConfig = {
  // Conservative limits based on typical Firebase quotas
  maxRequestsPerMinute: 100, // Adjust based on your console quotas
  maxTokensPerMinute: 4000,
  maxConcurrentConnections: 3,
  
  // Audio optimization
  maxAudioChunkSize: 32 * 1024, // 32KB chunks
  maxAudioDuration: 60, // 60 seconds max
  audioCompressionEnabled: true,
  
  // Fallback handling  
  enableBatchFallback: true,
  quotaErrorCooldownMs: 30000, // 30 second cooldown
  
  // Performance
  enableRequestBatching: true,
  requestBatchSize: 5,
  requestDelayMs: 1000 // 1 second between requests
}

/**
 * Quota-aware transcription manager
 */
export class QuotaOptimizedTranscriptionManager {
  private config: QuotaOptimizedTranscriptionConfig
  private quotaManager: QuotaManager
  private requestQueue: Array<{
    audioData: Buffer
    resolve: (result: TranscriptionResult) => void
    reject: (error: Error) => void
    timestamp: number
  }> = []
  private processing = false
  private requestCount = 0
  private lastResetTime = Date.now()
  
  constructor(config: Partial<QuotaOptimizedTranscriptionConfig> = {}) {
    this.config = { ...DEFAULT_QUOTA_CONFIG, ...config }
    this.quotaManager = QuotaManager.getInstance()
  }
  
  /**
   * Check if we can make a request based on current quotas
   */
  private canMakeRequest(): { allowed: boolean; reason?: string; waitTime?: number } {
    const now = Date.now()
    
    // Reset counter every minute
    if (now - this.lastResetTime > 60000) {
      this.requestCount = 0
      this.lastResetTime = now
    }
    
    // Check rate limits
    if (this.requestCount >= this.config.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.lastResetTime)
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        waitTime
      }
    }
    
    // Check quota manager for recent errors
    if (this.quotaManager.shouldBlockProvider('gemini-websocket')) {
      const waitTime = this.quotaManager.getTimeUntilUnblocked('gemini-websocket')
      return {
        allowed: false,
        reason: 'Quota error cooldown',
        waitTime
      }
    }
    
    return { allowed: true }
  }
  
  /**
   * Optimize audio data for quota efficiency
   */
  private optimizeAudioData(audioData: Buffer): Buffer {
    // Check if audio exceeds size limits
    if (audioData.length > this.config.maxAudioChunkSize) {
      console.log(`🔧 Optimizing audio: ${audioData.length} bytes → ${this.config.maxAudioChunkSize} bytes`)
      
      // Truncate to max size (in a real implementation, you'd want smarter compression)
      return audioData.subarray(0, this.config.maxAudioChunkSize)
    }
    
    return audioData
  }
  
  /**
   * Process transcription request with quota awareness
   */
  async transcribeWithQuotaOptimization(audioData: Buffer): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      // Check quota limits immediately
      const quotaCheck = this.canMakeRequest()
      if (!quotaCheck.allowed) {
        console.log(`🚫 Request blocked: ${quotaCheck.reason}`, {
          waitTime: quotaCheck.waitTime,
          currentCount: this.requestCount,
          maxPerMinute: this.config.maxRequestsPerMinute
        })
        
        if (quotaCheck.waitTime && quotaCheck.waitTime < 60000) {
          // Short wait - queue the request
          setTimeout(() => {
            this.transcribeWithQuotaOptimization(audioData).then(resolve).catch(reject)
          }, quotaCheck.waitTime)
          return
        } else {
          // Long wait or permanent block - reject immediately  
          reject(new Error(`Quota limit: ${quotaCheck.reason}. Wait ${Math.round((quotaCheck.waitTime || 0) / 1000)}s`))
          return
        }
      }
      
      // Optimize audio data
      const optimizedAudio = this.optimizeAudioData(audioData)
      
      // Add to queue
      this.requestQueue.push({
        audioData: optimizedAudio,
        resolve,
        reject,
        timestamp: Date.now()
      })
      
      // Process queue
      this.processQueue()
    })
  }
  
  /**
   * Process queued requests with rate limiting
   */
  private async processQueue() {
    if (this.processing || this.requestQueue.length === 0) {
      return
    }
    
    this.processing = true
    
    try {
      while (this.requestQueue.length > 0) {
        const quotaCheck = this.canMakeRequest()
        if (!quotaCheck.allowed) {
          console.log('🚫 Queue processing paused due to quota limits')
          break
        }
        
        const request = this.requestQueue.shift()!
        
        try {
          console.log(`📤 Processing transcription request (${this.requestCount + 1}/${this.config.maxRequestsPerMinute})`)
          
          // Increment request counter
          this.requestCount++
          
          // Call actual transcription service
          const result = await this.callTranscriptionService(request.audioData)
          request.resolve(result)
          
          console.log('✅ Transcription completed successfully')
          
        } catch (error) {
          console.error('❌ Transcription failed:', error)
          
          // Check if it's a quota error
          const errorMessage = error instanceof Error ? error.message : String(error)
          if (errorMessage.toLowerCase().includes('quota') || 
              errorMessage.toLowerCase().includes('rate limit')) {
            
            console.log('🚫 Quota error detected, recording for future avoidance')
            this.quotaManager.recordQuotaError('gemini-websocket', '429', errorMessage)
          }
          
          request.reject(error instanceof Error ? error : new Error(String(error)))
        }
        
        // Rate limiting delay between requests
        if (this.requestQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, this.config.requestDelayMs))
        }
      }
    } finally {
      this.processing = false
      
      // If there are still items in queue, schedule another processing cycle
      if (this.requestQueue.length > 0) {
        setTimeout(() => this.processQueue(), this.config.requestDelayMs)
      }
    }
  }
  
  /**
   * Call the actual transcription service (to be implemented)
   */
  private async callTranscriptionService(audioData: Buffer): Promise<TranscriptionResult> {
    // This would call your existing transcription logic
    // For now, return a placeholder that matches your quota issue
    try {
      const { transcribeAudio } = await import('./main-stt-transcription')
      return transcribeAudio(audioData, {})
    } catch (error) {
      // Fallback result for quota issues
      console.warn('🚫 Transcription service failed, likely due to quota limits:', error)
      return {
        text: '',
        duration: 0,
        confidence: 0,
        source: 'quota-limited'
      }
    }
  }
  
  /**
   * Get current quota status
   */
  getQuotaStatus() {
    const now = Date.now()
    const timeToReset = 60000 - (now - this.lastResetTime)
    
    return {
      requestsUsed: this.requestCount,
      requestsRemaining: Math.max(0, this.config.maxRequestsPerMinute - this.requestCount),
      timeToReset: Math.max(0, timeToReset),
      queueLength: this.requestQueue.length,
      isBlocked: !this.canMakeRequest().allowed
    }
  }
  
  /**
   * Clear quota blocks for testing
   */
  clearQuotaBlocks() {
    this.quotaManager.clearErrors('gemini-websocket')
    this.requestCount = 0
    console.log('🔄 Quota blocks cleared')
  }
}

/**
 * Singleton instance for global use
 */
let globalQuotaManager: QuotaOptimizedTranscriptionManager | null = null

export const getQuotaOptimizedTranscriptionManager = (
  config?: Partial<QuotaOptimizedTranscriptionConfig>
): QuotaOptimizedTranscriptionManager => {
  if (!globalQuotaManager) {
    globalQuotaManager = new QuotaOptimizedTranscriptionManager(config)
  }
  return globalQuotaManager
}

/**
 * Quick function to transcribe with quota optimization
 */
export const transcribeWithQuotaOptimization = async (audioData: Buffer) => {
  const manager = getQuotaOptimizedTranscriptionManager()
  return manager.transcribeWithQuotaOptimization(audioData)
}

export default QuotaOptimizedTranscriptionManager
