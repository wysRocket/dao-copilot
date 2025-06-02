import {ElectronAPI} from '@electron-toolkit/preload';
import {TranscriptionResult} from './services/stt-transcription';

declare global {
  interface Window {
    electron: ElectronAPI;
    api: unknown;
    nodeAPI: {
      writeFile: (path: string, data: Uint8Array) => Promise<void>;
      transcribeAudio: (audioData: Uint8Array) => Promise<TranscriptionResult>;
    };
  }
}
