import React, { useState, useEffect, useCallback } from 'react'
import { useTranscriptionStateContext } from '../contexts/TranscriptionStateContext'
import GlassCard from './GlassCard'
import GlassButton from './GlassButton'

export interface RetryCountdownProps {
  className?: string
  showDetailedStats?: boolean
  allowManualRetry?: boolean
  allowCancelRetry?: boolean
  onRetryNow?: () => void
  onCancelRetry?: () => void
}

interface RetryStats {
  totalAttempts: number
  successfulRetries: number
  failedRetries: number
  averageRetryDelay: number
  longestDelay: number
  shortestDelay: number
}

const RetryCountdown: React.FC<RetryCountdownProps> = ({
  className = '',
  showDetailedStats = false,
  allowManualRetry = true,
  allowCancelRetry = true,
  onRetryNow,
  onCancelRetry
}) => {
  const { state } = useTranscriptionStateContext()
  const [countdown, setCountdown] = useState(0)
  const [retryStats, setRetryStats] = useState<RetryStats>({
    totalAttempts: 0,
    successfulRetries: 0,
    failedRetries: 0,
    averageRetryDelay: 0,
    longestDelay: 0,
    shortestDelay: 0
  })

  const retry = state.connection?.retry

  // Update countdown timer
  useEffect(() => {
    if (!retry?.isRetrying || retry.nextAttemptIn <= 0) return

    const interval = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 100))
    }, 100)

    return () => clearInterval(interval)
  }, [retry?.isRetrying, retry?.nextAttemptIn])

  // Initialize countdown when retry state changes
  useEffect(() => {
    if (retry?.nextAttemptIn) {
      setCountdown(retry.nextAttemptIn)
    }
  }, [retry?.nextAttemptIn])

  // Calculate retry statistics
  useEffect(() => {
    if (retry) {
      setRetryStats({
        totalAttempts: retry.attemptCount,
        successfulRetries: 0, // This would need to be tracked in the state manager
        failedRetries: retry.attemptCount,
        averageRetryDelay: retry.currentDelay,
        longestDelay: Math.max(retry.currentDelay, retryStats.longestDelay),
        shortestDelay: Math.min(retry.currentDelay, retryStats.shortestDelay || retry.currentDelay)
      })
    }
  }, [retry, retryStats.longestDelay, retryStats.shortestDelay])

  const handleRetryNow = useCallback(() => {
    onRetryNow?.()
  }, [onRetryNow])

  const handleCancelRetry = useCallback(() => {
    onCancelRetry?.()
  }, [onCancelRetry])

  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${Math.ceil(ms)}ms`
    const seconds = Math.ceil(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const getProgressPercentage = (): number => {
    if (!retry?.currentDelay || retry.currentDelay <= 0) return 0
    return Math.min(100, ((retry.currentDelay - countdown) / retry.currentDelay) * 100)
  }

  const getRetryStatusColor = (): string => {
    if (!retry) return 'gray'
    if (retry.attemptCount >= retry.maxAttempts * 0.9) return 'red'
    if (retry.attemptCount >= retry.maxAttempts * 0.7) return 'yellow'
    return 'blue'
  }

  const getTimeUntilNextRetry = (): string => {
    return formatTime(countdown)
  }

  const isRetryInProgress = retry?.isRetrying || false
  const isNearMaxAttempts = retry ? retry.attemptCount >= retry.maxAttempts * 0.8 : false
  const progressPercentage = getProgressPercentage()
  const statusColor = getRetryStatusColor()

  if (!isRetryInProgress) {
    return null
  }

  return (
    <GlassCard className={`p-4 border-l-4 ${
      statusColor === 'red' ? 'border-red-400' :
      statusColor === 'yellow' ? 'border-yellow-400' :
      'border-blue-400'
    } ${className}`}>
      {/* Header with Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full animate-pulse ${
            statusColor === 'red' ? 'bg-red-500' :
            statusColor === 'yellow' ? 'bg-yellow-500' :
            'bg-blue-500'
          }`} />
          <h3 className="font-semibold text-lg">
            Reconnection in Progress
          </h3>
        </div>
        <div className="text-sm opacity-75">
          Attempt {retry?.attemptCount || 0} of {retry?.maxAttempts || 0}
        </div>
      </div>

      {/* Main Countdown Display */}
      <div className="text-center mb-4">
        <div className="text-3xl font-mono font-bold mb-2">
          {getTimeUntilNextRetry()}
        </div>
        <div className="text-sm opacity-75">
          Next retry attempt
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1 opacity-75">
          <span>Progress</span>
          <span>{Math.round(progressPercentage)}%</span>
        </div>
        <div className="w-full bg-black/20 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-100 ${
              statusColor === 'red' ? 'bg-red-500' :
              statusColor === 'yellow' ? 'bg-yellow-500' :
              'bg-blue-500'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Retry Strategy Info */}
      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
        <div>
          <div className="font-medium opacity-75">Strategy</div>
          <div className="capitalize">{retry?.strategy || 'Unknown'}</div>
        </div>
        <div>
          <div className="font-medium opacity-75">Current Delay</div>
          <div>{formatDuration(retry?.currentDelay || 0)}</div>
        </div>
      </div>

      {/* Detailed Statistics */}
      {showDetailedStats && (
        <div className="grid grid-cols-2 gap-4 text-xs mb-4 p-3 bg-black/10 rounded">
          <div>
            <div className="font-medium opacity-75">Total Attempts</div>
            <div>{retryStats.totalAttempts}</div>
          </div>
          <div>
            <div className="font-medium opacity-75">Failed Retries</div>
            <div>{retryStats.failedRetries}</div>
          </div>
          <div>
            <div className="font-medium opacity-75">Longest Delay</div>
            <div>{formatDuration(retryStats.longestDelay)}</div>
          </div>
          <div>
            <div className="font-medium opacity-75">Shortest Delay</div>
            <div>{formatDuration(retryStats.shortestDelay)}</div>
          </div>
        </div>
      )}

      {/* Warning for Near Max Attempts */}
      {isNearMaxAttempts && (
        <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-yellow-400">⚠️</span>
            <span>
              Only {(retry?.maxAttempts || 0) - (retry?.attemptCount || 0)} attempts remaining
            </span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-2">
        {allowManualRetry && (
          <GlassButton
            onClick={handleRetryNow}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <span className="mr-1">🔄</span>
            Retry Now
          </GlassButton>
        )}
        {allowCancelRetry && (
          <GlassButton
            onClick={handleCancelRetry}
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white"
          >
            <span className="mr-1">✕</span>
            Cancel
          </GlassButton>
        )}
      </div>

      {/* Strategy Description */}
      <div className="mt-3 text-xs opacity-60">
        {retry?.strategy === 'exponential' && 'Delays increase exponentially with each attempt'}
        {retry?.strategy === 'linear' && 'Delays increase linearly with each attempt'}
        {retry?.strategy === 'fibonacci' && 'Delays follow the Fibonacci sequence'}
        {retry?.strategy === 'custom' && 'Using custom retry delay strategy'}
      </div>
    </GlassCard>
  )
}

export default RetryCountdown
