import React from 'react';
import {TranscriptionResult} from '../services/main-stt-transcription';

interface TranscriptDisplayProps {
  transcripts: TranscriptionResult[];
  isProcessing?: boolean;
  maxHeight?: string;
  showConfidence?: boolean;
}

// Type guard for better type safety
const isNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value);
};

const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({
  transcripts,
  isProcessing = false,
  maxHeight = '400px',
  showConfidence = true,
}) => {
  // Helper function to format timing information
  const formatTiming = (transcript: TranscriptionResult): string => {
    const startTime = transcript.startTime;
    const endTime = transcript.endTime;

    if (isNumber(startTime) && isNumber(endTime)) {
      return `${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s`;
    }

    if (isNumber(transcript.duration)) {
      return `Duration: ${transcript.duration}ms`;
    }

    return 'Time: N/A';
  };

  // Helper function to format confidence score
  const formatConfidence = (transcript: TranscriptionResult): string | null => {
    const confidence = transcript.confidence;

    if (isNumber(confidence)) {
      return `Confidence: ${(confidence * 100).toFixed(1)}%`;
    }

    return null;
  };

  return (
    <div className="mt-4 w-full max-w-2xl">
      <h3 className="mb-2 text-lg font-semibold">Transcription Results</h3>
      <div
        className={`bg-background min-h-[200px] overflow-y-auto rounded-lg border p-4 ${
          maxHeight === '400px' ? 'max-h-[400px]' : 'max-h-[600px]'
        }`}
        role="log"
        aria-live="polite"
        aria-label="Transcription results"
      >
        {transcripts.length === 0 && !isProcessing ? (
          <p className="text-muted-foreground italic" role="status">
            No transcriptions yet. Start recording to see results.
          </p>
        ) : (
          <>
            {transcripts.map((transcript, index) => {
              const confidence = formatConfidence(transcript);

              return (
                <div
                  key={index}
                  className="bg-muted mb-4 rounded-md p-3"
                  role="article"
                  aria-label={`Transcription ${index + 1}`}
                >
                  <p className="text-sm leading-relaxed" role="main">
                    {transcript.text || 'No text available'}
                  </p>
                  <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
                    <span aria-label="Timing information">
                      {formatTiming(transcript)}
                    </span>
                    {showConfidence && confidence && (
                      <span aria-label="Confidence score">{confidence}</span>
                    )}
                  </div>
                </div>
              );
            })}
            {isProcessing && (
              <div
                className="flex items-center justify-center p-4"
                role="status"
                aria-live="polite"
              >
                <div
                  className="border-primary h-6 w-6 animate-spin rounded-full border-b-2"
                  aria-hidden="true"
                ></div>
                <span className="text-muted-foreground ml-2 text-sm">
                  Processing audio...
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TranscriptDisplay;
