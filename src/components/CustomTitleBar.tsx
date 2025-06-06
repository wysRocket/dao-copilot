import React, {useState, useRef, useEffect} from 'react';
import {audio_stream} from '../services/audio_capture';
import {buffer, interval, Subject, Subscription, takeUntil} from 'rxjs';
import {renderWavFile} from '../services/wav';
import {TranscriptionResult} from '../services/main-stt-transcription';
import ToggleTheme from './ToggleTheme';

// Constants for audio processing
const INTERVAL_SECONDS = 10; // Process audio every 10 seconds
const TARGET_SAMPLE_RATE = 8000; // Target sample rate for the SageMaker endpoint
const DEVICE_SAMPLE_RATE = 44100; // Typical device sample rate

interface CustomTitleBarProps {
  onAskAI?: () => void;
  onToggleVisibility?: () => void;
  isAIVisible?: boolean;
  onTranscription?: (transcript: TranscriptionResult) => void;
  onProcessingChange?: (processing: boolean) => void;
}

/**
 * Simple audio resampling function to convert from one sample rate to another
 * @param audioData The original audio data
 * @param originalSampleRate The original sample rate of the audio data
 * @param targetSampleRate The target sample rate to convert to
 * @returns Resampled audio data as Float32Array
 */
function resampleAudio(
  audioData: Float32Array,
  originalSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (originalSampleRate === targetSampleRate) {
    return audioData;
  }

  const ratio = originalSampleRate / targetSampleRate;
  const newLength = Math.round(audioData.length / ratio);
  const result = new Float32Array(newLength);

  // Simple linear interpolation resampling
  // Note: For production use, consider using a more sophisticated algorithm
  for (let i = 0; i < newLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;

    if (index >= audioData.length - 1) {
      result[i] = audioData[audioData.length - 1];
    } else {
      result[i] =
        audioData[index] * (1 - fraction) + audioData[index + 1] * fraction;
    }
  }

  return result;
}

/**
 * Renders audio data as a WAV file with the required format specifications:
 * - PCM encoding (16-bit)
 * - 8000 Hz sample rate
 * - Mono (1 channel)
 */
async function renderAudioToWav(audioData: Float32Array): Promise<Uint8Array> {
  return renderWavFile(audioData, {
    isFloat: false, // PCM format (not floating point) - this will use 16-bit depth
    numChannels: 1, // Mono
    sampleRate: TARGET_SAMPLE_RATE, // 8000 Hz
  });
}

