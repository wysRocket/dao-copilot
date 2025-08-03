/**
 * Retry Progress Component
 * Displays real-time retry progress with countdown and controls
 */

import React, {useEffect, useState} from 'react'
import {cn} from '@/utils/tailwind'
import {getTranscriptionStateManager, ConnectionState, StateChangeType, TranscriptionState} from '../state/TranscriptionStateManager'

export interface RetryProgressProps {
  className?: string
  showStrategy?: boolean
  showControls?: boolean
  onCancel?: () => void
  onRetryNow?: () => void
}

export const RetryProgress: React.FC<RetryProgressProps> = ({
  className,
  showStrategy = true,
  showControls = false,
  onCancel,
  onRetryNow
}) => {
  const [retryState, setRetryState] = useState<ConnectionState['retry']>()
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    const stateManager = getTranscriptionStateManager()
    const initialState = stateManager.getState()
    setRetryState(initialState.connection.retry)
    setCountdown(initialState.connection.retry.nextAttemptIn)

    // Subscribe to retry state changes
    const unsubscribe = stateManager.subscribe((type: StateChangeType, state: TranscriptionState) => {
      if (type === 'connection-retry-started' || type === 'connection-retry-updated') {
        setRetryState(state.connection.retry)
        setCountdown(state.connection.retry.nextAttemptIn)
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!retryState?.isRetrying || countdown <= 0) return

    const interval = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 100))
    }, 100)

    return () => clearInterval(interval)
  }, [retryState?.isRetrying, countdown])

  if (!retryState?.isRetrying) {
    return null
  }

  const progress = retryState.currentDelay > 0 
    ? ((retryState.currentDelay - countdown) / retryState.currentDelay) * 100
    : 0

  const formatTime = (ms: number) => {
    const seconds = Math.ceil(ms / 1000)
    return `${seconds}s`
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const getStrategyDescription = (strategy: ConnectionState['retry']['strategy']) => {
    switch (strategy) {
      case 'exponential':
        return 'Exponential backoff - delays increase progressively'
      case 'linear':
        return 'Linear backoff - constant delay increases'
      case 'fibonacci':
        return 'Fibonacci backoff - delays follow Fibonacci sequence'
      case 'custom':
        return 'Custom backoff strategy'
      default:
        return 'Unknown strategy'
    }
  }

  return (
    <div className={cn(
      'p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
          <span className="font-medium text-blue-800 dark:text-blue-200">
            Reconnecting...
          </span>
        </div>
        <span className="text-sm text-blue-600 dark:text-blue-400">
          Attempt {retryState.attemptCount} of {retryState.maxAttempts}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-sm text-blue-700 dark:text-blue-300 mb-1">
          <span>Next attempt in {formatTime(countdown)}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Strategy Info */}
      {showStrategy && (
        <div className="mb-3 text-sm text-blue-700 dark:text-blue-300">
          <div className="flex justify-between items-center">
            <span className="font-medium">Strategy: {retryState.strategy}</span>
            <span>Delay: {formatDuration(retryState.currentDelay)}</span>
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            {getStrategyDescription(retryState.strategy)}
          </p>
        </div>
      )}

      {/* Controls */}
      {showControls && (
        <div className="flex space-x-2">
          <button
            onClick={onRetryNow}
            className="flex-1 px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Retry Now
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Remaining Attempts Warning */}
      {retryState.attemptCount >= retryState.maxAttempts * 0.8 && (
        <div className="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-sm">
          <span className="text-yellow-800 dark:text-yellow-200">
            ⚠️ Only {retryState.maxAttempts - retryState.attemptCount} attempts remaining
          </span>
        </div>
      )}
    </div>
  )
}

export default RetryProgress
