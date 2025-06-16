import React from 'react'
import {TranscriptionResult} from '../services/main-stt-transcription'
import {GlassCard} from './ui/glass-card'
import {cn} from '../utils/tailwind'

interface TranscriptDisplayProps {
  transcripts: TranscriptionResult[]
  isProcessing?: boolean
  variant?: 'default' | 'subtle' | 'prominent'
  className?: string
}

const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({
  transcripts,
  isProcessing = false,
  variant = 'default',
  className
}) => {
  return (
    <div className={cn('mt-4 w-full max-w-2xl', className)}>
      <h3 className="mb-2 text-lg font-semibold text-white">Transcript</h3>
      <GlassCard
        variant={variant}
        className="max-h-[400px] min-h-[200px] overflow-y-auto"
        padding="p-4"
      >
        {transcripts.length === 0 && !isProcessing ? (
          <p className="text-white/60 italic">
            No transcriptions yet. Start recording to see results.
          </p>
        ) : (
          <>
            {transcripts.map((transcript, index) => (
              <GlassCard key={index} variant="subtle" className="mb-4" padding="p-3">
                <p className="text-sm text-white/90">{transcript.text}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-white/60">
                  <span>
                    {typeof transcript.startTime === 'number' &&
                      typeof transcript.endTime === 'number' &&
                      `${transcript.startTime.toFixed(1)}s - ${transcript.endTime.toFixed(1)}s`}
                  </span>
                  {typeof transcript.confidence === 'number' && (
                    <span>Confidence: {(transcript.confidence * 100).toFixed(1)}%</span>
                  )}
                </div>
              </GlassCard>
            ))}
            {isProcessing && (
              <div className="flex items-center justify-center p-4">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-white/50"></div>
                <span className="ml-2 text-sm text-white/60">Processing audio...</span>
              </div>
            )}
          </>
        )}
      </GlassCard>
    </div>
  )
}

export default TranscriptDisplay
