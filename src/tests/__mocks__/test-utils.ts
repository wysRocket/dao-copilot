/**
 * Test utilities and helper functions for WebSocket implementation testing
 */

import {vi} from 'vitest'
import {MockEnhancedAudioRecordingService} from './enhanced-audio-recording.mock'
import {MockAudioRecordingService} from './audio-recording.mock'
import {MockGeminiLiveIntegrationService} from './gemini-live-integration.mock'

// Test data generators
export const generateMockAudioBuffer = (duration = 1000, sampleRate = 16000): ArrayBuffer => {
  const samples = Math.floor((duration * sampleRate) / 1000)
  const buffer = new ArrayBuffer(samples * 2) // 16-bit samples
  const view = new DataView(buffer)

  // Generate simple sine wave test data
  for (let i = 0; i < samples; i++) {
    const value = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 32767
    view.setInt16(i * 2, value, true)
  }

  return buffer
}

export const generateMockTranscriptionResult = (overrides = {}) => ({
  text: 'Mock transcription text',
  confidence: 0.95,
  timestamp: Date.now(),
  isFinal: true,
  ...overrides
})

export const generateMockWebSocketMessage = (type: string, data: unknown = {}) => ({
  type,
  data: JSON.stringify(data),
  timestamp: Date.now()
})

// Mock WebSocket implementation
export class MockWebSocket extends EventTarget {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  public readyState = MockWebSocket.CONNECTING
  public url: string
  public protocol: string
  public binaryType: 'blob' | 'arraybuffer' = 'arraybuffer'

  private mockMessages: (string | ArrayBuffer | Blob)[] = []
  private mockError: Error | null = null
  private mockCloseCode = 1000
  private mockCloseReason = ''

  constructor(url: string, protocols?: string | string[]) {
    super()
    this.url = url
    this.protocol = Array.isArray(protocols) ? protocols[0] : protocols || ''

    // Simulate async connection
    setTimeout(() => {
      if (this.mockError) {
        this.readyState = MockWebSocket.CLOSED
        this.dispatchEvent(new CustomEvent('error', {detail: this.mockError}))
      } else {
        this.readyState = MockWebSocket.OPEN
        this.dispatchEvent(new CustomEvent('open'))
      }
    }, 10)
  }

  send(data: string | ArrayBuffer | Blob): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }

    // Store sent messages for verification
    this.mockMessages.push(data)

    // Simulate echo response for testing
    setTimeout(() => {
      const response = typeof data === 'string' ? `Echo: ${data}` : data
      this.dispatchEvent(new CustomEvent('message', {detail: {data: response}}))
    }, 5)
  }

  close(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSING
    this.mockCloseCode = code
    this.mockCloseReason = reason

    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED
      this.dispatchEvent(
        new CustomEvent('close', {
          detail: {code: this.mockCloseCode, reason: this.mockCloseReason}
        })
      )
    }, 10)
  }

  // Test utilities
  mockReceiveMessage(data: string | ArrayBuffer): void {
    if (this.readyState === MockWebSocket.OPEN) {
      this.dispatchEvent(new CustomEvent('message', {detail: {data}}))
    }
  }

  mockConnectionError(error: Error): void {
    this.mockError = error
  }

  mockForceClose(code = 1006, reason = 'Connection lost'): void {
    this.readyState = MockWebSocket.CLOSED
    this.dispatchEvent(new CustomEvent('close', {detail: {code, reason}}))
  }

  getSentMessages(): (string | ArrayBuffer | Blob)[] {
    return [...this.mockMessages]
  }

  clearSentMessages(): void {
    this.mockMessages = []
  }
}

// Mock factory for creating test services with dependency injection
export interface TestServiceMocks {
  enhancedAudioRecording?: MockEnhancedAudioRecordingService
  audioRecording?: MockAudioRecordingService
  geminiLiveIntegration?: MockGeminiLiveIntegrationService
  webSocket?: MockWebSocket
}

export const createTestServiceMocks = (
  overrides: Partial<TestServiceMocks> = {}
): TestServiceMocks => {
  return {
    enhancedAudioRecording: new MockEnhancedAudioRecordingService(),
    audioRecording: new MockAudioRecordingService(),
    geminiLiveIntegration: new MockGeminiLiveIntegrationService(),
    webSocket: new MockWebSocket('ws://localhost:8080/test'),
    ...overrides
  }
}

// Network condition simulators
export const networkSimulators = {
  highLatency: (delay = 1000) => ({
    simulateDelay: () => new Promise(resolve => setTimeout(resolve, delay))
  }),

  packetLoss: (lossRate = 0.1) => ({
    shouldDrop: () => Math.random() < lossRate
  }),

  unstableConnection: () => ({
    shouldDisconnect: () => Math.random() < 0.05 // 5% chance of disconnection
  })
}

// Test environment setup helpers
export const setupTestEnvironment = () => {
  // Mock global WebSocket
  ;(global as any).WebSocket = MockWebSocket

  // Mock Audio APIs
  ;(global as unknown as any).AudioContext = vi.fn(() => ({
    createMediaStreamSource: vi.fn(),
    createScriptProcessor: vi.fn(),
    destination: {},
    sampleRate: 44100,
    state: 'running',
    suspend: vi.fn(),
    resume: vi.fn(),
    close: vi.fn()
  }))

  global.navigator = {
    ...global.navigator,
    mediaDevices: {
      getUserMedia: vi.fn(() =>
        Promise.resolve({
          getTracks: () => [{stop: vi.fn()}]
        })
      )
    }
  }
}

export const teardownTestEnvironment = () => {
  vi.restoreAllMocks()
}

// Performance test utilities
export const performanceTestUtils = {
  measureExecutionTime: async (fn: () => Promise<void> | void): Promise<number> => {
    const start = performance.now()
    await fn()
    const end = performance.now()
    return end - start
  },

  measureMemoryUsage: (): number => {
    // Note: This requires --expose-gc flag in Node.js
    if (global.gc) {
      global.gc()
    }
    return process.memoryUsage().heapUsed
  },

  createLoadTestData: (count: number) => {
    return Array.from({length: count}, (_, index) => ({
      id: index,
      timestamp: Date.now() + index,
      data: generateMockAudioBuffer(100) // 100ms of audio
    }))
  }
}

export {
  MockEnhancedAudioRecordingService,
  MockAudioRecordingService,
  MockGeminiLiveIntegrationService
}
