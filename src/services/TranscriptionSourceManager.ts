/**
 * TranscriptionSourceManager - Manages transcription sources and routing priority
 *
 * This service resolves conflicts between different transcription sources by implementing
 * a priority system where WebSocket transcriptions take precedence over batch transcriptions.
 * It also handles routing to appropriate renderers (streaming vs static).
 */

export interface TranscriptionWithSource {
  id: string
  text: string
  timestamp: number
  confidence?: number
  source: TranscriptionSource
  isPartial?: boolean
  duration?: number
  startTime?: number
  endTime?: number
}

export enum TranscriptionSource {
  // WebSocket sources (highest priority)
  WEBSOCKET_GEMINI = 'websocket-gemini',
  WEBSOCKET = 'websocket',
  WEBSOCKET_PROXY = 'websocket-proxy',
  WEBSOCKET_PARTIAL = 'websocket-partial',
  WEBSOCKET_TEXT = 'websocket-text',
  WEBSOCKET_TURN_COMPLETE = 'websocket-turn-complete',

  // Streaming sources (medium priority)
  STREAMING = 'streaming',
  REAL_TIME = 'real-time',

  // Batch sources (lowest priority)
  BATCH = 'batch',
  BATCH_PROXY = 'batch-proxy',
  FILE_UPLOAD = 'file-upload'
}

export enum SourcePriority {
  WEBSOCKET = 1, // Highest priority - real-time WebSocket transcriptions
  STREAMING = 2, // Medium priority - streaming transcriptions
  BATCH = 3 // Lowest priority - batch/file transcriptions
}

export interface RoutingDecision {
  shouldRoute: boolean
  routeToStreaming: boolean
  routeToStatic: boolean
  shouldReplaceExisting: boolean
  conflictResolution: 'replace' | 'append' | 'ignore'
  reason: string
}

export interface SourceManagerConfig {
  enableWebSocketPriority: boolean
  enableStreamingMode: boolean
  allowBatchDuringWebSocket: boolean
  debounceMs: number
  maxConcurrentSources: number
}

export class TranscriptionSourceManager {
  private config: SourceManagerConfig
  private activeStreams: Map<TranscriptionSource, TranscriptionWithSource> = new Map()
  private staticTranscripts: TranscriptionWithSource[] = []
  private currentStreamingSource: TranscriptionSource | null = null
  private lastTranscriptionTime: number = 0

  constructor(config: Partial<SourceManagerConfig> = {}) {
    this.config = {
      enableWebSocketPriority: true,
      enableStreamingMode: true,
      allowBatchDuringWebSocket: false,
      debounceMs: 100,
      maxConcurrentSources: 3,
      ...config
    }
  }

  /**
   * Get the priority level for a transcription source
   */
  getSourcePriority(source: TranscriptionSource): SourcePriority {
    // WebSocket sources get highest priority
    if (
      [
        TranscriptionSource.WEBSOCKET_GEMINI,
        TranscriptionSource.WEBSOCKET,
        TranscriptionSource.WEBSOCKET_PROXY,
        TranscriptionSource.WEBSOCKET_PARTIAL,
        TranscriptionSource.WEBSOCKET_TEXT,
        TranscriptionSource.WEBSOCKET_TURN_COMPLETE
      ].includes(source)
    ) {
      return SourcePriority.WEBSOCKET
    }

    // Streaming sources get medium priority
    if ([TranscriptionSource.STREAMING, TranscriptionSource.REAL_TIME].includes(source)) {
      return SourcePriority.STREAMING
    }

    // Everything else is batch (lowest priority)
    return SourcePriority.BATCH
  }

  /**
   * Determine if a source should trigger streaming rendering
   */
  shouldUseStreamingRenderer(source: TranscriptionSource): boolean {
    if (!this.config.enableStreamingMode) return false

    const priority = this.getSourcePriority(source)
    return priority === SourcePriority.WEBSOCKET || priority === SourcePriority.STREAMING
  }

