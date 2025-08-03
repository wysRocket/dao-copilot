import React, { useState, useCallback } from 'react'
import { useTranscriptionStateContext } from '../contexts/TranscriptionStateContext'
import RetryCountdown from './RetryCountdown'
import RetryControls from './RetryControls'
import RetryProgress from './RetryProgress'
import GlassCard from './GlassCard'
import GlassButton from './GlassButton'

export interface RetryDashboardProps {
  className?: string
  layout?: 'horizontal' | 'vertical' | 'compact'
  showCountdown?: boolean
  showControls?: boolean
  showProgress?: boolean
  allowAdvancedControls?: boolean
  onRetryNow?: () => void
  onCancelRetry?: () => void
  onStrategyChange?: (strategy: 'exponential' | 'linear' | 'fibonacci' | 'custom') => void
  onConfigChange?: (config: RetryConfig) => void
}

export interface RetryConfig {
  strategy: 'exponential' | 'linear' | 'fibonacci' | 'custom'
  maxAttempts: number
  baseDelay: number
  maxDelay?: number
  multiplier?: number
}

const RetryDashboard: React.FC<RetryDashboardProps> = ({
  className = '',
  layout = 'vertical',
  showCountdown = true,
  showControls = true,
  showProgress = true,
  allowAdvancedControls = false,
  onRetryNow,
  onCancelRetry,
  onStrategyChange
  // onConfigChange - TODO: implement configuration management
}) => {
  const { state } = useTranscriptionStateContext()
  const [isDashboardCollapsed, setIsDashboardCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'countdown' | 'controls' | 'progress'>('countdown')

  const retry = state.connection?.retry
  const isRetrying = retry?.isRetrying || false
  const connectionStatus = state.connection?.status || 'disconnected'

  const handleRetryNow = useCallback(() => {
    onRetryNow?.()
    console.log('Manual retry triggered')
    // Here you would integrate with the actual retry mechanism
  }, [onRetryNow])

  const handleCancelRetry = useCallback(() => {
    onCancelRetry?.()
    console.log('Retry cancelled')
    // Here you would integrate with the actual retry cancellation
  }, [onCancelRetry])

  const handleStrategyChange = useCallback((strategy: 'exponential' | 'linear' | 'fibonacci' | 'custom') => {
    onStrategyChange?.(strategy)
    console.log('Retry strategy changed to:', strategy)
    // Here you would update the state manager with the new strategy
  }, [onStrategyChange])

  const handleResetRetryState = useCallback(() => {
    console.log('Resetting retry state')
    // Here you would reset the retry state in the state manager
  }, [])

  const getLayoutClasses = () => {
    switch (layout) {
      case 'horizontal':
        return 'flex flex-row gap-4'
      case 'compact':
        return 'space-y-2'
      default: // vertical
        return 'flex flex-col gap-4'
    }
  }

  const getStatusIndicator = () => {
    if (isRetrying) {
      return (
        <div className="flex items-center space-x-2 text-yellow-400">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          <span className="text-sm font-medium">Retrying Connection</span>
        </div>
      )
    }
    
    if (connectionStatus === 'connected') {
      return (
        <div className="flex items-center space-x-2 text-green-400">
          <div className="w-2 h-2 bg-green-400 rounded-full" />
          <span className="text-sm font-medium">Connected</span>
        </div>
      )
    }

    return (
      <div className="flex items-center space-x-2 text-red-400">
        <div className="w-2 h-2 bg-red-400 rounded-full" />
        <span className="text-sm font-medium">Disconnected</span>
      </div>
    )
  }

  // Don't show dashboard if not retrying and connection is stable
  if (!isRetrying && connectionStatus === 'connected') {
    return null
  }

  return (
    <GlassCard className={`p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <h3 className="font-semibold text-lg">Connection Retry</h3>
          {getStatusIndicator()}
        </div>
        <div className="flex items-center space-x-2">
          {/* Quick Actions */}
          {isRetrying && (
            <>
              <GlassButton
                onClick={handleRetryNow}
                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Retry Now
              </GlassButton>
              <GlassButton
                onClick={handleCancelRetry}
                className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white"
              >
                Cancel
              </GlassButton>
            </>
          )}
          {/* Collapse Toggle */}
          <button
            onClick={() => setIsDashboardCollapsed(!isDashboardCollapsed)}
            className="text-sm opacity-75 hover:opacity-100 transition-opacity"
          >
            {isDashboardCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {/* Collapsed State */}
      {isDashboardCollapsed && isRetrying && (
        <div className="flex items-center justify-between text-sm">
          <div>
            Attempt {retry?.attemptCount} of {retry?.maxAttempts}
          </div>
          <div>
            Next: {Math.ceil((retry?.nextAttemptIn || 0) / 1000)}s
          </div>
        </div>
      )}

      {/* Full Dashboard */}
      {!isDashboardCollapsed && (
        <>
          {/* Compact Layout with Tabs */}
          {layout === 'compact' && (
            <div className="mb-4">
              <div className="flex space-x-1 mb-3">
                {showCountdown && (
                  <button
                    onClick={() => setActiveTab('countdown')}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      activeTab === 'countdown'
                        ? 'bg-blue-600 text-white'
                        : 'bg-black/20 hover:bg-black/30'
                    }`}
                  >
                    Countdown
                  </button>
                )}
                {showProgress && (
                  <button
                    onClick={() => setActiveTab('progress')}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      activeTab === 'progress'
                        ? 'bg-blue-600 text-white'
                        : 'bg-black/20 hover:bg-black/30'
                    }`}
                  >
                    Progress
                  </button>
                )}
                {showControls && (
                  <button
                    onClick={() => setActiveTab('controls')}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      activeTab === 'controls'
                        ? 'bg-blue-600 text-white'
                        : 'bg-black/20 hover:bg-black/30'
                    }`}
                  >
                    Controls
                  </button>
                )}
              </div>

              {/* Tab Content */}
              {activeTab === 'countdown' && showCountdown && (
                <RetryCountdown
                  showDetailedStats={allowAdvancedControls}
                  onRetryNow={handleRetryNow}
                  onCancelRetry={handleCancelRetry}
                />
              )}
              {activeTab === 'progress' && showProgress && (
                <RetryProgress
                  showStrategy={true}
                  showControls={false}
                  onRetryNow={handleRetryNow}
                  onCancel={handleCancelRetry}
                />
              )}
              {activeTab === 'controls' && showControls && (
                <RetryControls
                  onRetryNow={handleRetryNow}
                  onCancelRetry={handleCancelRetry}
                  onStrategyChange={handleStrategyChange}
                  onResetRetryState={handleResetRetryState}
                />
              )}
            </div>
          )}

          {/* Full Layout */}
          {layout !== 'compact' && (
            <div className={getLayoutClasses()}>
              {showCountdown && (
                <RetryCountdown
                  showDetailedStats={allowAdvancedControls}
                  onRetryNow={handleRetryNow}
                  onCancelRetry={handleCancelRetry}
                />
              )}
              {showProgress && (
                <RetryProgress
                  showStrategy={true}
                  showControls={!showControls} // Don't duplicate controls
                  onRetryNow={handleRetryNow}
                  onCancel={handleCancelRetry}
                />
              )}
              {showControls && (
                <RetryControls
                  onRetryNow={handleRetryNow}
                  onCancelRetry={handleCancelRetry}
                  onStrategyChange={handleStrategyChange}
                  onResetRetryState={handleResetRetryState}
                />
              )}
            </div>
          )}

          {/* Summary Info */}
          {isRetrying && (
            <div className="mt-4 pt-3 border-t border-white/10 text-xs opacity-75">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="font-medium">Strategy</div>
                  <div className="capitalize">{retry?.strategy}</div>
                </div>
                <div>
                  <div className="font-medium">Next Attempt</div>
                  <div>{Math.ceil((retry?.nextAttemptIn || 0) / 1000)}s</div>
                </div>
                <div>
                  <div className="font-medium">Remaining</div>
                  <div>{(retry?.maxAttempts || 0) - (retry?.attemptCount || 0)}</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </GlassCard>
  )
}

export default RetryDashboard
