import React from 'react'
import {useTranscriptionState} from '../../hooks/useSharedState'

export default function AnalysisPage() {
  const {transcripts} = useTranscriptionState()

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
          <div
            className="rounded-xl p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
            style={{
              background: 'var(--glass-medium)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 8px 24px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
          >
            <h3 className="mb-2 text-sm font-semibold" style={{color: 'var(--text-accent)'}}>
              Total Transcripts
            </h3>
            <p className="text-3xl font-bold" style={{color: 'var(--text-primary)'}}>
              {transcripts.length}
            </p>
          </div>

          <div
            className="rounded-xl p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
            style={{
              background: 'var(--glass-medium)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 8px 24px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
          >
            <h3 className="mb-2 text-sm font-semibold" style={{color: 'var(--text-accent)'}}>
              Total Words
            </h3>
            <p className="text-3xl font-bold" style={{color: 'var(--text-primary)'}}>
              {totalWords.toLocaleString()}
            </p>
          </div>

          <div
            className="rounded-xl p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
            style={{
              background: 'var(--glass-medium)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 8px 24px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
          >
            <h3 className="mb-2 text-sm font-semibold" style={{color: 'var(--text-accent)'}}>
              Avg. Confidence
            </h3>
            <p className="text-3xl font-bold" style={{color: 'var(--text-primary)'}}>
              {averageConfidence > 0 ? `${Math.round(averageConfidence * 100)}%` : 'N/A'}
            </p>
          </div>
        </div>

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
                  <div
                    key={transcript.id}
                    className="flex items-center justify-between rounded-xl p-4 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg"
                    style={{
                      background: 'var(--glass-light)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      border: '1px solid var(--glass-border)',
                      boxShadow:
                        '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                    }}
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
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div
            className="rounded-xl py-16 text-center"
            style={{
              background: 'var(--glass-light)',
              border: '1px solid var(--glass-border)'
            }}
          >
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
          </div>
        )}
      </div>
    </div>
  )
}
