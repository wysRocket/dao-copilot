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
    <div className="h-full w-full">
      <div className="bg-background/95 h-full rounded-lg border shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="text-lg font-semibold">Live Transcription</h3>
          {isProcessing && (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              Processing...
            </div>
          )}
        </div>
        <div className="max-h-[calc(100%-80px)] overflow-y-auto p-4">
          {transcripts.length === 0 && !isProcessing ? (
            <p className="text-muted-foreground italic">
              No transcriptions yet. Start recording to see results.
            </p>
          ) : (
            <>
              {transcripts.map((transcript, index) => (
                <div key={index} className="bg-muted mb-4 rounded-md p-3">
                  <p className="text-sm">{transcript.text}</p>
                  <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
                    <span>
                      {transcript.startTime !== null &&
                        transcript.startTime !== undefined &&
                        transcript.endTime !== null &&
                        transcript.endTime !== undefined &&
                        typeof transcript.startTime === 'number' &&
                        typeof transcript.endTime === 'number' &&
                        `${transcript.startTime.toFixed(1)}s - ${transcript.endTime.toFixed(1)}s`}
                    </span>
                    {transcript.confidence &&
                    typeof transcript.confidence === 'number' ? (
                      <span>
                        Confidence:{' '}
                        {((transcript.confidence as number) * 100).toFixed(1)}%
                      </span>
                    ) : null}
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
  );
};

export default TranscriptDisplay;
