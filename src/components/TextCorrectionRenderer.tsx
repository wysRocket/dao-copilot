import React, {useEffect, useMemo} from 'react'
import {useTextCorrection, TextCorrectionConfig} from '../hooks/useTextCorrection'
import {TextDiff, WordDiff} from '../utils/text-differ'
import '../styles/text-correction-renderer.css'

/**
 * Props for the TextCorrectionRenderer component
 */
export interface TextCorrectionRendererProps {
  /** The current text to display */
  text: string
  /** Whether the text is partial (still being updated) */
  isPartial?: boolean
  /** Configuration for text correction behavior */
  config?: TextCorrectionConfig
  /** Additional CSS classes */
  className?: string
  /** Whether to show correction statistics */
  showStats?: boolean
  /** Callback when a correction is detected */
  onCorrection?: (diff: TextDiff | WordDiff) => void
  /** Callback when correction animation completes */
  onCorrectionComplete?: (diff: TextDiff | WordDiff) => void
  /** Custom styling for different correction types */
  correctionStyles?: {
    insert?: React.CSSProperties
    delete?: React.CSSProperties
    replace?: React.CSSProperties
    highlight?: React.CSSProperties
  }
}

/**
 * Renders individual correction with appropriate styling and animation
 */
const CorrectionSegment: React.FC<{
  diff: TextDiff | WordDiff
  phase: 'highlight' | 'replace' | 'complete'
  progress: number
  children: React.ReactNode
  customStyles?: React.CSSProperties
}> = ({diff, phase, progress, children, customStyles = {}}) => {
  const getSegmentClasses = () => {
    const baseClasses = ['correction-segment']

    baseClasses.push(`correction-${diff.type}`)
    baseClasses.push(`correction-phase-${phase}`)

    if (phase === 'highlight') {
      baseClasses.push('correction-highlighting')
    } else if (phase === 'replace') {
      baseClasses.push('correction-replacing')
    }

    return baseClasses.join(' ')
  }

  const getSegmentStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      '--correction-progress': progress,
      ...customStyles
    } as React.CSSProperties & {'--correction-progress': number}

    if (phase === 'highlight') {
      baseStyle.animationDelay = '0s'
      baseStyle.animationDuration = '0.3s'
    } else if (phase === 'replace') {
      baseStyle.transitionDuration = '0.5s'
      baseStyle.opacity = progress
    }

    return baseStyle
  }

  return (
    <span
      className={getSegmentClasses()}
      style={getSegmentStyle()}
      data-correction-type={diff.type}
      data-correction-id={diff.id}
    >
      {children}
    </span>
  )
}

/**
 * Statistics display component
 */
const CorrectionStats: React.FC<{
  stats: {
    totalCorrections: number
    correctionsThisSession: number
    averageLatency: number
  }
  isProcessing: boolean
  queueLength: number
}> = ({stats, isProcessing, queueLength}) => (
  <div className="correction-stats">
    <div className="stats-item">
      <span className="stats-label">Total:</span>
      <span className="stats-value">{stats.totalCorrections}</span>
    </div>
    <div className="stats-item">
      <span className="stats-label">Session:</span>
      <span className="stats-value">{stats.correctionsThisSession}</span>
    </div>
    <div className="stats-item">
      <span className="stats-label">Avg Latency:</span>
      <span className="stats-value">{Math.round(stats.averageLatency)}ms</span>
    </div>
    <div className="stats-item">
      <span className="stats-label">Queue:</span>
      <span className="stats-value">{queueLength}</span>
    </div>
    {isProcessing && (
      <div className="stats-item processing">
        <span className="processing-indicator">⚡</span>
        <span className="stats-label">Processing</span>
      </div>
    )}
  </div>
)

/**
 * TextCorrectionRenderer Component
 *
 * Renders text with smooth correction animations, highlighting changes
 * and providing visual feedback for text modifications in real-time.
 */
