import React, { useState, useCallback } from 'react'
import { useTranscriptionStateContext } from '../contexts/TranscriptionStateContext'
import GlassCard from './GlassCard'
import GlassButton from './GlassButton'

export interface RetryControlsProps {
  className?: string
  onStrategyChange?: (strategy: 'exponential' | 'linear' | 'fibonacci' | 'custom') => void
  onMaxAttemptsChange?: (maxAttempts: number) => void
  onDelayChange?: (baseDelay: number) => void
  onRetryNow?: () => void
  onCancelRetry?: () => void
  onResetRetryState?: () => void
}

const RetryControls: React.FC<RetryControlsProps> = ({
  className = '',
  onStrategyChange,
  onMaxAttemptsChange,
  onDelayChange,
  onRetryNow,
  onCancelRetry,
  onResetRetryState
}) => {
  const { state } = useTranscriptionStateContext()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [customDelay, setCustomDelay] = useState(1000)
  const [customMaxAttempts, setCustomMaxAttempts] = useState(5)

  const retry = state.connection?.retry
  const isRetrying = retry?.isRetrying || false

  const handleStrategyChange = useCallback((strategy: 'exponential' | 'linear' | 'fibonacci' | 'custom') => {
    onStrategyChange?.(strategy)
  }, [onStrategyChange])

  const handleMaxAttemptsChange = useCallback((attempts: number) => {
    setCustomMaxAttempts(attempts)
    onMaxAttemptsChange?.(attempts)
  }, [onMaxAttemptsChange])

  const handleDelayChange = useCallback((delay: number) => {
    setCustomDelay(delay)
    onDelayChange?.(delay)
  }, [onDelayChange])

  const formatDelay = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const getStrategyDescription = (strategy: string): string => {
    const descriptions = {
      exponential: 'Delays increase exponentially (1s, 2s, 4s, 8s...)',
      linear: 'Delays increase linearly (1s, 2s, 3s, 4s...)',
      fibonacci: 'Delays follow Fibonacci sequence (1s, 1s, 2s, 3s, 5s...)',
      custom: 'Use custom delay settings'
    }
    return descriptions[strategy as keyof typeof descriptions] || 'Unknown strategy'
  }

  return (
    <GlassCard className={`p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Retry Controls</h3>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm opacity-75 hover:opacity-100 transition-opacity"
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced
        </button>
      </div>

      {/* Current Status */}
      <div className="mb-4 p-3 bg-black/10 rounded">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-medium opacity-75">Status</div>
            <div className={`font-medium ${isRetrying ? 'text-yellow-400' : 'text-green-400'}`}>
              {isRetrying ? 'Retrying...' : 'Connected'}
            </div>
          </div>
          <div>
            <div className="font-medium opacity-75">Strategy</div>
            <div className="capitalize">{retry?.strategy || 'None'}</div>
          </div>
          <div>
            <div className="font-medium opacity-75">Attempts</div>
            <div>{retry?.attemptCount || 0} / {retry?.maxAttempts || 0}</div>
          </div>
          <div>
            <div className="font-medium opacity-75">Current Delay</div>
            <div>{formatDelay(retry?.currentDelay || 0)}</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <GlassButton
          onClick={onRetryNow}
          disabled={!isRetrying}
          className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="mr-1">🔄</span>
          Retry Now
        </GlassButton>
        <GlassButton
          onClick={onCancelRetry}
          disabled={!isRetrying}
          className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="mr-1">✕</span>
          Cancel
        </GlassButton>
      </div>

      {/* Advanced Controls */}
      {showAdvanced && (
        <div className="border-t border-white/10 pt-4">
          <h4 className="font-medium mb-3">Advanced Settings</h4>
          
          {/* Retry Strategy Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Retry Strategy</label>
            <select
              value={retry?.strategy || 'exponential'}
              onChange={(e) => handleStrategyChange(e.target.value as 'exponential' | 'linear' | 'fibonacci' | 'custom')}
              className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded text-sm"
              disabled={isRetrying}
            >
              <option value="exponential">Exponential Backoff</option>
              <option value="linear">Linear Backoff</option>
              <option value="fibonacci">Fibonacci Backoff</option>
              <option value="custom">Custom</option>
            </select>
            <div className="text-xs opacity-60 mt-1">
              {getStrategyDescription(retry?.strategy || 'exponential')}
            </div>
          </div>

          {/* Max Attempts */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Max Attempts</label>
            <input
              type="number"
              min="1"
              max="20"
              value={customMaxAttempts}
              onChange={(e) => handleMaxAttemptsChange(parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded text-sm"
              disabled={isRetrying}
            />
            <div className="text-xs opacity-60 mt-1">
              Maximum number of retry attempts before giving up
            </div>
          </div>

          {/* Base Delay */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Base Delay (ms)</label>
            <input
              type="number"
              min="100"
              max="30000"
              step="100"
              value={customDelay}
              onChange={(e) => handleDelayChange(parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded text-sm"
              disabled={isRetrying}
            />
            <div className="text-xs opacity-60 mt-1">
              Base delay between retry attempts ({formatDelay(customDelay)})
            </div>
          </div>

          {/* Reset Button */}
          <div className="pt-2 border-t border-white/10">
            <GlassButton
              onClick={onResetRetryState}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white"
            >
              <span className="mr-1">🔄</span>
              Reset Retry State
            </GlassButton>
            <div className="text-xs opacity-60 mt-1 text-center">
              Clears retry history and resets to default settings
            </div>
          </div>
        </div>
      )}

      {/* Strategy Preview */}
      {showAdvanced && (
        <div className="mt-4 p-3 bg-black/10 rounded">
          <h4 className="font-medium mb-2 text-sm">Delay Preview</h4>
          <div className="grid grid-cols-5 gap-2 text-xs">
            {Array.from({ length: 5 }, (_, i) => {
              let delay = customDelay
              const strategy = retry?.strategy || 'exponential'
              
              if (strategy === 'exponential') {
                delay = customDelay * Math.pow(2, i)
              } else if (strategy === 'linear') {
                delay = customDelay * (i + 1)
              } else if (strategy === 'fibonacci') {
                const fib = [1, 1, 2, 3, 5, 8, 13, 21]
                delay = customDelay * (fib[i] || fib[fib.length - 1])
              }

              return (
                <div key={i} className="text-center p-2 bg-black/20 rounded">
                  <div className="font-medium">#{i + 1}</div>
                  <div className="opacity-75">{formatDelay(delay)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </GlassCard>
  )
}

export default RetryControls
