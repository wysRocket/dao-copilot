import React, {useState} from 'react';
import {buffer, firstValueFrom, fromEvent, map, ObservableInput} from 'rxjs';
import {Button} from './ui/button';
import {createAudioStream} from '../services/audio-capture';
import {renderWavFile} from '../utils/wav-processor';
import {sttService, TranscriptionResult} from '../services/stt-service';

interface RecordingControlsProps {
  onTranscription?: (transcript: TranscriptionResult) => void;
}

const RecordingControls: React.FC<RecordingControlsProps> = ({
  onTranscription,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<string>('Ready to record');

  const record_wav = async (
    stop_event: ObservableInput<unknown>,
  ): Promise<void> => {
    try {
      setStatus('Processing recording...');

      const data = await firstValueFrom(
        createAudioStream().pipe(
          buffer(stop_event),
          map((chunks) => {
            const numFrames = (chunks as number[][]).reduce(
              (acc: number[], chunk: number[]) => acc.concat(chunk),
              [],
            );
            return new Float32Array(numFrames);
          }),
          map((data) =>
            renderWavFile(data, {
              isFloat: false,
              numChannels: 1,
              sampleRate: 44100,
            }),
          ),
        ),
      );

      setStatus('Saving recording...');
      console.log('Writing meeting recording...');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `meeting-recording-${timestamp}.wav`;

      await window.nodeAPI.writeFile(filename, data as Uint8Array);
      setStatus(`Recording saved: ${filename}`);

      // Process transcription if callback provided
      if (onTranscription) {
        setStatus('Transcribing audio...');
        sttService.transcribeFile(filename).subscribe({
          next: (transcript) => {
            onTranscription(transcript);
            setStatus(
              `Recording complete. Transcription: "${transcript.text.substring(0, 50)}..."`,
            );
          },
          error: (error) => {
            console.error('Transcription error:', error);
            setStatus(
              `Recording saved, but transcription failed: ${error.message}`,
            );
          },
        });
      }
    } catch (error) {
      console.error('Recording error:', error);
      setStatus(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  };

  const handleStartRecording = () => {
    if (isRecording) return;

    setIsRecording(true);
    setStatus('Recording... Click Stop to finish');

    // Create stop button reference for the observable
    const stopButton = document.getElementById('stopRecordingButton');
    if (stopButton) {
      const stopEvent = fromEvent(stopButton, 'click');
      record_wav(stopEvent).finally(() => {
        setIsRecording(false);
      });
    }
  };

  const handleStopRecording = () => {
    // The stop event is handled by the fromEvent observable
    // This just provides visual feedback
    setStatus('Stopping recording...');
  };

  return (
    <div className="bg-card flex flex-col items-center space-y-4 rounded-lg border p-6">
      <h3 className="text-lg font-semibold">Meeting Recording</h3>

      <div className="flex space-x-4">
        <Button
          onClick={handleStartRecording}
          disabled={isRecording}
          variant={isRecording ? 'secondary' : 'default'}
          className="min-w-24"
        >
          {isRecording ? 'Recording...' : 'Start Recording'}
        </Button>

        <Button
          id="stopRecordingButton"
          onClick={handleStopRecording}
          disabled={!isRecording}
          variant="destructive"
          className="min-w-24"
        >
          Stop Recording
        </Button>
      </div>

      <div className="text-muted-foreground text-center text-sm">
        <p>{status}</p>
        {isRecording && (
          <p className="animate-pulse text-red-500">🔴 Recording in progress</p>
        )}
      </div>

      <div className="text-muted-foreground max-w-md text-center text-xs">
        <p>Records system audio and microphone. WAV files are saved locally.</p>
      </div>
    </div>
  );
};

export default RecordingControls;
