/**
 * WebSocket Diagnostics - Real-time performance monitoring and delay detection
 *
 * This utility provides comprehensive timing measurements throughout the WebSocket
 * transcription pipeline to identify sources of delay and optimize performance.
 */

export interface WebSocketMetrics {
  connectionTime: number
  messageReceiveToDisplayTime: number[]
  averageLatency: number
  maxLatency: number
  minLatency: number
  totalMessages: number
  missedMessages: number
  connectionRetries: number
  lastHeartbeat: number
  networkCondition: 'excellent' | 'good' | 'poor' | 'critical'
}

export interface DiagnosticEvent {
  timestamp: number
  event: string
  duration?: number
  metadata?: Record<string, unknown>
}

export interface TimingPhase {
  name: string
  startTime: number
  endTime?: number
  duration?: number
  metadata?: Record<string, unknown>
}

/**
 * WebSocket Diagnostics Manager
 * Tracks performance metrics and provides real-time diagnostic information
 */
export class WebSocketDiagnostics {
  private metrics: WebSocketMetrics = {
    connectionTime: 0,
    messageReceiveToDisplayTime: [],
    averageLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
    totalMessages: 0,
    missedMessages: 0,
    connectionRetries: 0,
    lastHeartbeat: 0,
    networkCondition: 'excellent'
  }

  private events: DiagnosticEvent[] = []
  private timingPhases: Map<string, TimingPhase> = new Map()
  private overlay: HTMLElement | null = null
  private isVisible = false
  private updateInterval: NodeJS.Timeout | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null
  private connectionStartTime = 0
  private lastMessageTime = 0
  private readonly MAX_EVENTS = 1000
  private readonly UPDATE_INTERVAL_MS = 100
  private readonly HEARTBEAT_INTERVAL_MS = 5000

  constructor() {
    // Initialize diagnostic overlay if in development mode
    if (process.env.NODE_ENV === 'development') {
      this.createDiagnosticOverlay()
    }

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring()
  }

  /**
   * Start connection timing
   */
  startConnection(): void {
    this.connectionStartTime = performance.now()
    this.logEvent('connection-start', 0, {startTime: this.connectionStartTime})
    this.startTimingPhase('connection', {type: 'websocket-connection'})
  }

  /**
   * Mark connection as established
   */
  connectionEstablished(): void {
    this.metrics.connectionTime = performance.now() - this.connectionStartTime
    this.logEvent('connection-established', this.metrics.connectionTime)
    this.endTimingPhase('connection')
    this.updateNetworkCondition()
  }

  /**
   * Mark connection retry
   */
  connectionRetry(): void {
    this.metrics.connectionRetries++
    this.logEvent('connection-retry', 0, {retryCount: this.metrics.connectionRetries})
  }

  /**
   * Start message processing timing
   */
  startMessageProcessing(messageId: string, messageType: string = 'transcription'): void {
    this.lastMessageTime = performance.now()
    this.startTimingPhase(`message-${messageId}`, {
      type: messageType,
      messageId,
      receiveTime: this.lastMessageTime
    })
    this.logEvent('message-received', 0, {messageId, messageType})
  }

  /**
   * Mark message processing complete
   */
  completeMessageProcessing(messageId: string, displayTime?: number): void {
    const processTime = performance.now() - this.lastMessageTime
    const actualDisplayTime = displayTime || performance.now()
    const totalLatency = actualDisplayTime - this.lastMessageTime

    this.endTimingPhase(`message-${messageId}`)

    // Update metrics
    this.metrics.totalMessages++
    this.metrics.messageReceiveToDisplayTime.push(totalLatency)

    // Keep only last 100 measurements for rolling average
    if (this.metrics.messageReceiveToDisplayTime.length > 100) {
      this.metrics.messageReceiveToDisplayTime.shift()
    }

    // Update latency statistics
    this.updateLatencyStats(totalLatency)

    this.logEvent('message-processed', processTime, {
      messageId,
      totalLatency,
      processTime
    })

    this.updateNetworkCondition()
  }

  /**
   * Log a missed message (timeout or error)
   */
  logMissedMessage(messageId: string, reason: string): void {
    this.metrics.missedMessages++
    this.logEvent('message-missed', 0, {messageId, reason})
  }

  /**
   * Start timing phase
   */
  startTimingPhase(phaseId: string, metadata?: Record<string, unknown>): void {
    this.timingPhases.set(phaseId, {
      name: phaseId,
      startTime: performance.now(),
      metadata
    })
  }

