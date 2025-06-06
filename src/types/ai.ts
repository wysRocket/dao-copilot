// Types for AI functionality

export interface AIResponse {
  success: boolean;
  response: string;
  error?: string;
  timestamp: number;
}

export interface AIContext {
  appState: string;
  features: {
    screenMonitoring: boolean;
    audioListening: boolean;
    proactiveAssistance: boolean;
  };
  lastActivity: number;
}

export interface AIQuery {
  query: string;
  context?: string;
  timestamp: number;
}

// Global window types for AI API
declare global {
  interface Window {
    aiAPI?: {
      processQuery: (query: string, context?: string) => Promise<AIResponse>;
      getContext: () => Promise<AIContext>;
      assistant: (message: string) => Promise<string>;
    };
  }
}

export {}; // Make this a module
