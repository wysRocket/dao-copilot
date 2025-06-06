import {contextBridge, ipcRenderer} from 'electron';
import {
  AI_ASSISTANT_CHANNEL,
  AI_PROCESS_QUERY_CHANNEL,
  AI_GET_CONTEXT_CHANNEL,
} from './ai-channels';

export function exposeAIContext() {
  try {
    const globalWindow = window as unknown as Record<string, unknown>;
    if (!globalWindow.aiAPI) {
      contextBridge.exposeInMainWorld('aiAPI', {
        processQuery: (query: string, context?: string) =>
          ipcRenderer.invoke(AI_PROCESS_QUERY_CHANNEL, query, context),
        getContext: () => ipcRenderer.invoke(AI_GET_CONTEXT_CHANNEL),
        // For future AI assistant features
        assistant: (message: string) =>
          ipcRenderer.invoke(AI_ASSISTANT_CHANNEL, message),
      });
    }
  } catch (error) {
    console.error('Error exposing AI context:', error);
  }
}
