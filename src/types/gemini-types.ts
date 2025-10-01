/**
 * Shared types for Gemini Live API integration
 * This file contains only types and enums that can be safely imported in both main and renderer processes
 */

export enum TranscriptionMode {
  WEBSOCKET = 'websocket',
  BATCH = 'batch', 
  HYBRID = 'hybrid'
}

export enum MessageType {
  // Outgoing message types
  CLIENT_CONTENT = 'client_content',
  REALTIME_INPUT = 'realtime_input',
  PING = 'ping',
  SETUP = 'setup',

  // Incoming message types
  SERVER_CONTENT = 'server_content',
  MODEL_TURN = 'model_turn',
  TURN_COMPLETE = 'turn_complete',
  AUDIO_DATA = 'audio_data',
  PONG = 'pong',
  ERROR = 'error',
  SETUP_COMPLETE = 'setup_complete'
}

export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3
}

export interface MessageMetadata {
  id: string
  timestamp: number
  type: MessageType
  priority: MessagePriority
  retryCount?: number
  maxRetries?: number
  timeout?: number
}