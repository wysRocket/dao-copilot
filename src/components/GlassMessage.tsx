import React from 'react'
import {TranscriptionResult} from '../services/main-stt-transcription'
import GlassBox from './GlassBox'
import {cn} from '../utils/tailwind'

export interface GlassMessageProps {
  transcript: TranscriptionResult
  className?: string
  isNew?: boolean
  variant?: 'partial' | 'final'
  showStatusIndicator?: boolean
}

export const GlassMessage: React.FC<GlassMessageProps> = ({
  transcript,
  className = '',
  isNew = false,
  variant = 'final',
  showStatusIndicator = false
}) => {
  const isPartial = variant === 'partial'

  return (
    <div
      className={cn(
        'mb-3 w-full transition-all duration-500',
        isNew && 'animate-slide-in-up',
        isPartial && 'transcript-container-partial',
        !isPartial && 'transcript-container-final',
        className
      )}
      role="article"
      aria-label={`${isPartial ? 'Partial' : 'Final'} transcription`}
    >
      <GlassBox
        variant={isPartial ? 'light' : 'medium'}
        cornerRadius={8}
        className={cn('relative w-full p-3', isPartial && 'shadow-sm', !isPartial && 'shadow-md')}
        style={{
          // Add subtle animation on new messages
          ...(isNew && {
            animation: 'glass-message-appear 0.5s ease-out'
          })
        }}
      >
        <div className="space-y-2">
          {/* Status indicator */}
          {showStatusIndicator && (
            <div className="mb-2 flex items-center justify-between">
              <div
                className={cn(
                  'transcript-status-indicator',
                  isPartial ? 'transcript-status-partial' : 'transcript-status-final'
                )}
              >
                <div className="status-dot" aria-hidden="true" />
                <span>{isPartial ? 'Live' : 'Final'}</span>
              </div>

              {/* Screen reader status */}
              <span className="sr-only">
                {isPartial ? 'Live transcription in progress' : 'Final transcription complete'}
              </span>
            </div>
          )}

          <p
            className={cn(
              'text-sm leading-relaxed',
              isPartial && 'streaming-text-partial active',
              !isPartial && 'streaming-text-final'
            )}
            style={{
              color: isPartial ? 'var(--text-muted)' : 'var(--text-primary)',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
            }}
            aria-live={isPartial ? 'polite' : 'off'}
            aria-relevant="additions text"
          >
            {transcript.text}
          </p>

          <div
            className="flex items-center justify-between text-xs"
            style={{
              color: 'var(--text-secondary)',
              textShadow: '0 1px 1px rgba(0, 0, 0, 0.05)'
            }}
          >
            <span>
              {typeof transcript.startTime === 'number' &&
                typeof transcript.endTime === 'number' &&
                `${transcript.startTime.toFixed(1)}s - ${transcript.endTime.toFixed(1)}s`}
            </span>

            {typeof transcript.confidence === 'number' && (
              <div className="flex items-center space-x-1">
                <span>Confidence:</span>
                <span
                  className={cn(
                    'font-medium transition-colors duration-300',
                    transcript.confidence > 0.8
                      ? 'text-green-600 dark:text-green-400'
                      : transcript.confidence > 0.6
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-red-600 dark:text-red-400',
                    isPartial && 'opacity-70'
                  )}
                >
                  {(transcript.confidence * 100).toFixed(1)}%{isPartial && ' (updating)'}
                </span>
              </div>
            )}
          </div>
        </div>
      </GlassBox>
    </div>
  )
}

export default GlassMessage
