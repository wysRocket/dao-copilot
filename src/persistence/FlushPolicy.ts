/**
 * FlushPolicy - Configurable WAL Flush Triggering System
 *
 * Provides intelligent flush policies for Write-Ahead Log to balance:
 * - Data durability (not losing transcripts)
 * - Performance (not blocking UI thread)
 * - Resource usage (not overwhelming disk I/O)
 *
 * Supports multiple triggering conditions:
 * - Event-driven: transcript finalizations, session stops, app lifecycle
 * - Time-based: periodic intervals, background delays
 * - Count-based: number of partial transcripts accumulated
 * - Visibility-based: tab focus changes and background states
 */

import {EventEmitter} from 'events'
import {WalEntry, WalEntryType} from './WalEntry'

/**
 * Flush trigger types
 */
export enum FlushTriggerType {
  // Time-based triggers
  PERIODIC_INTERVAL = 'periodic_interval',
  BACKGROUND_DELAY = 'background_delay',

  // Event-based triggers
  TRANSCRIPT_FINALIZED = 'transcript_finalized',
  PARTIAL_COUNT_THRESHOLD = 'partial_count_threshold',
  SESSION_ENDED = 'session_ended',

  // Application lifecycle triggers
  APP_CLOSE = 'app_close',
  TAB_VISIBILITY_CHANGE = 'tab_visibility_change',
  MANUAL_FLUSH = 'manual_flush',

  // System triggers
  MEMORY_PRESSURE = 'memory_pressure',
  ERROR_RECOVERY = 'error_recovery'
}

/**
 * Flush policy configuration
 */
export interface FlushPolicyConfig {
  // Time-based settings
  periodicIntervalMs: number // Default: 250ms - regular flush interval
  backgroundDelayMs: number // Default: 10000ms - delay when app in background

  // Event-based settings
  partialCountThreshold: number // Default: 5 - flush after N partial transcripts
  forceFlushOnFinalized: boolean // Default: true - always flush when transcript finalizes
  flushOnSessionEnd: boolean // Default: true - flush when session ends

  // Application lifecycle settings
  flushOnAppClose: boolean // Default: true - flush on app termination
  flushOnTabHidden: boolean // Default: true - flush when tab goes to background
  tabHiddenDelayMs: number // Default: 2000ms - delay before flushing when tab hidden

  // System settings
  flushOnMemoryPressure: boolean // Default: true - flush under memory pressure
  memoryThresholdMB: number // Default: 50MB - memory threshold for pressure flush

  // Performance settings
  maxFlushBatchSize: number // Default: 100 - max entries per flush operation
  flushTimeoutMs: number // Default: 5000ms - timeout for flush operations
  concurrentFlushLimit: number // Default: 2 - max concurrent flush operations

  // Recovery settings
  retryFailedFlushes: boolean // Default: true - retry failed flush operations
  maxFlushRetries: number // Default: 3 - max retry attempts
  retryDelayMs: number // Default: 1000ms - delay between retries
}

/**
 * Default flush policy configuration
 */
export const DEFAULT_FLUSH_POLICY: FlushPolicyConfig = {
  // Time-based settings
  periodicIntervalMs: 250,
  backgroundDelayMs: 10000,

  // Event-based settings
  partialCountThreshold: 5,
  forceFlushOnFinalized: true,
  flushOnSessionEnd: true,

  // Application lifecycle settings
  flushOnAppClose: true,
  flushOnTabHidden: true,
  tabHiddenDelayMs: 2000,

  // System settings
  flushOnMemoryPressure: true,
  memoryThresholdMB: 50,

  // Performance settings
  maxFlushBatchSize: 100,
  flushTimeoutMs: 5000,
  concurrentFlushLimit: 2,

  // Recovery settings
  retryFailedFlushes: true,
  maxFlushRetries: 3,
  retryDelayMs: 1000
}

/**
 * Flush trigger event data
 */
export interface FlushTriggerEvent {
  type: FlushTriggerType
  timestamp: number
  reason: string
  metadata?: Record<string, unknown>
  urgent?: boolean // If true, flush should be immediate
  maxDelay?: number // Maximum delay before flush (ms)
}

/**
 * Flush request
 */
export interface FlushRequest {
  triggerId: string
  trigger: FlushTriggerEvent
  entries: WalEntry[]
  priority: 'low' | 'normal' | 'high' | 'urgent'
  timeout: number
  retryCount: number
}

/**
 * Application state tracking
 */
interface AppState {
  isVisible: boolean
  isActive: boolean
  lastActivityTime: number
  memoryUsageMB: number
  backgroundStartTime?: number
}

/**
 * Flush statistics
 */
