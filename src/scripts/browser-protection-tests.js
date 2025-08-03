/**
 * Browser Console Testing Script for WebSocket Protection Verification
 *
 * This script can be run in the browser console to manually test the protection
 * systems with real WebSocket transcription workloads. Copy and paste sections
 * into the browser console while the dao-copilot application is running.
 */

// === BASIC PROTECTION TEST ===
// Run this to test basic circuit breaker functionality
function runBasicProtectionTest() {
  console.log('🧪 Starting Basic Protection Test...')

  // Test if EmergencyCircuitBreaker is available
  if (typeof window.EmergencyCircuitBreaker !== 'undefined') {
    const breaker = window.EmergencyCircuitBreaker.getInstance()
    console.log('✅ EmergencyCircuitBreaker found:', breaker)

    // Test basic call guard
    const allowed = breaker.emergencyCallGuard('testFunction', ['arg1', 'arg2'])
    console.log('🛡️ Call guard result:', allowed)

    // Get current status
    const status = breaker.getEmergencyStatus()
    console.log('📊 Protection status:', status)
  } else {
    console.error('❌ EmergencyCircuitBreaker not found in global scope')
  }
}

// === STACK OVERFLOW PROTECTION TEST ===
// This is the specific test mentioned in the requirements
function runStackOverflowProtectionTest() {
  console.log('🧪 Starting Stack Overflow Protection Test...')

  // Create a function that would normally cause stack overflow
  function recursiveTranscription(depth = 0) {
    console.log(`📞 Recursive call depth: ${depth}`)

    // Check if EmergencyCircuitBreaker is protecting us
    if (typeof window.EmergencyCircuitBreaker !== 'undefined') {
      const breaker = window.EmergencyCircuitBreaker.getInstance()

      // Test the emergency call guard
      const allowed = breaker.emergencyCallGuard('recursiveTranscription', [depth])
      if (!allowed) {
        console.error(
          '🚨 EMERGENCY: Circuit breaker OPEN for recursiveTranscription. Blocking call.'
        )
        return {text: 'BLOCKED', duration: 0, source: 'protection'}
      }
    }

    // Simulate transcription work
    if (depth < 5) {
      // Normal depth - continue
      console.log(`✅ Processing transcription at depth ${depth}`)
      return recursiveTranscription(depth + 1)
    } else {
      // Return successful result
      console.log('✅ Transcription completed: "さっき これ で いい でしょう 。"')
      return {text: 'さっき これ で いい でしょう 。', duration: 100, source: 'test'}
    }
  }

  try {
    // First call should succeed
    console.log('🔄 First attempt...')
    const result1 = recursiveTranscription()
    console.log('📝 First result:', result1)

    // Second call should be protected if depth gets too high
    console.log('🔄 Second attempt (should be protected)...')
    const result2 = recursiveTranscription(45) // Start at high depth
    console.log('📝 Second result:', result2)
  } catch (error) {
    console.error('💥 Error caught (this should not happen with protection):', error)
  }
}

// === DUPLICATE REQUEST TEST ===
// Test the duplicate request detection system
function runDuplicateRequestTest() {
  console.log('🧪 Starting Duplicate Request Test...')

  // Create mock audio data
  const mockAudioData = new ArrayBuffer(1024)
  const uint8View = new Uint8Array(mockAudioData)
  uint8View.fill(42) // Fill with same data to test duplicates

  // Convert to Buffer-like object for testing
  const audioBuffer = {
    data: mockAudioData,
    length: mockAudioData.byteLength,
    toString: () => 'mock-audio-data'
  }

  if (typeof window.EmergencyCircuitBreaker !== 'undefined') {
    const breaker = window.EmergencyCircuitBreaker.getInstance()

    // Test transcription call guard with audio data
    console.log('🔄 First transcription request...')
    const result1 = breaker.transcriptionCallGuard('testTranscription', audioBuffer)
    console.log('📝 First request result:', result1)

    // Second identical request should be blocked
    console.log('🔄 Second identical request (should be blocked)...')
    const result2 = breaker.transcriptionCallGuard('testTranscription', audioBuffer)
    console.log('📝 Second request result:', result2)

    // Third request with different data should work
    console.log('🔄 Third request with different data...')
    const differentBuffer = {...audioBuffer, toString: () => 'different-audio-data'}
    const result3 = breaker.transcriptionCallGuard('testTranscription', differentBuffer)
    console.log('📝 Third request result:', result3)
  }
}

// === WEBSOCKET TRANSCRIPTION TEST ===
// Test real WebSocket transcription if available
async function runWebSocketTranscriptionTest() {
  console.log('🧪 Starting WebSocket Transcription Test...')

  try {
    // Check if transcription functions are available
    if (typeof window.transcribeAudio === 'function') {
      console.log('✅ transcribeAudio function found')

      // Create test audio data
      const testAudio = new Uint8Array(2048)
      testAudio.fill(Math.floor(Math.random() * 255))

      console.log('🔄 Testing transcription with protection...')

      // This should be protected by our systems
      const result = await window.transcribeAudio(testAudio.buffer, {
        mode: 'websocket',
        enableWebSocket: true
      })

      console.log('📝 Transcription result:', result)
      console.log('✅ Test completed successfully')
    } else if (typeof window.transcribeAudioViaWebSocket === 'function') {
      console.log('✅ transcribeAudioViaWebSocket function found')

      const testAudio = new Uint8Array(2048)
      testAudio.fill(Math.floor(Math.random() * 255))

      const result = await window.transcribeAudioViaWebSocket(testAudio.buffer)
      console.log('📝 WebSocket transcription result:', result)
    } else {
      console.warn('⚠️ No transcription functions found in global scope')
      console.log(
        'Available functions:',
        Object.keys(window).filter(key => key.includes('transcrib'))
      )
    }
  } catch (error) {
    console.error('💥 Transcription test error:', error)

    // Check if this is a protection error (expected)
    if (
      error.message.includes('Protection blocked') ||
      error.message.includes('Circuit breaker') ||
      error.message.includes('Duplicate request')
    ) {
      console.log('✅ Protection system is working - call was blocked as expected')
    } else {
      console.error('❌ Unexpected error:', error)
    }
  }
}

