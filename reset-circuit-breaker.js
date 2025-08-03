/**
 * Emergency Circuit Breaker Reset Script
 * Run this in the browser console to reset all circuit breakers
 */

console.log('🔄 Starting Emergency Circuit Breaker Reset...');

// Try to access the circuit breaker instance
try {
  // Method 1: Try global functions if they exist
  if (typeof resetCircuitBreakers === 'function') {
    resetCircuitBreakers();
    console.log('✅ Circuit breakers reset via global function');
  } else {
    console.log('Global resetCircuitBreakers not found, trying alternative methods...');
  }

  // Method 2: Try to import and reset directly
  if (typeof window !== 'undefined' && window.electronAPI) {
    console.log('🔄 Resetting via Electron API...');
    // Send reset command to main process
    window.electronAPI.invoke('reset-circuit-breakers');
  }

  // Method 3: Dispatch custom event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reset-circuit-breakers'));
    console.log('🔄 Dispatched reset event');
  }

  console.log('✅ Circuit breaker reset commands sent');
  console.log('🎯 Try recording audio now - transcription should work!');

} catch (error) {
  console.error('❌ Error resetting circuit breakers:', error);
  console.log('🔄 Manual reset instructions:');
  console.log('1. Try refreshing the page');
  console.log('2. Look for "Run Diagnostics" button in the app');
  console.log('3. Or wait 30 seconds for automatic reset');
}
