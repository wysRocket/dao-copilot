/**
 * Voice Activity Detection (VAD) Manager
 * 
 * Integrates with Google Gemini Live API to handle voice activity detection,
 * interruption management, and real-time audio processing coordination.
 * 
 * Based on official Google Gemini Live API v2 VAD support:
 * https://ai.google.dev/gemini-api/docs/live-guide#interruptions
 */

import {EventEmitter} from 'events'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'

export interface VADConfig {
  // Sensitivity settings
  threshold: number // 0.0 to 1.0, higher = more sensitive
  minSpeechDuration: number // minimum ms for speech detection
  maxSilenceDuration: number // maximum ms of silence before stopping
  
  // Processing settings
  windowSize: number // analysis window size in ms
  hopLength: number // hop length in ms between analysis windows
  
  // Integration settings
  enableInterruption: boolean // allow interrupting model responses
  interruptionThreshold: number // threshold for interruption detection
  gracePeriodMs: number // grace period before allowing interruptions
  
  // Performance settings
  enableBatchProcessing: boolean
  batchSize: number
  maxProcessingDelay: number
}

export interface VADState {
  isActive: boolean
  isSpeaking: boolean
  confidence: number
  lastActivityTime: number
  silenceDuration: number
  speechDuration: number
  canInterrupt: boolean
}

export interface VADEvent {
  type: 'speech_start' | 'speech_end' | 'silence_detected' | 'interruption_detected' | 'activity_change'
  confidence: number
  timestamp: number
  audioData?: Float32Array
  metadata?: {
    duration?: number
    silenceDuration?: number
    speechDuration?: number
    canInterrupt?: boolean
  }
}

export interface VADMetrics {
  totalAnalyzedFrames: number
  speechFrames: number
  silenceFrames: number
  interruptionCount: number
  averageConfidence: number
  processingLatency: number
  lastActivityTime: number
}

/**
 * Voice Activity Detection Manager
 * Handles real-time voice activity detection for Google Gemini Live API integration
 */
export class VADManager extends EventEmitter {
  private config: VADConfig
  private state: VADState
  private metrics: VADMetrics
  private audioBuffer: Float32Array[]
  private analysisTimer: NodeJS.Timeout | null = null
  private gracePeriodTimer: NodeJS.Timeout | null = null
  private isInitialized = false
  
  // Audio analysis state
  private currentWindow: Float32Array | null = null
  private windowIndex = 0
  private lastProcessingTime = 0
  
  // Interruption management
  private modelSpeaking = false
  private userSpeakingStartTime: number | null = null
  private lastInterruptionTime = 0

  constructor(config: Partial<VADConfig> = {}) {
    super()
    
    this.config = {
      threshold: 0.3,
      minSpeechDuration: 300, // 300ms minimum
      maxSilenceDuration: 2000, // 2s maximum silence
      windowSize: 25, // 25ms analysis window
      hopLength: 10, // 10ms hop length
      enableInterruption: true,
      interruptionThreshold: 0.6, // higher threshold for interruptions
      gracePeriodMs: 500, // 500ms grace period
      enableBatchProcessing: true,
      batchSize: 10,
      maxProcessingDelay: 50, // 50ms max delay
      ...config
    }
    
    this.state = {
      isActive: false,
      isSpeaking: false,
      confidence: 0,
      lastActivityTime: 0,
      silenceDuration: 0,
      speechDuration: 0,
      canInterrupt: false
    }
    
    this.metrics = {
      totalAnalyzedFrames: 0,
      speechFrames: 0,
      silenceFrames: 0,
      interruptionCount: 0,
      averageConfidence: 0,
      processingLatency: 0,
      lastActivityTime: 0
    }
    
    this.audioBuffer = []
    
    logger.info('VADManager initialized', {
      threshold: this.config.threshold,
      enableInterruption: this.config.enableInterruption,
      windowSize: this.config.windowSize
    })
  }

