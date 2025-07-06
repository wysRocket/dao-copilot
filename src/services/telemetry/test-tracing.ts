/**
 * Test OpenTelemetry Integration
 * 
 * Simple test to verify tracing is working correctly
 */

import { initializeTracing, shutdownTracing, defaultTracingConfig } from './tracing-config'
import { createConnectionSpan, withSpan, measureOperation } from './custom-spans'

async function testTracingIntegration() {
  console.log('🔍 Testing OpenTelemetry integration...')

  // Initialize tracing with console output enabled
  const config = {
    ...defaultTracingConfig,
    enableConsoleExporter: true,
    enableOTLPExporter: false
  }

  let sdk
  try {
    sdk = initializeTracing(config)
    console.log('✅ Tracing initialized successfully')

    // Test basic span creation
    const span = createConnectionSpan('test_connection', {
      connectionId: 'test-conn-123',
      metadata: { environment: 'test' }
    })

    await withSpan(span, async () => {
      console.log('📊 Inside span context')
      
      // Test nested operation measurement
      const result = await measureOperation('test_operation', async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return 'operation completed'
      }, {
        connectionId: 'test-conn-123',
        metadata: { operation: 'sleep' }
      })

      console.log('🎯 Operation result:', result)
      console.log('Test operation completed successfully')
    })

    console.log('✅ Span execution completed successfully')

  } catch (error) {
    console.error('❌ Tracing test failed:', error)
    throw error
  } finally {
    if (sdk) {
      await shutdownTracing(sdk)
      console.log('🛑 Tracing shutdown completed')
    }
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testTracingIntegration()
    .then(() => {
      console.log('🎉 All tracing tests passed!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('💥 Tracing tests failed:', error)
      process.exit(1)
    })
}

export { testTracingIntegration }