  /**
   * End timing phase
   */
  endTimingPhase(phaseId: string, metadata?: Record<string, unknown>): number {
    const phase = this.timingPhases.get(phaseId)
    if (!phase) {
      console.warn(`WebSocketDiagnostics: Unknown timing phase: ${phaseId}`)
      return 0
    }

    const endTime = performance.now()
    const duration = endTime - phase.startTime

    phase.endTime = endTime
    phase.duration = duration
    phase.metadata = {...phase.metadata, ...metadata}

    this.logEvent(`phase-${phaseId}-complete`, duration, phase.metadata)

    return duration
  }

  /**
   * Log diagnostic event
   */
  logEvent(event: string, duration: number = 0, metadata?: Record<string, unknown>): void {
    const diagnosticEvent: DiagnosticEvent = {
      timestamp: performance.now(),
      event,
      duration,
      metadata
    }

    this.events.push(diagnosticEvent)

    // Trim old events
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS)
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WS-Diagnostics] ${event}:`, {
        duration: duration > 0 ? `${duration.toFixed(2)}ms` : undefined,
        ...metadata
      })
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): WebSocketMetrics {
    return {...this.metrics}
  }

  /**
   * Get recent events
   */
  getRecentEvents(count: number = 50): DiagnosticEvent[] {
    return this.events.slice(-count)
  }

  /**
   * Get timing phases
   */
  getTimingPhases(): TimingPhase[] {
    return Array.from(this.timingPhases.values())
  }

  /**
   * Create diagnostic overlay UI
   */
  private createDiagnosticOverlay(): void {
    if (typeof window === 'undefined') return

    this.overlay = document.createElement('div')
    this.overlay.className = 'ws-diagnostic-overlay'
    this.overlay.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      width: 320px;
      max-height: 400px;
      background: rgba(0, 0, 0, 0.9);
      color: #00ff00;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      padding: 8px;
      border-radius: 4px;
      z-index: 10000;
      overflow-y: auto;
      display: none;
      border: 1px solid #333;
    `

    // Add toggle button
    const toggleButton = document.createElement('button')
    toggleButton.textContent = '📊 WS'
    toggleButton.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 340px;
      width: 40px;
      height: 30px;
      background: rgba(0, 0, 0, 0.7);
      color: #00ff00;
      border: 1px solid #333;
      border-radius: 4px;
      font-size: 10px;
      cursor: pointer;
      z-index: 10001;
    `

    toggleButton.addEventListener('click', () => {
      this.toggleOverlay()
    })

    document.body.appendChild(this.overlay)
    document.body.appendChild(toggleButton)

    // Start updating overlay
    this.startOverlayUpdates()

    // Add keyboard shortcut (Ctrl+Shift+D)
    document.addEventListener('keydown', event => {
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        this.toggleOverlay()
      }
    })
  }

  /**
   * Toggle diagnostic overlay visibility
   */
  toggleOverlay(): void {
    if (!this.overlay) return

    this.isVisible = !this.isVisible
    this.overlay.style.display = this.isVisible ? 'block' : 'none'

    if (this.isVisible) {
      this.updateOverlay()
    }
  }

  /**
   * Start overlay updates
   */
  private startOverlayUpdates(): void {
    if (this.updateInterval) return

    this.updateInterval = setInterval(() => {
      if (this.isVisible) {
        this.updateOverlay()
      }
    }, this.UPDATE_INTERVAL_MS)
  }

  /**
   * Update overlay content
   */
  private updateOverlay(): void {
    if (!this.overlay || !this.isVisible) return

    const now = performance.now()
    const recentEvents = this.getRecentEvents(10)
    const activePhases = Array.from(this.timingPhases.values()).filter(p => !p.endTime)

    const content = `
<div style="color: #00ff00; font-weight: bold; margin-bottom: 8px;">
WebSocket Diagnostics
</div>

<div style="color: #ffff00; margin-bottom: 4px;">Metrics:</div>
Connection: ${this.metrics.connectionTime.toFixed(2)}ms
Messages: ${this.metrics.totalMessages} (${this.metrics.missedMessages} missed)
Avg Latency: ${this.metrics.averageLatency.toFixed(2)}ms
Max Latency: ${this.metrics.maxLatency.toFixed(2)}ms
Network: ${this.getNetworkConditionIcon()} ${this.metrics.networkCondition}
Retries: ${this.metrics.connectionRetries}

<div style="color: #ffff00; margin-bottom: 4px;">Active Phases:</div>
${
  activePhases.map(phase => `${phase.name}: ${(now - phase.startTime).toFixed(0)}ms`).join('\n') ||
  'None'
}

