/**
 * Simple GCP SDK Initialization Test
 * Tests the core SDK manager functionality
 */

import {GCPSDKManager} from './src/services/gcp-sdk-manager.ts'

async function testBasicSDKInit() {
  console.log('🧪 Testing Basic GCP SDK Initialization...')

  try {
    // Get SDK manager instance
    const manager = GCPSDKManager.getInstance()
    console.log('✅ Got SDK manager instance')

    // Get environment config
    const envConfig = GCPSDKManager.getEnvironmentConfig()
    console.log('✅ Environment config loaded:', {
      authMethod: envConfig.authMethod,
      hasApiKey: !!envConfig.apiKey,
      debug: envConfig.debug
    })

    // Initialize SDK
    console.log('\n🚀 Initializing SDK...')
    const sdkInstance = await manager.initialize(envConfig)

    console.log('✅ SDK initialized successfully!')
    console.log('   - Auth Method:', sdkInstance.authResult.method)
    console.log('   - Auth Success:', sdkInstance.authResult.success)
    console.log('   - Has Gen AI Client:', !!sdkInstance.genAI)
    console.log('   - Has Auth Client:', !!sdkInstance.auth)
    console.log('   - Initialized:', sdkInstance.status.initialized)
    console.log('   - Authenticated:', sdkInstance.status.authenticated)

    // Test getting the instance again
    const retrievedInstance = manager.getInstance()
    if (retrievedInstance && retrievedInstance.status.initialized) {
      console.log('✅ Successfully retrieved initialized SDK instance')
    } else {
      console.log('❌ Failed to retrieve initialized SDK instance')
      return false
    }

    console.log('\n🎉 Basic SDK initialization test completed successfully!')
    return true
  } catch (error) {
    console.error('❌ SDK initialization test failed:', error.message)
    if (error.stack) {
      console.error('Stack trace:', error.stack)
    }
    return false
  }
}

// Run the test
testBasicSDKInit()
  .then(success => {
    if (success) {
      console.log('\n✅ SDK initialization successful - Task 15.3 can be marked complete')
      process.exit(0)
    } else {
      console.log('\n❌ SDK initialization failed - Task 15.3 needs more work')
      process.exit(1)
    }
  })
  .catch(error => {
    console.error('❌ Test runner failed:', error)
    process.exit(1)
  })
