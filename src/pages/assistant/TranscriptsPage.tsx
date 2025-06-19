import React, {useEffect} from 'react'
import {useTranscriptionState, useWindowCommunication} from '../../hooks/useSharedState'
import {TranscriptionResult} from '../../services/main-stt-transcription'

export default function TranscriptsPage() {
  const {transcripts, isProcessing, addTranscript, setProcessingState} = useTranscriptionState()
  const {onMessage} = useWindowCommunication()

  // Listen for transcription results from CustomTitleBar (main window)
  useEffect(() => {
    const unsubscribe = onMessage((channel, ...args) => {
      if (channel === 'transcription-result' && args[0]) {
        const result = args[0] as TranscriptionResult
        addTranscript({
          text: result.text,
          confidence: result.confidence as number | undefined
        })
        setProcessingState(false)
      }
    })

    return unsubscribe
  }, [onMessage, addTranscript, setProcessingState])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="border-b px-4 py-4"
        style={{
          background: 'var(--glass-heavy)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid var(--glass-border)',
          boxShadow: '0 2px 12px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}
      >
        <h2 className="mb-1 text-lg font-bold" style={{color: 'var(--text-primary)'}}>
          Live Transcriptions
        </h2>
        <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
          Real-time transcription results from audio recording
        </p>
      </div>

      {/* Live Transcription Display */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto w-full max-w-4xl">
          <div
            className="max-h-full min-h-[300px] overflow-y-auto rounded-xl p-4"
            style={{
              background: 'var(--glass-medium)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 8px 32px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
          >
            {transcripts.length === 0 && !isProcessing ? (
              <div className="flex h-full flex-col items-center justify-center space-y-6 py-16 text-center">
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-full"
                  style={{
                    background: 'var(--glass-medium)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: '0 4px 16px var(--glass-shadow)'
                  }}
                >
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{color: 'var(--text-accent)'}}
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </div>
                <div className="space-y-3">
                  <p className="text-lg font-medium" style={{color: 'var(--text-primary)'}}>
                    No transcriptions yet
                  </p>
                  <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
                    Start recording in the main window to see live transcriptions here
                  </p>
                </div>
              </div>
            ) : (
              <>
                {transcripts.map(transcript => (
                  <div
                    key={transcript.id}
                    className="mb-4 rounded-xl p-4 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg"
                    style={{
                      background: 'var(--glass-light)',
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      border: '1px solid var(--glass-border)',
                      boxShadow:
                        '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    <p
                      className="mb-3 text-sm leading-relaxed"
                      style={{color: 'var(--text-primary)'}}
                    >
                      {transcript.text}
                    </p>
                    <div
                      className="flex items-center justify-between text-xs"
                      style={{color: 'var(--text-muted)'}}
                    >
                      <span>{new Date(transcript.timestamp).toLocaleString()}</span>
                      {transcript.confidence && (
                        <span
                          className="rounded-full px-2 py-1 text-xs font-medium"
                          style={{
                            background: 'var(--glass-light)',
                            color: 'var(--text-accent)'
                          }}
                        >
                          {(transcript.confidence * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {isProcessing && (
                  <div
                    className="flex items-center justify-center rounded-xl p-6"
                    style={{
                      background: 'var(--glass-light)',
                      border: '1px solid var(--glass-border)'
                    }}
                  >
                    <div
                      className="h-6 w-6 animate-spin rounded-full border-r-2 border-b-2"
                      style={{borderColor: 'var(--interactive-primary)'}}
                    ></div>
                    <span
                      className="ml-3 text-sm font-medium"
                      style={{color: 'var(--text-primary)'}}
                    >
                      Processing audio...
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer with stats */}
      <div
        className="border-t px-4 py-3"
        style={{
          background: 'var(--glass-medium)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--glass-border)',
          boxShadow: '0 -2px 8px var(--glass-shadow)'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium" style={{color: 'var(--text-primary)'}}>
              {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''}
            </span>
            {isProcessing && (
              <span className="flex items-center text-sm" style={{color: 'var(--text-accent)'}}>
                <div className="mr-2 h-2 w-2 animate-pulse rounded-full bg-current"></div>
                Recording active
              </span>
            )}
          </div>
          <div className="text-xs" style={{color: 'var(--text-muted)'}}>
            Live updates from main window
          </div>
        </div>
      </div>
    </div>
  )
}
