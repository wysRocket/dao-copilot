import { useCallback, useEffect, useState } from 'react';
import { useMultiWindowContext } from '../contexts/MultiWindowContext';
import { useWindowState } from '../contexts/WindowStateProvider';

export interface UseSharedStateReturn {
  // Shared state access
  transcripts: Array<{
    id: string;
    text: string;
    timestamp: number;
    confidence?: number;
  }>;
  isRecording: boolean;
  isProcessing: boolean;
  theme: 'light' | 'dark' | 'system';
  settings: any;

  // Shared state actions
  addTranscript: (transcript: { text: string; confidence?: number }) => void;
  clearTranscripts: () => void;
  setRecordingState: (isRecording: boolean) => void;
  setProcessingState: (isProcessing: boolean) => void;
  updateSettings: (newSettings: any) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Window-specific state
  windowState: any;
  updateLocalState: (key: string, value: any) => void;
  resetLocalState: () => void;

  // Window actions
  focusWindow: () => void;
  hideWindow: () => void;
  showWindow: () => void;

  // Cross-window communication
  sendToWindow: (targetWindowId: string, channel: string, ...args: any[]) => void;
  broadcast: (channel: string, ...args: any[]) => void;
  onMessage: (callback: (channel: string, ...args: any[]) => void) => () => void;

  // State synchronization
  syncState: () => void;
}

export const useSharedState = (): UseSharedStateReturn => {
  const multiWindowContext = useMultiWindowContext();
  const windowStateContext = useWindowState();
  
  // Extract shared state
  const {
    sharedState,
    broadcastStateChange,
    syncState,
    addTranscript,
    clearTranscripts,
    setRecordingState,
    setProcessingState,
    updateSettings,
    setTheme,
  } = multiWindowContext;

  // Extract window state
  const {
    windowState,
    updateLocalState,
    resetLocalState,
    focusWindow,
    hideWindow,
    showWindow,
  } = windowStateContext;

  // Cross-window communication helpers
  const sendToWindow = useCallback((targetWindowId: string, channel: string, ...args: any[]) => {
    window.electronWindow?.sendToWindow(targetWindowId, channel, ...args);
  }, []);

  const broadcast = useCallback((channel: string, ...args: any[]) => {
    window.electronWindow?.broadcast(channel, ...args);
  }, []);

  const onMessage = useCallback((callback: (channel: string, ...args: any[]) => void) => {
    return window.electronWindow?.onInterWindowMessage?.(callback) || (() => {});
  }, []);

  return {
    // Shared state
    transcripts: sharedState.transcripts,
    isRecording: sharedState.isRecording,
    isProcessing: sharedState.isProcessing,
    theme: sharedState.theme,
    settings: sharedState.settings,

    // Shared state actions
    addTranscript,
    clearTranscripts,
    setRecordingState,
    setProcessingState,
    updateSettings,
    setTheme,

    // Window-specific state
    windowState,
    updateLocalState,
    resetLocalState,

    // Window actions
    focusWindow,
    hideWindow,
    showWindow,

    // Cross-window communication
    sendToWindow,
    broadcast,
    onMessage,

    // State synchronization
    syncState,
  };
};

// Specialized hooks for specific use cases
export const useTranscriptionState = () => {
  const { transcripts, isRecording, isProcessing, addTranscript, clearTranscripts, setRecordingState, setProcessingState } = useSharedState();
  
  return {
    transcripts,
    isRecording,
    isProcessing,
    addTranscript,
    clearTranscripts,
    setRecordingState,
    setProcessingState,
  };
};

export const useThemeState = () => {
  const { theme, setTheme } = useSharedState();
  
  return {
    theme,
    setTheme,
  };
};

export const useSettingsState = () => {
  const { settings, updateSettings } = useSharedState();
  
  return {
    settings,
    updateSettings,
  };
};

export const useWindowCommunication = () => {
  const { sendToWindow, broadcast, onMessage, windowState } = useSharedState();
  
  return {
    sendToWindow,
    broadcast,
    onMessage,
    currentWindowId: windowState.windowId,
    currentWindowType: windowState.windowType,
  };
};