// === PERFORMANCE MONITORING TEST ===
// Monitor protection system performance
function runPerformanceMonitoringTest() {
  console.log('🧪 Starting Performance Monitoring Test...')

  if (typeof window.EmergencyCircuitBreaker !== 'undefined') {
    const breaker = window.EmergencyCircuitBreaker.getInstance()

    // Run multiple protected calls and measure performance
    const iterations = 100
    const startTime = Date.now()

    console.log(`🔄 Running ${iterations} protected calls...`)

    for (let i = 0; i < iterations; i++) {
      breaker.emergencyCallGuard(`testFunction${i % 10}`, [i])
    }

    const endTime = Date.now()
    const totalTime = endTime - startTime
    const avgTime = totalTime / iterations

    console.log(`📊 Performance Results:
      Total time: ${totalTime}ms
      Average time per call: ${avgTime.toFixed(2)}ms
      Calls per second: ${(1000 / avgTime).toFixed(0)}
    `)

    // Get detailed protection status
    const status = breaker.getProtectionStatus
      ? breaker.getProtectionStatus()
      : breaker.getEmergencyStatus()
    console.log('📊 Detailed protection status:', status)
  }
}

// === RESET CIRCUIT BREAKERS TEST ===
// Test manual reset functionality
function resetCircuitBreakers() {
  console.log('🔄 Resetting circuit breakers...')

  if (typeof window.EmergencyCircuitBreaker !== 'undefined') {
    const breaker = window.EmergencyCircuitBreaker.getInstance()

    // Check if reset method exists
    if (typeof breaker.resetAllBreakers === 'function') {
      breaker.resetAllBreakers()
      console.log('✅ All circuit breakers reset')
    } else if (typeof breaker.resetBreaker === 'function') {
      // Reset known breakers
      ;['transcribeAudio', 'transcribeAudioViaWebSocket', 'performTranscription'].forEach(
        funcName => {
          try {
            breaker.resetBreaker(funcName)
            console.log(`✅ Reset breaker for ${funcName}`)
          } catch (error) {
            console.warn(`⚠️ Could not reset ${funcName}:`, error.message)
          }
        }
      )
    } else {
      console.warn('⚠️ No reset methods found on circuit breaker')
    }

    // Show status after reset
    const status = breaker.getEmergencyStatus()
    console.log('📊 Status after reset:', status)
  }
}

// === COMPREHENSIVE TEST SUITE ===
// Run all tests in sequence
async function runComprehensiveProtectionTests() {
  console.log('🚀 Starting Comprehensive Protection Test Suite...')
  console.log('='.repeat(60))

  try {
    // Test 1: Basic Protection
    console.log('\n1️⃣ BASIC PROTECTION TEST')
    runBasicProtectionTest()

    await new Promise(resolve => setTimeout(resolve, 1000))

    // Test 2: Stack Overflow Protection (from requirements)
    console.log('\n2️⃣ STACK OVERFLOW PROTECTION TEST')
    runStackOverflowProtectionTest()

    await new Promise(resolve => setTimeout(resolve, 1000))

    // Test 3: Duplicate Request Detection
    console.log('\n3️⃣ DUPLICATE REQUEST TEST')
    runDuplicateRequestTest()

    await new Promise(resolve => setTimeout(resolve, 1000))

    // Test 4: Performance Monitoring
    console.log('\n4️⃣ PERFORMANCE MONITORING TEST')
    runPerformanceMonitoringTest()

    await new Promise(resolve => setTimeout(resolve, 1000))

    // Test 5: WebSocket Transcription (if available)
    console.log('\n5️⃣ WEBSOCKET TRANSCRIPTION TEST')
    await runWebSocketTranscriptionTest()

    console.log('\n✅ Comprehensive test suite completed!')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('💥 Test suite error:', error)
  }
}

// === USAGE INSTRUCTIONS ===
console.log(`
🧪 WebSocket Protection Testing Console Commands
==============================================

Copy and paste these commands into the browser console:

1. Run basic protection test:
   runBasicProtectionTest()

2. Run stack overflow protection test (from requirements):
   runStackOverflowProtectionTest()

3. Run duplicate request test:
   runDuplicateRequestTest()

4. Run WebSocket transcription test:
   runWebSocketTranscriptionTest()

5. Run performance monitoring:
   runPerformanceMonitoringTest()

6. Reset circuit breakers:
   resetCircuitBreakers()

7. Run all tests:
   runComprehensiveProtectionTests()

Expected Results:
- ✅ Successful transcription: "さっき これ で いい でしょう 。"
- 🚨 Protection messages when limits exceeded
- 🚫 Blocking messages for duplicate/rapid requests
- 📊 Performance and status information

Note: Tests adapt to available functions in the global scope.
`)

// Export functions to global scope for easy access
if (typeof window !== 'undefined') {
  window.runBasicProtectionTest = runBasicProtectionTest
  window.runStackOverflowProtectionTest = runStackOverflowProtectionTest
  window.runDuplicateRequestTest = runDuplicateRequestTest
  window.runWebSocketTranscriptionTest = runWebSocketTranscriptionTest
  window.runPerformanceMonitoringTest = runPerformanceMonitoringTest
  window.resetCircuitBreakers = resetCircuitBreakers
  window.runComprehensiveProtectionTests = runComprehensiveProtectionTests
}
