/**
 * Quota Status Component
 * Displays API quota information and management
 */

import React, {useEffect, useState} from 'react'
import {cn} from '@/utils/tailwind'
import {getTranscriptionStateManager, ConnectionState, StateChangeType, TranscriptionState} from '../state/TranscriptionStateManager'

// Simple time formatting utility
const formatTimeAgo = (timestamp: number) => {
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

const formatTimeUntil = (timestamp: number) => {
  const now = Date.now()
  const diff = timestamp - now
  
  if (diff <= 0) return 'now'
  if (diff < 60000) return `in ${Math.ceil(diff / 1000)}s`
  if (diff < 3600000) return `in ${Math.ceil(diff / 60000)}m`
  if (diff < 86400000) return `in ${Math.ceil(diff / 3600000)}h`
  return `in ${Math.ceil(diff / 86400000)}d`
}

export interface QuotaStatusProps {
  className?: string
  showDetails?: boolean
  showResetTime?: boolean
  onRefresh?: () => void
}

export const QuotaStatus: React.FC<QuotaStatusProps> = ({
  className,
  showDetails = true,
  showResetTime = true,
  onRefresh
}) => {
  const [quotaState, setQuotaState] = useState<ConnectionState['quota']>()
  const [lastError, setLastError] = useState<ConnectionState['lastError']>()

  useEffect(() => {
    const stateManager = getTranscriptionStateManager()
    const initialState = stateManager.getState()
    setQuotaState(initialState.connection.quota)
    setLastError(initialState.connection.lastError)

    // Subscribe to quota state changes
    const unsubscribe = stateManager.subscribe((type: StateChangeType, state: TranscriptionState) => {
      if (type === 'quota-status-changed' || type === 'connection-error') {
        setQuotaState(state.connection.quota)
        if (state.connection.lastError?.type === 'quota') {
          setLastError(state.connection.lastError)
        }
      }
    })

    return unsubscribe
  }, [])

  if (!quotaState) {
    return null
  }

  const getQuotaStatusIcon = () => {
    if (quotaState.isQuotaExceeded) return '🚫'
    if (quotaState.availableKeys === 0) return '⚠️'
    if (quotaState.availableKeys < quotaState.totalKeys * 0.3) return '🟡'
    return '🟢'
  }

  const getQuotaStatusText = () => {
    if (quotaState.isQuotaExceeded) return 'Quota Exceeded'
    if (quotaState.availableKeys === 0) return 'No Keys Available'
    if (quotaState.availableKeys < quotaState.totalKeys * 0.3) return 'Low Quota'
    return 'Quota Available'
  }

  const getStatusColor = () => {
    if (quotaState.isQuotaExceeded) return 'text-red-600 dark:text-red-400'
    if (quotaState.availableKeys === 0) return 'text-orange-600 dark:text-orange-400'
    if (quotaState.availableKeys < quotaState.totalKeys * 0.3) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-green-600 dark:text-green-400'
  }

  const getBgColor = () => {
    if (quotaState.isQuotaExceeded) return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
    if (quotaState.availableKeys === 0) return 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
    if (quotaState.availableKeys < quotaState.totalKeys * 0.3) return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
    return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
  }

  const getUtilizationPercentage = () => {
    if (quotaState.totalKeys === 0) return 0
    return ((quotaState.totalKeys - quotaState.availableKeys) / quotaState.totalKeys) * 100
  }

  return (
    <div className={cn(
      'p-4 border rounded-lg',
      getBgColor(),
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-lg">{getQuotaStatusIcon()}</span>
          <span className={cn('font-medium', getStatusColor())}>
            {getQuotaStatusText()}
          </span>
        </div>
        
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            title="Refresh quota status"
          >
            🔄
          </button>
        )}
      </div>

      {/* Key Availability */}
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span>Available API Keys</span>
          <span className="font-mono">
            {quotaState.availableKeys} / {quotaState.totalKeys}
          </span>
        </div>
        
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className={cn(
              'h-2 rounded-full transition-all duration-300',
              quotaState.isQuotaExceeded || quotaState.availableKeys === 0 
                ? 'bg-red-500' 
                : quotaState.availableKeys < quotaState.totalKeys * 0.3 
                  ? 'bg-yellow-500' 
                  : 'bg-green-500'
            )}
            style={{ width: `${(quotaState.availableKeys / Math.max(quotaState.totalKeys, 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Quota Error Details */}
      {quotaState.isQuotaExceeded && lastError?.type === 'quota' && (
        <div className="mb-3 p-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-sm">
          <p className="font-medium text-red-800 dark:text-red-200 mb-1">
            Last Quota Error:
          </p>
          <p className="text-red-700 dark:text-red-300 text-xs">
            {lastError.message}
          </p>
          <p className="text-red-600 dark:text-red-400 text-xs mt-1">
            {formatTimeAgo(lastError.timestamp)}
          </p>
        </div>
      )}

      {/* Reset Time */}
      {showResetTime && quotaState.quotaResetEstimate && (
        <div className="mb-3 text-sm">
          <span className="text-muted-foreground">Quota Reset: </span>
          <span className="font-mono">
            {formatTimeUntil(quotaState.quotaResetEstimate)}
          </span>
        </div>
      )}

      {/* Additional Details */}
      {showDetails && (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Utilization:</span>
            <span className="font-mono">{getUtilizationPercentage().toFixed(1)}%</span>
          </div>
          
          {quotaState.lastQuotaError && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Error:</span>
              <span className="font-mono text-xs">
                {formatTimeAgo(quotaState.lastQuotaError)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {quotaState.isQuotaExceeded && (
        <div className="mt-3 p-2 bg-blue-100 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded text-sm">
          <p className="font-medium text-blue-800 dark:text-blue-200 mb-1">💡 Recommendations:</p>
          <ul className="text-blue-700 dark:text-blue-300 text-xs space-y-1">
            <li>• Wait for quota reset or add more API keys</li>
            <li>• Reduce transcription frequency temporarily</li>
            <li>• Check Google Cloud Console for quota limits</li>
          </ul>
        </div>
      )}
      
      {quotaState.availableKeys < quotaState.totalKeys * 0.3 && !quotaState.isQuotaExceeded && (
        <div className="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-sm">
          <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">⚠️ Low Quota Warning:</p>
          <p className="text-yellow-700 dark:text-yellow-300 text-xs">
            Consider adding backup API keys or monitoring usage more closely.
          </p>
        </div>
      )}
    </div>
  )
}

export default QuotaStatus
