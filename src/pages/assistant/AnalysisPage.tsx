import React from 'react';
import {useTranscriptionState} from '../../hooks/useSharedState';

export default function AnalysisPage() {
  const {transcripts} = useTranscriptionState();

  const totalWords = transcripts.reduce(
    (total, t) => total + t.text.split(' ').length,
    0,
  );
  const averageConfidence =
    transcripts.length > 0
      ? transcripts.reduce((sum, t) => sum + (t.confidence || 0), 0) /
        transcripts.length
      : 0;

  return (
    <div className="p-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Transcription Analysis</h2>
        <p className="text-muted-foreground text-sm">
          Insights and statistics about your transcriptions
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="bg-card rounded-lg border p-4">
          <h3 className="text-muted-foreground text-sm font-medium">
            Total Transcripts
          </h3>
          <p className="mt-1 text-2xl font-bold">{transcripts.length}</p>
        </div>

        <div className="bg-card rounded-lg border p-4">
          <h3 className="text-muted-foreground text-sm font-medium">
            Total Words
          </h3>
          <p className="mt-1 text-2xl font-bold">{totalWords}</p>
        </div>

        <div className="bg-card rounded-lg border p-4">
          <h3 className="text-muted-foreground text-sm font-medium">
            Avg. Confidence
          </h3>
          <p className="mt-1 text-2xl font-bold">
            {averageConfidence > 0
              ? `${Math.round(averageConfidence * 100)}%`
              : 'N/A'}
          </p>
        </div>
      </div>

      {transcripts.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-md font-semibold">Recent Activity</h3>

          <div className="space-y-2">
            {transcripts
              .slice(-10)
              .reverse()
              .map((transcript) => (
                <div
                  key={transcript.id}
                  className="bg-card/50 flex items-center justify-between rounded border p-3"
                >
                  <div className="flex-1">
                    <p className="max-w-md truncate text-sm">
                      {transcript.text}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {new Date(transcript.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-muted-foreground text-xs">
                      {transcript.text.split(' ').length} words
                    </p>
                    {transcript.confidence && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {Math.round(transcript.confidence * 100)}%
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground py-8 text-center">
          <p>No transcripts to analyze yet.</p>
          <p className="text-xs">Start recording to see analysis here.</p>
        </div>
      )}
    </div>
  );
}
