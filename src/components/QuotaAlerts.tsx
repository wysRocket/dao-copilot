import React, { useState, useEffect, useCallback } from 'react'
import { useTranscriptionStateContext } from '../contexts/TranscriptionStateContext'
import GlassCard from './GlassCard'
import GlassButton from './GlassButton'

export interface QuotaAlertsProps {
  className?: string
  alertThresholds?: {
    warning: number // percentage (e.g., 70)
    critical: number // percentage (e.g., 90)
  }
  enableNotifications?: boolean
  onThresholdReached?: (threshold: 'warning' | 'critical', details: QuotaAlertDetails) => void
  onDismissAlert?: (alertId: string) => void
}

export interface QuotaAlertDetails {
  id: string
  type: 'warning' | 'critical' | 'info'
  threshold: number
  currentUsage: number
  availableQuota: number
  totalQuota: number
  estimatedTimeToExhaustion: number
  message: string
  timestamp: Date
  dismissed: boolean
  actions?: Array<{
    label: string
    action: () => void
    type: 'primary' | 'secondary'
  }>
}

const QuotaAlerts: React.FC<QuotaAlertsProps> = ({
  className = '',
  alertThresholds = { warning: 70, critical: 90 },
  enableNotifications = true,
  onThresholdReached,
  onDismissAlert
}) => {
  const { state } = useTranscriptionStateContext()
  const [alerts, setAlerts] = useState<QuotaAlertDetails[]>([])
  const [lastQuotaCheck, setLastQuotaCheck] = useState<number>(0)

  const quota = state.connection?.quota

  // Generate alert ID
  const generateAlertId = useCallback(() => {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }, [])

  // Check quota thresholds and generate alerts
  const checkQuotaThresholds = useCallback(() => {
    if (!quota || !enableNotifications) return

    const utilizationPercentage = quota.totalKeys > 0 
      ? ((quota.totalKeys - quota.availableKeys) / quota.totalKeys) * 100 
      : 0

    const currentTime = Date.now()
    
    // Avoid generating duplicate alerts within a short time window
    if (currentTime - lastQuotaCheck < 60000) return // 1 minute cooldown

    setLastQuotaCheck(currentTime)

    // Critical threshold alert
    if (utilizationPercentage >= alertThresholds.critical) {
      const existingCriticalAlert = alerts.find(
        alert => alert.type === 'critical' && !alert.dismissed
      )

      if (!existingCriticalAlert) {
        const criticalAlert: QuotaAlertDetails = {
          id: generateAlertId(),
          type: 'critical',
          threshold: alertThresholds.critical,
          currentUsage: quota.totalKeys - quota.availableKeys,
          availableQuota: quota.availableKeys,
          totalQuota: quota.totalKeys,
          estimatedTimeToExhaustion: 0, // Calculate based on usage rate
          message: `Critical: ${utilizationPercentage.toFixed(1)}% of quota used. Only ${quota.availableKeys} API keys remaining.`,
          timestamp: new Date(),
          dismissed: false,
          actions: [
            {
              label: 'Add API Keys',
              action: () => console.log('Add API keys triggered'),
              type: 'primary'
            },
            {
              label: 'Check Console',
              action: () => console.log('Open Google Cloud Console'),
              type: 'secondary'
            }
          ]
        }

        setAlerts(prev => [criticalAlert, ...prev])
        onThresholdReached?.('critical', criticalAlert)
      }
    }

    // Warning threshold alert
    else if (utilizationPercentage >= alertThresholds.warning) {
      const existingWarningAlert = alerts.find(
        alert => alert.type === 'warning' && !alert.dismissed
      )

      if (!existingWarningAlert) {
        const warningAlert: QuotaAlertDetails = {
          id: generateAlertId(),
          type: 'warning',
          threshold: alertThresholds.warning,
          currentUsage: quota.totalKeys - quota.availableKeys,
          availableQuota: quota.availableKeys,
          totalQuota: quota.totalKeys,
          estimatedTimeToExhaustion: 0,
          message: `Warning: ${utilizationPercentage.toFixed(1)}% of quota used. Consider monitoring usage closely.`,
          timestamp: new Date(),
          dismissed: false,
          actions: [
            {
              label: 'Monitor Usage',
              action: () => console.log('Open usage monitor'),
              type: 'primary'
            },
            {
              label: 'View Projections',
              action: () => console.log('Open usage projections'),
              type: 'secondary'
            }
          ]
        }

        setAlerts(prev => [warningAlert, ...prev])
        onThresholdReached?.('warning', warningAlert)
      }
    }

    // Quota exhaustion alert
    if (quota.isQuotaExceeded) {
      const existingExhaustionAlert = alerts.find(
        alert => alert.message.includes('quota exhausted') && !alert.dismissed
      )

      if (!existingExhaustionAlert) {
        const exhaustionAlert: QuotaAlertDetails = {
          id: generateAlertId(),
          type: 'critical',
          threshold: 100,
          currentUsage: quota.totalKeys,
          availableQuota: 0,
          totalQuota: quota.totalKeys,
          estimatedTimeToExhaustion: 0,
          message: 'Quota exhausted! No API keys available. Service may be interrupted.',
          timestamp: new Date(),
          dismissed: false,
          actions: [
            {
              label: 'Add Keys Now',
              action: () => console.log('Emergency add API keys'),
              type: 'primary'
            },
            {
              label: 'Check Reset Time',
              action: () => console.log('Check quota reset time'),
              type: 'secondary'
            }
          ]
        }

        setAlerts(prev => [exhaustionAlert, ...prev])
        onThresholdReached?.('critical', exhaustionAlert)
      }
    }
  }, [quota, alertThresholds, enableNotifications, alerts, lastQuotaCheck, generateAlertId, onThresholdReached])

  // Monitor quota changes
  useEffect(() => {
    checkQuotaThresholds()
  }, [checkQuotaThresholds])

  // Handle alert dismissal
  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, dismissed: true } : alert
    ))
    onDismissAlert?.(alertId)
  }, [onDismissAlert])

  // Handle alert action
  const handleAlertAction = useCallback((alert: QuotaAlertDetails, actionIndex: number) => {
    if (alert.actions?.[actionIndex]) {
      alert.actions[actionIndex].action()
    }
  }, [])

  // Auto-cleanup old dismissed alerts
  useEffect(() => {
    const cleanup = setInterval(() => {
      setAlerts(prev => prev.filter(alert => 
        !alert.dismissed || 
        (Date.now() - alert.timestamp.getTime()) < 24 * 60 * 60 * 1000 // Keep for 24 hours
      ))
    }, 60000) // Check every minute

    return () => clearInterval(cleanup)
  }, [])

  const getAlertIcon = (type: QuotaAlertDetails['type']): string => {
    switch (type) {
      case 'critical': return '🚨'
      case 'warning': return '⚠️'
      case 'info': return 'ℹ️'
      default: return '📢'
    }
  }

  const getAlertColors = (type: QuotaAlertDetails['type']): string => {
    switch (type) {
      case 'critical': return 'border-red-400 bg-red-900/20 text-red-100'
      case 'warning': return 'border-yellow-400 bg-yellow-900/20 text-yellow-100'
      case 'info': return 'border-blue-400 bg-blue-900/20 text-blue-100'
      default: return 'border-gray-400 bg-gray-900/20 text-gray-100'
    }
  }

  const formatTimeAgo = (timestamp: Date): string => {
    const diff = Date.now() - timestamp.getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  const activeAlerts = alerts.filter(alert => !alert.dismissed)

  if (!enableNotifications || activeAlerts.length === 0) {
    return null
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {activeAlerts.map(alert => (
        <GlassCard 
          key={alert.id}
          className={`p-4 border-l-4 ${getAlertColors(alert.type)}`}
        >
          <div className="flex items-start gap-3">
            {/* Alert Icon */}
            <div className="text-2xl flex-shrink-0 mt-1">
              {getAlertIcon(alert.type)}
            </div>

            {/* Alert Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-sm mb-1">
                    Quota {alert.type === 'critical' ? 'Critical' : 'Warning'}
                  </h4>
                  <p className="text-sm opacity-90 leading-relaxed">
                    {alert.message}
                  </p>
                </div>

                {/* Dismiss Button */}
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="flex-shrink-0 w-6 h-6 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center text-sm opacity-70 hover:opacity-100"
                  aria-label="Dismiss alert"
                >
                  ✕
                </button>
              </div>

              {/* Alert Details */}
              <div className="mt-2 grid grid-cols-3 gap-4 text-xs opacity-75">
                <div>
                  <div className="font-medium">Usage</div>
                  <div>{alert.currentUsage} / {alert.totalQuota}</div>
                </div>
                <div>
                  <div className="font-medium">Available</div>
                  <div>{alert.availableQuota} keys</div>
                </div>
                <div>
                  <div className="font-medium">Threshold</div>
                  <div>{alert.threshold}%</div>
                </div>
              </div>

              {/* Actions */}
              {alert.actions && alert.actions.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {alert.actions.map((action, index) => {
                    const buttonTypes = {
                      primary: 'bg-blue-600 hover:bg-blue-700 text-white',
                      secondary: 'bg-gray-600 hover:bg-gray-700 text-white'
                    }

                    return (
                      <GlassButton
                        key={index}
                        onClick={() => handleAlertAction(alert, index)}
                        className={`text-xs px-3 py-1 ${buttonTypes[action.type]}`}
                      >
                        {action.label}
                      </GlassButton>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Timestamp */}
          <div className="mt-2 text-xs opacity-50">
            {formatTimeAgo(alert.timestamp)}
          </div>
        </GlassCard>
      ))}

      {/* Alert Settings (if more than 1 alert) */}
      {activeAlerts.length > 1 && (
        <div className="text-center">
          <button
            onClick={() => setAlerts(prev => prev.map(alert => ({ ...alert, dismissed: true })))}
            className="text-xs opacity-60 hover:opacity-80 transition-opacity"
          >
            Dismiss All Alerts
          </button>
        </div>
      )}
    </div>
  )
}

export default QuotaAlerts
