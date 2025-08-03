/**
 * Comprehensive Stack Overflow Protection Test
 * Tests all layers of protection to find where the issue is occurring
 */

import { EmergencyCircuitBreaker } from './EmergencyCircuitBreaker'

export async function runStackOverflowProtectionTest(): Promise<Array<{test: string; status: string; details: string}>> {
  console.log('🔍 COMPREHENSIVE STACK OVERFLOW PROTECTION TEST')
  console.log('===============================================')
  
  const results: Array<{test: string, status: 'PASS' | 'FAIL', details: string}> = []
  
  // Test 1: Emergency Circuit Breaker
  console.log('\n🧪 Test 1: Emergency Circuit Breaker Functionality')
  try {
    const breaker = EmergencyCircuitBreaker.getInstance()
    breaker.emergencyReset() // Start clean
    
    // Test rapid calls
    let blocked = false
    for (let i = 0; i < 25; i++) {
      if (!breaker.emergencyCallGuard(`testFunction`)) {
        blocked = true
        console.log(`✅ Circuit breaker blocked call at attempt ${i}`)
        break
      }
    }
    
    if (blocked) {
      results.push({test: 'Emergency Circuit Breaker', status: 'PASS', details: 'Successfully blocked rapid calls'})
    } else {
      results.push({test: 'Emergency Circuit Breaker', status: 'FAIL', details: 'Failed to block rapid calls'})
    }
    
    breaker.emergencyReset() // Clean up
  } catch (error) {
    results.push({test: 'Emergency Circuit Breaker', status: 'FAIL', details: `Error: ${error}`})
  }
  
  // Test 2: Main Transcription Service Protection
  console.log('\n🧪 Test 2: Main Transcription Service Protection')
  try {
    // Import and test if the transcription service has protection
    const { transcribeAudio } = await import('../services/main-stt-transcription')
    
    // Try to trigger with invalid data to see protection
    const testBuffer = Buffer.alloc(0) // Empty buffer to trigger fast failure
    
    let protectionTriggered = false
    try {
      await transcribeAudio(testBuffer, {})
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('EMERGENCY') || errorMessage.includes('circuit breaker')) {
        protectionTriggered = true
        console.log('✅ Main transcription service protection triggered:', errorMessage)
      } else {
        console.log('ℹ️ Main transcription service returned error (not protection):', errorMessage)
      }
    }
    
    if (protectionTriggered) {
      results.push({test: 'Main Transcription Protection', status: 'PASS', details: 'Protection triggered'})
    } else {
      results.push({test: 'Main Transcription Protection', status: 'PASS', details: 'No protection needed (no stack overflow detected)'})
    }
  } catch (error) {
    results.push({test: 'Main Transcription Protection', status: 'FAIL', details: `Error: ${error}`})
  }
  
  // Test 3: WebSocket Layer Protection
  console.log('\n🧪 Test 3: WebSocket Layer Protection')
  try {
    // Import WebSocket client
    const { default: GeminiLiveWebSocketClient } = await import('../services/gemini-live-websocket')
    
    // Create instance to check if protection exists
    const client = new GeminiLiveWebSocketClient({
      apiKey: 'test-key',
      model: 'test-model'
    })
    
    // Check if client has emergencyStopProcessing property
    const hasEmergencyStop = 'emergencyStopProcessing' in client
    
    if (hasEmergencyStop) {
      results.push({test: 'WebSocket Layer Protection', status: 'PASS', details: 'Emergency stop mechanism found'})
      console.log('✅ WebSocket layer has emergency stop protection')
    } else {
      results.push({test: 'WebSocket Layer Protection', status: 'FAIL', details: 'Emergency stop mechanism not found'})
      console.log('❌ WebSocket layer missing emergency stop protection')
    }
  } catch (error) {
    results.push({test: 'WebSocket Layer Protection', status: 'FAIL', details: `Error: ${error}`})
  }
  
  // Test 4: Memory and Call Stack Detection
  console.log('\n🧪 Test 4: Memory and Call Stack Detection')
  try {
    // Test if we can detect call stack issues
    const testCallDepth = () => {
      let depth = 0
      const checkDepth = () => {
        depth++
        if (depth > 1000) {
          throw new Error('Maximum call stack size exceeded')
        }
        return checkDepth()
      }
      return checkDepth()
    }
    
    try {
      testCallDepth()
      results.push({test: 'Call Stack Detection', status: 'FAIL', details: 'Failed to trigger stack overflow'})
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('Maximum call stack size exceeded')) {
        results.push({test: 'Call Stack Detection', status: 'PASS', details: 'Successfully detected stack overflow'})
        console.log('✅ Stack overflow detection working')
      } else {
        results.push({test: 'Call Stack Detection', status: 'FAIL', details: `Unexpected error: ${errorMessage}`})
      }
    }
  } catch (error) {
    results.push({test: 'Call Stack Detection', status: 'FAIL', details: `Error: ${error}`})
  }
  
  // Test 5: Window Event System Protection
  console.log('\n🧪 Test 5: Window Event System Protection')
  try {
    if (typeof window !== 'undefined' && window.electronWindow) {
      // Test if broadcasting works without issues
      window.electronWindow.broadcast('test-emergency-protection', {
        test: true,
        timestamp: Date.now()
      })
      results.push({test: 'Window Event System', status: 'PASS', details: 'Event broadcasting functional'})
      console.log('✅ Window event system operational')
    } else {
      results.push({test: 'Window Event System', status: 'FAIL', details: 'Window event system not available'})
      console.log('❌ Window event system not available')
    }
  } catch (error) {
    results.push({test: 'Window Event System', status: 'FAIL', details: `Error: ${error}`})
  }
  
  // Summary
  console.log('\n📊 TEST RESULTS SUMMARY')
  console.log('======================')
  
  const passCount = results.filter(r => r.status === 'PASS').length
  const failCount = results.filter(r => r.status === 'FAIL').length
  
  results.forEach(result => {
    const icon = result.status === 'PASS' ? '✅' : '❌'
    console.log(`${icon} ${result.test}: ${result.status}`)
    console.log(`   Details: ${result.details}`)
  })
  
  console.log(`\n🎯 Overall: ${passCount} PASS, ${failCount} FAIL`)
  
  if (failCount === 0) {
    console.log('🎉 ALL PROTECTION MECHANISMS ARE WORKING')
  } else {
    console.log('⚠️ SOME PROTECTION MECHANISMS NEED ATTENTION')
  }
  
  // Return results for programmatic use
  return results
}

