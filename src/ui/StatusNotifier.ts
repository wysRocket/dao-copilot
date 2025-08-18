/**
 * Status Notifier System
 *
 * Provides UI notification integration for circuit breaker state changes
 * and system degradation events. Manages toast notifications, status banners,
 * and event propagation to UI components.
 */

import {
  CircuitBreakerState,
  CircuitBreakerHealthStatus,
  SystemHealthStatus
} from '../fallback/CircuitBreaker'

export interface StatusNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: number
  autoHide?: boolean
  hideAfterMs?: number
  actions?: NotificationAction[]
}

export enum NotificationType {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success'
}

export interface NotificationAction {
  label: string
  action: () => void
  style?: 'primary' | 'secondary'
}

export interface StatusEventListener {
  (event: StatusEvent): void
}

export interface StatusEvent {
  type: StatusEventType
  source: string
  data: Record<string, unknown> | unknown
  timestamp: number
}

export enum StatusEventType {
  CIRCUIT_BREAKER_OPENED = 'circuit_breaker_opened',
  CIRCUIT_BREAKER_CLOSED = 'circuit_breaker_closed',
  CIRCUIT_BREAKER_HALF_OPEN = 'circuit_breaker_half_open',
  SYSTEM_DEGRADED = 'system_degraded',
  SYSTEM_RECOVERED = 'system_recovered',
  CONNECTION_QUALITY_CHANGED = 'connection_quality_changed',
  FALLBACK_ACTIVATED = 'fallback_activated',
  FALLBACK_RECOVERED = 'fallback_recovered'
}

export class StatusNotifier {
  private static instance: StatusNotifier
  private notifications = new Map<string, StatusNotification>()
  private listeners = new Set<StatusEventListener>()
  private notificationContainer?: HTMLElement

  private constructor() {
    this.initializeNotificationContainer()
  }

  static getInstance(): StatusNotifier {
    if (!StatusNotifier.instance) {
      StatusNotifier.instance = new StatusNotifier()
    }
    return StatusNotifier.instance
  }

  /**
   * Add a status event listener
   */
  addEventListener(listener: StatusEventListener): void {
    this.listeners.add(listener)
  }

  /**
   * Remove a status event listener
   */
  removeEventListener(listener: StatusEventListener): void {
    this.listeners.delete(listener)
  }

  /**
   * Show a notification
   */
  notify(notification: Omit<StatusNotification, 'id' | 'timestamp'>): string {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const fullNotification: StatusNotification = {
      id,
      timestamp: Date.now(),
      autoHide: notification.autoHide ?? true,
      hideAfterMs: notification.hideAfterMs ?? 5000,
      ...notification
    }

    this.notifications.set(id, fullNotification)
    this.renderNotification(fullNotification)

    if (fullNotification.autoHide) {
      setTimeout(() => this.hideNotification(id), fullNotification.hideAfterMs)
    }

    return id
  }

  /**
   * Hide a specific notification
   */
  hideNotification(id: string): void {
    const notification = this.notifications.get(id)
    if (notification) {
      this.notifications.delete(id)
      this.removeNotificationFromDOM(id)
    }
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    this.notifications.forEach((_, id) => this.hideNotification(id))
  }

