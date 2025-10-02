import React, {useMemo, useCallback} from 'react'
import {TextDiff, WordDiff} from '../utils/text-differ'
import '../styles/advanced-animations.css'

/**
 * Props for TextCorrectionHighlighter component
 */
export interface TextCorrectionHighlighterProps {
  /** Current text to display */
  text: string
  /** Active corrections to highlight */
  corrections: Array<{
    diff: TextDiff | WordDiff
    phase: 'highlight' | 'replace' | 'complete'
    progress: number
  }>
  /** Whether to show confidence visualization */
  showConfidence?: boolean
  /** Confidence score (0-1) */
  confidence?: number
  /** Additional CSS classes */
  className?: string
  /** Custom styling for different correction types */
  correctionStyles?: {
    insert?: React.CSSProperties
    delete?: React.CSSProperties
    replace?: React.CSSProperties
    unchanged?: React.CSSProperties
  }
}

/**
 * Get confidence color based on score
 */
const getConfidenceColor = (confidence: number): string => {
  // Red (low confidence) to Yellow to Green (high confidence)
  if (confidence < 0.33) {
    // Red to Yellow
    const t = confidence / 0.33
    const r = 255
    const g = Math.round(165 * t) // 0 to 165
    const b = 0
    return `rgb(${r}, ${g}, ${b})`
  } else if (confidence < 0.67) {
    // Yellow to Light Green
    const t = (confidence - 0.33) / 0.34
    const r = Math.round(255 - 105 * t) // 255 to 150
    const g = Math.round(165 + 90 * t) // 165 to 255
    const b = 0
    return `rgb(${r}, ${g}, ${b})`
  } else {
    // Light Green to Green
    const t = (confidence - 0.67) / 0.33
    const r = Math.round(150 - 150 * t) // 150 to 0
    const g = 255
    const b = Math.round(50 * t) // 0 to 50
    return `rgb(${r}, ${g}, ${b})`
  }
}

/**
 * Render a single correction segment
 */
const CorrectionSegment: React.FC<{
  diff: TextDiff | WordDiff
  phase: 'highlight' | 'replace' | 'complete'
  progress: number
  text: string
  customStyles?: React.CSSProperties
  showConfidence?: boolean
  confidence?: number
}> = ({diff, phase, progress, text, customStyles = {}, showConfidence, confidence}) => {
  const segmentClasses = useMemo(() => {
    const classes = [
      'correction-segment',
      `correction-type-${diff.type}`,
      `correction-phase-${phase}`
    ]

    if (phase === 'highlight') {
      classes.push('correction-highlighting')
    } else if (phase === 'replace') {
      classes.push('correction-replacing')
    }

    return classes.join(' ')
  }, [diff.type, phase])

  const segmentStyle = useMemo((): React.CSSProperties => {
    const style: React.CSSProperties = {
      '--correction-progress': progress,
      ...customStyles
    } as React.CSSProperties & {'--correction-progress': number}

    // Add confidence coloring if enabled
    if (showConfidence && confidence !== undefined) {
      const color = getConfidenceColor(confidence)
      style.color = color
      style.textShadow = `0 0 2px ${color}`
    }

    return style
  }, [progress, customStyles, showConfidence, confidence])

  return (
    <span
      className={segmentClasses}
      style={segmentStyle}
      data-correction-type={diff.type}
      data-correction-id={diff.id}
      data-phase={phase}
    >
      {text}
    </span>
  )
}

/**
 * Build segments from text and corrections
 */
