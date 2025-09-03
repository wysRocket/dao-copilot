/**
 * AnswerDisplayManager
 *
 * Manages the display of AI answers, search states, and streaming updates.
 * Integrates with AnswerStreamingManager and existing display components
 * for a seamless real-time answer experience.
 */

import {EventEmitter} from 'events'
import {AnswerStreamingManager, AnswerStream, AnswerStreamChunk} from './AnswerStreamingManager'
import {UltraFastWebSocketManager} from './UltraFastWebSocketManager'

// Define SearchResult interface locally since it's not exported from search-service
export interface SearchResult {
  title: string
  snippet: string
  link: string
  displayLink: string
  source: 'google' | 'bing' | 'duckduckgo' | 'cache' | 'offline'
  timestamp: number
  relevanceScore?: number
  credibilityScore?: number
  url: string // Add url property for compatibility
  metadata?: {
    pageRank?: number
    freshness?: number
    domainAuthority?: number
  }
}

export interface SearchState {
  query: string
  isSearching: boolean
  status: 'idle' | 'searching' | 'synthesizing' | 'complete' | 'error'
  progress: number // 0-100
  currentSource?: string
  sourcesFound: number
  totalSources: number
  timeElapsed: number
  metadata?: {
    searchStartTime: number
    lastUpdate: number
    searchMethod?: 'semantic' | 'keyword' | 'hybrid'
    expandedQueries?: string[]
  }
}

export interface AnswerDisplay {
  id: string
  questionId: string
  questionText: string
  answerText: string
  isPartial: boolean
  isComplete: boolean
  confidence: number
  sources: SearchResult[]
  timestamp: number
  searchState: SearchState
  metadata: {
    streamingLatency?: number
    processingTime?: number
    tokensPerSecond?: number
    sourceCount?: number
    synthesisMethod?: string
  }
}

export interface DisplayState {
  currentDisplay: AnswerDisplay | null
  displayHistory: AnswerDisplay[]
  isStreaming: boolean
  searchInProgress: boolean
  lastUpdateTime: number
  displayMetrics: {
    totalAnswersDisplayed: number
    averageDisplayTime: number
    averageConfidence: number
  }
}

export interface AnswerDisplayConfig {
  maxHistorySize: number
  showSearchProgress: boolean
  showConfidence: boolean
  showSources: boolean
  showMetadata: boolean
  enableTypewriterEffect: boolean
  typewriterSpeed: number
  updateThrottleMs: number
  enableDebugLogging: boolean
}

/**
 * AnswerDisplayManager - Orchestrates answer display and search state management
 */
export class AnswerDisplayManager extends EventEmitter {
  private config: AnswerDisplayConfig
  private answerStreamingManager: AnswerStreamingManager
  private webSocketManager: UltraFastWebSocketManager
  private displayState: DisplayState
  private updateThrottleTimer: NodeJS.Timeout | null = null
  private pendingUpdates: Partial<AnswerDisplay>[] = []

  constructor(
    answerStreamingManager: AnswerStreamingManager,
    webSocketManager: UltraFastWebSocketManager,
    config: Partial<AnswerDisplayConfig> = {}
  ) {
    super()

    this.config = {
      maxHistorySize: 50,
      showSearchProgress: true,
      showConfidence: true,
      showSources: true,
      showMetadata: false,
      enableTypewriterEffect: true,
      typewriterSpeed: 30, // characters per second
      updateThrottleMs: 100, // throttle updates to 10fps
      enableDebugLogging: true,
      ...config
    }

    this.answerStreamingManager = answerStreamingManager
    this.webSocketManager = webSocketManager

    this.displayState = {
      currentDisplay: null,
      displayHistory: [],
      isStreaming: false,
      searchInProgress: false,
      lastUpdateTime: Date.now(),
      displayMetrics: {
        totalAnswersDisplayed: 0,
        averageDisplayTime: 0,
        averageConfidence: 0
      }
    }

    this.setupEventListeners()

    if (this.config.enableDebugLogging) {
      console.log('🖥️ AnswerDisplayManager initialized with config:', this.config)
    }
  }

