import React from 'react';
import {useRecording} from '../../contexts/AppContext';
import {formatDistanceToNow} from 'date-fns';

export default function TranscriptPortal() {
  const {transcripts, isTranscribing, status} = useRecording();

  const formatTimestamp = (timestamp: unknown) => {
    try {
      if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        return formatDistanceToNow(date, {addSuffix: true});
      } else if (typeof timestamp === 'number') {
        const date = new Date(timestamp);
        return formatDistanceToNow(date, {addSuffix: true});
      }
      return 'Unknown time';
    } catch {
      return 'Unknown time';
    }
  };

  return (
    <div className="bg-background/95 flex h-full w-full flex-col backdrop-blur-md">
      {/* Header */}
      <div className="border-border/50 flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary"
          >
            <path d="M12 1v6M12 17v6" />
            <path d="M3 12h18" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <h2 className="text-foreground text-sm font-semibold">Transcripts</h2>
        </div>

        <div className="flex items-center gap-2">
          {isTranscribing && (
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              <span className="text-muted-foreground text-xs">
                Processing...
              </span>
            </div>
          )}
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => window.electronWindow?.close()}
            title="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {transcripts.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-muted-foreground mx-auto mb-3"
              >
                <path d="M12 1v6M12 17v6" />
                <path d="M3 12h18" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <p className="text-muted-foreground text-sm">
                No transcripts yet
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Start recording to see transcripts here
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {transcripts.map((transcript, index) => (
              <div
                key={`${transcript.timestamp}-${index}`}
                className="bg-card border-border/30 rounded-lg border p-3 shadow-sm transition-all hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between">
                  <span className="text-muted-foreground text-xs">
                    {formatTimestamp(transcript.timestamp)}
                  </span>
                  {typeof transcript.confidence === 'number' && (
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        transcript.confidence > 0.8
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : transcript.confidence > 0.6
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      {Math.round(transcript.confidence * 100)}%
                    </span>
                  )}
                </div>
                <p className="text-foreground text-sm leading-relaxed">
                  {transcript.text || 'No text transcribed'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-border/50 border-t px-4 py-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''}
          </span>
          <span className="text-muted-foreground text-xs">{status}</span>
        </div>
      </div>
    </div>
  );
}
