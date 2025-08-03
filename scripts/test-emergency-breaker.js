#!/usr/bin/env node

/**
 * Emergency Circuit Breaker Test
 * 
 * This script tests the emergency circuit breaker to verify it's working
 * and can prevent stack overflow errors.
 */

const { EmergencyCircuitBreaker } = require('../src/utils/EmergencyCircuitBreaker.ts');

async function testEmergencyCircuitBreaker() {
  console.log('🚨 Testing Emergency Circuit Breaker...');
  
  const breaker = EmergencyCircuitBreaker.getInstance();
  
  // Test 1: Normal operation
  console.log('\n1. Testing normal operation...');
  if (breaker.emergencyCallGuard('testFunction')) {
    console.log('✅ Call allowed by circuit breaker');
    breaker.emergencyCallComplete('testFunction');
  } else {
    console.log('❌ Call blocked by circuit breaker');
  }
  
  // Test 2: Simulate stack overflow by exceeding depth limit
  console.log('\n2. Testing stack overflow protection...');
  
  // Simulate rapid deep calls
  for (let i = 0; i < 60; i++) {
    const allowed = breaker.emergencyCallGuard('deepFunction');
    if (!allowed) {
      console.log(`🚨 Circuit breaker TRIPPED at depth ${i}! Stack overflow prevented.`);
      break;
    }
    
    if (i === 59) {
      console.log('❌ Circuit breaker failed to trip - this is a problem!');
    }
  }
  
  // Test 3: Test error reporting
  console.log('\n3. Testing error reporting...');
  const stackOverflowError = new Error('Maximum call stack size exceeded');
  breaker.reportError('errorFunction', stackOverflowError);
  
  if (!breaker.emergencyCallGuard('errorFunction')) {
    console.log('✅ Circuit breaker blocked function after stack overflow error');
  } else {
    console.log('❌ Circuit breaker should have blocked function after stack overflow error');
  }
  
  // Test 4: Check emergency status
  console.log('\n4. Emergency status:');
  const status = breaker.getEmergencyStatus();
  console.log(JSON.stringify(status, null, 2));
  
  // Test 5: Emergency reset
  console.log('\n5. Testing emergency reset...');
  breaker.emergencyReset();
  
  if (breaker.emergencyCallGuard('testFunction')) {
    console.log('✅ Circuit breaker reset successfully');
    breaker.emergencyCallComplete('testFunction');
  } else {
    console.log('❌ Circuit breaker failed to reset');
  }
  
  console.log('\n🎉 Emergency Circuit Breaker test completed!');
}

// Run the test
testEmergencyCircuitBreaker().catch(console.error);