  /**
   * Route a transcription to the appropriate handler based on source priority
   */
  routeTranscription(transcription: TranscriptionWithSource): RoutingDecision {
    const sourcePriority = this.getSourcePriority(transcription.source)
    const currentTime = Date.now()

    // Check for debouncing
    if (currentTime - this.lastTranscriptionTime < this.config.debounceMs) {
      return {
        shouldRoute: false,
        routeToStreaming: false,
        routeToStatic: false,
        shouldReplaceExisting: false,
        conflictResolution: 'ignore',
        reason: 'Debounce period active'
      }
    }

    // WebSocket sources always get priority
    if (sourcePriority === SourcePriority.WEBSOCKET) {
      // If we have an active streaming source, replace it
      if (this.currentStreamingSource && this.currentStreamingSource !== transcription.source) {
        this.clearActiveStream(this.currentStreamingSource)
      }

      this.currentStreamingSource = transcription.source
      this.activeStreams.set(transcription.source, transcription)
      this.lastTranscriptionTime = currentTime

      return {
        shouldRoute: true,
        routeToStreaming: true,
        routeToStatic: false,
        shouldReplaceExisting: true,
        conflictResolution: 'replace',
        reason: 'WebSocket source has highest priority'
      }
    }

    // Streaming sources get priority if no WebSocket is active
    if (sourcePriority === SourcePriority.STREAMING) {
      if (
        this.currentStreamingSource &&
        this.getSourcePriority(this.currentStreamingSource) === SourcePriority.WEBSOCKET
      ) {
        return {
          shouldRoute: false,
          routeToStreaming: false,
          routeToStatic: true,
          shouldReplaceExisting: false,
          conflictResolution: 'append',
          reason: 'WebSocket source is active, routing to static instead'
        }
      }

      this.currentStreamingSource = transcription.source
      this.activeStreams.set(transcription.source, transcription)
      this.lastTranscriptionTime = currentTime

      return {
        shouldRoute: true,
        routeToStreaming: true,
        routeToStatic: false,
        shouldReplaceExisting: false,
        conflictResolution: 'replace',
        reason: 'Streaming source active, no WebSocket conflict'
      }
    }

    // Batch sources get lowest priority
    if (sourcePriority === SourcePriority.BATCH) {
      // Check if WebSocket or streaming is active
      if (this.currentStreamingSource && !this.config.allowBatchDuringWebSocket) {
        return {
          shouldRoute: false,
          routeToStreaming: false,
          routeToStatic: true,
          shouldReplaceExisting: false,
          conflictResolution: 'append',
          reason: 'Batch source blocked by active streaming, routing to static'
        }
      }

      this.lastTranscriptionTime = currentTime
      return {
        shouldRoute: true,
        routeToStreaming: false,
        routeToStatic: true,
        shouldReplaceExisting: false,
        conflictResolution: 'append',
        reason: 'Batch source routing to static display'
      }
    }

    return {
      shouldRoute: false,
      routeToStreaming: false,
      routeToStatic: false,
      shouldReplaceExisting: false,
      conflictResolution: 'ignore',
      reason: 'Unknown source type'
    }
  }

  /**
   * Process and route a transcription with source information
   */
  processTranscription(transcription: TranscriptionWithSource): {
    streamingTranscription?: TranscriptionWithSource
    staticTranscription?: TranscriptionWithSource
    routing: RoutingDecision
  } {
    const routing = this.routeTranscription(transcription)

    let streamingTranscription: TranscriptionWithSource | undefined
    let staticTranscription: TranscriptionWithSource | undefined

    if (routing.shouldRoute) {
      if (routing.routeToStreaming) {
        streamingTranscription = transcription
      }

      if (routing.routeToStatic) {
        staticTranscription = transcription
        this.staticTranscripts.push(transcription)
      }
    }

    return {
      streamingTranscription,
      staticTranscription,
      routing
    }
  }

  /**
   * Clear an active stream
   */
  clearActiveStream(source: TranscriptionSource): void {
    this.activeStreams.delete(source)
    if (this.currentStreamingSource === source) {
      this.currentStreamingSource = null
    }
  }

  /**
   * Complete a streaming transcription and move it to static
   */
  completeStreamingTranscription(source: TranscriptionSource): TranscriptionWithSource | null {
    const activeTranscription = this.activeStreams.get(source)
    if (!activeTranscription) return null

    // Move to static transcripts
    this.staticTranscripts.push(activeTranscription)

    // Clear active stream
    this.clearActiveStream(source)

    return activeTranscription
  }

