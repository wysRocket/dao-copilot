/**
 * Integration test for Gemini Live WebSocket Client with ReconnectionManager
 * Tests the integrated reconnection functionality
 */

import { GeminiLiveWebSocketClient } from './gemini-live-websocket'
import { ReconnectionStrategy } from './gemini-reconnection-manager'

// Mock WebSocket for testing
class MockWebSocket {
  public onopen: ((event: Event) => void) | null = null
  public onmessage: ((event: MessageEvent) => void) | null = null
  public onerror: ((event: Event) => void) | null = null
  public onclose: ((event: CloseEvent) => void) | null = null
  public readyState: number = WebSocket.CONNECTING
  
  constructor(public url: string) {
    // Simulate connection after a short delay
    setTimeout(() => {
      this.readyState = WebSocket.OPEN
      this.onopen?.(new Event('open'))
    }, 100)
  }

  send(data: string): void {
    console.log('Mock WebSocket sending:', data.substring(0, 100))
  }

  close(code?: number, reason?: string): void {
    this.readyState = WebSocket.CLOSED
    this.onclose?.(new CloseEvent('close', { code: code || 1000, reason: reason || '' }))
  }

  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
}

global.WebSocket = MockWebSocket as unknown as typeof WebSocket

/**
 * Test basic reconnection functionality
 */
async function testBasicReconnection(): Promise<void> {
  console.log('🧪 Testing basic reconnection...')
  
  const client = new GeminiLiveWebSocketClient({
    apiKey: 'test-api-key',
    reconnectAttempts: 3,
    reconnectionStrategy: ReconnectionStrategy.EXPONENTIAL,
    reconnectionBaseDelay: 500,
    reconnectionMaxDelay: 2000
  })

  let reconnectionStarted = false
  let connectionEstablished = false

  client.on('connected', () => {
    console.log('✅ Connection established')
    connectionEstablished = true
  })

  client.on('reconnectionStarted', (data) => {
    console.log(`🔄 Reconnection started: attempt ${data.attempt}, delay ${data.delay}ms`)
    reconnectionStarted = true
  })

  client.on('connectionQualityUpdate', (metrics) => {
    console.log('📊 Connection quality:', metrics.connectionQuality)
  })

  client.on('error', (error) => {
    console.log('❌ Error:', error.message)
  })

  try {
    // Connect
    await client.connect()
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 200))
    
    if (!connectionEstablished) {
      throw new Error('Initial connection failed')
    }

    // Simulate connection loss
    console.log('💥 Simulating connection loss...')
    const mockWs = (client as unknown as { ws: MockWebSocket }).ws
    mockWs.onerror?.(new Event('error'))

    // Wait for reconnection attempt
    await new Promise(resolve => setTimeout(resolve, 1000))

    if (!reconnectionStarted) {
      throw new Error('Reconnection was not started')
    }

    console.log('✅ Basic reconnection test passed')
  } finally {
    client.destroy()
  }
}

/**
 * Test connection quality monitoring
 */
