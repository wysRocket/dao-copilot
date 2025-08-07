import React, {useEffect, useRef, useState, useMemo} from 'react'
import {useTranscriptionState} from '../hooks/useTranscriptionState'
import {useTranscriptStore} from '../state/transcript-state'
import GlassBox from './GlassBox'
import {cn} from '../utils/tailwind'

interface AccumulativeTranscriptDisplayProps {
  className?: string
  showHeader?: boolean
  showStatus?: boolean
  maxHeight?: string
}

export const AccumulativeTranscriptDisplay: React.FC<AccumulativeTranscriptDisplayProps> = ({
  className = '',
  showHeader = true,
  showStatus = true,
  maxHeight = '500px'
}) => {
  // Get streaming state from unified manager
  const {currentStreamingText, isStreamingActive, transcripts} = useTranscriptionState()

  // Get transcript store state for partial/final entries
  const {recentEntries} = useTranscriptStore()

  // Refs for managing display
  const textAreaRef = useRef<HTMLDivElement>(null)
  const [accumulatedText, setAccumulatedText] = useState('')
  const [currentPartialText, setCurrentPartialText] = useState('')

  // Combine text sources for proper accumulative display
  const combinedText = useMemo(() => {
    // Priority 1: Show current streaming text if actively streaming
    if (isStreamingActive && currentStreamingText?.trim()) {
      return currentStreamingText.trim()
    }

    // Priority 2: Show the most recent partial entry (actively being updated)
    const latestPartial = recentEntries
      .filter(entry => entry.isPartial && !entry.isFinal)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0]

    if (latestPartial?.text?.trim()) {
      return latestPartial.text.trim()
    }

    // Priority 3: Show finalized recent entries (from current session)
    const sessionFinalEntries = recentEntries
      .filter(entry => entry.isFinal)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .map(entry => entry.text)
      .join(' ')

    if (sessionFinalEntries.trim()) {
      return sessionFinalEntries.trim()
    }

    // Priority 4: Show static transcripts as fallback
    const staticText = transcripts
      .map(t => t.text)
      .join(' ')
      .trim()

    return staticText
  }, [transcripts, recentEntries, currentStreamingText, isStreamingActive])

  // Auto-scroll to bottom when text updates
  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight
    }
  }, [combinedText])

  // Get status information
  const totalTranscripts = transcripts.length + recentEntries.filter(e => e.isFinal).length
  const hasPartialContent = isStreamingActive || recentEntries.some(e => e.isPartial && !e.isFinal)

  // Debug logging to help troubleshoot accumulation issues
  React.useEffect(() => {
    console.log('🔄 AccumulativeTranscriptDisplay Update:', {
      isStreamingActive,
      currentStreamingText: currentStreamingText?.substring(0, 50) + '...',
      recentEntriesCount: recentEntries.length,
      partialEntries: recentEntries.filter(e => e.isPartial && !e.isFinal).length,
      finalEntries: recentEntries.filter(e => e.isFinal).length,
      combinedTextLength: combinedText.length,
      combinedTextPreview: combinedText.substring(0, 100) + '...'
    })
  }, [isStreamingActive, currentStreamingText, recentEntries, combinedText])

  return (
    <div className={cn('accumulative-transcript-display', className)}>
      {showHeader && (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold" style={{color: 'var(--text-primary)'}}>
            Live Transcription
          </h3>
          {hasPartialContent && (
            <div className="flex items-center space-x-2">
              <div
                className="h-2 w-2 animate-pulse rounded-full bg-green-500"
                aria-hidden="true"
              ></div>
              <span className="text-sm" style={{color: 'var(--text-accent)'}}>
                Live
              </span>
            </div>
          )}
        </div>
      )}

      {showStatus && (
        <div className="mb-3 text-sm" style={{color: 'var(--text-muted)'}}>
          <span>Status: {isStreamingActive ? 'Recording' : 'Ready'}</span>
          {totalTranscripts > 0 && (
            <span className="ml-4">Total Transcripts: {totalTranscripts}</span>
          )}
        </div>
      )}

      <GlassBox variant="medium" cornerRadius={12} className="overflow-hidden">
        <div
          ref={textAreaRef}
          className="overflow-y-auto p-6"
          style={{
            maxHeight,
            minHeight: '200px',
            lineHeight: '1.6',
            fontSize: '16px'
          }}
          role="log"
          aria-live={hasPartialContent ? 'polite' : 'off'}
          aria-label="Live transcription text"
        >
          {combinedText ? (
            <div className="relative">
              {/* Main accumulated text */}
              <div
                className="break-words whitespace-pre-wrap"
                style={{color: 'var(--text-primary)'}}
              >
                {combinedText}
              </div>

              {/* Streaming indicator cursor */}
              {hasPartialContent && (
                <span
                  className="ml-1 inline-block h-5 w-1 animate-pulse bg-blue-500"
                  aria-hidden="true"
                />
              )}

              {/* Visual indicator for partial text */}
              {hasPartialContent && (
                <div
                  className="absolute top-0 bottom-0 left-0 w-1 rounded-r bg-gradient-to-b from-blue-400 to-transparent opacity-30"
                  aria-hidden="true"
                />
              )}
            </div>
          ) : (
            <div className="flex h-full min-h-[150px] flex-col items-center justify-center text-center">
              <div
                className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed"
                style={{
                  borderColor: 'var(--border-secondary)',
                  color: 'var(--text-muted)'
                }}
                aria-hidden="true"
              >
                🎤
              </div>
              <p className="text-sm italic" style={{color: 'var(--text-muted)'}}>
                Waiting for audio input. Start recording to see transcriptions.
              </p>
            </div>
          )}
        </div>
      </GlassBox>
    </div>
  )
}

export default AccumulativeTranscriptDisplay
