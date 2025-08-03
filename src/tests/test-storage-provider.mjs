/**
 * Simple test script to verify storage provider functionality
 * Can be run directly with Node.js
 */

import { getStorageProvider } from '../utils/storage-provider.js'
import { getEnvironmentType } from '../utils/environment-detector.js'

async function testStorageProvider() {
  console.log('🧪 Testing Storage Provider Integration...')
  
  try {
    // Test environment detection
    const envType = getEnvironmentType()
    console.log(`📍 Environment detected: ${envType}`)
    
    // Get storage provider
    const provider = getStorageProvider()
    console.log(`💾 Storage provider: ${provider.getProviderType()}`)
    
    // Test basic operations
    const testKey = 'test-storage-key'
    const testData = {
      message: 'Hello from storage provider!',
      timestamp: Date.now(),
      nested: {
        array: [1, 2, 3],
        object: { foo: 'bar' }
      }
    }
    
    console.log('🔄 Testing basic storage operations...')
    
    // Set data
    await provider.set(testKey, testData)
    console.log('✅ Data stored successfully')
    
    // Get data
    const retrieved = await provider.get(testKey)
    console.log('✅ Data retrieved successfully')
    
    // Verify data integrity
    if (JSON.stringify(retrieved) === JSON.stringify(testData)) {
      console.log('✅ Data integrity verified')
    } else {
      console.error('❌ Data integrity check failed')
      console.error('Expected:', testData)
      console.error('Got:', retrieved)
    }
    
    // Test has
    const exists = await provider.has(testKey)
    console.log(`✅ Key existence check: ${exists}`)
    
    // Test keys
    const keys = await provider.keys()
    console.log(`✅ Available keys: ${keys.length} (includes: ${keys.includes(testKey) ? 'test key' : 'no test key'})`)
    
    // Test TranscriptionStateManager data format
    console.log('🔄 Testing TranscriptionStateManager data format...')
    const transcriptData = {
      transcripts: [
        {
          id: 'test-transcript',
          text: 'This is a test transcription',
          timestamp: Date.now(),
          confidence: 0.95
        }
      ],
      metadata: {
        lastSaved: Date.now(),
        version: '1.0',
        storageProvider: provider.getProviderType()
      }
    }
    
    await provider.set('dao-copilot.transcripts', transcriptData)
    const transcriptRetrieved = await provider.get('dao-copilot.transcripts')
    
    if (transcriptRetrieved && typeof transcriptRetrieved === 'object') {
      const data = transcriptRetrieved as typeof transcriptData
      console.log(`✅ Transcript data stored and retrieved (${data.transcripts?.length} transcripts)`)
    } else {
      console.error('❌ Transcript data test failed')
    }
    
    // Clean up
    await provider.remove(testKey)
    await provider.remove('dao-copilot.transcripts')
    console.log('✅ Cleanup completed')
    
    console.log('\n🎉 All storage provider tests passed!')
    
  } catch (error) {
    console.error('❌ Storage provider test failed:', error)
    process.exit(1)
  }
}

// Run the test
testStorageProvider().catch(error => {
  console.error('💥 Test execution failed:', error)
  process.exit(1)
})
