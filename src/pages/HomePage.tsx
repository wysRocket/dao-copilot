import React from 'react';
import ToggleTheme from '../components/ToggleTheme';
import RecordingControls from '../components/RecordingControls';
import TranscriptDisplay from '../components/TranscriptDisplay';
import {TranscriptionResult} from '../services/main-stt-transcription';
import {useWindowPortal} from '../hooks/useWindowPortal';
import {useTranscriptionState} from '../hooks/useSharedState';
import {WindowNavigator} from '../components/ui/window-navigator';
import {WindowStatus} from '../components/ui/window-status';
import {PerformanceDashboard} from '../components/PerformanceDashboard';

export default function HomePage() {
  // Use shared state for transcription
  const {transcripts, isProcessing, addTranscript, setProcessingState} =
    useTranscriptionState();

  // Multi-window portal hooks
  const assistantWindow = useWindowPortal({type: 'assistant'});
  const settingsWindow = useWindowPortal({type: 'settings'});
  const overlayWindow = useWindowPortal({type: 'overlay'});

  const handleTranscription = (transcript: TranscriptionResult) => {
    addTranscript({
      text: transcript.text,
      confidence: transcript.confidence,
    });
    setProcessingState(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <div className="mt-8 w-full max-w-md">
          <RecordingControls onTranscription={handleTranscription} />
        </div>
        <TranscriptDisplay
          transcripts={transcripts}
          isProcessing={isProcessing}
        />

        {/* Development Testing Button */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4">
            <button
              onClick={() => console.log('Audio tests would run here')}
              className="rounded bg-blue-100 px-4 py-2 text-xs text-blue-800 hover:bg-blue-200"
            >
              🧪 Run Audio Tests
            </button>
          </div>
        )}

        <ToggleTheme />

        {/* Enhanced Multi-Window Controls */}
        <div className="mt-8 space-y-4">
          <div className="mb-4 text-center text-sm font-medium">
            Multi-Window Navigation
          </div>

          {/* Modern Window Navigator */}
          <div className="flex justify-center">
            <WindowNavigator
              showLabels
              orientation="horizontal"
              className="bg-card/50 rounded-lg border p-3"
            />
          </div>

          {/* Window Status Display */}
          <div className="flex justify-center">
            <WindowStatus
              showWindowInfo
              showRecordingStatus
              showTranscriptCount
              showConnectionStatus
              className="bg-card/30 rounded-lg border px-4 py-2"
            />
          </div>

          {/* Performance Dashboard */}
          <div className="flex justify-center">
            <PerformanceDashboard
              compact
              className="bg-card/30 rounded-lg border px-4 py-2"
            />
          </div>

          {/* Legacy Controls for Comparison */}
          <details className="text-center">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
              Show Legacy Controls
            </summary>
            <div className="mt-4 space-y-2">
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => assistantWindow.openWindow()}
                  disabled={assistantWindow.isWindowOpen}
                  className="rounded-md bg-blue-500 px-4 py-2 text-sm text-white disabled:bg-gray-400"
                >
                  {assistantWindow.isWindowOpen
                    ? 'Assistant Open'
                    : 'Open Assistant'}
                </button>
                <button
                  onClick={() => settingsWindow.openWindow()}
                  disabled={settingsWindow.isWindowOpen}
                  className="rounded-md bg-green-500 px-4 py-2 text-sm text-white disabled:bg-gray-400"
                >
                  {settingsWindow.isWindowOpen
                    ? 'Settings Open'
                    : 'Open Settings'}
                </button>
                <button
                  onClick={() => overlayWindow.openWindow()}
                  disabled={overlayWindow.isWindowOpen}
                  className="rounded-md bg-purple-500 px-4 py-2 text-sm text-white disabled:bg-gray-400"
                >
                  {overlayWindow.isWindowOpen ? 'Overlay Open' : 'Open Overlay'}
                </button>
              </div>

              <div className="text-muted-foreground text-xs">
                Assistant:{' '}
                {assistantWindow.isWindowVisible ? 'Visible' : 'Hidden'} |
                Settings:{' '}
                {settingsWindow.isWindowVisible ? 'Visible' : 'Hidden'} |
                Overlay: {overlayWindow.isWindowVisible ? 'Visible' : 'Hidden'}
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
