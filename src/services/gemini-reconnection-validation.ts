/**
 * Simple validation test for ReconnectionManager integration
 */

import { GeminiLiveWebSocketClient } from './gemini-live-websocket'
import { ReconnectionStrategy } from './gemini-reconnection-manager'

// Mock WebSocket globally for Node.js environment
global.WebSocket = class MockWebSocket {
  public onopen: ((event: Event) => void) | null = null
  public onmessage: ((event: MessageEvent) => void) | null = null
  public onerror: ((event: Event) => void) | null = null
  public onclose: ((event: any) => void) | null = null // Use any to avoid CloseEvent issues
  public readyState: number = 1 // OPEN
  
  constructor(public url: string) {}
  send() {}
  close() {}
  
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
} as any

console.log('🧪 Testing ReconnectionManager Integration...')

try {
  // Test 1: Basic instantiation
  const client = new GeminiLiveWebSocketClient({
    apiKey: 'test-api-key',
    reconnectAttempts: 3,
    reconnectionStrategy: ReconnectionStrategy.EXPONENTIAL,
    reconnectionBaseDelay: 500,
    reconnectionMaxDelay: 2000
  })

  console.log('✅ Client instantiated successfully')

  // Test 2: Configuration access
  const metrics = client.getReconnectionMetrics()
  const state = client.getReconnectionState()
  const history = client.getConnectionHistory()

  console.log('✅ Reconnection data access working')
  console.log('📊 Initial metrics:', {
    quality: metrics.connectionQuality,
    attempts: state.attemptCount,
    historyLength: history.length
  })

  // Test 3: Configuration update
  client.updateReconnectionConfig({
    maxAttempts: 5,
    strategy: ReconnectionStrategy.LINEAR
  })

  console.log('✅ Configuration update successful')

  // Test 4: Data export
  const exportedData = client.exportData()
  console.log('✅ Data export working')
  console.log('📋 Export includes:', Object.keys(exportedData))

  // Cleanup
  client.destroy()
  console.log('✅ Cleanup successful')

  console.log('🎉 All ReconnectionManager integration tests passed!')
  
} catch (error) {
  console.error('❌ Test failed:', error)
  process.exit(1)
}