export interface FlushStats {
  totalFlushes: number
  successfulFlushes: number
  failedFlushes: number
  totalEntriesFlushed: number
  avgFlushTimeMs: number
  triggerCounts: Record<FlushTriggerType, number>
  lastFlushTime?: number
}

/**
 * Flush Policy Manager
 *
 * Manages all flush triggers and policies for the WAL system.
 * Uses EventEmitter to decouple flush triggers from WAL writer implementation.
 */
export class FlushPolicyManager extends EventEmitter {
  private config: FlushPolicyConfig
  private appState: AppState
  private partialCount: number = 0
  private lastFlushTime: number = 0
  private periodicTimer?: NodeJS.Timeout
  private backgroundTimer?: NodeJS.Timeout
  private tabHiddenTimer?: NodeJS.Timeout
  private stats: FlushStats
  private isDestroyed: boolean = false

  constructor(config: Partial<FlushPolicyConfig> = {}) {
    super()

    this.config = {...DEFAULT_FLUSH_POLICY, ...config}
    this.appState = {
      isVisible: true,
      isActive: true,
      lastActivityTime: Date.now(),
      memoryUsageMB: 0
    }

    this.stats = {
      totalFlushes: 0,
      successfulFlushes: 0,
      failedFlushes: 0,
      totalEntriesFlushed: 0,
      avgFlushTimeMs: 0,
      triggerCounts: {} as Record<FlushTriggerType, number>
    }

    this.setupEventListeners()
    this.startPeriodicTimer()
  }

  /**
   * Record a new WAL entry and check flush triggers
   */
  onWalEntryAdded(entry: WalEntry): void {
    if (this.isDestroyed) return

    // Count partial transcripts
    if (
      entry.type === WalEntryType.UTTERANCE_INSERT ||
      entry.type === WalEntryType.UTTERANCE_UPDATE
    ) {
      this.partialCount++
    }

    // Check for flush triggers
    this.checkFlushTriggers(entry)
  }

  /**
   * Update application state
   */
  updateAppState(state: Partial<AppState>): void {
    if (this.isDestroyed) return

    const wasVisible = this.appState.isVisible
    this.appState = {...this.appState, ...state}

    // Handle visibility changes
    if (wasVisible && !this.appState.isVisible) {
      this.handleTabHidden()
    } else if (!wasVisible && this.appState.isVisible) {
      this.handleTabVisible()
    }

    // Check memory pressure
    if (
      this.config.flushOnMemoryPressure &&
      this.appState.memoryUsageMB > this.config.memoryThresholdMB
    ) {
      this.triggerFlush(
        FlushTriggerType.MEMORY_PRESSURE,
        `Memory usage ${this.appState.memoryUsageMB}MB exceeds threshold ${this.config.memoryThresholdMB}MB`,
        {memoryUsage: this.appState.memoryUsageMB},
        true
      )
    }
  }

  /**
   * Manually trigger a flush
   */
  triggerManualFlush(reason: string = 'Manual flush requested'): void {
    this.triggerFlush(FlushTriggerType.MANUAL_FLUSH, reason, {}, true)
  }

  /**
   * Handle application closing
   */
  onAppClose(): void {
    if (this.config.flushOnAppClose) {
      this.triggerFlush(FlushTriggerType.APP_CLOSE, 'Application is closing', {}, true)
    }
    this.destroy()
  }

  /**
   * Handle session ending
   */
  onSessionEnd(sessionId: string): void {
    if (this.config.flushOnSessionEnd) {
      this.triggerFlush(
        FlushTriggerType.SESSION_ENDED,
        `Session ${sessionId} ended`,
        {sessionId},
        true
      )
    }
  }

