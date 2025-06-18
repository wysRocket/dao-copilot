import React, {useEffect, useRef, useState} from 'react'
import {TranscriptionResult} from '../services/main-stt-transcription'
import GlassBox from './GlassBox'
import VirtualizedTranscript from './VirtualizedTranscript'
import {cn} from '../utils/tailwind'

interface TranscriptDisplayProps {
  transcripts: TranscriptionResult[]
  isProcessing?: boolean
  autoScroll?: boolean
  showScrollToBottom?: boolean
}

const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({
  transcripts,
  isProcessing = false,
  autoScroll = true,
  showScrollToBottom = true
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [newMessageIndices, setNewMessageIndices] = useState<Set<number>>(new Set())
  const prevTranscriptCount = useRef(transcripts.length)

  // Handle auto-scroll and new message detection
  useEffect(() => {
    if (transcripts.length > prevTranscriptCount.current) {
      // Mark new messages for animation
      const newIndices = new Set<number>()
      for (let i = prevTranscriptCount.current; i < transcripts.length; i++) {
        newIndices.add(i)
      }
      setNewMessageIndices(newIndices)

      // Auto-scroll to bottom if enabled
      if (autoScroll && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }

      // Clear animation flags after animation completes
      setTimeout(() => {
        setNewMessageIndices(new Set())
      }, 500)
    }

    prevTranscriptCount.current = transcripts.length
  }, [transcripts.length, autoScroll])

  // Handle scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement || !showScrollToBottom) return

    const handleScroll = () => {
      const {scrollTop, scrollHeight, clientHeight} = scrollElement
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
      setShowScrollButton(!isNearBottom && transcripts.length > 0)
    }

    scrollElement.addEventListener('scroll', handleScroll)
    handleScroll() // Initial check

    return () => scrollElement.removeEventListener('scroll', handleScroll)
  }, [transcripts.length, showScrollToBottom])

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }

  return (
    <div className="mx-auto mt-4 w-full max-w-4xl">
      <h3 className="mb-3 text-center text-lg font-semibold" style={{color: 'var(--text-primary)'}}>
        Live Transcript
      </h3>

      <div className="relative">
        <GlassBox variant="medium" cornerRadius={12} className="overflow-hidden">
          <div
            ref={scrollRef}
            className={cn(
              'max-h-[400px] min-h-[200px] overflow-y-auto p-4',
              'transcript-scroll glass-container'
            )}
          >
            {transcripts.length === 0 && !isProcessing ? (
              <div className="flex h-full min-h-[150px] flex-col items-center justify-center text-center">
                <div
                  className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed"
                  style={{
                    borderColor: 'var(--border-secondary)',
                    color: 'var(--text-muted)'
                  }}
                >
                  🎤
                </div>
                <p className="text-sm italic" style={{color: 'var(--text-muted)'}}>
                  No transcriptions yet. Start recording to see results.
                </p>
              </div>
            ) : (
              <>
                <VirtualizedTranscript
                  transcripts={transcripts}
                  newMessageIndices={newMessageIndices}
                  maxVisibleMessages={100}
                />

                {isProcessing && (
                  <div className="flex items-center justify-center p-4">
                    <GlassBox variant="light" className="px-4 py-2">
                      <div className="flex items-center space-x-3">
                        <div
                          className="h-4 w-4 animate-spin rounded-full border-2 border-b-transparent"
                          style={{borderColor: 'var(--text-accent)'}}
                        ></div>
                        <span className="text-sm" style={{color: 'var(--text-secondary)'}}>
                          Processing audio...
                        </span>
                      </div>
                    </GlassBox>
                  </div>
                )}
              </>
            )}
          </div>
        </GlassBox>

        {/* Scroll to bottom button */}
        {showScrollButton && showScrollToBottom && (
          <button
            onClick={scrollToBottom}
            className={cn(
              'absolute right-4 bottom-4 rounded-full p-2 transition-all duration-200',
              'hover:scale-110 active:scale-95'
            )}
            style={{
              backgroundColor: 'var(--glass-medium)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 12px var(--glass-shadow)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--glass-heavy)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'var(--glass-medium)'
            }}
            title="Scroll to bottom"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M7 13l3 3 3-3"></path>
              <path d="M7 6l3 3 3-3"></path>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export default TranscriptDisplay
