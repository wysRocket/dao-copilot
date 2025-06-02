import {ElectronAPI} from '@electron-toolkit/preload';
import {TranscriptionResult} from './services/main-stt-transcription';

declare global {
  interface Window {
    electron: ElectronAPI;
    api: unknown;
    audioAPI: {
      bufferAlloc: (size: number) => Buffer;
      writeFile: (path: string, data: Uint8Array) => Promise<void>;
      readFile: (path: string) => Promise<Uint8Array>;
      requestAudioPermissions: () => Promise<void>;
    };
    transcriptionAPI: {
      transcribeAudio: (audioData: Uint8Array) => Promise<TranscriptionResult>;
    };
    themeAPI: {
      setTheme: (theme: 'light' | 'dark' | 'system') => void;
      getTheme: () => Promise<string>;
      onThemeChanged: (callback: (theme: string) => void) => void;
    };
    windowAPI: {
      minimize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      maximize: () => void;
      unmaximize: () => void;
    };
  }
}
