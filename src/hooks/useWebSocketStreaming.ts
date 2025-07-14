import { useState, useEffect, useCallback, useRef } from 'react';
import { EventEmitter } from 'events';
import { useStreamingText, StreamingTextConfig } from './useStreamingText';
import TextStreamBuffer from '../services/TextStreamBuffer';

/**
 * WebSocket connection states
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

/**
 * WebSocket message types for streaming text
 */
export interface WebSocketMessage {
  type: 'transcription' | 'text' | 'setup' | 'serverContent' | 'turnComplete';
  content?: string;
  metadata?: {
    isPartial?: boolean;
    confidence?: number;
    source?: string;
    duration?: number;
    [key: string]: unknown;
  };
}

/**
 * Configuration for WebSocket streaming
 */
export interface WebSocketStreamingConfig extends StreamingTextConfig {
  /** Auto-reconnect on connection loss */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Reconnection delay in milliseconds */
  reconnectDelay?: number;
  /** Enable heartbeat to keep connection alive */
  enableHeartbeat?: boolean;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
  /** Filter message types to process */
  messageFilter?: string[];
}

/**
 * WebSocket streaming state
 */
export interface WebSocketStreamingState {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Currently displayed streaming text */
  streamingText: string;
  /** Whether the current text is partial */
  isPartial: boolean;
  /** Whether text animation is running */
  isAnimating: boolean;
  /** Whether there are recent corrections */
  hasCorrections: boolean;
  /** Connection quality indicator */
  connectionQuality: 'good' | 'poor' | 'unstable';
  /** Number of reconnection attempts */
  reconnectAttempts: number;
  /** Last error message */
  lastError: string | null;
  /** Message statistics */
  messageStats: {
    total: number;
    partial: number;
    final: number;
    corrections: number;
  };
}

/**
 * WebSocket streaming controls
 */
export interface WebSocketStreamingControls {
  /** Connect to WebSocket */
  connect: (url?: string) => Promise<void>;
  /** Disconnect from WebSocket */
  disconnect: () => void;
  /** Send a message through WebSocket */
  sendMessage: (message: WebSocketMessage) => void;
  /** Clear all streaming text */
  clearText: () => void;
  /** Force reconnection */
  reconnect: () => Promise<void>;
  /** Update configuration */
  updateConfig: (config: Partial<WebSocketStreamingConfig>) => void;
}

/**
 * Default configuration for WebSocket streaming
 */
const defaultConfig: Required<WebSocketStreamingConfig> = {
  animationSpeed: 40,
  debounceDelay: 80,
  enableAnimation: true,
  animationMode: 'character',
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelay: 2000,
  enableHeartbeat: true,
  heartbeatInterval: 30000,
  messageFilter: ['transcription', 'text', 'serverContent'],
  onAnimationComplete: () => {},
  onTextUpdate: () => {},
};

/**
 * Custom React hook for WebSocket streaming text integration
 * 
 * This hook connects streaming text components to WebSocket events,
 * handling connection management, message parsing, and real-time text updates.
 */
