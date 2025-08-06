/**
 * Service Pre-warming Utility
 * 
 * Optimizes startup performance by pre-initializing critical services
 * in parallel during application startup, reducing the 30-second delay
 * experienced when users first start transcription.
 */

import { markPerformance, PERFORMANCE_MARKERS } from './performance-profiler'
import { logger } from '../services/gemini-logger'

interface PrewarmingResult {
  service: string
  success: boolean
  duration: number
  error?: Error
}

class ServicePrewarmer {
  private static instance: ServicePrewarmer | null = null
  private prewarmingPromise: Promise<PrewarmingResult[]> | null = null
  private isPrewarming = false

  static getInstance(): ServicePrewarmer {
    if (!ServicePrewarmer.instance) {
      ServicePrewarmer.instance = new ServicePrewarmer()
    }
    return ServicePrewarmer.instance
  }

  /**
   * Start pre-warming critical services immediately after app startup
   */
  async prewarmServices(): Promise<PrewarmingResult[]> {
    if (this.prewarmingPromise) {
      return this.prewarmingPromise
    }

    this.isPrewarming = true
    markPerformance(PERFORMANCE_MARKERS.APPLICATION_START)

    this.prewarmingPromise = this.executePrewarming()
    return this.prewarmingPromise
  }

  private async executePrewarming(): Promise<PrewarmingResult[]> {
    logger.info('🚀 Starting service pre-warming for faster transcription startup')
    
    const results: PrewarmingResult[] = []
    const prewarmTasks: Array<() => Promise<PrewarmingResult>> = [
      () => this.prewarmWebSocketConnection(),
      () => this.prewarmAudioServices(),
      () => this.prewarmTranscriptionEngine()
    ]

    // Execute all pre-warming tasks in parallel
    const prewarmPromises = prewarmTasks.map(task => task())
    const taskResults = await Promise.allSettled(prewarmPromises)

    taskResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        results.push({
          service: `Task ${index}`,
          success: false,
          duration: 0,
          error: result.reason
        })
      }
    })

    this.isPrewarming = false
    this.logPrewarmingResults(results)
    
    return results
  }

  /**
   * Pre-warm WebSocket connection pool
   */
  private async prewarmWebSocketConnection(): Promise<PrewarmingResult> {
    const startTime = performance.now()
    
    try {
      markPerformance(PERFORMANCE_MARKERS.WEBSOCKET_INIT_START)
      
      // Import and initialize connection pool
      const { GeminiConnectionPool } = await import('../services/gemini-connection-pool')
      const connectionPool = GeminiConnectionPool.getInstance()
      
      // Initialize with minimal configuration for pre-warming
      await connectionPool.initialize()
      
      markPerformance(PERFORMANCE_MARKERS.WEBSOCKET_CONNECTED)
      
      const duration = performance.now() - startTime
      logger.info(`✅ WebSocket pre-warming completed in ${duration.toFixed(2)}ms`)
      
      return {
        service: 'WebSocket Connection Pool',
        success: true,
        duration
      }
    } catch (error) {
      const duration = performance.now() - startTime
      logger.warn(`❌ WebSocket pre-warming failed after ${duration.toFixed(2)}ms:`, error)
      
      return {
        service: 'WebSocket Connection Pool',
        success: false,
        duration,
        error: error as Error
      }
    }
  }

  /**
   * Pre-warm audio services
   */
  private async prewarmAudioServices(): Promise<PrewarmingResult> {
    const startTime = performance.now()
    
    try {
      markPerformance(PERFORMANCE_MARKERS.AUDIO_INIT_START)
      
      // Pre-load audio service modules
      const [
        { AudioWebSocketIntegration },
        { EnhancedAudioRecording },
        { AudioFormatConverter }
      ] = await Promise.all([
        import('../services/audio-websocket-integration'),
        import('../services/enhanced-audio-recording'),
        import('../services/audio-format-converter')
      ])

      // Pre-initialize format converter (lightweight)
      const formatConverter = new AudioFormatConverter({
        inputFormat: { sampleRate: 44100, channels: 1, bitDepth: 16 },
        outputFormat: { format: 'pcm16', sampleRate: 16000, channels: 1 },
        enableCompression: false,
        qualityLevel: 0.8
      })

      await formatConverter.initialize()
      
      // Pre-load other audio classes for faster instantiation later
      logger.debug('Pre-loaded audio classes:', {
        integration: AudioWebSocketIntegration.name,
        recording: EnhancedAudioRecording.name
      })
      
      markPerformance(PERFORMANCE_MARKERS.AUDIO_READY)
      
      const duration = performance.now() - startTime
      logger.info(`✅ Audio services pre-warming completed in ${duration.toFixed(2)}ms`)
      
      return {
        service: 'Audio Services',
        success: true,
        duration
      }
    } catch (error) {
      const duration = performance.now() - startTime
      logger.warn(`❌ Audio services pre-warming failed after ${duration.toFixed(2)}ms:`, error)
      
      return {
        service: 'Audio Services',
        success: false,
        duration,
        error: error as Error
      }
    }
  }

  /**
   * Pre-warm transcription engine
   */
  private async prewarmTranscriptionEngine(): Promise<PrewarmingResult> {
    const startTime = performance.now()
    
    try {
      markPerformance(PERFORMANCE_MARKERS.TRANSCRIPTION_INIT_START)
      
      // Pre-load transcription modules
      const [
        { getTranscriptionStateManager },
        { GeminiTranscriptionBridge }
      ] = await Promise.all([
        import('../state/TranscriptionStateManager'),
        import('../services/gemini-transcription-bridge')
      ])

      // Initialize transcription state manager
      const stateManager = getTranscriptionStateManager()
      
      // Pre-warm transcription bridge (lightweight initialization)
      const bridge = new GeminiTranscriptionBridge()
      
      // Verify services are ready
      logger.debug('Pre-warmed transcription services:', {
        stateManager: !!stateManager,
        bridge: !!bridge
      })
      
      markPerformance(PERFORMANCE_MARKERS.TRANSCRIPTION_READY)
      
      const duration = performance.now() - startTime
      logger.info(`✅ Transcription engine pre-warming completed in ${duration.toFixed(2)}ms`)
      
      return {
        service: 'Transcription Engine',
        success: true,
        duration
      }
    } catch (error) {
      const duration = performance.now() - startTime
      logger.warn(`❌ Transcription engine pre-warming failed after ${duration.toFixed(2)}ms:`, error)
      
      return {
        service: 'Transcription Engine',
        success: false,
        duration,
        error: error as Error
      }
    }
  }

  /**
   * Log pre-warming results with performance analysis
   */
  private logPrewarmingResults(results: PrewarmingResult[]): void {
    console.log('\n📊 SERVICE PRE-WARMING RESULTS')
    console.log('==============================')
    
    const totalDuration = results.reduce((sum, result) => sum + result.duration, 0)
    const successCount = results.filter(r => r.success).length
    
    results.forEach(result => {
      const status = result.success ? '✅' : '❌'
      const duration = result.duration.toFixed(2)
      console.log(`${status} ${result.service}: ${duration}ms`)
      
      if (!result.success && result.error) {
        console.log(`   Error: ${result.error.message}`)
      }
    })
    
    console.log(`\n📈 Pre-warming Summary:`)
    console.log(`   Success Rate: ${successCount}/${results.length} (${((successCount/results.length)*100).toFixed(1)}%)`)
    console.log(`   Total Time: ${totalDuration.toFixed(2)}ms`)
    console.log(`   Estimated Startup Improvement: ${this.calculateSpeedupEstimate(results)}`)
    
    // Mark pre-warming complete
    markPerformance('prewarming_complete')
  }

  /**
   * Estimate startup speedup from pre-warming
   */
  private calculateSpeedupEstimate(results: PrewarmingResult[]): string {
    const successfulPrewarms = results.filter(r => r.success)
    const totalSavedTime = successfulPrewarms.length * 3000 // Estimate 3s saved per service
    const actualTime = results.reduce((sum, r) => sum + r.duration, 0)
    const netSavings = totalSavedTime - actualTime
    
    if (netSavings > 0) {
      return `~${(netSavings/1000).toFixed(1)}s faster startup`
    } else {
      return 'Minimal impact (services needed immediate init anyway)'
    }
  }

  /**
   * Check if pre-warming is currently in progress
   */
  get isInProgress(): boolean {
    return this.isPrewarming
  }

  /**
   * Get pre-warming results if completed
   */
  async getResults(): Promise<PrewarmingResult[] | null> {
    if (!this.prewarmingPromise) {
      return null
    }
    
    try {
      return await this.prewarmingPromise
    } catch (error) {
      logger.error('Failed to get pre-warming results:', error)
      return null
    }
  }
}

// Export singleton instance and convenience functions
export const servicePrewarmer = ServicePrewarmer.getInstance()

export async function prewarmCriticalServices(): Promise<PrewarmingResult[]> {
  return servicePrewarmer.prewarmServices()
}

export function isPrewarmingInProgress(): boolean {
  return servicePrewarmer.isInProgress
}

export async function getPrewarmingResults(): Promise<PrewarmingResult[] | null> {
  return servicePrewarmer.getResults()
}
