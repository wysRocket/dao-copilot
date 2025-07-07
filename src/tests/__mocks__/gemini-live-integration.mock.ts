/**
 * Mock implementation of GeminiLiveIntegrationService for testing
 */

import {EventEmitter} from 'events'

export interface MockGeminiConnectionState {
  isConnected: boolean
  connectionQuality: 'good' | 'fair' | 'poor' | 'disconnected'
  sessionId?: string
}

export interface MockGeminiMessage {
  type: 'text' | 'audio' | 'control'
  content: string | ArrayBuffer
  timestamp: number
}

export class MockGeminiLiveIntegrationService extends EventEmitter {
  private connectionState: MockGeminiConnectionState = {
    isConnected: false,
    connectionQuality: 'disconnected'
  }

  constructor() {
    super()
  }

  async connect(apiKey: string): Promise<void> {
    if (!apiKey) {
      throw new Error('API key is required')
    }

    this.connectionState.isConnected = true
    this.connectionState.connectionQuality = 'good'
    this.connectionState.sessionId = 'mock-session-' + Date.now()

    this.emit('connected', this.connectionState.sessionId)
  }

  async disconnect(): Promise<void> {
    this.connectionState.isConnected = false
    this.connectionState.connectionQuality = 'disconnected'
    this.connectionState.sessionId = undefined

    this.emit('disconnected')
  }

  isConnected(): boolean {
    return this.connectionState.isConnected
  }

  getConnectionState(): MockGeminiConnectionState {
    return {...this.connectionState}
  }

  async sendMessage(message: MockGeminiMessage): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Gemini service')
    }

    // Simulate message processing delay
    setTimeout(() => {
      this.emit('messageReceived', {
        type: 'text',
        content: `Echo: ${message.content}`,
        timestamp: Date.now()
      })
    }, 10)
  }

  async sendAudioData(): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to Gemini service')
    }

    // Simulate transcription response
    setTimeout(() => {
      this.emit('transcriptionReceived', {
        text: 'Mock transcription from audio',
        confidence: 0.9,
        isFinal: false,
        timestamp: Date.now()
      })
    }, 50)
  }

  // Test utilities
  mockSetConnectionState(state: Partial<MockGeminiConnectionState>) {
    this.connectionState = {...this.connectionState, ...state}
  }

  mockEmitError(error: Error) {
    this.emit('error', error)
  }

  mockEmitConnectionLoss() {
    this.connectionState.isConnected = false
    this.connectionState.connectionQuality = 'disconnected'
    this.emit('connectionLost')
  }

  mockEmitTranscription(text: string, isFinal = false) {
    this.emit('transcriptionReceived', {
      text,
      confidence: 0.95,
      isFinal,
      timestamp: Date.now()
    })
  }
}

// Export a factory function for creating mock instances
export const createMockGeminiLiveIntegrationService = () => {
  return new MockGeminiLiveIntegrationService()
}