  /**
   * Get the current streaming transcription
   */
  getCurrentStreamingTranscription(): TranscriptionWithSource | null {
    if (!this.currentStreamingSource) return null
    return this.activeStreams.get(this.currentStreamingSource) || null
  }

  /**
   * Get all static transcripts
   */
  getStaticTranscripts(): TranscriptionWithSource[] {
    return [...this.staticTranscripts]
  }

  /**
   * Get active streaming sources
   */
  getActiveStreamingSources(): TranscriptionSource[] {
    return Array.from(this.activeStreams.keys())
  }

  /**
   * Check if a WebSocket source is currently active
   */
  isWebSocketActive(): boolean {
    if (!this.currentStreamingSource) return false
    return this.getSourcePriority(this.currentStreamingSource) === SourcePriority.WEBSOCKET
  }

  /**
   * Check if any streaming is currently active
   */
  isStreamingActive(): boolean {
    return this.currentStreamingSource !== null
  }

  /**
   * Clear all transcriptions
   */
  clearAll(): void {
    this.activeStreams.clear()
    this.staticTranscripts = []
    this.currentStreamingSource = null
    this.lastTranscriptionTime = 0
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SourceManagerConfig>): void {
    this.config = {...this.config, ...newConfig}
  }

  /**
   * Get current configuration
   */
  getConfig(): SourceManagerConfig {
    return {...this.config}
  }

  /**
   * Convert a source string to TranscriptionSource enum
   */
  static parseSource(source: string): TranscriptionSource {
    // Check if it's a valid enum value
    const enumValues = Object.values(TranscriptionSource) as string[]
    if (enumValues.includes(source)) {
      return source as TranscriptionSource
    }

    // Handle common aliases and variations
    const normalizedSource = source.toLowerCase().replace(/[-_]/g, '')

    if (normalizedSource.includes('websocket') && normalizedSource.includes('gemini')) {
      return TranscriptionSource.WEBSOCKET_GEMINI
    }
    if (normalizedSource.includes('websocket') && normalizedSource.includes('proxy')) {
      return TranscriptionSource.WEBSOCKET_PROXY
    }
    if (normalizedSource.includes('websocket')) {
      return TranscriptionSource.WEBSOCKET
    }
    if (normalizedSource.includes('batch') && normalizedSource.includes('proxy')) {
      return TranscriptionSource.BATCH_PROXY
    }
    if (normalizedSource.includes('batch')) {
      return TranscriptionSource.BATCH
    }
    if (normalizedSource.includes('streaming')) {
      return TranscriptionSource.STREAMING
    }
    if (normalizedSource.includes('realtime')) {
      return TranscriptionSource.REAL_TIME
    }

    // Default to batch for unknown sources
    console.warn(`Unknown transcription source: ${source}, defaulting to BATCH`)
    return TranscriptionSource.BATCH
  }

  /**
   * Create a TranscriptionWithSource from legacy transcript format
   */
  static fromLegacyTranscript(
    transcript: {text: string; confidence?: number; id?: string; timestamp?: number},
    source: string | TranscriptionSource = TranscriptionSource.BATCH
  ): TranscriptionWithSource {
    const parsedSource = typeof source === 'string' ? this.parseSource(source) : source

    return {
      id: transcript.id || `transcript-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: transcript.text,
      timestamp: transcript.timestamp || Date.now(),
      confidence: transcript.confidence,
      source: parsedSource,
      isPartial: false
    }
  }
}

// Singleton instance for global use
let globalSourceManager: TranscriptionSourceManager | null = null

/**
 * Get the global TranscriptionSourceManager instance
 */
export function getTranscriptionSourceManager(): TranscriptionSourceManager {
  if (!globalSourceManager) {
    globalSourceManager = new TranscriptionSourceManager({
      enableWebSocketPriority: true,
      enableStreamingMode: true,
      allowBatchDuringWebSocket: false,
      debounceMs: 50,
      maxConcurrentSources: 3
    })
  }
  return globalSourceManager
}

/**
 * Reset the global TranscriptionSourceManager instance
 */
export function resetTranscriptionSourceManager(): void {
  globalSourceManager = null
}