  /**
   * Emit a status event
   */
  emitEvent(type: StatusEventType, source: string, data?: Record<string, unknown> | unknown): void {
    const event: StatusEvent = {
      type,
      source,
      data,
      timestamp: Date.now()
    }

    this.listeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('Error in status event listener:', error)
      }
    })

    // Handle built-in event responses
    this.handleBuiltInEvent(event)
  }

  /**
   * Handle circuit breaker state changes
   */
  handleCircuitBreakerStateChange(
    serviceName: string,
    newState: CircuitBreakerState,
    healthStatus: CircuitBreakerHealthStatus
  ): void {
    switch (newState) {
      case CircuitBreakerState.OPEN:
        this.emitEvent(StatusEventType.CIRCUIT_BREAKER_OPENED, serviceName, healthStatus)
        this.notify({
          type: NotificationType.ERROR,
          title: 'Service Degraded',
          message: `${serviceName} is experiencing issues. Switching to backup mode.`,
          autoHide: false,
          actions: [
            {
              label: 'Retry Now',
              action: () => this.requestManualRetry(serviceName),
              style: 'primary'
            },
            {
              label: 'Dismiss',
              action: () => {},
              style: 'secondary'
            }
          ]
        })
        break

      case CircuitBreakerState.HALF_OPEN:
        this.emitEvent(StatusEventType.CIRCUIT_BREAKER_HALF_OPEN, serviceName, healthStatus)
        this.notify({
          type: NotificationType.WARNING,
          title: 'Testing Service Recovery',
          message: `Attempting to restore ${serviceName}...`,
          hideAfterMs: 3000
        })
        break

      case CircuitBreakerState.CLOSED:
        this.emitEvent(StatusEventType.CIRCUIT_BREAKER_CLOSED, serviceName, healthStatus)
        this.notify({
          type: NotificationType.SUCCESS,
          title: 'Service Recovered',
          message: `${serviceName} is now operating normally.`,
          hideAfterMs: 3000
        })
        break
    }
  }

  /**
   * Handle system-wide health changes
   */
  handleSystemHealthChange(
    previousHealth: SystemHealthStatus,
    currentHealth: SystemHealthStatus
  ): void {
    const wasDegraded = previousHealth.isDegraded
    const isDegraded = currentHealth.isDegraded

    if (!wasDegraded && isDegraded) {
      this.emitEvent(StatusEventType.SYSTEM_DEGRADED, 'system', currentHealth)
      this.notify({
        type: NotificationType.WARNING,
        title: 'System Performance Degraded',
        message: `${currentHealth.openCircuits} service(s) are experiencing issues.`,
        autoHide: false
      })
    } else if (wasDegraded && !isDegraded) {
      this.emitEvent(StatusEventType.SYSTEM_RECOVERED, 'system', currentHealth)
      this.notify({
        type: NotificationType.SUCCESS,
        title: 'System Fully Recovered',
        message: 'All services are now operating normally.',
        hideAfterMs: 5000
      })
    }
  }

  /**
   * Handle fallback activation
   */
  handleFallbackActivated(primaryService: string, fallbackService: string): void {
    this.emitEvent(StatusEventType.FALLBACK_ACTIVATED, primaryService, {fallbackService})
    this.notify({
      type: NotificationType.INFO,
      title: 'Backup Mode Active',
      message: `Switched from ${primaryService} to ${fallbackService} for continued service.`,
      hideAfterMs: 4000
    })
  }

  /**
   * Handle fallback recovery
   */
  handleFallbackRecovered(primaryService: string, fallbackService: string): void {
    this.emitEvent(StatusEventType.FALLBACK_RECOVERED, primaryService, {fallbackService})
    this.notify({
      type: NotificationType.SUCCESS,
      title: 'Primary Service Restored',
      message: `Switched back to ${primaryService} from backup mode.`,
      hideAfterMs: 4000
    })
  }

  private handleBuiltInEvent(event: StatusEvent): void {
    // Additional built-in event handling can be added here
    // For now, just log for debugging
    console.debug('Status event:', event)
  }

  private requestManualRetry(serviceName: string): void {
    this.emitEvent(StatusEventType.CIRCUIT_BREAKER_HALF_OPEN, serviceName, {manual: true})
  }

  private initializeNotificationContainer(): void {
    // Only initialize in browser environment
    if (typeof window === 'undefined') return

    this.notificationContainer = document.createElement('div')
    this.notificationContainer.id = 'status-notifications'
    this.notificationContainer.className = 'status-notifications-container'

    // Add basic styling
    Object.assign(this.notificationContainer.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '10000',
      pointerEvents: 'none'
    })

    document.body.appendChild(this.notificationContainer)
  }

  private renderNotification(notification: StatusNotification): void {
    if (!this.notificationContainer) return

    const element = document.createElement('div')
    element.id = `notification-${notification.id}`
    element.className = `status-notification status-notification--${notification.type}`
    element.style.cssText = `
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      margin-bottom: 12px;
      padding: 16px;
      max-width: 400px;
      pointer-events: auto;
      animation: slideIn 0.3s ease-out;
      border-left: 4px solid ${this.getTypeColor(notification.type)};
    `

    const title = document.createElement('h4')
    title.textContent = notification.title
    title.style.cssText = 'margin: 0 0 8px 0; font-size: 16px; font-weight: 600;'

    const message = document.createElement('p')
    message.textContent = notification.message
    message.style.cssText = 'margin: 0; font-size: 14px; color: #666;'

    element.appendChild(title)
    element.appendChild(message)

    if (notification.actions && notification.actions.length > 0) {
      const actionsContainer = document.createElement('div')
      actionsContainer.style.cssText =
        'margin-top: 12px; display: flex; gap: 8px; justify-content: flex-end;'

      notification.actions.forEach(action => {
        const button = document.createElement('button')
        button.textContent = action.label
        button.style.cssText = `
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          ${
            action.style === 'primary'
              ? 'background: #007bff; color: white;'
              : 'background: #f8f9fa; color: #333; border: 1px solid #dee2e6;'
          }
        `
        button.onclick = () => {
          action.action()
          this.hideNotification(notification.id)
        }
        actionsContainer.appendChild(button)
      })

      element.appendChild(actionsContainer)
    }

    // Add close button for persistent notifications
    if (!notification.autoHide) {
      const closeButton = document.createElement('button')
      closeButton.innerHTML = '×'
      closeButton.style.cssText = `
        position: absolute;
        top: 8px;
        right: 12px;
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #999;
      `
      closeButton.onclick = () => this.hideNotification(notification.id)
      element.appendChild(closeButton)
      element.style.position = 'relative'
    }

    this.notificationContainer.appendChild(element)
  }

  private removeNotificationFromDOM(id: string): void {
    const element = document.getElementById(`notification-${id}`)
    if (element) {
      element.style.animation = 'slideOut 0.3s ease-in forwards'
      setTimeout(() => element.remove(), 300)
    }
  }

  private getTypeColor(type: NotificationType): string {
    switch (type) {
      case NotificationType.SUCCESS:
        return '#28a745'
      case NotificationType.WARNING:
        return '#ffc107'
      case NotificationType.ERROR:
        return '#dc3545'
      case NotificationType.INFO:
        return '#17a2b8'
      default:
        return '#6c757d'
    }
  }
}

// Global CSS for animations (should be added to your CSS file)
export const StatusNotifierStyles = `
@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

.status-notifications-container {
  font-family: system-ui, -apple-system, sans-serif;
}
`

// Export singleton instance for easy access
export const statusNotifier = StatusNotifier.getInstance()
