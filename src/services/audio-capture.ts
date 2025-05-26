import {Observable} from 'rxjs';

export interface AudioCaptureOptions {
  sampleRate?: number;
  channels?: number;
  mergeSystemAndMic?: boolean;
}

export class AudioCapturer {
  private recording_stream?: MediaStream;
  private audio_context?: AudioContext;
  private workletNode?: AudioWorkletNode;

  /**
   * Get microphone audio stream
   */
  private async getMicrophoneAudio(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 44100,
      },
      video: false,
    });
  }

  /**
   * Get system audio stream using display media
   */
  private async getSystemAudio(): Promise<MediaStream> {
    return navigator.mediaDevices.getDisplayMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
        sampleRate: 44100,
      },
      video: {
        width: 320,
        height: 240,
        frameRate: 1, // Minimal video for audio capture
      },
    });
  }

  /**
   * Merge system audio and microphone streams
   */
  private mergeAudioStreams(
    audioContext: AudioContext,
    systemStream: MediaStream,
    micStream: MediaStream,
  ): MediaStreamTrack[] {
    // Create audio sources
    const systemSource = audioContext.createMediaStreamSource(systemStream);
    const micSource = audioContext.createMediaStreamSource(micStream);
    const destination = audioContext.createMediaStreamDestination();

    // Create gain nodes for volume control
    const systemGain = audioContext.createGain();
    const micGain = audioContext.createGain();

    // Set initial gain levels
    systemGain.gain.value = 0.8; // System audio slightly lower
    micGain.gain.value = 1.0; // Microphone at full

    // Connect audio graph
    systemSource.connect(systemGain);
    micSource.connect(micGain);
    systemGain.connect(destination);
    micGain.connect(destination);

    return destination.stream.getAudioTracks();
  }

  /**
   * Get sample rate from media stream
   */
  private getSampleRate(stream: MediaStream): number {
    const track = stream.getAudioTracks()[0];
    return track.getSettings().sampleRate || 44100;
  }

  /**
   * Start audio recording with real-time callback
   */
  async startRecording(
    callback: (audioBuffer: number[]) => void,
    options: AudioCaptureOptions = {},
  ): Promise<void> {
    if (this.recording_stream) {
      console.warn('Recording already in progress');
      return;
    }

    const sampleRate = options.sampleRate || 44100;

    try {
      // Initialize audio context
      this.audio_context = new AudioContext({sampleRate});

      // Get audio streams
      const systemAudio = await this.getSystemAudio();
      const micAudio = await this.getMicrophoneAudio();

      // Create combined stream
      this.recording_stream = new MediaStream(
        options.mergeSystemAndMic !== false
          ? this.mergeAudioStreams(this.audio_context, systemAudio, micAudio)
          : micAudio.getAudioTracks(), // Microphone only
      );

      // Create audio source
      const audioSource = this.audio_context.createMediaStreamSource(
        this.recording_stream,
      );

      // Load and create AudioWorklet
      // Import worklet as a URL for proper Vite bundling
      const workletModule = await import('./wave-loopback.ts?url');
      await this.audio_context.audioWorklet.addModule(workletModule.default);

      this.workletNode = new AudioWorkletNode(
        this.audio_context,
        'wave-loopback',
      );

      // Handle audio data from worklet
      this.workletNode.port.onmessage = (event): void => {
        const audioBuffer = event.data as number[];
        if (audioBuffer && audioBuffer.length > 0) {
          callback(audioBuffer);
        }
      };

      // Connect audio nodes
      audioSource.connect(this.workletNode);
      this.workletNode.connect(this.audio_context.destination);

      console.log('Audio recording started');
    } catch (error) {
      console.error('Failed to start audio recording:', error);
      await this.stopRecording();
      throw error;
    }
  }

  /**
   * Stop audio recording
   */
  async stopRecording(): Promise<void> {
    if (this.recording_stream) {
      // Stop all tracks
      this.recording_stream.getTracks().forEach((track) => {
        track.stop();
      });
      this.recording_stream = undefined;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = undefined;
    }

    if (this.audio_context) {
      await this.audio_context.close();
      this.audio_context = undefined;
    }

    console.log('Audio recording stopped');
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return !!this.recording_stream;
  }

  /**
   * Get current audio context state
   */
  getAudioContextState(): AudioContextState | null {
    return this.audio_context?.state || null;
  }
}

/**
 * Create an Observable stream of audio data
 */
export function createAudioStream(
  options: AudioCaptureOptions = {},
): Observable<number[]> {
  const capturer = new AudioCapturer();

  return new Observable<number[]>((subscriber) => {
    capturer
      .startRecording((audioBuffer) => {
        subscriber.next(audioBuffer);
      }, options)
      .catch((error) => {
        subscriber.error(error);
      });

    // Cleanup function
    return (): void => {
      capturer.stopRecording().catch(console.error);
      subscriber.complete();
    };
  });
}

// Export types