<div style="color: #ffff00; margin-bottom: 4px;">Recent Events:</div>
${recentEvents
  .slice(-5)
  .reverse()
  .map(event => `${event.event}: ${event.duration ? `${event.duration.toFixed(1)}ms` : 'instant'}`)
  .join('\n')}

<div style="color: #888; font-size: 9px; margin-top: 8px;">
Press Ctrl+Shift+D to toggle | Last update: ${new Date().toLocaleTimeString()}
</div>
    `.trim()

    this.overlay.innerHTML = content
  }

  /**
   * Update latency statistics
   */
  private updateLatencyStats(latency: number): void {
    this.metrics.averageLatency =
      this.metrics.messageReceiveToDisplayTime.reduce((a, b) => a + b, 0) /
      this.metrics.messageReceiveToDisplayTime.length

    this.metrics.maxLatency = Math.max(this.metrics.maxLatency, latency)
    this.metrics.minLatency = Math.min(this.metrics.minLatency, latency)
  }

  /**
   * Update network condition assessment
   */
  private updateNetworkCondition(): void {
    const avgLatency = this.metrics.averageLatency
    const missedRate = this.metrics.missedMessages / Math.max(1, this.metrics.totalMessages)

    if (avgLatency < 50 && missedRate < 0.01) {
      this.metrics.networkCondition = 'excellent'
    } else if (avgLatency < 150 && missedRate < 0.05) {
      this.metrics.networkCondition = 'good'
    } else if (avgLatency < 300 && missedRate < 0.15) {
      this.metrics.networkCondition = 'poor'
    } else {
      this.metrics.networkCondition = 'critical'
    }
  }

  /**
   * Get network condition icon
   */
  private getNetworkConditionIcon(): string {
    switch (this.metrics.networkCondition) {
      case 'excellent':
        return '🟢'
      case 'good':
        return '🟡'
      case 'poor':
        return '🟠'
      case 'critical':
        return '🔴'
      default:
        return '⚪'
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(() => {
      this.metrics.lastHeartbeat = performance.now()
      this.logEvent('heartbeat', 0, {
        uptime: this.metrics.lastHeartbeat,
        memoryUsage: (performance as Performance & {memory?: {usedJSHeapSize: number}}).memory
          ?.usedJSHeapSize
      })
    }, this.HEARTBEAT_INTERVAL_MS)
  }

  /**
   * Export diagnostics data
   */
  exportDiagnostics(): string {
    const data = {
      timestamp: new Date().toISOString(),
      metrics: this.getMetrics(),
      recentEvents: this.getRecentEvents(100),
      timingPhases: this.getTimingPhases(),
      userAgent: navigator.userAgent,
      url: window.location.href
    }

    return JSON.stringify(data, null, 2)
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics = {
      connectionTime: 0,
      messageReceiveToDisplayTime: [],
      averageLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
      totalMessages: 0,
      missedMessages: 0,
      connectionRetries: 0,
      lastHeartbeat: 0,
      networkCondition: 'excellent'
    }
    this.events = []
    this.timingPhases.clear()
    this.logEvent('metrics-reset')
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    if (this.overlay) {
      this.overlay.remove()
      this.overlay = null
    }

    this.events = []
    this.timingPhases.clear()
  }
}

// Singleton instance
let globalDiagnostics: WebSocketDiagnostics | null = null

/**
 * Get global WebSocket diagnostics instance
 */
export function getWebSocketDiagnostics(): WebSocketDiagnostics {
  if (!globalDiagnostics) {
    globalDiagnostics = new WebSocketDiagnostics()
  }
  return globalDiagnostics
}

/**
 * Reset global diagnostics instance
 */
export function resetWebSocketDiagnostics(): void {
  if (globalDiagnostics) {
    globalDiagnostics.destroy()
    globalDiagnostics = null
  }
}

/**
 * Convenience function to log timing events
 */
export function logWebSocketTiming(
  event: string,
  duration?: number,
  metadata?: Record<string, unknown>
): void {
  const diagnostics = getWebSocketDiagnostics()
  diagnostics.logEvent(event, duration || 0, metadata)
}

/**
 * Convenience function to start timing phase
 */
export function startWebSocketTiming(phaseId: string, metadata?: Record<string, unknown>): void {
  const diagnostics = getWebSocketDiagnostics()
  diagnostics.startTimingPhase(phaseId, metadata)
}

/**
 * Convenience function to end timing phase
 */
export function endWebSocketTiming(phaseId: string, metadata?: Record<string, unknown>): number {
  const diagnostics = getWebSocketDiagnostics()
  return diagnostics.endTimingPhase(phaseId, metadata)
}
