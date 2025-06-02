import React from 'react';
import {TranscriptionResult} from '../services/main-stt-transcription';

interface TranscriptDisplayProps {
  transcripts: TranscriptionResult[];
  isProcessing?: boolean;
}

const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({
  transcripts,
  isProcessing = false,
}) => {
  return (
    <div className="mt-4 w-full max-w-2xl">
      <h3 className="mb-2 text-lg font-semibold">Transcript</h3>
      <div className="max-h-[400px] min-h-[200px] overflow-y-auto rounded-lg border bg-background p-4">
        {transcripts.length === 0 && !isProcessing ? (
          <p className="italic text-muted-foreground">
            No transcriptions yet. Start recording to see results.
          </p>
        ) : (
          <>
            {transcripts.map((transcript, index) => (
              <div key={index} className="mb-4 rounded-md bg-muted p-3">
                <p className="text-sm">{transcript.text}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {transcript.startTime !== undefined &&
                      transcript.endTime !== undefined &&
                      `${transcript.startTime.toFixed(1)}s - ${transcript.endTime.toFixed(1)}s`}
                  </span>
                  {transcript.confidence && (
                    <span>
                      Confidence: {(transcript.confidence * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex items-center justify-center p-4">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
                <span className="ml-2 text-sm text-muted-foreground">
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
