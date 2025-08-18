/**
 * AppLifecycleEvents - Application Lifecycle Event Management
 *
 * Provides centralized event management for application lifecycle events
 * that can trigger WAL flushes and other persistence operations:
 * - App startup/shutdown
 * - Window focus/blur states
 * - Tab visibility changes
 * - System sleep/wake events
 * - Memory pressure notifications
 */

import {EventEmitter} from 'events'

/**
 * Type definitions for browser APIs and Electron integration
 */
interface PerformanceMemory {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

interface Performance {
  memory?: PerformanceMemory
}

interface ElectronAPI {
  onAppReady?: (callback: () => void) => void
  onAppClose?: (callback: () => void) => void
  onAppTerminate?: (callback: () => void) => void
  onWindowMinimize?: (callback: () => void) => void
  onWindowRestore?: (callback: () => void) => void
  onSystemSleep?: (callback: () => void) => void
  onSystemWake?: (callback: () => void) => void
}

interface WindowWithElectron extends Window {
  electronAPI?: ElectronAPI
}

declare let window: WindowWithElectron
declare let performance: Performance

/**
 * Application lifecycle event types
 */
export enum AppLifecycleEventType {
  APP_START = 'app_start',
  APP_READY = 'app_ready',
  APP_CLOSE = 'app_close',
  APP_TERMINATE = 'app_terminate',

  WINDOW_FOCUS = 'window_focus',
  WINDOW_BLUR = 'window_blur',
  WINDOW_MINIMIZE = 'window_minimize',
  WINDOW_RESTORE = 'window_restore',

  TAB_VISIBLE = 'tab_visible',
  TAB_HIDDEN = 'tab_hidden',

  SYSTEM_SLEEP = 'system_sleep',
  SYSTEM_WAKE = 'system_wake',
  SYSTEM_MEMORY_PRESSURE = 'system_memory_pressure',

  SESSION_START = 'session_start',
  SESSION_END = 'session_end',

  TRANSCRIPT_FINALIZED = 'transcript_finalized'
}

/**
 * Lifecycle event data
 */
export interface AppLifecycleEvent {
  type: AppLifecycleEventType
  timestamp: number
  data?: Record<string, unknown>
}

/**
 * Memory pressure information
 */
export interface MemoryPressureInfo {
  usedHeapMB: number
  totalHeapMB: number
  usagePercent: number
  pressure: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * App state information
 */
export interface AppStateInfo {
  isVisible: boolean
  isActive: boolean
  isFocused: boolean
  isMinimized: boolean
  lastActivityTime: number
  memoryInfo?: MemoryPressureInfo
}

/**
 * Application Lifecycle Event Manager
 *
 * Central hub for all application lifecycle events that need to trigger
 * persistence operations, especially WAL flushes.
 */
export class AppLifecycleEventManager extends EventEmitter {
  private appState: AppStateInfo
  private memoryCheckInterval?: NodeJS.Timeout
  private activityTimer?: NodeJS.Timeout
  private isDestroyed: boolean = false

  constructor() {
    super()

    this.appState = {
      isVisible: true,
      isActive: true,
      isFocused: true,
      isMinimized: false,
      lastActivityTime: Date.now()
    }

    this.setupEventListeners()
    this.startMemoryMonitoring()
  }

  /**
   * Get current app state
   */
  getAppState(): AppStateInfo {
    return {...this.appState}
  }

  /**
   * Manually emit lifecycle event
   */
  emitLifecycleEvent(type: AppLifecycleEventType, data?: Record<string, unknown>): void {
    if (this.isDestroyed) return

    const event: AppLifecycleEvent = {
      type,
      timestamp: Date.now(),
      data
    }

    this.emit('lifecycleEvent', event)
    this.emit(type, event)
  }

  /**
   * Update activity timestamp (call on user interaction)
   */
  updateActivity(): void {
    if (this.isDestroyed) return

    this.appState.lastActivityTime = Date.now()

    // Reset activity timer
    if (this.activityTimer) {
      clearTimeout(this.activityTimer)
    }
  }

  /**
   * Force memory check and emit pressure event if needed
   */
  checkMemoryPressure(): MemoryPressureInfo | null {
    if (this.isDestroyed) return null

    try {
      const memInfo = this.getMemoryInfo()
      this.appState.memoryInfo = memInfo

      // Emit pressure event if threshold exceeded
      if (memInfo.pressure !== 'low') {
        this.emitLifecycleEvent(AppLifecycleEventType.SYSTEM_MEMORY_PRESSURE, {
          memoryInfo: memInfo
        })
      }

      return memInfo
    } catch (error) {
      console.error('[AppLifecycleEventManager] Memory check failed:', error)
      return null
    }
  }

  /**
   * Mark session start
   */
  sessionStart(sessionId: string, metadata?: Record<string, unknown>): void {
    this.emitLifecycleEvent(AppLifecycleEventType.SESSION_START, {
      sessionId,
      ...metadata
    })
  }

  /**
   * Mark session end
   */
  sessionEnd(sessionId: string, metadata?: Record<string, unknown>): void {
    this.emitLifecycleEvent(AppLifecycleEventType.SESSION_END, {
      sessionId,
      ...metadata
    })
  }

  /**
   * Mark transcript finalization
   */
  transcriptFinalized(utteranceId: string, sessionId?: string): void {
    this.emitLifecycleEvent(AppLifecycleEventType.TRANSCRIPT_FINALIZED, {
      utteranceId,
      sessionId
    })
  }

  /**
   * Destroy the event manager
   */
  destroy(): void {
    if (this.isDestroyed) return

    this.isDestroyed = true

    // Clear timers
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval)
    }
    if (this.activityTimer) {
      clearTimeout(this.activityTimer)
    }

