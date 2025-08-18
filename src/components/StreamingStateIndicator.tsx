import React from 'react'
import '../styles/streaming-state-indicator.css'

/**
 * Streaming state types for visual feedback
 */
export type StreamingState =
  | 'listening' // Ready for input, waiting for audio
  | 'processing' // Processing audio or preparing to send
  | 'receiving' // Actively receiving transcription data
  | 'complete' // Transcription completed
  | 'error' // Error state requiring user attention
  | 'disconnected' // WebSocket connection lost
  | 'connecting' // Attempting to establish connection

/**
 * Connection quality indicator for network status
 */
export type ConnectionQuality = 'good' | 'poor' | 'unstable'

/**
 * Props for the StreamingStateIndicator component
 */
export interface StreamingStateIndicatorProps {
  /** Current streaming state */
  state: StreamingState
  /** Connection quality when applicable */
  connectionQuality?: ConnectionQuality
  /** Custom message to display */
  message?: string
  /** Whether to show detailed status information */
  showDetails?: boolean
  /** Callback when indicator is clicked (for user interaction) */
  onClick?: () => void
  /** Custom CSS class for styling */
  className?: string
  /** Size variant for different use cases */
  size?: 'small' | 'medium' | 'large'
}

/**
 * StreamingStateIndicator Component
 *
 * Provides comprehensive visual feedback for streaming text states with smooth
 * animations and accessibility support.
 */
export const StreamingStateIndicator: React.FC<StreamingStateIndicatorProps> = ({
  state,
  connectionQuality = 'good',
  message,
  showDetails = false,
  onClick,
  className = '',
  size = 'medium'
}) => {
  /**
   * Get state configuration including colors, icons, and messages
   */
  const getStateConfig = (state: StreamingState) => {
    const configs = {
      listening: {
        color: 'var(--state-listening, #10b981)',
        icon: '🎤',
        message: 'Ready to receive audio',
        animation: 'pulse-soft',
        description: 'Waiting for audio input'
      },
      processing: {
        color: 'var(--state-processing, #f59e0b)',
        icon: '⚡',
        message: 'Processing audio',
        animation: 'spin',
        description: 'Converting audio to text'
      },
      receiving: {
        color: 'var(--state-receiving, #3b82f6)',
        icon: '📝',
        message: 'Receiving transcription',
        animation: 'pulse-fast',
        description: 'Live transcription in progress'
      },
      complete: {
        color: 'var(--state-complete, #059669)',
        icon: '✅',
        message: 'Transcription complete',
        animation: 'fade-in',
        description: 'Transcription finished successfully'
      },
      error: {
        color: 'var(--state-error, #dc2626)',
        icon: '⚠️',
        message: 'Error occurred',
        animation: 'shake',
        description: 'An error occurred during transcription'
      },
      disconnected: {
        color: 'var(--state-disconnected, #6b7280)',
        icon: '📡',
        message: 'Connection lost',
        animation: 'fade',
        description: 'WebSocket connection disconnected'
      },
      connecting: {
        color: 'var(--state-connecting, #8b5cf6)',
        icon: '🔄',
        message: 'Connecting...',
        animation: 'rotate',
        description: 'Establishing connection'
      }
    }

    return configs[state]
  }

  /**
   * Get connection quality indicator styles
   */
  const getQualityIndicator = (quality: ConnectionQuality) => {
    const indicators = {
      good: {
        color: '#10b981',
        bars: 3,
        description: 'Strong connection'
      },
      poor: {
        color: '#f59e0b',
        bars: 1,
        description: 'Weak connection'
      },
      unstable: {
        color: '#dc2626',
        bars: 2,
        description: 'Unstable connection'
      }
    }

    return indicators[quality]
  }

  const config = getStateConfig(state)
  const qualityConfig = getQualityIndicator(connectionQuality)
  const displayMessage = message || config.message

  /**
   * Render connection quality bars
   */
  const renderQualityBars = () => {
    if (!['receiving', 'listening', 'processing'].includes(state)) {
      return null
    }

    return (
      <div className="connection-quality" aria-label={qualityConfig.description}>
        {[1, 2, 3].map(bar => (
          <div
            key={bar}
            className={`quality-bar ${bar <= qualityConfig.bars ? 'active' : 'inactive'}`}
            style={{
              backgroundColor:
                bar <= qualityConfig.bars ? qualityConfig.color : 'rgba(107, 114, 128, 0.3)'
            }}
          />
        ))}
      </div>
    )
  }

  /**
   * Render detailed status information
   */
  const renderDetails = () => {
    if (!showDetails) return null

    return (
      <div className="state-details">
        <div className="state-description">{config.description}</div>
        {connectionQuality && (
          <div className="connection-status">Connection: {qualityConfig.description}</div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`streaming-state-indicator ${state} ${size} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : 'status'}
      aria-label={`Streaming state: ${displayMessage}`}
      aria-describedby={showDetails ? `${state}-details` : undefined}
      tabIndex={onClick ? 0 : -1}
    >
      {/* Main status display */}
      <div className="state-content">
        {/* Animated icon */}
        <div
          className={`state-icon ${config.animation}`}
          style={{color: config.color}}
          aria-hidden="true"
        >
          {config.icon}
        </div>

        {/* Status message */}
        <div className="state-message">{displayMessage}</div>

        {/* Connection quality indicator */}
        {renderQualityBars()}
      </div>

      {/* Detailed information */}
      {renderDetails()}

      {/* Animated background for current state */}
      <div
        className={`state-background ${config.animation}`}
        style={{
          backgroundColor: config.color,
          opacity: 0.1
        }}
      />

      {/* Screen reader only live region for state changes */}
      <div className="sr-only" aria-live="polite" aria-atomic="true" id={`${state}-details`}>
        {config.description}
        {connectionQuality && ` - ${qualityConfig.description}`}
      </div>
    </div>
  )
}

/**
 * Compact version for minimal UI space
 */
export const StreamingStateIndicatorCompact: React.FC<
  Omit<StreamingStateIndicatorProps, 'showDetails' | 'size'>
> = ({state, connectionQuality, className = '', ...props}) => {
  return (
    <StreamingStateIndicator
      {...props}
      state={state}
      connectionQuality={connectionQuality}
      className={`compact ${className}`}
      showDetails={false}
      size="small"
    />
  )
}

/**
 * Hook for managing streaming state with automatic transitions
 */
export const useStreamingStateManager = () => {
  const [state, setState] = React.useState<StreamingState>('disconnected')
  const [connectionQuality, setConnectionQuality] = React.useState<ConnectionQuality>('good')
  const [message, setMessage] = React.useState<string>()

  /**
   * Update streaming state with optional custom message
   */
  const updateState = React.useCallback(
    (newState: StreamingState, customMessage?: string, quality?: ConnectionQuality) => {
      setState(newState)
      if (customMessage) setMessage(customMessage)
      if (quality) setConnectionQuality(quality)
    },
    []
  )

  /**
   * Auto-transition to error state after timeout
   */
  const setStateWithTimeout = React.useCallback(
    (newState: StreamingState, timeoutMs: number = 30000, errorMessage?: string) => {
      setState(newState)

      const timeout = setTimeout(() => {
        setState('error')
        if (errorMessage) setMessage(errorMessage)
      }, timeoutMs)

      return () => clearTimeout(timeout)
    },
    []
  )

  return {
    state,
    connectionQuality,
    message,
    updateState,
    setStateWithTimeout,
    isConnected: state !== 'disconnected' && state !== 'connecting' && state !== 'error',
    isActive: ['listening', 'processing', 'receiving'].includes(state)
  }
}

export default StreamingStateIndicator
