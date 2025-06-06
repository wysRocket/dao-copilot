import React, {useEffect, useRef} from 'react';
import {
  useAppContext,
  useAIAssistant,
  useRecording,
} from '../../contexts/AppContext';
import {audio_stream} from '../../services/audio_capture';
import {renderAudioToWav} from '../../services/wav';
import {resampleAudio} from '../../services/audio_capture';
import {Subject, interval} from 'rxjs';
import {buffer, takeUntil} from 'rxjs/operators';
import {TranscriptionResult} from '../../services/main-stt-transcription';

const INTERVAL_SECONDS = 5;
const DEVICE_SAMPLE_RATE = 48000;
const TARGET_SAMPLE_RATE = 8000;

export default function TitleBarPortal() {
  const {dispatch} = useAppContext();
  const aiAssistant = useAIAssistant();
  const recording = useRecording();

  // Recording management refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingSubscriptionRef = useRef<{unsubscribe: () => void} | null>(
    null,
  );
  const stopSubjectRef = useRef<Subject<void> | null>(null);

  const processAudioChunk = async (
    chunks: number[][],
  ): Promise<TranscriptionResult | null> => {
    try {
      recording.setTranscribing(true);
      recording.setStatus('Processing audio...');

      // Convert chunks to a single Float32Array
      const numFrames = chunks.reduce((acc, chunk) => acc.concat(chunk), []);
      const originalAudioData = new Float32Array(numFrames);

      // Resample the audio
      const resampledAudioData = resampleAudio(
        originalAudioData,
        DEVICE_SAMPLE_RATE,
        TARGET_SAMPLE_RATE,
      );

      // Render as WAV file
      const wavData = await renderAudioToWav(resampledAudioData);

      // Save the WAV file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `chunk-${timestamp}.wav`;

      if (window.audioAPI?.writeFile) {
        await window.audioAPI.writeFile(filename, wavData);
      }

      // Send for transcription
      const result = await window.transcriptionAPI.transcribeAudio(wavData);

      // Update transcripts
      if (result && result.text) {
        recording.addTranscript(result);
      }

      recording.setStatus('Transcription completed');
      return result;
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      recording.setStatus('Error processing audio');
      return null;
    } finally {
      recording.setTranscribing(false);
    }
  };

  const startIntervalRecording = () => {
    if (recording.isRecording) return;

    recording.setRecording(true);
    recording.setStatus(`Recording... (${INTERVAL_SECONDS}s intervals)`);

    // Start timer
    timerRef.current = setInterval(() => {
      dispatch({
        type: 'SET_RECORDING_TIME',
        payload: recording.recordingTime + 1,
      });
    }, 1000);

    // Create stop subject
    const stopSubject = new Subject<void>();
    stopSubjectRef.current = stopSubject;

    // Create interval observable
    const intervalObservable = interval(INTERVAL_SECONDS * 1000);
    const audioObservable = audio_stream();

    // Subscribe to audio stream
    recordingSubscriptionRef.current = audioObservable
      .pipe(buffer(intervalObservable), takeUntil(stopSubject))
      .subscribe({
        next: async (chunks) => {
          if (chunks.length === 0) return;
          await processAudioChunk(chunks);
        },
        error: (err) => {
          console.error('Error in audio recording:', err);
          recording.setStatus('Recording error occurred');
          stopIntervalRecording();
        },
        complete: () => {
          console.log('Interval recording completed');
          recording.setStatus('Recording completed');
        },
      });
  };

  const stopIntervalRecording = () => {
    if (!recording.isRecording) return;

    recording.setRecording(false);
    recording.setStatus('Stopping recording...');

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop recording
    const stopSubject = stopSubjectRef.current;
    if (stopSubject) {
      stopSubject.next();
      stopSubject.complete();
      stopSubjectRef.current = null;
    }

    if (recordingSubscriptionRef.current) {
      recordingSubscriptionRef.current.unsubscribe();
      recordingSubscriptionRef.current = null;
    }

    recording.setStatus('Ready to record');
  };

  const handleRecordingToggle = () => {
    if (recording.isRecording) {
      stopIntervalRecording();
    } else {
      startIntervalRecording();
    }
  };

  const handleAskAI = async () => {
    aiAssistant.setVisible(true);

    // Trigger AI Assistant window creation via IPC
    if (window.electronWindow?.showAIAssistant) {
      await window.electronWindow.showAIAssistant();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (stopSubjectRef.current) {
        stopSubjectRef.current.next();
        stopSubjectRef.current.complete();
      }
      if (recordingSubscriptionRef.current) {
        recordingSubscriptionRef.current.unsubscribe();
      }
    };
  }, []);

  return (
    <div className="bg-background/95 border-border/50 fixed top-0 right-0 left-0 z-[9999] flex h-12 items-center gap-4 border-b px-6 shadow-sm backdrop-blur-md select-none">
      {/* Window Controls (Left side on macOS) */}
      <div className="flex items-center gap-1.5">
        <button
          className="h-3 w-3 rounded-full bg-red-500 transition-colors hover:bg-red-600"
          onClick={() => window.electronWindow?.close()}
          title="Close"
          aria-label="Close window"
        />
        <button
          className="h-3 w-3 rounded-full bg-yellow-500 transition-colors hover:bg-yellow-600"
          onClick={() => window.electronWindow?.minimize()}
          title="Minimize"
          aria-label="Minimize window"
        />
        <button
          className="h-3 w-3 rounded-full bg-green-500 transition-colors hover:bg-green-600"
          onClick={() => window.electronWindow?.maximize()}
          title="Maximize"
          aria-label="Maximize window"
        />
      </div>

      {/* Recording Control */}
      <div className="flex items-center gap-3">
        <button
          className={`focus:ring-primary/50 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 focus:ring-2 focus:outline-none ${
            recording.isRecording
              ? 'border border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/20'
              : 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/30 border'
          }`}
          title={
            recording.isRecording
              ? `Stop Recording - ${recording.status}`
              : `Start Recording - ${recording.status}`
          }
          onClick={handleRecordingToggle}
          aria-label={
            recording.isRecording ? 'Stop Recording' : 'Start Recording'
          }
        >
          {recording.isRecording ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect
                x="3"
                y="3"
                width="10"
                height="10"
                rx="2"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" fill="currentColor" />
            </svg>
          )}
          <span className="text-xs font-medium">
            {recording.isRecording ? 'STOP' : 'REC'}
          </span>
        </button>

        <div className="text-muted-foreground flex items-center gap-1 font-mono text-sm">
          <span>{formatTime(recording.recordingTime)}</span>
          {recording.isRecording && (
            <div className="ml-2 h-2 w-2 animate-pulse rounded-full bg-red-500" />
          )}
          {recording.isTranscribing && (
            <div className="ml-2 h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          )}
        </div>
      </div>

      {/* App Title */}
      <div className="text-foreground/80 flex items-center gap-2 text-sm font-medium">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-primary"
        >
          <path d="M12 2L2 7L12 12L22 7L12 2Z" />
          <path d="M2 17L12 22L22 17" />
          <path d="M2 12L12 17L22 12" />
        </svg>
        DAO Copilot
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* AI Controls Section */}
      <div className="flex items-center gap-2">
        <button
          className="border-border/50 bg-background/80 text-foreground/80 hover:bg-primary/10 hover:text-primary hover:border-primary/30 focus:ring-primary/50 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-200 focus:ring-2 focus:outline-none"
          onClick={handleAskAI}
          title="Ask AI (⌘↵)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2L2 7L12 12L22 7L12 2Z" />
            <path d="M2 17L12 22L22 17" />
            <path d="M2 12L12 17L22 12" />
          </svg>
          Ask AI
          <span className="text-muted-foreground ml-1 text-xs">⌘↵</span>
        </button>

        <button
          className={`focus:ring-primary/50 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-200 focus:ring-2 focus:outline-none ${
            aiAssistant.isVisible
              ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/20'
              : 'bg-background/80 text-foreground/80 border-border/50 hover:bg-muted/50'
          }`}
          onClick={aiAssistant.toggleVisibility}
          title="Show/Hide AI Assistant (⌘\)"
        >
          <div
            className={`h-2 w-2 rounded-full transition-all duration-200 ${
              aiAssistant.isVisible
                ? 'bg-primary animate-pulse'
                : 'bg-muted-foreground'
            }`}
          />
          {aiAssistant.isVisible ? 'Hide' : 'Show'}
          <span className="text-muted-foreground ml-1 text-xs">⌘\</span>
        </button>
      </div>

      {/* Settings */}
      <button
        className="border-border/50 bg-background/80 hover:bg-muted/50 hover:border-primary/30 focus:ring-primary/50 rounded-lg border p-2 transition-all duration-200 focus:ring-2 focus:outline-none"
        title="Settings"
        aria-label="Settings"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted-foreground"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" />
        </svg>
      </button>
    </div>
  );
}