export const useWebSocketStreaming = (
  config: WebSocketStreamingConfig = {}
): [WebSocketStreamingState, WebSocketStreamingControls] => {
  const mergedConfig = { ...defaultConfig, ...config };
  
  // State management
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'poor' | 'unstable'>('good');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [messageStats, setMessageStats] = useState({
    total: 0,
    partial: 0,
    final: 0,
    corrections: 0,
  });
  
  // Refs for managing connections and timers
  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamBufferRef = useRef<TextStreamBuffer | null>(null);
  const eventEmitterRef = useRef<EventEmitter | null>(null);
  const urlRef = useRef<string>('');
  
  // Use streaming text hook
  const [streamingState, streamingControls] = useStreamingText({
    animationSpeed: mergedConfig.animationSpeed,
    debounceDelay: mergedConfig.debounceDelay,
    enableAnimation: mergedConfig.enableAnimation,
    animationMode: mergedConfig.animationMode,
    onAnimationComplete: mergedConfig.onAnimationComplete,
    onTextUpdate: mergedConfig.onTextUpdate,
  });
  
  // Initialize text stream buffer
  useEffect(() => {
    streamBufferRef.current = new TextStreamBuffer({
      debounceDelay: mergedConfig.debounceDelay,
      autoFlush: true,
      enableCorrectionDetection: true,
      maxChunks: 500,
    });
    
    eventEmitterRef.current = new EventEmitter();
    
    // Subscribe to buffer events
    const unsubscribe = streamBufferRef.current.subscribe('textUpdate', (text, isPartial) => {
      streamingControls.updateText(text, isPartial);
    });
    
    return () => {
      unsubscribe();
      if (streamBufferRef.current) {
        streamBufferRef.current.destroy();
      }
      if (eventEmitterRef.current) {
        eventEmitterRef.current.removeAllListeners();
      }
    };
  }, [mergedConfig.debounceDelay, streamingControls]);
  
  /**
   * Update connection state and sync with streaming text hook
   */
  const updateConnectionState = useCallback((state: ConnectionState) => {
    setConnectionState(state);
    
    // Map connection states to streaming text hook states
    const mappedState = state === 'reconnecting' ? 'connecting' : state;
    streamingControls.setConnectionState(mappedState);
    
    if (eventEmitterRef.current) {
      eventEmitterRef.current.emit('connectionStateChange', state);
    }
  }, [streamingControls]);
  
  /**
   * Process incoming WebSocket messages
   */
  const processMessage = useCallback((message: WebSocketMessage) => {
    // Filter messages based on configuration
    if (!mergedConfig.messageFilter.includes(message.type)) {
      return;
    }
    
    // Update message statistics
    setMessageStats(prev => ({
      ...prev,
      total: prev.total + 1,
      partial: message.metadata?.isPartial ? prev.partial + 1 : prev.partial,
      final: !message.metadata?.isPartial ? prev.final + 1 : prev.final,
    }));
    
    // Process text content
    if (message.content && streamBufferRef.current) {
      const isPartial = message.metadata?.isPartial || false;
      streamBufferRef.current.addText(message.content, isPartial);
      
      // Detect corrections
      if (message.metadata?.correctedFrom) {
        setMessageStats(prev => ({ ...prev, corrections: prev.corrections + 1 }));
      }
    }
    
    // Emit event for external listeners
    if (eventEmitterRef.current) {
      eventEmitterRef.current.emit('message', message);
    }
  }, [mergedConfig.messageFilter]);
  
  /**
   * Handle WebSocket message events
   */
  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      
      // Convert various message formats to standardized format
      let message: WebSocketMessage;
      
      if (data.serverContent && data.serverContent.modelTurn) {
        // Gemini Live API format
        const parts = data.serverContent.modelTurn.parts || [];
        const textPart = parts.find((part: { text?: string }) => part.text);
        
        if (textPart) {
          message = {
            type: 'serverContent',
            content: textPart.text,
            metadata: {
              isPartial: !data.serverContent.turnComplete,
              source: 'gemini-live',
            },
          };
        } else {
          return; // No text content
        }
      } else if (data.type === 'transcription' || data.type === 'text') {
        // Direct transcription format
        message = {
          type: data.type,
          content: data.content || data.text,
          metadata: {
            isPartial: data.isPartial || data.partial,
            confidence: data.confidence,
            source: data.source,
            duration: data.duration,
          },
        };
      } else {
        // Unknown format, skip
        return;
      }
      
      processMessage(message);
      
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      setLastError(`Message parsing error: ${error}`);
    }
  }, [processMessage]);
  
  /**
   * Handle WebSocket connection events
   */
  const setupWebSocketEventListeners = useCallback((ws: WebSocket) => {
    ws.onopen = () => {
      updateConnectionState('connected');
      setReconnectAttempts(0);
      setLastError(null);
      setConnectionQuality('good');
      
      // Start heartbeat if enabled
      if (mergedConfig.enableHeartbeat) {
        heartbeatTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, mergedConfig.heartbeatInterval);
      }
    };
    
    ws.onclose = (event) => {
      updateConnectionState('disconnected');
      
      // Clear heartbeat
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      
      // Attempt reconnection if enabled
      if (mergedConfig.autoReconnect && reconnectAttempts < mergedConfig.maxReconnectAttempts && !event.wasClean) {
        updateConnectionState('reconnecting');
        setReconnectAttempts(prev => prev + 1);
        
        reconnectTimerRef.current = setTimeout(() => {
          connect(urlRef.current);
        }, mergedConfig.reconnectDelay);
      }
    };
    
    ws.onerror = (error) => {
      updateConnectionState('error');
      setLastError(`WebSocket error: ${error}`);
      setConnectionQuality('poor');
    };
    
    ws.onmessage = handleWebSocketMessage;
  }, [updateConnectionState, reconnectAttempts, mergedConfig, handleWebSocketMessage]);
  
  /**
   * Connect to WebSocket
   */
  const connect = useCallback(async (url?: string) => {
    if (url) {
      urlRef.current = url;
    }
    
    if (!urlRef.current) {
      throw new Error('WebSocket URL is required');
    }
    
    // Disconnect existing connection
    if (websocketRef.current) {
      websocketRef.current.close();
    }
    
    updateConnectionState('connecting');
    
    try {
      const ws = new WebSocket(urlRef.current);
      websocketRef.current = ws;
      setupWebSocketEventListeners(ws);
      
      // Wait for connection to open
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);
        
        ws.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
        
        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Connection failed'));
        };
      });
      
    } catch (error) {
      updateConnectionState('error');
      setLastError(`Connection failed: ${error}`);
      throw error;
    }
  }, [setupWebSocketEventListeners, updateConnectionState]);
  
  /**
   * Disconnect from WebSocket
   */
  const disconnect = useCallback(() => {
    // Clear timers
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    
    // Close WebSocket
    if (websocketRef.current) {
      websocketRef.current.close(1000, 'Disconnected by user');
      websocketRef.current = null;
    }
    
    updateConnectionState('disconnected');
    setReconnectAttempts(0);
    setLastError(null);
  }, [updateConnectionState]);
  
  /**
   * Send message through WebSocket
   */
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify(message));
    } else {
      setLastError('WebSocket is not connected');
    }
  }, []);
  
  /**
   * Clear all streaming text
   */
  const clearText = useCallback(() => {
    if (streamBufferRef.current) {
      streamBufferRef.current.clear();
    }
    streamingControls.clearText();
    setMessageStats({ total: 0, partial: 0, final: 0, corrections: 0 });
  }, [streamingControls]);
  
  /**
   * Force reconnection
   */
  const reconnect = useCallback(async () => {
    disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay
    return connect();
  }, [disconnect, connect]);
  
  /**
   * Update configuration
   */
  const updateConfig = useCallback((newConfig: Partial<WebSocketStreamingConfig>) => {
    Object.assign(mergedConfig, newConfig);
  }, [mergedConfig]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
  
  // State object
  const state: WebSocketStreamingState = {
    connectionState,
    streamingText: streamingState.displayedText,
    isPartial: streamingState.isPartial,
    isAnimating: streamingState.isAnimating,
    hasCorrections: streamingState.hasCorrection,
    connectionQuality,
    reconnectAttempts,
    lastError,
    messageStats,
  };
  
  // Controls object
  const controls: WebSocketStreamingControls = {
    connect,
    disconnect,
    sendMessage,
    clearText,
    reconnect,
    updateConfig,
  };
  
  return [state, controls];
};

export default useWebSocketStreaming;