  /**
   * Handle transcript finalization
   */
  onTranscriptFinalized(utteranceId: string): void {
    if (this.config.forceFlushOnFinalized) {
      this.triggerFlush(
        FlushTriggerType.TRANSCRIPT_FINALIZED,
        `Transcript ${utteranceId} finalized`,
        {utteranceId},
        true
      )
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FlushPolicyConfig>): void {
    this.config = {...this.config, ...config}

    // Restart timers with new configuration
    this.restartTimers()
  }

  /**
   * Get current statistics
   */
  getStats(): FlushStats {
    return {...this.stats}
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalFlushes: 0,
      successfulFlushes: 0,
      failedFlushes: 0,
      totalEntriesFlushed: 0,
      avgFlushTimeMs: 0,
      triggerCounts: {} as Record<FlushTriggerType, number>,
      lastFlushTime: this.stats.lastFlushTime
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): FlushPolicyConfig {
    return {...this.config}
  }

  /**
   * Destroy the policy manager
   */
  destroy(): void {
    if (this.isDestroyed) return

    this.isDestroyed = true

    // Clear all timers
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer)
    }
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer)
    }
    if (this.tabHiddenTimer) {
      clearTimeout(this.tabHiddenTimer)
    }

    // Remove all listeners
    this.removeAllListeners()
  }

  // Private methods

  /**
   * Check all flush triggers for the given entry
   */
  private checkFlushTriggers(entry: WalEntry): void {
    // Check partial count threshold
    if (this.partialCount >= this.config.partialCountThreshold) {
      this.triggerFlush(
        FlushTriggerType.PARTIAL_COUNT_THRESHOLD,
        `Partial count ${this.partialCount} reached threshold ${this.config.partialCountThreshold}`
      )
      this.partialCount = 0
    }

    // Check for finalized transcripts
    if (
      (entry.type === WalEntryType.UTTERANCE_UPDATE ||
        entry.type === WalEntryType.UTTERANCE_INSERT) &&
      this.config.forceFlushOnFinalized
    ) {
      // Note: This would need access to the transcript state to determine if finalized
      // For now, we check this via onTranscriptFinalized callback
    }
  }

  /**
   * Setup event listeners for browser/app events
   */
  private setupEventListeners(): void {
    // Browser visibility API
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.updateAppState({
          isVisible: !document.hidden,
          lastActivityTime: Date.now()
        })
      })
    }

    // Browser beforeunload event
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.onAppClose()
      })

      // Page focus/blur events
      window.addEventListener('focus', () => {
        this.updateAppState({
          isActive: true,
          lastActivityTime: Date.now()
        })
      })

      window.addEventListener('blur', () => {
        this.updateAppState({
          isActive: false
        })
      })
    }

    // Electron app events (if available)
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const electronAPI = (window as any).electronAPI

      electronAPI.onAppClose?.(this.onAppClose.bind(this))
      electronAPI.onAppHidden?.(this.handleTabHidden.bind(this))
      electronAPI.onAppShown?.(this.handleTabVisible.bind(this))
    }
  }

  /**
   * Start periodic flush timer
   */
  private startPeriodicTimer(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer)
    }

    const interval = this.appState.isVisible
      ? this.config.periodicIntervalMs
      : this.config.backgroundDelayMs

    this.periodicTimer = setInterval(() => {
      if (!this.isDestroyed) {
        this.triggerFlush(
          FlushTriggerType.PERIODIC_INTERVAL,
          `Periodic flush (interval: ${interval}ms)`
        )
      }
    }, interval)
  }

  /**
   * Restart all timers with current configuration
   */
  private restartTimers(): void {
    this.startPeriodicTimer()
  }

  /**
   * Handle tab becoming hidden
   */
  private handleTabHidden(): void {
    this.appState.backgroundStartTime = Date.now()

    if (this.config.flushOnTabHidden) {
      // Set timer to flush after delay
      if (this.tabHiddenTimer) {
        clearTimeout(this.tabHiddenTimer)
      }

      this.tabHiddenTimer = setTimeout(() => {
        if (!this.appState.isVisible && !this.isDestroyed) {
          this.triggerFlush(
            FlushTriggerType.TAB_VISIBILITY_CHANGE,
            `Tab hidden for ${this.config.tabHiddenDelayMs}ms`,
            {hiddenDuration: this.config.tabHiddenDelayMs}
          )
        }
      }, this.config.tabHiddenDelayMs)
    }

    // Switch to background flush interval
    this.startPeriodicTimer()
  }

  /**
   * Handle tab becoming visible
   */
  private handleTabVisible(): void {
    if (this.tabHiddenTimer) {
      clearTimeout(this.tabHiddenTimer)
      this.tabHiddenTimer = undefined
    }

    const backgroundDuration = this.appState.backgroundStartTime
      ? Date.now() - this.appState.backgroundStartTime
      : 0

    this.appState.backgroundStartTime = undefined

    // Switch back to normal flush interval
    this.startPeriodicTimer()

    // Optional: trigger flush on visibility if we were hidden for a while
    if (backgroundDuration > this.config.tabHiddenDelayMs) {
      this.triggerFlush(
        FlushTriggerType.TAB_VISIBILITY_CHANGE,
        `Tab visible after ${backgroundDuration}ms background`,
        {backgroundDuration}
      )
    }
  }

  /**
   * Trigger a flush event
   */
  private triggerFlush(
    type: FlushTriggerType,
    reason: string,
    metadata: Record<string, unknown> = {},
    urgent: boolean = false
  ): void {
    const trigger: FlushTriggerEvent = {
      type,
      timestamp: Date.now(),
      reason,
      metadata,
      urgent,
      maxDelay: urgent ? 0 : this.config.periodicIntervalMs
    }

    // Update statistics
    this.stats.triggerCounts[type] = (this.stats.triggerCounts[type] || 0) + 1

    // Emit flush event
    this.emit('flushRequired', trigger)

    this.lastFlushTime = Date.now()
  }
}

export default FlushPolicyManager
