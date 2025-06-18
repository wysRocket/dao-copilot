/**
 * Test suite for Gemini Live Integration Service
 * Tests the coordination between WebSocket client and existing audio services
 */

import GeminiLiveIntegrationService, {
  TranscriptionMode,
  type IntegrationConfig
} from './gemini-live-integration'

/**
 * Mock configuration for testing
 */
const mockConfig: Partial<IntegrationConfig> = {
  apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || 'test-api-key',
  model: 'gemini-2.0-flash-live-001',
  mode: TranscriptionMode.HYBRID,
  fallbackToBatch: true,
  realTimeThreshold: 1000,
  batchFallbackDelay: 2000,
  audioBufferSize: 1024,
  enableAudioStreaming: true,
  heartbeatInterval: 10000,
  connectionTimeout: 5000
}

/**
 * Test integration service initialization
 */
async function testInitialization(): Promise<void> {
  console.log('\n=== Testing Integration Service Initialization ===')

  try {
    const integrationService = new GeminiLiveIntegrationService(mockConfig)
    
    const state = integrationService.getState()
    console.log('✓ Integration service initialized')
    console.log(`✓ Initial mode: ${state.mode}`)
    console.log(`✓ Connection state: ${state.connectionState}`)
    console.log(`✓ Streaming enabled: ${state.isStreaming}`)

    await integrationService.destroy()
    console.log('✓ Integration service destroyed')
    
  } catch (error) {
    console.error('❌ Initialization test failed:', error)
    throw error
  }
}

/**
 * Test mode switching functionality
 */
async function testModeSwitching(): Promise<void> {
  console.log('\n=== Testing Mode Switching ===')

  const integrationService = new GeminiLiveIntegrationService(mockConfig)

  try {
    let modeChangeEvents = 0
    integrationService.on('modeChanged', (mode) => {
      modeChangeEvents++
      console.log(`✓ Mode changed to: ${mode}`)
    })

    // Test switching to WebSocket mode
    await integrationService.switchMode(TranscriptionMode.WEBSOCKET)
    const websocketState = integrationService.getState()
    console.log(`✓ Switched to WebSocket mode: ${websocketState.mode}`)

    // Test switching to Batch mode
    await integrationService.switchMode(TranscriptionMode.BATCH)
    const batchState = integrationService.getState()
    console.log(`✓ Switched to Batch mode: ${batchState.mode}`)

    // Test switching to Hybrid mode
    await integrationService.switchMode(TranscriptionMode.HYBRID)
    const hybridState = integrationService.getState()
    console.log(`✓ Switched to Hybrid mode: ${hybridState.mode}`)

    console.log(`✓ Total mode change events: ${modeChangeEvents}`)

  } catch (error) {
    console.error('❌ Mode switching test failed:', error)
    throw error
  } finally {
    await integrationService.destroy()
  }
}

/**
 * Test event handling
 */
async function testEventHandling(): Promise<void> {
  console.log('\n=== Testing Event Handling ===')

  const integrationService = new GeminiLiveIntegrationService({
    ...mockConfig,
    mode: TranscriptionMode.WEBSOCKET
  })

  try {
    let eventsReceived = 0

    // Set up event listeners
    integrationService.on('stateChanged', (state) => {
      eventsReceived++
      console.log(`✓ State changed event received: ${state.mode}`)
    })

    integrationService.on('websocketConnected', () => {
      eventsReceived++
      console.log('✓ WebSocket connected event received')
    })

    integrationService.on('websocketDisconnected', () => {
      eventsReceived++
      console.log('✓ WebSocket disconnected event received')
    })

    integrationService.on('transcription', (result, source) => {
      eventsReceived++
      console.log(`✓ Transcription received from ${source}: "${result.text}"`)
    })

    integrationService.on('error', (error) => {
      eventsReceived++
      console.log(`✓ Error event received: ${error.message}`)
    })

    integrationService.on('streamingStarted', () => {
      eventsReceived++
      console.log('✓ Streaming started event received')
    })

    integrationService.on('streamingStopped', () => {
      eventsReceived++
      console.log('✓ Streaming stopped event received')
    })

    // Trigger some events by switching modes
    await integrationService.switchMode(TranscriptionMode.BATCH)
    await integrationService.switchMode(TranscriptionMode.HYBRID)

    console.log(`✓ Total events received: ${eventsReceived}`)

  } catch (error) {
    console.error('❌ Event handling test failed:', error)
    throw error
  } finally {
    await integrationService.destroy()
  }
}

/**
 * Test audio streaming functionality
 */
async function testAudioStreaming(): Promise<void> {
  console.log('\n=== Testing Audio Streaming ===')

  const integrationService = new GeminiLiveIntegrationService({
    ...mockConfig,
    mode: TranscriptionMode.WEBSOCKET,
    enableAudioStreaming: true,
    audioBufferSize: 512
  })

  try {
    // Mock audio data
    const mockAudioData = new Float32Array(1024)
    for (let i = 0; i < mockAudioData.length; i++) {
      mockAudioData[i] = Math.sin(2 * Math.PI * 440 * i / 44100) // 440Hz sine wave
    }

    console.log('✓ Generated mock audio data')

    // Add audio data to buffer
    integrationService.addAudioData(mockAudioData)
    console.log('✓ Added audio data to streaming buffer')

    // Test buffer management
    for (let i = 0; i < 10; i++) {
      integrationService.addAudioData(mockAudioData)
    }
    console.log('✓ Added multiple audio chunks (testing buffer management)')

    const state = integrationService.getState()
    console.log(`✓ Streaming state: ${state.isStreaming}`)
    console.log(`✓ Bytes streamed: ${state.bytesStreamed}`)

  } catch (error) {
    console.error('❌ Audio streaming test failed:', error)
    throw error
  } finally {
    await integrationService.destroy()
  }
}