export const TextCorrectionRenderer: React.FC<TextCorrectionRendererProps> = ({
  text,
  isPartial = false,
  config = {},
  className = '',
  showStats = false,
  onCorrection,
  onCorrectionComplete,
  correctionStyles = {}
}) => {
  // Use the text correction hook
  const [correctionState, correctionControls] = useTextCorrection(text, config)

  // Update text when prop changes
  useEffect(() => {
    correctionControls.updateText(text)
  }, [text, correctionControls])

  // Handle correction callbacks
  useEffect(() => {
    if (correctionState.activeCorrections.length > 0 && onCorrection) {
      const latestCorrection =
        correctionState.activeCorrections[correctionState.activeCorrections.length - 1]
      onCorrection(latestCorrection.diff)
    }
  }, [correctionState.activeCorrections.length, onCorrection, correctionState.activeCorrections])

  // Handle completion callbacks
  useEffect(() => {
    const completedCorrections = correctionState.activeCorrections.filter(
      c => c.phase === 'complete'
    )
    if (completedCorrections.length > 0 && onCorrectionComplete) {
      completedCorrections.forEach(correction => {
        onCorrectionComplete(correction.diff)
      })
    }
  }, [correctionState.activeCorrections, onCorrectionComplete])

  /**
   * Render text with correction segments
   */
  const renderTextWithCorrections = useMemo(() => {
    if (correctionState.activeCorrections.length === 0) {
      return <span className="correction-text-base">{correctionState.displayText}</span>
    }

    // Create a map of positions to corrections for efficient lookup
    const correctionMap = new Map()
    correctionState.activeCorrections.forEach(correction => {
      const key = `${correction.diff.position}-${correction.diff.length}`
      correctionMap.set(key, correction)
    })

    const result: React.ReactNode[] = []
    let currentIndex = 0
    const textLength = correctionState.displayText.length

    // Process each character and apply corrections
    while (currentIndex < textLength) {
      // Check if there's a correction starting at this position
      let correctionFound = false

      for (const correction of correctionState.activeCorrections) {
        if (correction.diff.position === currentIndex) {
          const segmentText = correctionState.displayText.slice(
            currentIndex,
            Math.min(currentIndex + correction.diff.length, textLength)
          )

          // Get custom styles for this correction type
          const customStyle =
            correctionStyles[correction.diff.type as keyof typeof correctionStyles]

          result.push(
            <CorrectionSegment
              key={correction.id}
              diff={correction.diff}
              phase={correction.phase}
              progress={correction.progress}
              customStyles={customStyle}
            >
              {segmentText}
            </CorrectionSegment>
          )

          currentIndex = Math.min(currentIndex + correction.diff.length, textLength)
          correctionFound = true
          break
        }
      }

      if (!correctionFound) {
        // Find the next correction position
        let nextCorrectionPos = textLength
        for (const correction of correctionState.activeCorrections) {
          if (correction.diff.position > currentIndex) {
            nextCorrectionPos = Math.min(nextCorrectionPos, correction.diff.position)
          }
        }

        // Add regular text segment
        const segmentText = correctionState.displayText.slice(currentIndex, nextCorrectionPos)
        if (segmentText) {
          result.push(
            <span key={`text-${currentIndex}`} className="correction-text-regular">
              {segmentText}
            </span>
          )
        }

        currentIndex = nextCorrectionPos
      }
    }

    return result.length > 0 ? result : correctionState.displayText
  }, [correctionState.displayText, correctionState.activeCorrections, correctionStyles])

  return (
    <div
      className={`text-correction-renderer ${isPartial ? 'partial' : 'final'} ${className}`}
      role="log"
      aria-live="polite"
      aria-label="Text with corrections"
    >
      {/* Main text content with corrections */}
      <div className="correction-text-container">{renderTextWithCorrections}</div>

      {/* Correction statistics (optional) */}
      {showStats && (
        <CorrectionStats
          stats={correctionState.stats}
          isProcessing={correctionState.isProcessingCorrections}
          queueLength={correctionState.correctionQueue.length}
        />
      )}

      {/* Screen reader announcements */}
      <div className="sr-only" aria-live="assertive">
        {correctionState.isProcessingCorrections && 'Text correction in progress'}
        {correctionState.activeCorrections.length > 0 &&
          `${correctionState.activeCorrections.length} correction${correctionState.activeCorrections.length > 1 ? 's' : ''} active`}
      </div>
    </div>
  )
}

export default TextCorrectionRenderer