  /**
   * Initialize the VAD manager
   */
  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) {
        logger.debug('VADManager already initialized')
        return
      }
      
      // Validate configuration
      this.validateConfig()
      
      // Set up analysis timer for continuous processing
      this.setupAnalysisTimer()
      
      this.isInitialized = true
      this.state.isActive = true
      
      logger.info('VADManager initialization complete', {
        windowSize: this.config.windowSize,
        hopLength: this.config.hopLength,
        threshold: this.config.threshold
      })
      
      this.emit('initialized')
    } catch (error) {
      logger.error('Failed to initialize VADManager', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Process audio chunk for voice activity detection
   */
  processAudioChunk(audioData: Float32Array, timestamp: number = Date.now()): VADEvent | null {
    if (!this.isInitialized || !this.state.isActive) {
      return null
    }
    
    try {
      const processingStart = performance.now()
      
      // Add audio data to buffer
      this.audioBuffer.push(audioData)
      
      // Process in batches if enabled
      if (this.config.enableBatchProcessing && this.audioBuffer.length < this.config.batchSize) {
        return null
      }
      
      // Analyze current audio window
      const vadResult = this.analyzeAudioWindow(audioData, timestamp)
      
      // Update metrics
      this.updateMetrics(vadResult, performance.now() - processingStart)
      
      // Generate VAD event if state changed
      const event = this.generateVADEvent(vadResult, timestamp)
      
      // Process batch if ready
      if (this.config.enableBatchProcessing) {
        this.processBatch(timestamp)
      }
      
      return event
    } catch (error) {
      logger.error('Error processing audio chunk for VAD', {
        error: error instanceof Error ? error.message : 'Unknown error',
        audioDataLength: audioData.length,
        timestamp
      })
      return null
    }
  }

  /**
   * Analyze audio window for voice activity
   */
  private analyzeAudioWindow(audioData: Float32Array, timestamp: number): {
    hasVoiceActivity: boolean
    confidence: number
    energy: number
    spectralCentroid: number
  } {
    // Calculate RMS energy
    let energy = 0
    for (let i = 0; i < audioData.length; i++) {
      energy += audioData[i] * audioData[i]
    }
    energy = Math.sqrt(energy / audioData.length)
    
    // Calculate spectral centroid for voice characteristics
    const spectralCentroid = this.calculateSpectralCentroid(audioData)
    
    // Simple VAD based on energy and spectral characteristics
    // In a production system, this would use more sophisticated ML models
    const energyThreshold = this.config.threshold * 0.1
    const spectralThreshold = this.config.threshold * 2000 // Hz
    
    const hasVoiceActivity = energy > energyThreshold && spectralCentroid > spectralThreshold
    
    // Calculate confidence based on multiple factors
    const energyConfidence = Math.min(energy / (energyThreshold * 2), 1.0)
    const spectralConfidence = Math.min(spectralCentroid / (spectralThreshold * 2), 1.0)
    const confidence = (energyConfidence + spectralConfidence) / 2
    
    return {
      hasVoiceActivity,
      confidence,
      energy,
      spectralCentroid
    }
  }

  /**
   * Calculate spectral centroid for voice activity detection
   */
  private calculateSpectralCentroid(audioData: Float32Array): number {
    // Simple spectral centroid calculation
    // In production, would use FFT and proper spectral analysis
    let weightedSum = 0
    let magnitudeSum = 0
    
    for (let i = 1; i < audioData.length - 1; i++) {
      const magnitude = Math.abs(audioData[i])
      weightedSum += i * magnitude
      magnitudeSum += magnitude
    }
    
    return magnitudeSum > 0 ? (weightedSum / magnitudeSum) * (22050 / audioData.length) : 0
  }

  /**
   * Generate VAD event based on analysis results
   */
  private generateVADEvent(vadResult: {
    hasVoiceActivity: boolean
    confidence: number
    energy: number
    spectralCentroid: number
  }, timestamp: number): VADEvent | null {
    const previouslySpeaking = this.state.isSpeaking
    const currentlySpeaking = vadResult.hasVoiceActivity && vadResult.confidence > this.config.threshold
    
    // Update state
    this.updateVADState(vadResult, timestamp, currentlySpeaking)
    
    // Check for state changes
    if (currentlySpeaking && !previouslySpeaking) {
      // Speech started
      this.userSpeakingStartTime = timestamp
      return {
        type: 'speech_start',
        confidence: vadResult.confidence,
        timestamp,
        metadata: {
          duration: 0,
          canInterrupt: this.state.canInterrupt
        }
      }
    } else if (!currentlySpeaking && previouslySpeaking) {
      // Speech ended
      const duration = this.userSpeakingStartTime ? timestamp - this.userSpeakingStartTime : 0
      this.userSpeakingStartTime = null
      
      return {
        type: 'speech_end',
        confidence: vadResult.confidence,
        timestamp,
        metadata: {
          duration,
          silenceDuration: this.state.silenceDuration
        }
      }
    } else if (currentlySpeaking && this.shouldTriggerInterruption(vadResult.confidence, timestamp)) {
      // Interruption detected
      this.metrics.interruptionCount++
      this.lastInterruptionTime = timestamp
      
      return {
        type: 'interruption_detected',
        confidence: vadResult.confidence,
        timestamp,
        metadata: {
          canInterrupt: this.state.canInterrupt,
          speechDuration: this.state.speechDuration
        }
      }
    } else if (!currentlySpeaking && this.state.silenceDuration > this.config.maxSilenceDuration) {
      // Extended silence detected
      return {
        type: 'silence_detected',
        confidence: vadResult.confidence,
        timestamp,
        metadata: {
          silenceDuration: this.state.silenceDuration
        }
      }
    }
    
    return null
  }

  /**
   * Update VAD state based on analysis results
   */
  private updateVADState(vadResult: {
    hasVoiceActivity: boolean
    confidence: number
  }, timestamp: number, currentlySpeaking: boolean): void {
    const timeDelta = timestamp - this.state.lastActivityTime
    
    this.state.isSpeaking = currentlySpeaking
    this.state.confidence = vadResult.confidence
    this.state.lastActivityTime = timestamp
    
    if (currentlySpeaking) {
      this.state.speechDuration += timeDelta
      this.state.silenceDuration = 0
    } else {
      this.state.silenceDuration += timeDelta
      if (this.state.silenceDuration > this.config.minSpeechDuration) {
        this.state.speechDuration = 0
      }
    }
    
    // Update interruption capability
    this.updateInterruptionState(timestamp)
  }

  /**
   * Update interruption state based on current conditions
   */
  private updateInterruptionState(timestamp: number): void {
    if (!this.config.enableInterruption) {
      this.state.canInterrupt = false
      return
    }
    
    // Check grace period
    const timeSinceLastInterruption = timestamp - this.lastInterruptionTime
    const gracePeriodExpired = timeSinceLastInterruption > this.config.gracePeriodMs
    
    // Can interrupt if model is speaking, grace period expired, and speech is strong enough
    this.state.canInterrupt = this.modelSpeaking && 
                               gracePeriodExpired && 
                               this.state.confidence > this.config.interruptionThreshold
  }

  /**
   * Check if interruption should be triggered
   */
  private shouldTriggerInterruption(confidence: number, timestamp: number): boolean {
    if (!this.state.canInterrupt) return false
    if (confidence < this.config.interruptionThreshold) return false
    if (!this.modelSpeaking) return false
    
    // Minimum speech duration before allowing interruption
    if (this.state.speechDuration < this.config.minSpeechDuration) return false
    
    return true
  }

  /**
   * Process batch of audio data
   */
  private processBatch(timestamp: number): void {
    if (this.audioBuffer.length === 0) return
    
    try {
      // Clear processed buffer
      this.audioBuffer = []
      
      // Update batch processing metrics
      this.metrics.totalAnalyzedFrames += this.config.batchSize
      
      this.emit('batch_processed', {
        timestamp,
        frameCount: this.config.batchSize
      })
    } catch (error) {
      logger.error('Error processing audio batch', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(vadResult: {hasVoiceActivity: boolean, confidence: number}, processingTime: number): void {
    this.metrics.totalAnalyzedFrames++
    this.metrics.processingLatency = processingTime
    
    if (vadResult.hasVoiceActivity) {
      this.metrics.speechFrames++
    } else {
      this.metrics.silenceFrames++
    }
    
    // Update average confidence (running average)
    const alpha = 0.1 // smoothing factor
    this.metrics.averageConfidence = alpha * vadResult.confidence + (1 - alpha) * this.metrics.averageConfidence
  }

  /**
   * Set up continuous analysis timer
   */
  private setupAnalysisTimer(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer)
    }
    
    this.analysisTimer = setInterval(() => {
      this.performContinuousAnalysis()
    }, this.config.hopLength)
  }

  /**
   * Perform continuous analysis of buffered audio
   */
  private performContinuousAnalysis(): void {
    if (!this.state.isActive || this.audioBuffer.length === 0) {
      return
    }
    
    const now = Date.now()
    
    // Check for processing delays
    if (now - this.lastProcessingTime > this.config.maxProcessingDelay) {
      logger.debug('VAD processing delay detected', {
        delay: now - this.lastProcessingTime,
        maxDelay: this.config.maxProcessingDelay
      })
    }
    
    this.lastProcessingTime = now
    
    // Emit activity change events
    this.emit('activity_change', {
      type: 'activity_change',
      confidence: this.state.confidence,
      timestamp: now,
      metadata: {
        isSpeaking: this.state.isSpeaking,
        canInterrupt: this.state.canInterrupt,
        speechDuration: this.state.speechDuration,
        silenceDuration: this.state.silenceDuration
      }
    })
  }

  /**
   * Set model speaking state (called when model starts/stops talking)
   */
  setModelSpeaking(speaking: boolean): void {
    const wasModelSpeaking = this.modelSpeaking
    this.modelSpeaking = speaking
    
    if (speaking && !wasModelSpeaking) {
      // Model started speaking - reset grace period
      this.lastInterruptionTime = Date.now()
      
      if (this.gracePeriodTimer) {
        clearTimeout(this.gracePeriodTimer)
      }
      
      // Set grace period timer
      this.gracePeriodTimer = setTimeout(() => {
        this.updateInterruptionState(Date.now())
        this.emit('grace_period_expired')
      }, this.config.gracePeriodMs)
    } else if (!speaking && wasModelSpeaking) {
      // Model stopped speaking
      this.state.canInterrupt = false
      
      if (this.gracePeriodTimer) {
        clearTimeout(this.gracePeriodTimer)
        this.gracePeriodTimer = null
      }
    }
    
    logger.debug('Model speaking state changed', {
      speaking,
      canInterrupt: this.state.canInterrupt
    })
  }

  /**
   * Get current VAD state
   */
  getState(): VADState {
    return {...this.state}
  }

  /**
   * Get performance metrics
   */
  getMetrics(): VADMetrics {
    return {...this.metrics}
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<VADConfig>): void {
    this.config = {...this.config, ...newConfig}
    this.validateConfig()
    
    // Restart analysis timer if timing changed
    if (newConfig.hopLength !== undefined) {
      this.setupAnalysisTimer()
    }
    
    logger.info('VADManager configuration updated', {
      threshold: this.config.threshold,
      enableInterruption: this.config.enableInterruption
    })
    
    this.emit('config_updated', this.config)
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.state.isSpeaking = false
    this.state.confidence = 0
    this.state.speechDuration = 0
    this.state.silenceDuration = 0
    this.state.canInterrupt = false
    this.userSpeakingStartTime = null
    this.audioBuffer = []
    
    logger.debug('VADManager state reset')
    this.emit('reset')
  }

  /**
   * Start VAD processing
   */
  start(): void {
    if (!this.isInitialized) {
      throw new Error('VADManager must be initialized before starting')
    }
    
    this.state.isActive = true
    this.setupAnalysisTimer()
    
    logger.info('VADManager started')
    this.emit('started')
  }

  /**
   * Stop VAD processing
   */
  stop(): void {
    this.state.isActive = false
    
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer)
      this.analysisTimer = null
    }
    
    if (this.gracePeriodTimer) {
      clearTimeout(this.gracePeriodTimer)
      this.gracePeriodTimer = null
    }
    
    this.reset()
    
    logger.info('VADManager stopped')
    this.emit('stopped')
  }

  /**
   * Destroy VAD manager and cleanup resources
   */
  destroy(): void {
    this.stop()
    this.removeAllListeners()
    this.audioBuffer = []
    this.isInitialized = false
    
    logger.info('VADManager destroyed')
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (this.config.threshold < 0 || this.config.threshold > 1) {
      throw new Error('VAD threshold must be between 0 and 1')
    }
    
    if (this.config.minSpeechDuration < 0) {
      throw new Error('Minimum speech duration must be positive')
    }
    
    if (this.config.windowSize <= 0 || this.config.hopLength <= 0) {
      throw new Error('Window size and hop length must be positive')
    }
    
    if (this.config.hopLength > this.config.windowSize) {
      throw new Error('Hop length cannot be greater than window size')
    }
  }
}

export default VADManager