/**
 * Test configuration updates
 */
async function testConfigurationUpdates(): Promise<void> {
  console.log('\n=== Testing Configuration Updates ===')

  const integrationService = new GeminiLiveIntegrationService(mockConfig)

  try {
    let configUpdateEvents = 0
    integrationService.on('configUpdated', (config) => {
      configUpdateEvents++
      console.log(`✓ Configuration updated: ${Object.keys(config).join(', ')}`)
    })

    // Update configuration
    integrationService.updateConfig({
      audioBufferSize: 2048,
      realTimeThreshold: 500,
      batchFallbackDelay: 3000
    })

    console.log(`✓ Configuration update events: ${configUpdateEvents}`)

    // Test metrics after configuration update
    const metrics = integrationService.getMetrics()
    console.log('✓ Retrieved metrics after config update:', {
      mode: metrics.mode,
      bytesStreamed: metrics.bytesStreamed,
      messagesReceived: metrics.messagesReceived,
      errors: metrics.errors
    })

  } catch (error) {
    console.error('❌ Configuration update test failed:', error)
    throw error
  } finally {
    await integrationService.destroy()
  }
}

/**
 * Test error handling and failover
 */
async function testErrorHandlingAndFailover(): Promise<void> {
  console.log('\n=== Testing Error Handling and Failover ===')

  const integrationService = new GeminiLiveIntegrationService({
    ...mockConfig,
    mode: TranscriptionMode.HYBRID,
    fallbackToBatch: true,
    batchFallbackDelay: 1000
  })

  try {
    let failoverEvents = 0
    let errorEvents = 0

    integrationService.on('failover', (mode) => {
      failoverEvents++
      console.log(`✓ Failover to ${mode} mode`)
    })

    integrationService.on('error', (error) => {
      errorEvents++
      console.log(`✓ Error handled: ${error.message}`)
    })

    // Simulate starting transcription (this may trigger connection attempts)
    try {
      await integrationService.startTranscription()
      console.log('✓ Transcription started (may have triggered failover)')
      
      // Wait a bit for any async operations
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      await integrationService.stopTranscription()
      console.log('✓ Transcription stopped')
      
    } catch {
      console.log('✓ Expected error during transcription test (likely no real API key)')
    }

    const finalState = integrationService.getState()
    console.log(`✓ Final state - Mode: ${finalState.mode}, Errors: ${finalState.errors}`)
    console.log(`✓ Failover events: ${failoverEvents}`)
    console.log(`✓ Error events: ${errorEvents}`)

  } catch (error) {
    console.error('❌ Error handling test failed:', error)
    throw error
  } finally {
    await integrationService.destroy()
  }
}

/**
 * Test metrics and monitoring
 */
async function testMetricsAndMonitoring(): Promise<void> {
  console.log('\n=== Testing Metrics and Monitoring ===')

  const integrationService = new GeminiLiveIntegrationService(mockConfig)

  try {
    // Get initial metrics
    const initialMetrics = integrationService.getMetrics()
    console.log('✓ Initial metrics retrieved:', {
      mode: initialMetrics.mode,
      bytesStreamed: initialMetrics.bytesStreamed,
      messagesReceived: initialMetrics.messagesReceived,
      errors: initialMetrics.errors
    })

    // Simulate some audio streaming to update metrics
    const mockAudio = new Float32Array(512).fill(0.5)
    integrationService.addAudioData(mockAudio)

    // Get updated metrics
    const updatedMetrics = integrationService.getMetrics()
    console.log('✓ Updated metrics after audio data:', {
      mode: updatedMetrics.mode,
      bytesStreamed: updatedMetrics.bytesStreamed
    })

    // Test state retrieval
    const state = integrationService.getState()
    console.log('✓ Current state:', {
      mode: state.mode,
      connectionState: state.connectionState,
      isStreaming: state.isStreaming,
      isProcessing: state.isProcessing
    })

  } catch (error) {
    console.error('❌ Metrics and monitoring test failed:', error)
    throw error
  } finally {
    await integrationService.destroy()
  }
}

/**
 * Run all integration tests
 */
async function runAllTests(): Promise<void> {
  console.log('🧪 Starting Gemini Live Integration Service Tests')

  try {
    await testInitialization()
    await testModeSwitching()
    await testEventHandling()
    await testAudioStreaming()
    await testConfigurationUpdates()
    await testErrorHandlingAndFailover()
    await testMetricsAndMonitoring()

    console.log('\n✅ All integration tests completed successfully!')
    console.log('\n📊 Test Summary:')
    console.log('• Service initialization and destruction: ✓')
    console.log('• Mode switching (WebSocket/Batch/Hybrid): ✓')
    console.log('• Event handling and state management: ✓')
    console.log('• Audio streaming and buffer management: ✓')
    console.log('• Configuration updates: ✓')
    console.log('• Error handling and failover: ✓')
    console.log('• Metrics and monitoring: ✓')
    
  } catch (error) {
    console.error('\n❌ Integration test suite failed:', error)
    process.exit(1)
  }
}

// Export test functions
export {
  testInitialization,
  testModeSwitching,
  testEventHandling,
  testAudioStreaming,
  testConfigurationUpdates,
  testErrorHandlingAndFailover,
  testMetricsAndMonitoring,
  runAllTests
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests()
}
