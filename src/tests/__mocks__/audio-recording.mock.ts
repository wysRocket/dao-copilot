/**
 * Mock implementation of AudioRecordingService for testing
 */

import {EventEmitter} from 'events'

export interface MockTranscriptionResult {
  text: string
  confidence: number
  timestamp: number
  isFinal: boolean
}

export class MockAudioRecordingService extends EventEmitter {
  private isRecordingState = false

  constructor() {
    super()
  }

  async startRecording(): Promise<void> {
    this.isRecordingState = true
    this.emit('recordingStarted')
  }

  async stopRecording(): Promise<void> {
    this.isRecordingState = false
    this.emit('recordingStopped')
  }

  isRecording(): boolean {
    return this.isRecordingState
  }

  async getTranscription(): Promise<MockTranscriptionResult> {
    return {
      text: 'Mock transcription result',
      confidence: 0.95,
      timestamp: Date.now(),
      isFinal: true
    }
  }

  // Test utilities
  mockEmitTranscription(result: MockTranscriptionResult) {
    this.emit('transcriptionReceived', result)
  }

  mockEmitError(error: Error) {
    this.emit('error', error)
  }
}

// Export a factory function for creating mock instances
export const createMockAudioRecordingService = () => {
  return new MockAudioRecordingService()
}
