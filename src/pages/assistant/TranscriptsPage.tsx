import React, {useEffect} from 'react';
import {
  useTranscriptionState,
  useWindowCommunication,
} from '../../hooks/useSharedState';
import {TranscriptionResult} from '../../services/main-stt-transcription';

export default function TranscriptsPage() {
  const {transcripts, isProcessing, addTranscript, setProcessingState} =
    useTranscriptionState();
  const {onMessage} = useWindowCommunication();

  // Listen for transcription results from CustomTitleBar (main window)
  useEffect(() => {
    const unsubscribe = onMessage((channel, ...args) => {
      if (channel === 'transcription-result' && args[0]) {
        const result = args[0] as TranscriptionResult;
        addTranscript({
          text: result.text,
          confidence: result.confidence as number | undefined,
        });
        setProcessingState(false);
      }
    });

    return unsubscribe;
  }, [onMessage, addTranscript, setProcessingState]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="bg-card/50 border-b px-4 py-3">
        <h2 className="text-lg font-semibold">Live Transcriptions</h2>
        <p className="text-muted-foreground text-sm">
          Real-time transcription results from audio recording
        </p>
      </div>

      {/* Live Transcription Display */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto w-full max-w-4xl">
          <div className="bg-background max-h-full min-h-[200px] overflow-y-auto rounded-lg border p-4">
            {transcripts.length === 0 && !isProcessing ? (
              <div className="flex h-full flex-col items-center justify-center space-y-4 py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-gray-400"
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <p className="text-muted-foreground italic">
                    No transcriptions yet. Start recording to see results.
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Start recording in the main window to see live
                    transcriptions here
                  </p>
                </div>
              </div>
            ) : (
              <>
                {transcripts.map((transcript) => (
                  <div
                    key={transcript.id}
                    className="bg-muted mb-4 rounded-md p-3"
                  >
                    <p className="text-sm">{transcript.text}</p>
                    <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
                      <span>
                        {new Date(transcript.timestamp).toLocaleString()}
                      </span>
                      {transcript.confidence && (
                        <span>
                          Confidence: {(transcript.confidence * 100).toFixed(1)}
                          %
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {isProcessing && (
                  <div className="flex items-center justify-center p-4">
                    <div className="border-primary h-6 w-6 animate-spin rounded-full border-b-2"></div>
                    <span className="text-muted-foreground ml-2 text-sm">
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
      <div className="bg-card/30 border-t px-4 py-2">
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>{transcripts.length} transcriptions</span>
          <span>{isProcessing ? 'Processing...' : 'Ready'}</span>
        </div>
      </div>
    </div>
  );
}
