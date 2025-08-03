/**
 * Emergency Circuit Breaker Test
 * This script tests if the emergency circuit breaker is working properly
 * by attempting to trigger the stack overflow condition
 */

import { EmergencyCircuitBreaker } from './EmergencyCircuitBreaker'

export async function testEmergencyCircuitBreaker(): Promise<void> {
  console.log('🚨 TESTING: Emergency Circuit Breaker')
  
  const breaker = EmergencyCircuitBreaker.getInstance()
  
  // Test 1: Check if circuit breaker is functional
  console.log('Test 1: Basic circuit breaker functionality')
  const status1 = breaker.getEmergencyStatus()
  console.log('Initial status:', status1)
  
  // Test 2: Try to trigger depth protection
  console.log('Test 2: Testing call depth protection')
  
  let depthTestPassed = false
  try {
    for (let i = 0; i < 55; i++) { // Exceed MAX_CALL_DEPTH of 50
      const allowed = breaker.emergencyCallGuard(`testFunction-${i}`)
      if (!allowed) {
        console.log(`✅ Circuit breaker BLOCKED call at depth ${i}`)
        depthTestPassed = true
        break
      }
    }
    
    if (!depthTestPassed) {
      console.error('❌ Circuit breaker failed to block excessive call depth')
    }
  } catch (error) {
    console.log('✅ Circuit breaker caught error:', error)
    depthTestPassed = true
  }
  
  // Test 3: Test rapid repeated calls protection
  console.log('Test 3: Testing rapid repeated calls protection')
  
  let rapidCallTestPassed = false
  try {
    for (let i = 0; i < 25; i++) { // Trigger rapid call protection
      const allowed = breaker.emergencyCallGuard('rapidTestFunction')
      if (!allowed) {
        console.log(`✅ Circuit breaker BLOCKED rapid calls at attempt ${i}`)
        rapidCallTestPassed = true
        break
      }
    }
    
    if (!rapidCallTestPassed) {
      console.error('❌ Circuit breaker failed to block rapid repeated calls')
    }
  } catch (error) {
    console.log('✅ Circuit breaker caught rapid call error:', error)
    rapidCallTestPassed = true
  }
  
  // Test 4: Test stack overflow error reporting
  console.log('Test 4: Testing stack overflow error reporting')
  
  try {
    breaker.reportError('testFunction', new Error('Maximum call stack size exceeded'))
    const status2 = breaker.getEmergencyStatus()
    console.log('Status after stack overflow error:', status2)
    
    if (status2.testFunction && status2.testFunction.isOpen) {
      console.log('✅ Circuit breaker TRIPPED on stack overflow error')
    } else {
      console.error('❌ Circuit breaker failed to trip on stack overflow error')
    }
  } catch (error) {
    console.error('❌ Error in stack overflow test:', error)
  }
  
  // Test 5: Check overall status
  console.log('Test 5: Final status check')
  const finalStatus = breaker.getEmergencyStatus()
  console.log('Final emergency status:', finalStatus)
  
  // Emergency reset for clean state
  breaker.emergencyReset()
  console.log('🚨 Emergency reset completed')
  
  console.log('🚨 Emergency Circuit Breaker test completed')
}

// Test function that can be used in the browser console
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).testEmergencyCircuitBreaker = testEmergencyCircuitBreaker
}

export default testEmergencyCircuitBreaker
