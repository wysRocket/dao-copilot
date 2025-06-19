import React, {memo} from 'react'
import {TranscriptionResult} from '../services/main-stt-transcription'
import GlassMessage from './GlassMessage'

interface VirtualizedTranscriptProps {
  transcripts: TranscriptionResult[]
  newMessageIndices: Set<number>
  maxVisibleMessages?: number
}

// Memoized transcript message to prevent unnecessary re-renders
const MemoizedGlassMessage = memo(GlassMessage, (prevProps, nextProps) => {
  return (
    prevProps.transcript.text === nextProps.transcript.text &&
    prevProps.transcript.confidence === nextProps.transcript.confidence &&
    prevProps.isNew === nextProps.isNew
  )
})

export const VirtualizedTranscript: React.FC<VirtualizedTranscriptProps> = memo(
  ({transcripts, newMessageIndices, maxVisibleMessages = 100}) => {
    // Only render the most recent messages for performance
    const visibleTranscripts = React.useMemo(() => {
      if (transcripts.length <= maxVisibleMessages) {
        return transcripts
      }
      return transcripts.slice(-maxVisibleMessages)
    }, [transcripts, maxVisibleMessages])

    const startIndex = transcripts.length - visibleTranscripts.length

    return (
      <>
        {visibleTranscripts.map((transcript, index) => {
          const actualIndex = startIndex + index
          return (
            <MemoizedGlassMessage
              key={`transcript-${actualIndex}-${transcript.text.slice(0, 10)}`}
              transcript={transcript}
              isNew={newMessageIndices.has(actualIndex)}
            />
          )
        })}
      </>
    )
  }
)

VirtualizedTranscript.displayName = 'VirtualizedTranscript'

export default VirtualizedTranscript