    // Remove all listeners
    this.removeAllListeners()
  }

  // Private methods

  /**
   * Setup event listeners for various platforms
   */
  private setupEventListeners(): void {
    // Browser events
    if (typeof window !== 'undefined') {
      // Visibility API
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          const isVisible = !document.hidden
          this.appState.isVisible = isVisible

          const eventType = isVisible
            ? AppLifecycleEventType.TAB_VISIBLE
            : AppLifecycleEventType.TAB_HIDDEN

          this.emitLifecycleEvent(eventType, {
            previousState: !isVisible
          })
        })
      }

      // Window focus events
      window.addEventListener('focus', () => {
        this.appState.isFocused = true
        this.appState.isActive = true
        this.updateActivity()

        this.emitLifecycleEvent(AppLifecycleEventType.WINDOW_FOCUS)
      })

      window.addEventListener('blur', () => {
        this.appState.isFocused = false
        this.appState.isActive = false

        this.emitLifecycleEvent(AppLifecycleEventType.WINDOW_BLUR)
      })

      // Page unload events
      window.addEventListener('beforeunload', () => {
        this.emitLifecycleEvent(AppLifecycleEventType.APP_CLOSE, {
          reason: 'page_unload'
        })
      })

      // User activity tracking
      const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
      for (const eventName of activityEvents) {
        window.addEventListener(
          eventName,
          () => {
            this.updateActivity()
          },
          {passive: true}
        )
      }
    }

    // Electron main process events
    if (typeof window !== 'undefined' && window.electronAPI) {
      const electronAPI = window.electronAPI

      // App events
      electronAPI.onAppReady?.(this.handleAppReady.bind(this))
      electronAPI.onAppClose?.(this.handleAppClose.bind(this))
      electronAPI.onAppTerminate?.(this.handleAppTerminate.bind(this))

      // Window events
      electronAPI.onWindowMinimize?.(this.handleWindowMinimize.bind(this))
      electronAPI.onWindowRestore?.(this.handleWindowRestore.bind(this))

      // System events
      electronAPI.onSystemSleep?.(this.handleSystemSleep.bind(this))
      electronAPI.onSystemWake?.(this.handleSystemWake.bind(this))
    }

    // Node.js process events (for main process)
    if (typeof process !== 'undefined' && process.on) {
      process.on('SIGTERM', () => {
        this.emitLifecycleEvent(AppLifecycleEventType.APP_TERMINATE, {
          signal: 'SIGTERM'
        })
      })

      process.on('SIGINT', () => {
        this.emitLifecycleEvent(AppLifecycleEventType.APP_TERMINATE, {
          signal: 'SIGINT'
        })
      })

      // Memory warnings (if available)
      process.on('warning', (warning: Error & {name?: string}) => {
        if (warning.name === 'MaxListenersExceededWarning' || warning.message?.includes('memory')) {
          this.checkMemoryPressure()
        }
      })
    }
  }

  /**
   * Start monitoring memory usage
   */
  private startMemoryMonitoring(): void {
    // Check memory every 30 seconds
    this.memoryCheckInterval = setInterval(() => {
      if (!this.isDestroyed) {
        this.checkMemoryPressure()
      }
    }, 30000)
  }

  /**
   * Get current memory information
   */
  private getMemoryInfo(): MemoryPressureInfo {
    let usedHeapMB = 0
    let totalHeapMB = 0

    // Browser environment
    if (typeof performance !== 'undefined' && performance.memory) {
      const memory = performance.memory
      usedHeapMB = memory.usedJSHeapSize / (1024 * 1024)
      totalHeapMB = memory.totalJSHeapSize / (1024 * 1024)
    }
    // Node.js environment
    else if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage()
      usedHeapMB = memory.heapUsed / (1024 * 1024)
      totalHeapMB = memory.heapTotal / (1024 * 1024)
    }

    const usagePercent = totalHeapMB > 0 ? (usedHeapMB / totalHeapMB) * 100 : 0

    let pressure: MemoryPressureInfo['pressure'] = 'low'
    if (usagePercent > 90) pressure = 'critical'
    else if (usagePercent > 80) pressure = 'high'
    else if (usagePercent > 60) pressure = 'medium'

    return {
      usedHeapMB,
      totalHeapMB,
      usagePercent,
      pressure
    }
  }

  // Event handlers for Electron main process events

  private handleAppReady(): void {
    this.emitLifecycleEvent(AppLifecycleEventType.APP_READY)
  }

  private handleAppClose(): void {
    this.emitLifecycleEvent(AppLifecycleEventType.APP_CLOSE, {
      reason: 'app_close'
    })
  }

  private handleAppTerminate(): void {
    this.emitLifecycleEvent(AppLifecycleEventType.APP_TERMINATE, {
      reason: 'app_terminate'
    })
  }

  private handleWindowMinimize(): void {
    this.appState.isMinimized = true
    this.emitLifecycleEvent(AppLifecycleEventType.WINDOW_MINIMIZE)
  }

  private handleWindowRestore(): void {
    this.appState.isMinimized = false
    this.emitLifecycleEvent(AppLifecycleEventType.WINDOW_RESTORE)
  }

  private handleSystemSleep(): void {
    this.emitLifecycleEvent(AppLifecycleEventType.SYSTEM_SLEEP)
  }

  private handleSystemWake(): void {
    this.emitLifecycleEvent(AppLifecycleEventType.SYSTEM_WAKE)
  }
}

/**
 * Global lifecycle event manager instance
 */
export const globalAppLifecycleManager = new AppLifecycleEventManager()

export default AppLifecycleEventManager
