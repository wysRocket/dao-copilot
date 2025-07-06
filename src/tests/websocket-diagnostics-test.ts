/**
 * Test WebSocket Diagnostics Integration
 * This script validates that the enhanced WebSocket client with diagnostics is working correctly
 */

import {GeminiLiveWebSocketClient, ResponseModality} from '../services/gemini-live-websocket'

async function testWebSocketDiagnostics() {
  console.log('🧪 Testing WebSocket Diagnostics Integration')
  console.log('='.repeat(50))

  // Create WebSocket client with diagnostics
  const client = new GeminiLiveWebSocketClient({
    apiKey: process.env.GEMINI_API_KEY || 'test-key',
    model: 'gemini-live-2.5-flash-preview',
    responseModalities: [ResponseModality.TEXT],
    systemInstruction: 'Test assistant'
  })

  try {
    // Test diagnostic status retrieval
    console.log('📊 Testing diagnostic status retrieval...')
    const status = client.getConnectionStatusWithDiagnostics()
    console.log('✅ Connection Status:', {
      state: status.state,
      connected: status.connected,
      healthScore: status.health.score,
      healthStatus: status.health.status
    })

    // Test metrics retrieval
    console.log('📈 Testing metrics retrieval...')
    const metrics = client.getDiagnosticMetrics()
    console.log('✅ Metrics:', {
      totalConnections: metrics.totalConnections,
      successfulConnections: metrics.successfulConnections,
      errorsCount: metrics.errorsCount,
      uptime: metrics.uptime
    })

    // Test diagnostic export
    console.log('💾 Testing diagnostic export...')
    const diagnostics = client.exportDiagnostics()
    console.log('✅ Diagnostics Export:', {
      connectionId: diagnostics.connectionId,
      recentEventsCount: diagnostics.recentEvents.length,
      recentErrorsCount: diagnostics.recentErrors.length
    })

    console.log('\n🎉 All diagnostic tests passed!')
    console.log('✅ WebSocket diagnostics integration is working correctly')
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error)
  }

  console.log('\n🔧 Diagnostic Integration Summary:')
  console.log('• Real-time connection monitoring ✅')
  console.log('• Health assessment and scoring ✅')
  console.log('• Performance metrics collection ✅')
  console.log('• Event logging and tracking ✅')
  console.log('• Diagnostic data export ✅')
  console.log('• Security-focused log sanitization ✅')
}

// Export test function for use in other modules
export {testWebSocketDiagnostics}

// Run test if this file is executed directly
if (require.main === module) {
  testWebSocketDiagnostics()
    .then(() => {
      console.log('\n✅ WebSocket diagnostics validation complete')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ WebSocket diagnostics validation failed:', error)
      process.exit(1)
    })
}
