import React, {useState, useEffect, useRef} from 'react'
import {
  useRealTimeTranscription,
  RealTimeTranscriptionStatus
} from '../hooks/useRealTimeTranscription'

interface TranscriptEntry {
  id: string
  text: string
  timestamp: number
  confidence?: number
  isFinal: boolean
}

/**
 * Zero-latency transcription display component
 * Handles real-time speech-to-text with instant updates
 */
export const ZeroLatencyTranscriptionDisplay: React.FC<{
  className?: string
  maxEntries?: number
  showTimestamps?: boolean
  showConfidence?: boolean
  autoStart?: boolean
}> = ({
  className = '',
  maxEntries = 100,
  showTimestamps = false,
  showConfidence = false,
  autoStart = false
}) => {
  const {
    isInitialized,
    isConnected,
    currentTranscript,
    finalTranscripts,
    error,
    latency,
    reconnectAttempts,
    start,
    stop,
    clearTranscripts,
    isActive,
    hasError
  } = useRealTimeTranscription({autoStart, confidenceThreshold: 0.3})

  const [displayEntries, setDisplayEntries] = useState<TranscriptEntry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true)

  // Update display entries when transcripts change
  useEffect(() => {
    const entries: TranscriptEntry[] = []

    // Add final transcripts
    finalTranscripts.forEach((transcript, index) => {
      entries.push({
        id: `final-${index}`,
        text: transcript.text,
        timestamp: transcript.timestamp,
        confidence: transcript.confidence,
        isFinal: true
      })
    })

    // Add current interim transcript
    if (currentTranscript) {
      entries.push({
        id: 'current',
        text: currentTranscript,
        timestamp: Date.now(),
        isFinal: false
      })
    }

    // Limit entries
    const limitedEntries = entries.slice(-maxEntries)
    setDisplayEntries(limitedEntries)
  }, [finalTranscripts, currentTranscript, maxEntries])

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (isAutoScrollEnabled && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [displayEntries, isAutoScrollEnabled])

  // Handle manual scroll (disable auto-scroll if user scrolls up)
  const handleScroll = () => {
    if (scrollRef.current) {
      const {scrollTop, scrollHeight, clientHeight} = scrollRef.current
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10
      setIsAutoScrollEnabled(isAtBottom)
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    })
  }

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'text-gray-400'
    if (confidence > 0.8) return 'text-green-500'
    if (confidence > 0.6) return 'text-yellow-500'
    return 'text-red-500'
  }

  return (
    <div className={`flex h-full flex-col bg-black text-white ${className}`}>
      {/* Header with controls and status */}
      <div className="border-b border-gray-700 bg-gray-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Zero-Latency Transcription</h2>
          <div className="flex items-center space-x-2">
            {!isActive ? (
              <button
                onClick={start}
                className="rounded-lg bg-green-600 px-4 py-2 transition-colors hover:bg-green-700"
                disabled={isInitialized && !isConnected}
              >
                {isInitialized ? 'Reconnect' : 'Start'}
              </button>
            ) : (
              <button
                onClick={stop}
                className="rounded-lg bg-red-600 px-4 py-2 transition-colors hover:bg-red-700"
              >
                Stop
              </button>
            )}
            <button
              onClick={clearTranscripts}
              className="rounded-lg bg-gray-600 px-4 py-2 transition-colors hover:bg-gray-700"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Status display */}
        <RealTimeTranscriptionStatus
          latency={latency}
          isConnected={isConnected}
          reconnectAttempts={reconnectAttempts}
          error={error}
        />

        {/* Performance metrics */}
        <div className="mt-2 font-mono text-sm text-gray-400">
          Entries: {displayEntries.length} | Final: {finalTranscripts.length} |
          {currentTranscript &&
            ` Interim: "${currentTranscript.slice(0, 30)}${currentTranscript.length > 30 ? '...' : ''}"`}
        </div>
      </div>

      {/* Transcription display */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-2 overflow-y-auto p-4"
        style={{scrollBehavior: 'smooth'}}
      >
        {hasError && (
          <div className="mb-4 rounded-lg border border-red-600 bg-red-900 p-3">
            <div className="font-semibold text-red-300">Error</div>
            <div className="text-red-200">{error}</div>
          </div>
        )}

        {!isActive && !hasError && (
          <div className="py-8 text-center text-gray-400">
            <div className="mb-2 text-lg">🎤 Ready for Real-Time Transcription</div>
            <div>Click "Start" to begin zero-latency speech-to-text</div>
          </div>
        )}

        {isActive && displayEntries.length === 0 && (
          <div className="py-8 text-center text-gray-400">
            <div className="mb-2 text-lg">👂 Listening...</div>
            <div>Speak to see real-time transcription</div>
          </div>
        )}

        {displayEntries.map(entry => (
          <div
            key={entry.id}
            className={`rounded-lg border p-3 transition-all duration-200 ${
              entry.isFinal
                ? 'border-gray-600 bg-gray-800 text-white'
                : 'animate-pulse border-blue-600 bg-blue-900 text-blue-100'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className={`${entry.isFinal ? 'text-white' : 'text-blue-100'}`}>
                  {entry.text}
                </div>

                {(showTimestamps || showConfidence) && (
                  <div className="mt-1 flex items-center space-x-4 text-xs text-gray-400">
                    {showTimestamps && <span>{formatTime(entry.timestamp)}</span>}
                    {showConfidence && entry.confidence && (
                      <span className={getConfidenceColor(entry.confidence)}>
                        {(entry.confidence * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="ml-2 flex items-center space-x-1">
                {entry.isFinal ? (
                  <span className="text-xs text-green-400">✓</span>
                ) : (
                  <span className="animate-pulse text-xs text-blue-400">●</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Auto-scroll indicator */}
      {!isAutoScrollEnabled && (
        <div className="absolute bottom-4 right-4">
          <button
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight
                setIsAutoScrollEnabled(true)
              }
            }}
            className="rounded-full bg-blue-600 px-3 py-1 text-sm text-white shadow-lg transition-colors hover:bg-blue-700"
          >
            ↓ New messages
          </button>
        </div>
      )}
    </div>
  )
}

export default ZeroLatencyTranscriptionDisplay
