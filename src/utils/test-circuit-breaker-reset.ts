/**
 * Simple test utility to verify circuit breaker reset functionality
 */

import { EmergencyCircuitBreaker } from './EmergencyCircuitBreaker'

export interface CircuitBreakerTest {
  testName: string
  status: 'PASS' | 'FAIL'
  message: string
  details?: unknown
}

/**
 * Test circuit breaker reset functionality
 */
export async function testCircuitBreakerReset(): Promise<CircuitBreakerTest[]> {
  const tests: CircuitBreakerTest[] = []
  
  console.log('🧪 Testing circuit breaker reset functionality...')
  
  try {
    const breaker = EmergencyCircuitBreaker.getInstance()
    
    // Test 1: Check initial state
    const initialStatus = breaker.getEmergencyStatus()
    const initialTripped = breaker.getTrippedBreakers()
    
    tests.push({
      testName: 'Initial State Check',
      status: 'PASS',
      message: `Found ${Object.keys(initialStatus).length} breakers, ${initialTripped.length} tripped`,
      details: { totalBreakers: Object.keys(initialStatus).length, trippedBreakers: initialTripped }
    })
    
    // Test 2: Test manual reset capability
    try {
      breaker.manualResetAll()
      tests.push({
        testName: 'Manual Reset All',
        status: 'PASS',
        message: 'Manual reset completed without errors'
      })
    } catch (error) {
      tests.push({
        testName: 'Manual Reset All',
        status: 'FAIL',
        message: `Manual reset failed: ${error}`
      })
    }
    
    // Test 3: Verify reset was effective
    const afterResetTripped = breaker.getTrippedBreakers()
    if (afterResetTripped.length === 0) {
      tests.push({
        testName: 'Reset Effectiveness',
        status: 'PASS',
        message: 'All circuit breakers are now closed after reset'
      })
    } else {
      tests.push({
        testName: 'Reset Effectiveness',
        status: 'FAIL',
        message: `${afterResetTripped.length} breakers still tripped after reset`,
        details: afterResetTripped
      })
    }
    
    // Test 4: Test emergency reset
    try {
      breaker.emergencyReset()
      tests.push({
        testName: 'Emergency Reset',
        status: 'PASS',
        message: 'Emergency reset completed without errors'
      })
    } catch (error) {
      tests.push({
        testName: 'Emergency Reset',
        status: 'FAIL',
        message: `Emergency reset failed: ${error}`
      })
    }
    
  } catch (error) {
    tests.push({
      testName: 'Circuit Breaker Access',
      status: 'FAIL',
      message: `Failed to access circuit breaker: ${error}`
    })
  }
  
  // Log results
  console.log('🧪 Circuit Breaker Reset Test Results:')
  tests.forEach(test => {
    const emoji = test.status === 'PASS' ? '✅' : '❌'
    console.log(`${emoji} ${test.testName}: ${test.message}`)
    if (test.details) {
      console.log('   Details:', test.details)
    }
  })
  
  return tests
}

/**
 * Test automatic reset timing
 */
export async function testAutomaticReset(): Promise<void> {
  console.log('⏰ Testing automatic circuit breaker reset timing...')
  
  const breaker = EmergencyCircuitBreaker.getInstance()
  const status = breaker.getEmergencyStatus()
  
  console.log('Current breaker status:', status)
  
  // Check if any breakers are tripped and how long until reset
  for (const [name, breakerInfo] of Object.entries(status)) {
    if (typeof breakerInfo === 'object' && breakerInfo && 'isOpen' in breakerInfo && 'lastError' in breakerInfo) {
      const info = breakerInfo as { isOpen: boolean; lastError: string | null }
      if (info.isOpen && info.lastError) {
        const lastErrorTime = new Date(info.lastError).getTime()
        const now = Date.now()
        const timeSinceError = now - lastErrorTime
        const resetTimeout = 30000 // 30 seconds as per EmergencyCircuitBreaker
        const timeUntilReset = Math.max(0, resetTimeout - timeSinceError)
        
        console.log(`⏰ ${name}: Tripped ${Math.floor(timeSinceError / 1000)}s ago, auto-reset in ${Math.floor(timeUntilReset / 1000)}s`)
      }
    }
  }
}

// Browser console helpers
if (typeof window !== 'undefined') {
  // Make functions available in browser console
  const windowGlobal = window as unknown as Record<string, unknown>
  windowGlobal.testCircuitBreakerReset = testCircuitBreakerReset
  windowGlobal.testAutomaticReset = testAutomaticReset
  
  console.log('🧪 Circuit breaker test functions loaded:')
  console.log('   - testCircuitBreakerReset() - Test manual reset functionality')
  console.log('   - testAutomaticReset() - Check automatic reset timing')
}