const CustomTitleBar: React.FC<CustomTitleBarProps> = ({
  onAskAI,
  onToggleVisibility,
  isAIVisible = false,
  onTranscription,
  onProcessingChange,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [status, setStatus] = useState<string>('Ready to record');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Recording functionality refs
  const recordingSubscriptionRef = useRef<Subscription | null>(null);
  const stopSubjectRef = useRef<Subject<void> | null>(null); /**
   * Processes a chunk of audio data by converting it to WAV and sending for transcription
   */
  const processAudioChunk = async (
    chunks: number[][],
  ): Promise<TranscriptionResult | null> => {
    try {
      setIsTranscribing(true);
      setStatus('Processing audio...');
      onProcessingChange?.(true);

      // Convert chunks to a single Float32Array
      const numFrames = chunks.reduce((acc, chunk) => acc.concat(chunk), []);
      const originalAudioData = new Float32Array(numFrames);

      // Resample the audio from device sample rate to target sample rate (8000 Hz)
      console.log(
        `Resampling audio from ${DEVICE_SAMPLE_RATE}Hz to ${TARGET_SAMPLE_RATE}Hz`,
      );
      const resampledAudioData = resampleAudio(
        originalAudioData,
        DEVICE_SAMPLE_RATE,
        TARGET_SAMPLE_RATE,
      );

      // Render as WAV file using the resampled audio data
      const wavData = await renderAudioToWav(resampledAudioData);

      // Save the WAV file (for debugging/reference)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `chunk-${timestamp}.wav`;

      if (window.audioAPI?.writeFile) {
        await window.audioAPI.writeFile(filename, wavData);
        console.log(
          `Saved audio chunk to ${filename}, sending for transcription...`,
        );
      }

      // Send for transcription
      const result = await window.transcriptionAPI.transcribeAudio(wavData);
      console.log('Transcription result:', result);

      // Update UI with transcription result via callback
      if (result && result.text && onTranscription) {
        onTranscription(result);
      }

      setStatus('Transcription completed');
      return result;
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      setStatus('Error processing audio');
      return null;
    } finally {
      setIsTranscribing(false);
      onProcessingChange?.(false);
    }
  };

  /**
   * Starts recording audio in intervals
   */
  const startIntervalRecording = () => {
    if (isRecording) return;

    setIsRecording(true);
    setRecordingTime(0);
    setStatus(`Recording... (${INTERVAL_SECONDS}s intervals)`);

    console.log(
      `Starting interval recording (${INTERVAL_SECONDS} second intervals)`,
    );

    // Start timer
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);

    // Create a subject that will emit when recording should stop
    const stopSubject = new Subject<void>();
    stopSubjectRef.current = stopSubject;

    // Create an interval observable that emits every INTERVAL_SECONDS
    const intervalObservable = interval(INTERVAL_SECONDS * 1000);

    // Start the audio stream
    const audioObservable = audio_stream();

    // Subscribe to the audio stream and process chunks at intervals
    recordingSubscriptionRef.current = audioObservable
      .pipe(
        // Buffer the audio data until the interval emits
        buffer(intervalObservable),
        // Stop when the stop subject emits
        takeUntil(stopSubject),
      )
      .subscribe({
        next: async (chunks) => {
          if (chunks.length === 0) return;

          console.log(
            `Processing ${chunks.length} audio chunks after ${INTERVAL_SECONDS} seconds`,
          );
          await processAudioChunk(chunks);
        },
        error: (err) => {
          console.error('Error in audio recording:', err);
          setStatus('Recording error occurred');
          stopIntervalRecording();
        },
        complete: () => {
          console.log('Interval recording completed');
          setStatus('Recording completed');
        },
      });
  };

  /**
   * Stops the interval recording
   */
  const stopIntervalRecording = () => {
    if (!isRecording) return;

    console.log('Stopping interval recording');
    setIsRecording(false);
    setRecordingTime(0);
    setStatus('Stopping recording...');

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Trigger the stop subject
    const stopSubject = stopSubjectRef.current;
    if (stopSubject) {
      stopSubject.next();
      stopSubject.complete();
      stopSubjectRef.current = null;
    }

    // Unsubscribe from the recording subscription
    if (recordingSubscriptionRef.current) {
      recordingSubscriptionRef.current.unsubscribe();
      recordingSubscriptionRef.current = null;
    }

    setStatus('Ready to record');
    console.log('Recording stopped');
  };

  const handleRecordingToggle = () => {
    if (isRecording) {
      stopIntervalRecording();
    } else {
      startIntervalRecording();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup timer and subscriptions on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      const stopSubject = stopSubjectRef.current;
      if (stopSubject) {
        stopSubject.next();
        stopSubject.complete();
      }

      if (recordingSubscriptionRef.current) {
        recordingSubscriptionRef.current.unsubscribe();
      }
    };
  }, []);

  return (
    <div className="app-region-drag bg-background/95 border-border/50 fixed top-0 right-0 left-0 z-[9999] flex h-12 items-center gap-4 border-b px-6 shadow-sm backdrop-blur-md select-none">
      {/* Window Controls (Left side on macOS) */}
      <div className="app-region-no-drag flex items-center gap-1.5">
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
          className={`app-region-no-drag focus:ring-primary/50 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 focus:ring-2 focus:outline-none ${
            isRecording
              ? 'border border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/20'
              : 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/30 border'
          }`}
          title={
            isRecording
              ? `Stop Recording - ${status}`
              : `Start Recording - ${status}`
          }
          onClick={handleRecordingToggle}
          aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          {isRecording ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
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
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="8" cy="8" r="6" fill="currentColor" />
            </svg>
          )}
          <span className="text-xs font-medium">
            {isRecording ? 'STOP' : 'REC'}
          </span>
        </button>

        <div className="text-muted-foreground flex items-center gap-1 font-mono text-sm">
          <span>{formatTime(recordingTime)}</span>
          {isRecording && (
            <div className="ml-2 h-2 w-2 animate-pulse rounded-full bg-red-500" />
          )}
          {isTranscribing && (
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

      <ToggleTheme />

      {/* Spacer */}
      <div className="flex-1" />

      {/* AI Controls Section */}
      <div className="flex items-center gap-2">
        <button
          className="app-region-no-drag border-border/50 bg-background/80 text-foreground/80 hover:bg-primary/10 hover:text-primary hover:border-primary/30 focus:ring-primary/50 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-200 focus:ring-2 focus:outline-none"
          onClick={onAskAI}
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
          className={`app-region-no-drag focus:ring-primary/50 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-200 focus:ring-2 focus:outline-none ${
            isAIVisible
              ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/20'
              : 'bg-background/80 text-foreground/80 border-border/50 hover:bg-muted/50'
          }`}
          onClick={onToggleVisibility}
          title="Show/Hide AI Assistant (⌘\)"
        >
          <div
            className={`h-2 w-2 rounded-full transition-all duration-200 ${
              isAIVisible ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
            }`}
          />
          {isAIVisible ? 'Hide' : 'Show'}
          <span className="text-muted-foreground ml-1 text-xs">⌘\</span>
        </button>
      </div>

      {/* Settings */}
      <button
        className="app-region-no-drag border-border/50 bg-background/80 hover:bg-muted/50 hover:border-primary/30 focus:ring-primary/50 rounded-lg border p-2 transition-all duration-200 focus:ring-2 focus:outline-none"
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
};

export default CustomTitleBar;
