/**
 * TranscriptionStatusIndicator - Enhanced status indicators for live transcription
 *
 * Provides comprehensive visual feedback including connection status, transcription
 * activity, confidence levels, and progress indicators.
 */

import React from 'react'
import {cn} from '../utils/tailwind'

export interface TranscriptionStatusIndicatorProps {
  // Status states
  isConnected: boolean
  isTranscribing: boolean
  isProcessing: boolean
  isPaused: boolean
  confidence?: number

  // Activity metrics
  wordsPerMinute?: number
  charactersTranscribed?: number
  sessionDuration?: number

  // Visual configuration
  showMetrics?: boolean
  showConfidence?: boolean
  showProgress?: boolean
  animated?: boolean
  compact?: boolean

  // Accessibility
  accessibilityEnabled?: boolean
}

interface StatusConfig {
  label: string
  icon: string
  color: string
  description: string
  pulse?: boolean
}

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  connected: {
    label: 'Connected',
    icon: '🟢',
    color: '#10b981',
    description: 'Connected to transcription service',
    pulse: false
  },
  transcribing: {
    label: 'Live Transcribing',
    icon: '🎤',
    color: '#3b82f6',
    description: 'Actively transcribing audio',
    pulse: true
  },
  processing: {
    label: 'Processing',
    icon: '⚡',
    color: '#f59e0b',
    description: 'Processing audio input',
    pulse: true
  },
  paused: {
    label: 'Paused',
    icon: '⏸️',
    color: '#6b7280',
    description: 'Transcription paused',
    pulse: false
  },
  disconnected: {
    label: 'Disconnected',
    icon: '🔴',
    color: '#ef4444',
    description: 'Not connected to transcription service',
    pulse: false
  }
}

const TranscriptionStatusIndicator: React.FC<TranscriptionStatusIndicatorProps> = ({
  isConnected,
  isTranscribing,
  isProcessing,
  isPaused,
  confidence,
  wordsPerMinute,
  charactersTranscribed,
  sessionDuration,
  showMetrics = true,
  showConfidence = true,
  showProgress = true,
  animated = true,
  compact = false,
  accessibilityEnabled = true
}) => {
  // Determine current status
  const currentStatus = React.useMemo(() => {
    if (!isConnected) return STATUS_CONFIGS.disconnected
    if (isPaused) return STATUS_CONFIGS.paused
    if (isTranscribing) return STATUS_CONFIGS.transcribing
    if (isProcessing) return STATUS_CONFIGS.processing
    return STATUS_CONFIGS.connected
  }, [isConnected, isTranscribing, isProcessing, isPaused])

  // Format session duration
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get confidence level styling
  const getConfidenceStyle = (confidence?: number) => {
    if (!confidence) return {color: '#6b7280', label: 'Unknown'}

    if (confidence >= 0.9) return {color: '#10b981', label: 'Excellent'}
    if (confidence >= 0.8) return {color: '#3b82f6', label: 'Good'}
    if (confidence >= 0.7) return {color: '#f59e0b', label: 'Fair'}
    return {color: '#ef4444', label: 'Poor'}
  }

  const confidenceStyle = getConfidenceStyle(confidence)

  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        <div
          className={cn('h-2 w-2 rounded-full transition-all duration-300', {
            'animate-pulse': currentStatus.pulse && animated
          })}
          style={{backgroundColor: currentStatus.color}}
          aria-hidden="true"
        />
        <span
          className="text-xs font-medium"
          style={{color: currentStatus.color}}
          aria-label={currentStatus.description}
        >
          {currentStatus.label}
        </span>
        {showConfidence && confidence && (
          <span
            className="text-xs opacity-75"
            style={{color: confidenceStyle.color}}
            title={`Confidence: ${Math.round(confidence * 100)}%`}
          >
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-3 backdrop-blur-sm transition-all duration-300',
        'border-white/10 bg-white/5'
      )}
      role={accessibilityEnabled ? 'status' : undefined}
      aria-live={accessibilityEnabled ? 'polite' : undefined}
    >
      {/* Main status indicator */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div
            className={cn('h-3 w-3 rounded-full transition-all duration-300', {
              'animate-pulse': currentStatus.pulse && animated,
              'shadow-lg': currentStatus.pulse
            })}
            style={{
              backgroundColor: currentStatus.color,
              boxShadow: currentStatus.pulse ? `0 0 8px ${currentStatus.color}40` : undefined
            }}
            aria-hidden="true"
          />
          <div>
            <div className="text-sm font-medium" style={{color: currentStatus.color}}>
              {currentStatus.label}
            </div>
            <div className="text-xs opacity-75" style={{color: 'var(--text-muted)'}}>
              {currentStatus.description}
            </div>
          </div>
        </div>

        {/* Confidence indicator */}
        {showConfidence && confidence && (
          <div className="text-right">
            <div className="text-xs font-medium" style={{color: confidenceStyle.color}}>
              {Math.round(confidence * 100)}%
            </div>
            <div className="text-xs opacity-75" style={{color: 'var(--text-muted)'}}>
              {confidenceStyle.label}
            </div>
          </div>
        )}
      </div>

      {/* Progress bar for confidence */}
      {showProgress && confidence && (
        <div className="mb-3">
          <div className="mb-1 flex justify-between text-xs">
            <span style={{color: 'var(--text-muted)'}}>Confidence</span>
            <span style={{color: confidenceStyle.color}}>{Math.round(confidence * 100)}%</span>
          </div>
          <div
            className="h-1 overflow-hidden rounded-full"
            style={{backgroundColor: 'rgba(255,255,255,0.1)'}}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${confidence * 100}%`,
                backgroundColor: confidenceStyle.color
              }}
            />
          </div>
        </div>
      )}

      {/* Metrics */}
      {showMetrics && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {sessionDuration !== undefined && (
            <div>
              <div style={{color: 'var(--text-muted)'}}>Duration</div>
              <div style={{color: 'var(--text-primary)'}} className="font-medium">
                {formatDuration(sessionDuration)}
              </div>
            </div>
          )}

          {wordsPerMinute !== undefined && (
            <div>
              <div style={{color: 'var(--text-muted)'}}>WPM</div>
              <div style={{color: 'var(--text-primary)'}} className="font-medium">
                {wordsPerMinute}
              </div>
            </div>
          )}

          {charactersTranscribed !== undefined && (
            <div>
              <div style={{color: 'var(--text-muted)'}}>Characters</div>
              <div style={{color: 'var(--text-primary)'}} className="font-medium">
                {charactersTranscribed.toLocaleString()}
              </div>
            </div>
          )}

          <div>
            <div style={{color: 'var(--text-muted)'}}>Status</div>
            <div style={{color: currentStatus.color}} className="font-medium">
              {currentStatus.label}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TranscriptionStatusIndicator
