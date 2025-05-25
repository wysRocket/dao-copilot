export interface WavOptions {
  isFloat: boolean;
  numChannels?: number;
  sampleRate?: number;
}

/**
 * Convert Float32Array audio buffer to WAV file format
 * Based on the electron-audio-capture-with-stt implementation
 */
export function renderWavFile(
  buffer: Float32Array,
  options: WavOptions,
): Uint8Array {
  // Default options
  const numChannels = options.numChannels || 1;
  const sampleRate = options.sampleRate || 44100;
  const bytesPerSample = options.isFloat ? 4 : 2;
  const format = options.isFloat ? 3 : 1; // 3 = IEEE float, 1 = PCM

  // Calculate sizes
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numFrames = buffer.length / numChannels;
  const dataSize = numFrames * blockAlign;

  /**
   * Generate WAV file header
   */
  function getWavHeader(): Uint8Array {
    const headerBuffer = new ArrayBuffer(44);
    const view = new DataView(headerBuffer);
    let offset = 0;

    // Helper functions for writing data
    const writeString = (str: string): void => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
      offset += str.length;
    };

    const writeUint32 = (value: number): void => {
      view.setUint32(offset, value, true); // little-endian
      offset += 4;
    };

    const writeUint16 = (value: number): void => {
      view.setUint16(offset, value, true); // little-endian
      offset += 2;
    };

    // WAV file header
    writeString('RIFF'); // ChunkID
    writeUint32(dataSize + 36); // ChunkSize
    writeString('WAVE'); // Format
    writeString('fmt '); // Subchunk1ID
    writeUint32(16); // Subchunk1Size (PCM)
    writeUint16(format); // AudioFormat
    writeUint16(numChannels); // NumChannels
    writeUint32(sampleRate); // SampleRate
    writeUint32(byteRate); // ByteRate
    writeUint16(blockAlign); // BlockAlign
    writeUint16(bytesPerSample * 8); // BitsPerSample
    writeString('data'); // Subchunk2ID
    writeUint32(dataSize); // Subchunk2Size

    return new Uint8Array(headerBuffer);
  }

  /**
   * Convert Float32Array to the target format
   */
  function convertAudioData(): Uint8Array {
    if (options.isFloat) {
      // Keep as float32
      return new Uint8Array(buffer.buffer);
    } else {
      // Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
      const pcmData = new Int16Array(buffer.length);

      for (let i = 0; i < buffer.length; i++) {
        // Clamp to [-1, 1] range
        const sample = Math.max(-1, Math.min(1, buffer[i]));

        // Convert to 16-bit PCM
        pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      return new Uint8Array(pcmData.buffer);
    }
  }

  // Generate header and audio data
  const headerBytes = getWavHeader();
  const audioBytes = convertAudioData();

  // Combine header and data
  const wavFile = new Uint8Array(headerBytes.length + audioBytes.length);
  wavFile.set(headerBytes, 0);
  wavFile.set(audioBytes, headerBytes.length);

  return wavFile;
}

/**
 * Get WAV file info from buffer
 */
export function getWavInfo(wavBuffer: Uint8Array): {
  sampleRate: number;
  channels: number;
  duration: number;
  format: string;
} | null {
  try {
    const view = new DataView(wavBuffer.buffer);

    // Check RIFF header
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );

    if (riff !== 'RIFF') {
      return null;
    }

    // Check WAVE format
    const wave = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11),
    );

    if (wave !== 'WAVE') {
      return null;
    }

    // Read format chunk
    const audioFormat = view.getUint16(20, true);
    const channels = view.getUint16(22, true);
    const sampleRate = view.getUint32(24, true);
    const bitsPerSample = view.getUint16(34, true);
    const dataSize = view.getUint32(40, true);

    const format =
      audioFormat === 1 ? 'PCM' : audioFormat === 3 ? 'IEEE Float' : 'Unknown';
    const duration = dataSize / (channels * (bitsPerSample / 8) * sampleRate);

    return {
      sampleRate,
      channels,
      duration,
      format,
    };
  } catch (error) {
    console.error('Failed to parse WAV info:', error);
    return null;
  }
}

/**
 * Create a download link for WAV file
 */
export function createWavDownloadUrl(wavData: Uint8Array): string {
  // Create a new Uint8Array to ensure proper typing
  const arrayBuffer = new ArrayBuffer(wavData.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  uint8Array.set(wavData);

  const blob = new Blob([uint8Array], {type: 'audio/wav'});
  return URL.createObjectURL(blob);
}

/**
 * Save WAV file using the file system API (Electron)
 */
export async function saveWavFile(
  wavData: Uint8Array,
  filepath: string,
): Promise<void> {
  if (window.nodeAPI?.writeFile) {
    await window.nodeAPI.writeFile(filepath, wavData);
  } else {
    throw new Error('File system API not available');
  }
}
