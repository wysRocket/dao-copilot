import {ElectronAPI} from '@electron-toolkit/preload';
import {TranscriptionResult} from './services/main-stt-transcription';

export interface MCPServer {
  name: string;
  command: string;
  args: string[];
  source: 'cursor' | 'windsurf';
}

export interface MCPServersResponse {
  servers: MCPServer[];
  error?: string;
}

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
      testStreamingIPC: () => Promise<{success: boolean; message?: string; error?: string}>;
    };
    themeAPI: {
      setTheme: (theme: 'light' | 'dark' | 'system') => void;
      getTheme: () => Promise<string>;
      onThemeChanged: (callback: (theme: string) => void) => void;
    };
    mcpAPI: {
      getServers: () => Promise<MCPServersResponse>;
    };
    windowAPI: {
      minimize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      maximize: () => void;
      unmaximize: () => void;
    };
    electronWindow: {
      // Existing window controls
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      
      // Multi-window management
      createWindow: (type: string, config?: any) => Promise<string>;
      showWindow: (windowId: string) => void;
      hideWindow: (windowId: string) => void;
      focusWindow: (windowId: string) => void;
      getAllWindows: () => Promise<any[]>;
      getWindowInfo: (windowId?: string) => Promise<any>;
      
      // Inter-window communication
      sendToWindow: (targetWindowId: string, channel: string, ...args: any[]) => void;
      sendInterWindowMessage: (channel: string, ...args: any[]) => void;
      broadcast: (channel: string, ...args: any[]) => void;
      
      // Event listeners
      onWindowStateChanged: (callback: (windowInfo: any) => void) => () => void;
      onWindowInfo: (callback: (windowInfo: any) => void) => () => void;
      onInterWindowMessage: (callback: (channel: string, ...args: any[]) => void) => () => void;
    };
  }
}
