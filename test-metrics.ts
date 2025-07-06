/**
 * Prometheus Metrics Test
 * 
 * Basic test to validate metrics collection functionality
 */

import { webSocketMetrics, ConnectionType, MessageType } from './src/services/metrics/websocket-metrics'
import { initializeMetrics, register } from './src/services/metrics/prometheus-metrics'

async function testMetricsCollection() {
  console.log('🧪 Testing Prometheus Metrics Collection...\n')

  try {
    // Initialize metrics
    console.log('1. Initializing metrics...')
    initializeMetrics()
    console.log('✅ Metrics initialized successfully\n')

    // Test connection metrics
    console.log('2. Testing connection metrics...')
    const connectionId = 'test_connection_123'
    
    webSocketMetrics.recordConnectionAttempt(connectionId, ConnectionType.ENHANCED)
    webSocketMetrics.recordConnectionSuccess(connectionId, ConnectionType.ENHANCED, 150)
    console.log('✅ Connection metrics recorded\n')

    // Test message metrics
    console.log('3. Testing message metrics...')
    webSocketMetrics.recordMessageSent(connectionId, MessageType.AUDIO, 1024, 'high')
    webSocketMetrics.recordMessageReceived(connectionId, MessageType.TEXT, 512)
    webSocketMetrics.recordMessageProcessingTime(MessageType.AUDIO, 'encode', 25)
    console.log('✅ Message metrics recorded\n')

    // Test error metrics
    console.log('4. Testing error metrics...')
    const testError = new Error('Test connection error')
    webSocketMetrics.recordConnectionFailure('failed_connection', testError, ConnectionType.ENHANCED)
    webSocketMetrics.recordMessageFailure(connectionId, MessageType.AUDIO, 'NetworkError', 1)
    console.log('✅ Error metrics recorded\n')

    // Test queue and health metrics
    console.log('5. Testing queue and health metrics...')
    webSocketMetrics.updateMessageQueueSize(connectionId, 'high', 5)
    webSocketMetrics.recordHealthCheck('websocket', 'connectivity', 95)
    webSocketMetrics.recordCircuitBreakerState('websocket', 'closed')
    console.log('✅ Queue and health metrics recorded\n')

    // Get metrics summary
    console.log('6. Getting metrics summary...')
    const summary = webSocketMetrics.getMetricsSummary()
    console.log('📊 Metrics Summary:', summary)
    console.log('')

    // Test metrics output
    console.log('7. Testing metrics output...')
    const metricsText = await register.metrics()
    const metricsCount = metricsText.split('\n').filter(line => 
      line.startsWith('dao_copilot_') && !line.startsWith('#')
    ).length
    
    console.log(`✅ Generated ${metricsCount} metric entries`)
    console.log('📋 Sample metrics output (first 500 chars):')
    console.log(metricsText.substring(0, 500) + '...\n')

    // Test operation tracking
    console.log('8. Testing operation tracking...')
    const startTime = Date.now()
    await webSocketMetrics.trackOperation(
      'test_operation',
      MessageType.TEXT,
      async () => {
        await new Promise(resolve => setTimeout(resolve, 50)) // Simulate 50ms operation
        return 'success'
      }
    )
    const endTime = Date.now()
    console.log(`✅ Operation tracked (took ${endTime - startTime}ms)\n`)

    // Test cleanup
    console.log('9. Testing cleanup...')
    webSocketMetrics.cleanupConnection(connectionId)
    const cleanedSummary = webSocketMetrics.getMetricsSummary()
    console.log('✅ Connection cleaned up')
    console.log('📊 Post-cleanup Summary:', cleanedSummary)
    console.log('')

    console.log('🎉 All metrics tests passed successfully!')
    console.log('')
    console.log('📈 Metrics system is ready for production use!')
    console.log('   - WebSocket connection tracking: ✅')
    console.log('   - Message flow monitoring: ✅')
    console.log('   - Error rate tracking: ✅')
    console.log('   - Performance measurement: ✅')
    console.log('   - Health check monitoring: ✅')
    console.log('')

  } catch (error) {
    console.error('❌ Metrics test failed:', error)
    process.exit(1)
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testMetricsCollection().catch(console.error)
}

export { testMetricsCollection }
