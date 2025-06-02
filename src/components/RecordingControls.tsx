import React, {useState, useRef} from 'react';
import {Button} from './ui/button';
import {audio_stream} from '../services/audio_capture';
import {buffer, interval, Subject, Subscription, takeUntil} from 'rxjs';
import {renderWavFile} from '../services/wav';
import {TranscriptionResult} from '../services/main-stt-transcription';

interface RecordingControlsProps {
  onTranscription: (transcript: TranscriptionResult) => void;
}

// Constants
const INTERVAL_SECONDS = 10;
const TARGET_SAMPLE_RATE = 8000; // Target sample rate for the SageMaker endpoint
const DEVICE_SAMPLE_RATE = 44100; // Typical device sample rate

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

const RecordingControls: React.FC<RecordingControlsProps> = ({
  onTranscription,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [status, setStatus] = useState<string>('Ready to record');
  const recordingSubscriptionRef = useRef<Subscription | null>(null);
  const stopSubjectRef = useRef<Subject<void> | null>(null);

  /**
   * Processes a chunk of audio data by converting it to WAV and sending for transcription
   */
  const processAudioChunk = async (
    chunks: number[][],
  ): Promise<TranscriptionResult | null> => {
    try {
      setIsTranscribing(true);
      setStatus('Processing audio...');

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
      await window.audioAPI.writeFile(filename, wavData);

      console.log(
        `Saved audio chunk to ${filename}, sending for transcription...`,
      );

      // Send for transcription
      const result = await window.transcriptionAPI.transcribeAudio(wavData);
      console.log('Transcription result:', result);

      // Update UI with transcription result via callback
      onTranscription(result);

      setStatus('Transcription completed');
      return result;
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      setStatus('Error processing audio');
      return null;
    } finally {
      setIsTranscribing(false);
    }
  };

  /**
   * Starts recording audio in 30-second intervals
   */
  const startIntervalRecording = (): void => {
    if (isRecording) return;

    setIsRecording(true);
    setStatus(`Recording... (${INTERVAL_SECONDS}s intervals)`);

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
  const stopIntervalRecording = (): void => {
    if (!isRecording) return;

    console.log('Stopping interval recording');
    setStatus('Stopping recording...');

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
    setStatus('Ready to record');

    console.log('Recording stopped');
  };

  return (
    <div className="flex flex-col items-center space-y-4 rounded-lg border bg-card p-6">
      <h3 className="text-lg font-semibold">
        Real-time Speech-to-Text Recording
      </h3>

      <div className="flex space-x-4">
        <Button
          onClick={startIntervalRecording}
          disabled={isRecording}
          variant={isRecording ? 'secondary' : 'default'}
          className="min-w-24"
        >
          {isRecording ? 'Recording...' : 'Start Recording'}
        </Button>

        <Button
          onClick={stopIntervalRecording}
          disabled={!isRecording}
          variant="destructive"
          className="min-w-24"
        >
          Stop Recording
        </Button>
      </div>

      <div className="text-center text-sm text-muted-foreground">
        <p>{status}</p>
        {isRecording && (
          <div className="flex flex-col items-center space-y-1">
            <p className="animate-pulse text-red-500">
              🔴 Recording in progress
            </p>
            {isTranscribing && (
              <p className="animate-pulse text-blue-500">
                🧠 Processing transcription...
              </p>
            )}
          </div>
        )}
      </div>

      <div className="max-w-md text-center text-xs text-muted-foreground">
        <p>
          Records system audio and microphone with real-time transcription using
          AWS SageMaker. WAV files are also saved locally for backup.
        </p>
        <p className="mt-1 text-yellow-600">
          Note: Requires AWS credentials configured for SageMaker access
        </p>
      </div>
    </div>
  );
};

export default RecordingControls;