const buildSegments = (
  text: string,
  corrections: Array<{
    diff: TextDiff | WordDiff
    phase: 'highlight' | 'replace' | 'complete'
    progress: number
  }>
) => {
  if (corrections.length === 0) {
    return [{text, correction: null, startPos: 0, endPos: text.length}]
  }

  const segments: Array<{
    text: string
    correction: {
      diff: TextDiff | WordDiff
      phase: 'highlight' | 'replace' | 'complete'
      progress: number
    } | null
    startPos: number
    endPos: number
  }> = []

  // Sort corrections by position
  const sortedCorrections = [...corrections].sort((a, b) => a.diff.position - b.diff.position)

  let currentPos = 0

  for (const correction of sortedCorrections) {
    const {diff} = correction

    // Add text before correction
    if (currentPos < diff.position) {
      segments.push({
        text: text.slice(currentPos, diff.position),
        correction: null,
        startPos: currentPos,
        endPos: diff.position
      })
    }

    // Add correction segment
    const correctionText =
      correction.phase === 'replace' && diff.newText
        ? diff.newText
        : text.slice(diff.position, diff.position + diff.length)

    segments.push({
      text: correctionText,
      correction,
      startPos: diff.position,
      endPos: diff.position + diff.length
    })

    currentPos = diff.position + diff.length
  }

  // Add remaining text
  if (currentPos < text.length) {
    segments.push({
      text: text.slice(currentPos),
      correction: null,
      startPos: currentPos,
      endPos: text.length
    })
  }

  return segments
}

/**
 * TextCorrectionHighlighter Component
 *
 * Renders text with highlighted corrections and confidence visualization
 */
export const TextCorrectionHighlighter: React.FC<TextCorrectionHighlighterProps> = ({
  text,
  corrections,
  showConfidence = false,
  confidence = 1,
  className = '',
  correctionStyles = {}
}) => {
  const segments = useMemo(() => buildSegments(text, corrections), [text, corrections])

  const renderSegment = useCallback(
    (
      segment: {
        text: string
        correction: {
          diff: TextDiff | WordDiff
          phase: 'highlight' | 'replace' | 'complete'
          progress: number
        } | null
        startPos: number
        endPos: number
      },
      index: number
    ) => {
      if (!segment.correction) {
        // Regular text without correction
        if (showConfidence) {
          const color = getConfidenceColor(confidence)
          return (
            <span key={index} style={{color}}>
              {segment.text}
            </span>
          )
        }
        return <span key={index}>{segment.text}</span>
      }

      // Text with correction
      const {diff, phase, progress} = segment.correction
      const customStyle = correctionStyles[diff.type]

      return (
        <CorrectionSegment
          key={`correction-${diff.id}-${index}`}
          diff={diff}
          phase={phase}
          progress={progress}
          text={segment.text}
          customStyles={customStyle}
          showConfidence={showConfidence}
          confidence={confidence}
        />
      )
    },
    [correctionStyles, showConfidence, confidence]
  )

  return (
    <div className={`text-correction-highlighter ${className}`}>
      {segments.map(renderSegment)}
    </div>
  )
}

/**
 * Confidence Badge Component
 *
 * Displays a visual indicator of confidence level
 */
export interface ConfidenceBadgeProps {
  /** Confidence score (0-1) */
  confidence: number
  /** Whether to show percentage */
  showPercentage?: boolean
  /** Additional CSS classes */
  className?: string
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({
  confidence,
  showPercentage = true,
  className = ''
}) => {
  const color = getConfidenceColor(confidence)
  const percentage = Math.round(confidence * 100)

  const badgeStyle: React.CSSProperties = {
    backgroundColor: color,
    color: confidence > 0.5 ? '#000' : '#fff',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    display: 'inline-block'
  }

  return (
    <span className={`confidence-badge ${className}`} style={badgeStyle}>
      {showPercentage ? `${percentage}%` : '●'}
    </span>
  )
}

/**
 * Correction Type Legend Component
 *
 * Shows legend for different correction types
 */
export const CorrectionLegend: React.FC<{className?: string}> = ({className = ''}) => {
  return (
    <div className={`correction-legend ${className}`}>
      <div className="legend-item">
        <span className="legend-color correction-type-insert"></span>
        <span className="legend-label">Addition</span>
      </div>
      <div className="legend-item">
        <span className="legend-color correction-type-delete"></span>
        <span className="legend-label">Deletion</span>
      </div>
      <div className="legend-item">
        <span className="legend-color correction-type-replace"></span>
        <span className="legend-label">Modification</span>
      </div>
    </div>
  )
}

export default TextCorrectionHighlighter
