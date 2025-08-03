/**
 * Auto-Reset Circuit Breakers on App Startup
 * This ensures clean transcription functionality without manual intervention
 */

import { EmergencyCircuitBreaker } from './EmergencyCircuitBreaker'

export function autoResetCircuitBreakersOnStartup(): void {
  try {
    console.log('🔄 Auto-reset: Initializing circuit breakers for clean startup...')
    
    const breaker = EmergencyCircuitBreaker.getInstance()
    
    // Reset all circuit breakers on startup
    breaker.manualResetAll()
    
    console.log('✅ Auto-reset: All circuit breakers reset for clean transcription startup')
    
    // Add a small delay and check status
    setTimeout(() => {
      const trippedBreakers = breaker.getTrippedBreakers()
      
      if (trippedBreakers.length === 0) {
        console.log('✅ Auto-reset: Transcription system ready - no active circuit breakers')
      } else {
        console.warn('⚠️ Auto-reset: Some circuit breakers still active:', trippedBreakers)
      }
    }, 1000)
    
  } catch (error) {
    console.error('❌ Auto-reset: Failed to reset circuit breakers on startup:', error)
  }
}

// Make available globally for console access if needed
if (typeof window !== 'undefined') {
  (window as Record<string, unknown>).autoResetCircuitBreakers = autoResetCircuitBreakersOnStartup
}
