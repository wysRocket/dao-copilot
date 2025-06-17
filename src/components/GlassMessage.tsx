import React from 'react'
import {TranscriptionResult} from '../services/main-stt-transcription'
import GlassBox from './GlassBox'
import {cn} from '../utils/tailwind'

export interface GlassMessageProps {
  transcript: TranscriptionResult
  className?: string
  isNew?: boolean
}

export const GlassMessage: React.FC<GlassMessageProps> = ({
  transcript,
  className = '',
  isNew = false
}) => {
  return (
    <div
      className={cn(
        'mb-3 w-full transition-all duration-500',
        isNew && 'animate-slide-in-up',
        className
      )}
    >
      <GlassBox
        variant="light"
        cornerRadius={8}
        className="w-full p-3"
        style={{
          // Add subtle animation on new messages
          ...(isNew && {
            animation: 'glass-message-appear 0.5s ease-out'
          })
        }}
      >
        <div className="space-y-2">
          <p
            className="text-sm leading-relaxed"
            style={{
              color: 'var(--text-primary)',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
            }}
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
                    'font-medium',
                    transcript.confidence > 0.8
                      ? 'text-green-600 dark:text-green-400'
                      : transcript.confidence > 0.6
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {(transcript.confidence * 100).toFixed(1)}%
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
