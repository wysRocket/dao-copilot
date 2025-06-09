import React, {useState, useRef, useEffect} from 'react';
import {useWindowPortal} from '../hooks/useWindowPortal';
import {
  useWindowCommunication,
  useTranscriptionState,
} from '../hooks/useSharedState';
import {audio_stream} from '../services/audio_capture';
import {buffer, interval, Subject, Subscription, takeUntil} from 'rxjs';
import {renderWavFile} from '../services/wav';
import {TranscriptionResult} from '../services/main-stt-transcription';

import ToggleTheme from '../components/ToggleTheme';

// Note: You may need to add the following to your global CSS:
// .app-region-drag { -webkit-app-region: drag; }
// .app-region-no-drag { -webkit-app-region: no-drag; }

// Recording constants
const INTERVAL_SECONDS = 10;
const TARGET_SAMPLE_RATE = 8000;
const DEVICE_SAMPLE_RATE = 44100;

/**
 * Simple audio resampling function
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
 * Renders audio data as a WAV file
 */
async function renderAudioToWav(audioData: Float32Array): Promise<Uint8Array> {
  return renderWavFile(audioData, {
    isFloat: false,
    numChannels: 1,
    sampleRate: TARGET_SAMPLE_RATE,
  });
}

const CustomTitleBar: React.FC = () => {
  const assistantWindow = useWindowPortal({type: 'assistant'});
  const {broadcast} = useWindowCommunication();
  const {setProcessingState} = useTranscriptionState();

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingSubscriptionRef = useRef<Subscription | null>(null);
  const stopSubjectRef = useRef<Subject<void> | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (recordingSubscriptionRef.current) {
        recordingSubscriptionRef.current.unsubscribe();
      }
      if (stopSubjectRef.current) {
        stopSubjectRef.current.complete();
      }
    };
  }, []);

  /**
   * Processes a chunk of audio data by converting it to WAV and sending for transcription
   */
  const processAudioChunk = async (
    chunks: number[][],
  ): Promise<TranscriptionResult | null> => {
    try {
      setIsTranscribing(true);
      setProcessingState(true);

      // Convert chunks to a single Float32Array
      const numFrames = chunks.reduce((acc, chunk) => acc.concat(chunk), []);
      const originalAudioData = new Float32Array(numFrames);

      // Resample the audio from device sample rate to target sample rate (8000 Hz)
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
      await window.audioAPI.writeFile(filename, wavData);

      // Send for transcription
      const result = await window.transcriptionAPI.transcribeAudio(wavData);

      // Broadcast transcription result to all windows
      broadcast('transcription-result', result);

      return result;
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      setProcessingState(false);
      return null;
    } finally {
      setIsTranscribing(false);
    }
  };

  /**
   * Starts recording audio in intervals
   */
  const startIntervalRecording = (): void => {
    if (isRecording) return;

    setIsRecording(true);
    setRecordingTime(0);

    // Start timer
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);

    console.log(
      `Starting interval recording (${INTERVAL_SECONDS} second intervals)`,
    );

    // Create a subject that will emit when recording should stop
    const stopSubject = new Subject<void>();
    stopSubjectRef.current = stopSubject;

    // Create an interval observable that emits every INTERVAL_SECONDS
    const intervalObservable = interval(INTERVAL_SECONDS * 1000);

    // Start the audio stream
    const audioObservable = audio_stream();

    // Subscribe to the audio stream and process chunks at intervals
    recordingSubscriptionRef.current = audioObservable
      .pipe(buffer(intervalObservable), takeUntil(stopSubject))
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
          stopIntervalRecording();
        },
        complete: () => {
          console.log('Interval recording completed');
        },
      });
  };

  /**
   * Stops the interval recording
   */
  const stopIntervalRecording = (): void => {
    if (!isRecording) return;

    console.log('Stopping interval recording');

    // Stop timer
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

    setIsRecording(false);
    setRecordingTime(0);
    console.log('Recording stopped');
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopIntervalRecording();
    } else {
      startIntervalRecording();
    }
  };

  const handleAskAI = () => {
    assistantWindow.openWindow();
  };

  const handleShowHide = () => {
    if (window.electronWindow?.hideWindow) {
      // Get current window ID and hide it
      window.electronWindow.getWindowInfo().then((windowInfo) => {
        if (windowInfo?.windowId) {
          window.electronWindow.hideWindow(windowInfo.windowId);
        }
      });
    }
  };

  const handleSettings = () => {
    assistantWindow.openWindow();
    // Send message to set AssistantWindow to Settings tab
    setTimeout(() => {
      broadcast('set-assistant-view', 'settings');
    }, 100);
  };

  return (
    <div className="app-region-drag flex h-10 items-center gap-3 rounded-t-lg bg-[#f6faff] px-4 shadow-sm select-none">
      <button
        onClick={toggleRecording}
        className="record-btn app-region-no-drag mr-2 border-none bg-none p-0 transition-opacity hover:opacity-80"
        title={isRecording ? 'Stop Recording' : 'Start Recording'}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="8"
            cy="8"
            r="8"
            fill={isRecording ? '#ef4444' : '#2563eb'}
            className={isRecording ? 'animate-pulse' : ''}
          />
          {isRecording ? (
            <rect x="6" y="6" width="4" height="4" fill="white" />
          ) : (
            <rect x="6" y="4" width="4" height="8" rx="2" fill="white" />
          )}
        </svg>
      </button>
      <span
        className={`mr-4 text-base ${isRecording ? 'font-semibold text-red-600' : 'text-slate-700'}`}
      >
        {isRecording || recordingTime > 0
          ? `${Math.floor(recordingTime / 60)
              .toString()
              .padStart(
                2,
                '0',
              )}:${(recordingTime % 60).toString().padStart(2, '0')}`
          : '00:00'}
        {isTranscribing && (
          <span className="ml-2 animate-pulse text-xs text-blue-600">
            Processing...
          </span>
        )}
      </span>

      <ToggleTheme />

      <div className="flex-1" />
      <button
        onClick={handleAskAI}
        className="app-region-no-drag flex items-center rounded border-none bg-none px-2 py-1 text-slate-700 hover:bg-slate-100"
      >
        Ask AI
      </button>
      <span className="shortcut app-region-no-drag mx-1 text-xs text-slate-400">
        ⌘↵
      </span>
      <button
        onClick={handleShowHide}
        className="app-region-no-drag flex items-center rounded border-none bg-none px-2 py-1 text-slate-700 hover:bg-slate-100"
      >
        Show/Hide
      </button>
      <span className="shortcut app-region-no-drag mx-1 text-xs text-slate-400">
        ⌘\
      </span>
      <button
        onClick={handleSettings}
        className="settings-btn app-region-no-drag ml-2 rounded border-none bg-none p-1 hover:bg-slate-100"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="9" cy="9" r="8" stroke="#cbd5e1" strokeWidth="2" />
          <circle cx="9" cy="9" r="2" fill="#cbd5e1" />
        </svg>
      </button>
    </div>
  );
};

export default CustomTitleBar;
