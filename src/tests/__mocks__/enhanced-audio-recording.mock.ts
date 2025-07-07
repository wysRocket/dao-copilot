/**
 * Mock implementation of EnhancedAudioRecordingService for testing
 */

import {EventEmitter} from 'events'
import {vi} from 'vitest'

export interface MockAudioState {
  isRecording: boolean
  bufferHealth: number
  latency: number
  bufferSize: number
  droppedFrames: number
}

export class MockEnhancedAudioRecordingService extends EventEmitter {
  private state: MockAudioState = {
    isRecording: false,
    bufferHealth: 0.8,
    latency: 50,
    bufferSize: 4096,
    droppedFrames: 0
  }

  private stateObservable = {
    subscribe: vi.fn((callback: (state: MockAudioState) => void) => {
      // Immediately call with current state
      callback(this.state)

      // Return mock subscription object
      return {
        unsubscribe: vi.fn()
      }
    })
  }

  constructor() {
    super()
  }

  getStateObservable() {
    return this.stateObservable
  }

  async startRecording(): Promise<void> {
    this.state.isRecording = true
    this.emit('recordingStarted')
  }

  async stopRecording(): Promise<void> {
    this.state.isRecording = false
    this.emit('recordingStopped')
  }

  isRecording(): boolean {
    return this.state.isRecording
  }

  getState(): MockAudioState {
    return {...this.state}
  }

  // Test utilities
  mockSetState(newState: Partial<MockAudioState>) {
    this.state = {...this.state, ...newState}
    // Trigger state observers
    this.stateObservable.subscribe.mock.calls.forEach(([callback]) => {
      callback(this.state)
    })
  }

  mockEmitError(error: Error) {
    this.emit('error', error)
  }

  mockBufferOverflow() {
    this.state.droppedFrames += 1
    this.emit('bufferOverflow')
  }
}

// Export a factory function for creating mock instances
export const createMockEnhancedAudioRecordingService = () => {
  return new MockEnhancedAudioRecordingService()
}
