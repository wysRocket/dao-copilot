import React, {useRef, useEffect} from 'react'
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
  // Use simplified animation approach with CSS transforms and requestAnimationFrame optimizations
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isNew && containerRef.current) {
      // Apply entrance animation using requestAnimationFrame for new messages
      const element = containerRef.current
      element.style.opacity = '0'
      element.style.transform = 'translateY(20px) translateZ(0)'

      requestAnimationFrame(() => {
        element.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out'
        element.style.opacity = '1'
        element.style.transform = 'translateY(0) translateZ(0)'
      })
    }
  }, [isNew])

  return (
    <div
      ref={containerRef}
      className={cn('mb-3 w-full', className)}
      style={{
        // Hardware acceleration for smooth animations
        transform: 'translateZ(0)',
        willChange: isNew ? 'transform, opacity' : 'auto'
      }}
    >
      <GlassBox
        variant="light"
        cornerRadius={8}
        className="w-full p-3 transition-transform duration-200 ease-out hover:scale-[1.01]"
        style={{
          // Optimize rendering for glass effects
          transform: 'translateZ(0)',
          willChange: 'transform',
          backfaceVisibility: 'hidden'
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
