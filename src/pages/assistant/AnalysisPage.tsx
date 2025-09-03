import React, {useMemo} from 'react'
import {useTranscriptionState} from '../../hooks/useSharedState'
import GlassCard from '../../components/GlassCard'
import {globalTranscriptionDeduplicator} from '../../services/TranscriptionDeduplicator'

export default function AnalysisPage() {
  const {transcripts: rawTranscripts} = useTranscriptionState()

  // Apply deduplication to transcripts
  const deduplicationResult = useMemo(() => {
    if (rawTranscripts.length === 0) {
      return {
        deduplicated: [],
        removed: [],
        duplicateCount: 0,
        removalReasons: []
      }
    }

    return globalTranscriptionDeduplicator.deduplicate(rawTranscripts)
  }, [rawTranscripts])

  const transcripts = deduplicationResult.deduplicated
  const duplicateCount = deduplicationResult.duplicateCount

  const totalWords = transcripts.reduce((total, t) => total + t.text.split(' ').length, 0)
  const averageConfidence =
    transcripts.length > 0
      ? transcripts.reduce((sum, t) => sum + (t.confidence || 0), 0) / transcripts.length
      : 0

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex-none p-4"
        style={{
          background: 'var(--glass-heavy)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid var(--glass-border)',
          boxShadow: '0 2px 12px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}
      >
        <h2 className="mb-1 text-lg font-bold" style={{color: 'var(--text-primary)'}}>
          Transcription Analysis
        </h2>
        <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
          Insights and statistics about your transcriptions
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <GlassCard variant="medium">
            <h3 className="mb-2 text-sm font-semibold" style={{color: 'var(--text-accent)'}}>
              Total Transcripts
            </h3>
            <p className="text-3xl font-bold" style={{color: 'var(--text-primary)'}}>
              {transcripts.length}
            </p>
            {duplicateCount > 0 && (
              <p className="mt-1 text-xs" style={{color: 'var(--text-muted)'}}>
                {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''} removed
              </p>
            )}
          </GlassCard>

          <GlassCard variant="medium">
            <h3 className="mb-2 text-sm font-semibold" style={{color: 'var(--text-accent)'}}>
              Total Words
            </h3>
            <p className="text-3xl font-bold" style={{color: 'var(--text-primary)'}}>
              {totalWords.toLocaleString()}
            </p>
          </GlassCard>

          <GlassCard variant="medium">
            <h3 className="mb-2 text-sm font-semibold" style={{color: 'var(--text-accent)'}}>
              Avg. Confidence
            </h3>
            <p className="text-3xl font-bold" style={{color: 'var(--text-primary)'}}>
              {averageConfidence > 0 ? `${Math.round(averageConfidence * 100)}%` : 'N/A'}
            </p>
          </GlassCard>
        </div>

        {/* Show deduplication summary if duplicates were found */}
        {duplicateCount > 0 && (
          <div className="mb-6">
            <GlassCard variant="light" className="p-4">
              <div className="mb-2 flex items-center space-x-2">
                <div className="h-2 w-2 rounded-full bg-yellow-400" />
                <h3 className="text-sm font-semibold" style={{color: 'var(--text-accent)'}}>
                  Deduplication Applied
                </h3>
              </div>
              <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
                Removed {duplicateCount} duplicate transcript{duplicateCount !== 1 ? 's' : ''} to
                improve analysis accuracy.
              </p>
              {deduplicationResult.removalReasons.length > 0 && (
                <div className="mt-2 text-xs" style={{color: 'var(--text-muted)'}}>
                  Reasons:{' '}
                  {Object.entries(
                    deduplicationResult.removalReasons.reduce(
                      (acc, {reason}) => {
                        acc[reason] = (acc[reason] || 0) + 1
                        return acc
                      },
                      {} as Record<string, number>
                    )
                  )
                    .map(([reason, count]) => `${reason.replace(/_/g, ' ')}: ${count}`)
                    .join(', ')}
                </div>
              )}
            </GlassCard>
          </div>
        )}

        {transcripts.length > 0 ? (
          <div className="space-y-4">
            <h3 className="text-md font-semibold" style={{color: 'var(--text-primary)'}}>
              Recent Activity
            </h3>

            <div className="space-y-3">
              {transcripts
                .slice(-10)
                .reverse()
                .map(transcript => (
                  <GlassCard
                    key={transcript.id}
                    variant="light"
                    className="flex items-center justify-between p-4"
                  >
                    <div className="flex-1">
                      <p
                        className="mb-1 max-w-md truncate text-sm leading-relaxed"
                        style={{color: 'var(--text-primary)'}}
                      >
                        {transcript.text}
                      </p>
                      <p className="text-xs" style={{color: 'var(--text-muted)'}}>
                        {new Date(transcript.timestamp).toLocaleDateString()} at{' '}
                        {new Date(transcript.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="ml-4 space-y-1 text-right">
                      <p
                        className="rounded-full px-2 py-1 text-xs"
                        style={{
                          color: 'var(--text-primary)',
                          background: 'var(--glass-light)'
                        }}
                      >
                        {transcript.text.split(' ').length} words
                      </p>
                      {transcript.confidence && (
                        <p
                          className="rounded-full px-2 py-1 text-xs font-medium"
                          style={{
                            color: 'var(--interactive-success)',
                            background: 'rgba(16, 185, 129, 0.1)'
                          }}
                        >
                          {Math.round(transcript.confidence * 100)}%
                        </p>
                      )}
                    </div>
                  </GlassCard>
                ))}
            </div>
          </div>
        ) : (
          <GlassCard variant="light" className="py-16 text-center">
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: 'var(--glass-medium)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)'
              }}
            >
              <svg
                className="h-6 w-6"
                style={{color: 'var(--text-accent)'}}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <p className="mb-2 text-lg font-medium" style={{color: 'var(--text-primary)'}}>
              No data to analyze
            </p>
            <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
              Start recording to see insights and statistics here
            </p>
          </GlassCard>
        )}
      </div>
    </div>
  )
}