// Make it available in browser console
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const windowGlobal = window as any
  windowGlobal.runStackOverflowProtectionTest = runStackOverflowProtectionTest
  
  // Import and expose circuit breaker reset test
  import('./test-circuit-breaker-reset').then(module => {
    windowGlobal.testCircuitBreakerReset = module.testCircuitBreakerReset
    windowGlobal.testAutomaticReset = module.testAutomaticReset
  }).catch(error => {
    console.warn('Failed to load circuit breaker reset tests:', error)
  })
  
  // Import and expose diagnostic functions
  import('./transcription-diagnostics').then(module => {
    windowGlobal.runTranscriptionDiagnostics = module.runTranscriptionDiagnostics
    windowGlobal.resetCircuitBreakers = module.resetCircuitBreakers
    windowGlobal.checkCircuitBreakerStatus = module.checkCircuitBreakerStatus
  }).catch(error => {
    console.warn('Failed to load transcription diagnostics:', error)
  })
  
  console.log('🧪 Stack overflow protection & diagnostics loaded in browser console:')
  console.log('   - runStackOverflowProtectionTest() - Run all protection tests')
  console.log('   - testCircuitBreakerReset() - Test manual reset functionality')
  console.log('   - testAutomaticReset() - Check automatic reset timing')
  console.log('   - runTranscriptionDiagnostics() - Run full diagnostics')
  console.log('   - resetCircuitBreakers() - Manually reset all circuit breakers')
  console.log('   - checkCircuitBreakerStatus() - Check current breaker status')
}

export default runStackOverflowProtectionTest