async function testConnectionQuality(): Promise<void> {
  console.log('🧪 Testing connection quality monitoring...')
  
  const client = new GeminiLiveWebSocketClient({
    apiKey: 'test-api-key',
    reconnectAttempts: 5,
    reconnectionStrategy: ReconnectionStrategy.LINEAR,
    reconnectionBaseDelay: 200
  })

  let qualityUpdates = 0

  client.on('connectionQualityUpdate', (metrics) => {
    console.log(`📊 Quality update ${++qualityUpdates}:`, {
      quality: metrics.connectionQuality,
      successfulConnections: metrics.successfulConnections,
      avgDuration: metrics.averageConnectionDuration
    })
  })

  try {
    // Connect and disconnect multiple times to test quality monitoring
    for (let i = 0; i < 3; i++) {
      await client.connect()
      await new Promise(resolve => setTimeout(resolve, 100))
      await client.disconnect()
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const metrics = client.getReconnectionMetrics()
    console.log('📈 Final metrics:', {
      quality: metrics.connectionQuality,
      totalConnections: metrics.successfulConnections,
      uptime: metrics.totalUptime,
      avgDuration: metrics.averageConnectionDuration
    })

    if (qualityUpdates === 0) {
      throw new Error('No quality updates received')
    }

    console.log('✅ Connection quality test passed')
  } finally {
    client.destroy()
  }
}

/**
 * Test different reconnection strategies
 */
async function testReconnectionStrategies(): Promise<void> {
  console.log('🧪 Testing reconnection strategies...')

  const strategies = [
    ReconnectionStrategy.EXPONENTIAL,
    ReconnectionStrategy.LINEAR,
    ReconnectionStrategy.FIBONACCI
  ]

  for (const strategy of strategies) {
    console.log(`🔄 Testing ${strategy} strategy...`)
    
    const client = new GeminiLiveWebSocketClient({
      apiKey: 'test-api-key',
      reconnectAttempts: 2,
      reconnectionStrategy: strategy,
      reconnectionBaseDelay: 100,
      reconnectionMaxDelay: 1000,
      enableJitter: false // Disable jitter for predictable delays
    })

    const delays: number[] = []

    client.on('reconnectionStarted', (data) => {
      delays.push(data.delay)
      console.log(`  Attempt ${data.attempt}: ${data.delay}ms delay`)
    })

    try {
      await client.connect()
      await new Promise(resolve => setTimeout(resolve, 150))

      // Trigger reconnection attempts
      const mockWs = (client as unknown as { ws: MockWebSocket }).ws
      mockWs.onerror?.(new Event('error'))
      
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Trigger another failure
      mockWs.onerror?.(new Event('error'))
      
      await new Promise(resolve => setTimeout(resolve, 300))

      if (delays.length === 0) {
        throw new Error(`No reconnection attempts for ${strategy}`)
      }

      console.log(`  ${strategy} delays:`, delays)
    } finally {
      client.destroy()
    }
  }

  console.log('✅ Reconnection strategies test passed')
}

/**
 * Test reconnection configuration updates
 */
async function testConfigurationUpdates(): Promise<void> {
  console.log('🧪 Testing configuration updates...')
  
  const client = new GeminiLiveWebSocketClient({
    apiKey: 'test-api-key',
    reconnectAttempts: 2,
    reconnectionStrategy: ReconnectionStrategy.EXPONENTIAL
  })

  let configUpdated = false

  client.on('reconnectionConfigUpdated', (config) => {
    console.log('⚙️ Configuration updated:', config)
    configUpdated = true
  })

  try {
    // Update configuration
    client.updateReconnectionConfig({
      maxAttempts: 5,
      strategy: ReconnectionStrategy.LINEAR,
      baseDelay: 300
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    if (!configUpdated) {
      throw new Error('Configuration update event not received')
    }

    const state = client.getReconnectionState()
    console.log('🔧 Reconnection state:', state)

    console.log('✅ Configuration updates test passed')
  } finally {
    client.destroy()
  }
}

/**
 * Test data export functionality
 */
async function testDataExport(): Promise<void> {
  console.log('🧪 Testing data export...')
  
  const client = new GeminiLiveWebSocketClient({
    apiKey: 'test-api-key',
    reconnectAttempts: 3
  })

  try {
    await client.connect()
    await new Promise(resolve => setTimeout(resolve, 200))
    await client.disconnect()

    const exportedData = client.exportData()
    
    console.log('📋 Exported data structure:', {
      hasConnectionState: 'connectionState' in exportedData,
      hasConfig: 'config' in exportedData,
      hasErrorStats: 'errorStats' in exportedData,
      hasReconnection: 'reconnection' in exportedData,
      reconnectionKeys: Object.keys(exportedData.reconnection || {})
    })

    if (!exportedData.connectionState || !exportedData.config || !exportedData.reconnection) {
      throw new Error('Exported data is missing required fields')
    }

    console.log('✅ Data export test passed')
  } finally {
    client.destroy()
  }
}

/**
 * Run all integration tests
 */
async function runAllTests(): Promise<void> {
  console.log('🚀 Starting Gemini Live WebSocket ReconnectionManager Integration Tests...\n')

  const tests = [
    testBasicReconnection,
    testConnectionQuality,
    testReconnectionStrategies,
    testConfigurationUpdates,
    testDataExport
  ]

  let passed = 0
  let failed = 0

  for (const test of tests) {
    try {
      await test()
      passed++
      console.log()
    } catch (error) {
      console.error(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`)
      failed++
      console.log()
    }
  }

  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`)
  
  if (failed > 0) {
    process.exit(1)
  } else {
    console.log('🎉 All tests passed!')
    process.exit(0)
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('💥 Test suite failed:', error)
    process.exit(1)
  })
}

export {
  testBasicReconnection,
  testConnectionQuality,
  testReconnectionStrategies,
  testConfigurationUpdates,
  testDataExport,
  runAllTests
}