  /**
   * Setup event listeners for streaming and WebSocket events
   */
  private setupEventListeners(): void {
    // Listen to AnswerStreamingManager events
    this.answerStreamingManager.on('stream-started', this.handleStreamStarted.bind(this))
    this.answerStreamingManager.on('answer-chunk', this.handleAnswerChunk.bind(this))
    this.answerStreamingManager.on('stream-completed', this.handleStreamCompleted.bind(this))
    this.answerStreamingManager.on('stream-cancelled', this.handleStreamCancelled.bind(this))
    this.answerStreamingManager.on('answer-updated', this.handleAnswerUpdated.bind(this))

    // Listen to WebSocket events for search state updates
    this.webSocketManager.on('transcription', this.handleTranscriptionMessage.bind(this))
    this.webSocketManager.on('partial', this.handlePartialMessage.bind(this))
    this.webSocketManager.on('complete', this.handleCompleteMessage.bind(this))
    this.webSocketManager.on('status', this.handleStatusMessage.bind(this))

    if (this.config.enableDebugLogging) {
      console.log('🔌 AnswerDisplayManager: Event listeners configured')
    }
  }

  /**
   * Start a new answer display session
   */
  async startAnswerDisplay(
    questionId: string,
    questionText: string,
    initialSearchState?: Partial<SearchState>
  ): Promise<string> {
    const displayId = `display-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Create initial search state
    const searchState: SearchState = {
      query: questionText,
      isSearching: true,
      status: 'searching',
      progress: 0,
      sourcesFound: 0,
      totalSources: 0,
      timeElapsed: 0,
      metadata: {
        searchStartTime: Date.now(),
        lastUpdate: Date.now(),
        ...initialSearchState?.metadata
      },
      ...initialSearchState
    }

    // Create initial display
    const answerDisplay: AnswerDisplay = {
      id: displayId,
      questionId,
      questionText,
      answerText: '',
      isPartial: true,
      isComplete: false,
      confidence: 0,
      sources: [],
      timestamp: Date.now(),
      searchState,
      metadata: {
        sourceCount: 0
      }
    }

    // Update display state
    this.displayState.currentDisplay = answerDisplay
    this.displayState.isStreaming = false
    this.displayState.searchInProgress = true
    this.displayState.lastUpdateTime = Date.now()

    // Emit display started event
    this.emit('display-started', answerDisplay)

    // Send initial display via WebSocket
    this.sendDisplayUpdate(answerDisplay, 'display-started')

    if (this.config.enableDebugLogging) {
      console.log(
        '🖥️ Started answer display:',
        displayId,
        'for question:',
        questionText.substring(0, 50)
      )
    }

    return displayId
  }

  /**
   * Update search progress and state
   */
  updateSearchState(updates: Partial<SearchState>): void {
    if (!this.displayState.currentDisplay) {
      console.warn('⚠️ Cannot update search state: no active display')
      return
    }

    const currentState = this.displayState.currentDisplay.searchState
    const updatedState: SearchState = {
      ...currentState,
      ...updates,
      timeElapsed: Date.now() - (currentState.metadata?.searchStartTime || Date.now()),
      metadata: {
        searchStartTime: currentState.metadata?.searchStartTime || Date.now(),
        lastUpdate: Date.now(),
        ...currentState.metadata,
        ...updates.metadata
      }
    }

    this.displayState.currentDisplay.searchState = updatedState
    this.displayState.searchInProgress = updatedState.isSearching

    // Emit search state update
    this.emit('search-state-updated', updatedState)

    // Send throttled update
    this.throttledDisplayUpdate(
      {
        searchState: updatedState
      },
      'search-progress'
    )

    if (this.config.enableDebugLogging) {
      console.log('🔍 Search state updated:', updatedState.status, `${updatedState.progress}%`)
    }
  }

  /**
   * Update answer display with partial answer
   */
  updatePartialAnswer(
    answerText: string,
    confidence: number = 0,
    sources: SearchResult[] = [],
    metadata: Partial<AnswerDisplay['metadata']> = {}
  ): void {
    if (!this.displayState.currentDisplay) {
      console.warn('⚠️ Cannot update partial answer: no active display')
      return
    }

    const display = this.displayState.currentDisplay
    display.answerText = answerText
    display.isPartial = true
    display.isComplete = false
    display.confidence = confidence
    display.sources = sources
    display.timestamp = Date.now()
    display.metadata = {
      ...display.metadata,
      ...metadata
    }

    this.displayState.lastUpdateTime = Date.now()

    // Emit partial answer update
    this.emit('partial-answer-updated', display)

    // Send throttled update
    this.throttledDisplayUpdate(
      {
        answerText,
        confidence,
        sources,
        isPartial: true,
        metadata: display.metadata
      },
      'partial-answer'
    )

    if (this.config.enableDebugLogging) {
      console.log('📝 Partial answer updated:', answerText.substring(0, 100) + '...')
    }
  }

  /**
   * Complete answer display with final answer
   */
  completeAnswerDisplay(
    finalAnswer: string,
    confidence: number,
    sources: SearchResult[],
    metadata: Partial<AnswerDisplay['metadata']> = {}
  ): void {
    if (!this.displayState.currentDisplay) {
      console.warn('⚠️ Cannot complete answer: no active display')
      return
    }

    const display = this.displayState.currentDisplay
    display.answerText = finalAnswer
    display.isPartial = false
    display.isComplete = true
    display.confidence = confidence
    display.sources = sources
    display.timestamp = Date.now()
    display.metadata = {
      ...display.metadata,
      ...metadata,
      processingTime: Date.now() - (display.searchState.metadata?.searchStartTime || Date.now())
    }

    // Update search state to complete
    display.searchState.isSearching = false
    display.searchState.status = 'complete'
    display.searchState.progress = 100

    // Update display state
    this.displayState.isStreaming = false
    this.displayState.searchInProgress = false
    this.displayState.lastUpdateTime = Date.now()

    // Add to history
    this.addToHistory(display)

    // Update metrics
    this.updateDisplayMetrics(display)

    // Emit completion event
    this.emit('answer-completed', display)

    // Send final update
    this.sendDisplayUpdate(display, 'answer-complete')

    if (this.config.enableDebugLogging) {
      console.log(
        '✅ Answer display completed:',
        display.id,
        `confidence: ${confidence}%`,
        `sources: ${sources.length}`
      )
    }
  }

  /**
   * Handle streaming events from AnswerStreamingManager
   */
  private handleStreamStarted(answerStream: AnswerStream): void {
    this.displayState.isStreaming = true

    if (this.displayState.currentDisplay) {
      // Update search state to synthesizing
      this.updateSearchState({
        status: 'synthesizing',
        progress: 80,
        isSearching: false
      })
    }

    this.emit('streaming-started', answerStream)
  }

  private handleAnswerChunk(chunk: AnswerStreamChunk): void {
    if (this.displayState.currentDisplay) {
      this.updatePartialAnswer(
        chunk.text,
        chunk.metadata?.confidence || 0,
        this.displayState.currentDisplay.sources,
        {
          tokensPerSecond: chunk.metadata?.tokensPerSecond,
          streamingLatency: chunk.metadata?.latency
        }
      )
    }
  }

  private handleStreamCompleted(answerStream: AnswerStream): void {
    this.displayState.isStreaming = false

    if (this.displayState.currentDisplay) {
      this.completeAnswerDisplay(
        answerStream.currentAnswer,
        answerStream.metadata.confidence || 95,
        this.displayState.currentDisplay.sources,
        {
          streamingLatency: answerStream.metadata.streamingLatency,
          processingTime: answerStream.metadata.processingTime
        }
      )
    }

    this.emit('streaming-completed', answerStream)
  }

  private handleStreamCancelled(answerStream: AnswerStream): void {
    this.displayState.isStreaming = false

    if (this.displayState.currentDisplay) {
      this.displayState.currentDisplay.searchState.status = 'error'
      this.displayState.currentDisplay.searchState.isSearching = false
      this.displayState.searchInProgress = false

      this.sendDisplayUpdate(this.displayState.currentDisplay, 'answer-cancelled')
    }

    this.emit('streaming-cancelled', answerStream)
  }

  private handleAnswerUpdated(answerStream: AnswerStream): void {
    if (this.displayState.currentDisplay) {
      this.updatePartialAnswer(
        answerStream.currentAnswer,
        answerStream.metadata.confidence || 0,
        this.displayState.currentDisplay.sources
      )
    }
  }

  /**
   * Handle WebSocket messages for search state updates
   */
  private handleTranscriptionMessage(data: unknown): void {
    // Handle messages that indicate search activity
    if (this.config.enableDebugLogging) {
      console.log('📨 Received transcription message for display:', data)
    }
  }

  private handlePartialMessage(data: unknown): void {
    // Handle partial results
    if (this.config.enableDebugLogging) {
      console.log('📨 Received partial message for display:', data)
    }
  }

  private handleCompleteMessage(data: unknown): void {
    // Handle completion messages
    if (this.config.enableDebugLogging) {
      console.log('📨 Received complete message for display:', data)
    }
  }

  private handleStatusMessage(data: unknown): void {
    // Handle status updates
    if (this.config.enableDebugLogging) {
      console.log('📨 Received status message for display:', data)
    }
  }

  /**
   * Send display update via WebSocket with throttling
   */
  private throttledDisplayUpdate(updates: Partial<AnswerDisplay>, eventType: string): void {
    // Add to pending updates
    this.pendingUpdates.push(updates)

    // Set up throttle timer if not already active
    if (!this.updateThrottleTimer) {
      this.updateThrottleTimer = setTimeout(() => {
        this.processPendingUpdates(eventType)
      }, this.config.updateThrottleMs)
    }
  }

  private processPendingUpdates(eventType: string): void {
    if (!this.displayState.currentDisplay || this.pendingUpdates.length === 0) {
      this.updateThrottleTimer = null
      return
    }

    // Merge all pending updates
    const mergedUpdates = this.pendingUpdates.reduce(
      (merged, update) => ({
        ...merged,
        ...update
      }),
      {}
    )

    // Apply to current display
    Object.assign(this.displayState.currentDisplay, mergedUpdates)

    // Send via WebSocket
    this.sendDisplayUpdate(this.displayState.currentDisplay, eventType)

    // Clear pending updates
    this.pendingUpdates = []
    this.updateThrottleTimer = null
  }

  /**
   * Send display update via WebSocket
   */
  private sendDisplayUpdate(display: AnswerDisplay, eventType: string): void {
    const message = {
      type: 'answer-display',
      eventType,
      display: this.formatDisplayForTransmission(display),
      timestamp: Date.now()
    }

    this.webSocketManager.send(message, 'transcription')
  }

  /**
   * Format display for efficient transmission
   */
  private formatDisplayForTransmission(display: AnswerDisplay) {
    return {
      id: display.id,
      questionId: display.questionId,
      questionText: this.config.showMetadata
        ? display.questionText
        : display.questionText.substring(0, 100),
      answerText: display.answerText,
      isPartial: display.isPartial,
      isComplete: display.isComplete,
      confidence: this.config.showConfidence ? display.confidence : undefined,
      sources: this.config.showSources
        ? display.sources.map(source => ({
            url: source.url,
            title: source.title,
            snippet: source.snippet?.substring(0, 200),
            relevanceScore: source.relevanceScore,
            credibilityScore: source.credibilityScore
          }))
        : [],
      timestamp: display.timestamp,
      searchState: this.config.showSearchProgress ? display.searchState : undefined,
      metadata: this.config.showMetadata ? display.metadata : undefined
    }
  }

  /**
   * Add display to history
   */
  private addToHistory(display: AnswerDisplay): void {
    this.displayState.displayHistory.unshift({...display})

    // Trim history if too large
    if (this.displayState.displayHistory.length > this.config.maxHistorySize) {
      this.displayState.displayHistory = this.displayState.displayHistory.slice(
        0,
        this.config.maxHistorySize
      )
    }
  }

  /**
   * Update display metrics
   */
  private updateDisplayMetrics(display: AnswerDisplay): void {
    const metrics = this.displayState.displayMetrics

    metrics.totalAnswersDisplayed++

    const displayTime = display.metadata.processingTime || 0
    metrics.averageDisplayTime = (metrics.averageDisplayTime + displayTime) / 2

    metrics.averageConfidence = (metrics.averageConfidence + display.confidence) / 2
  }

  /**
   * Get current display state
   */
  getCurrentDisplay(): AnswerDisplay | null {
    return this.displayState.currentDisplay
  }

  /**
   * Get display history
   */
  getDisplayHistory(): AnswerDisplay[] {
    return [...this.displayState.displayHistory]
  }

  /**
   * Get display metrics
   */
  getDisplayMetrics() {
    return {
      ...this.displayState.displayMetrics,
      isStreaming: this.displayState.isStreaming,
      searchInProgress: this.displayState.searchInProgress,
      historySize: this.displayState.displayHistory.length,
      lastUpdateTime: this.displayState.lastUpdateTime,
      uptime: Date.now() - (this.displayState.displayHistory[0]?.timestamp || Date.now())
    }
  }

  /**
   * Clear current display
   */
  clearCurrentDisplay(): void {
    if (this.displayState.currentDisplay) {
      const display = this.displayState.currentDisplay
      this.addToHistory(display)

      this.displayState.currentDisplay = null
      this.displayState.isStreaming = false
      this.displayState.searchInProgress = false

      this.emit('display-cleared', display)

      if (this.config.enableDebugLogging) {
        console.log('🔄 Display cleared:', display.id)
      }
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AnswerDisplayConfig>): void {
    this.config = {...this.config, ...newConfig}
    this.emit('config-updated', this.config)

    if (this.config.enableDebugLogging) {
      console.log('⚙️ Display config updated:', newConfig)
    }
  }

  /**
   * Reset display state
   */
  reset(): void {
    // Cancel any pending updates
    if (this.updateThrottleTimer) {
      clearTimeout(this.updateThrottleTimer)
      this.updateThrottleTimer = null
    }

    // Clear state
    this.displayState = {
      currentDisplay: null,
      displayHistory: [],
      isStreaming: false,
      searchInProgress: false,
      lastUpdateTime: Date.now(),
      displayMetrics: {
        totalAnswersDisplayed: 0,
        averageDisplayTime: 0,
        averageConfidence: 0
      }
    }

    this.pendingUpdates = []

    console.log('🔄 AnswerDisplayManager: Reset completed')
    this.emit('reset')
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    this.reset()
    this.removeAllListeners()
    console.log('🗑️ AnswerDisplayManager: Destroyed')
  }
}

/**
 * Singleton instance for global access
 */
let answerDisplayManager: AnswerDisplayManager | null = null

export function getAnswerDisplayManager(
  answerStreamingManager: AnswerStreamingManager,
  webSocketManager: UltraFastWebSocketManager,
  config?: Partial<AnswerDisplayConfig>
): AnswerDisplayManager {
  if (!answerDisplayManager) {
    answerDisplayManager = new AnswerDisplayManager(
      answerStreamingManager,
      webSocketManager,
      config
    )
  }
  return answerDisplayManager
}

export function destroyAnswerDisplayManager(): void {
  if (answerDisplayManager) {
    answerDisplayManager.destroy()
    answerDisplayManager = null
  }
}

export default AnswerDisplayManager
