/**
 * Comprehensive transcription system diagnostics
 * This utility helps identify where the transcription pipeline is failing
 */

import { EmergencyCircuitBreaker } from './EmergencyCircuitBreaker'

export interface DiagnosticResult {
  step: string
  status: 'pass' | 'fail' | 'warning'
  message: string
  details?: any
}

export class TranscriptionDiagnostics {
  private results: DiagnosticResult[] = []

  /**
   * Run comprehensive diagnostic checks
   */
  async runDiagnostics(): Promise<DiagnosticResult[]> {
    this.results = []
    
    console.log('🔍 Starting comprehensive transcription diagnostics...')

    // Test 1: Check window objects
    this.checkWindowObjects()
    
    // Test 2: Check event broadcasting
    await this.checkEventBroadcasting()
    
    // Test 3: Check audio service
    await this.checkAudioService()
    
    // Test 4: Check IPC communication
    await this.checkIPCCommunication()
    
    // Test 5: Check streaming text context
    this.checkStreamingContext()
    
    // Test 6: Check stack overflow protection
    await this.checkStackOverflowProtection()

    // Test 7: Check circuit breaker status
    this.checkCircuitBreakerStatus()

    console.log('🔍 Diagnostic results:', this.results)
    return this.results
  }

  /**
   * Test 1: Check required window objects
   */
  private checkWindowObjects(): void {
    console.log('🔍 Test 1: Checking window objects...')

    // Check electronWindow
    if (window.electronWindow) {
      this.addResult('window-electron', 'pass', 'electronWindow is available')
      
      if (window.electronWindow.broadcast) {
        this.addResult('window-broadcast', 'pass', 'broadcast function is available')
      } else {
        this.addResult('window-broadcast', 'fail', 'broadcast function is missing')
      }
    } else {
      this.addResult('window-electron', 'fail', 'electronWindow is not available')
    }

    // Check electron API
    if (window.electron?.ipcRenderer) {
      this.addResult('window-ipc', 'pass', 'IPC renderer is available')
    } else if (window.electronAPI) {
      this.addResult('window-ipc', 'pass', 'electronAPI is available')
    } else {
      this.addResult('window-ipc', 'fail', 'No IPC communication method available')
    }
  }

  /**
   * Test 2: Test event broadcasting
   */
  private async checkEventBroadcasting(): Promise<void> {
    console.log('🔍 Test 2: Checking event broadcasting...')

    if (!window.electronWindow?.broadcast) {
      this.addResult('broadcast-test', 'fail', 'Cannot test broadcasting - no broadcast function')
      return
    }

    try {
      // Set up a listener to catch the test event
      let eventReceived = false
      const testData = { test: 'diagnostic-test', timestamp: Date.now() }

      // Create a promise to wait for the event
      const eventPromise = new Promise((resolve) => {
        const cleanup = window.electronWindow?.onMessage?.((channel: string, data: any) => {
          if (channel === 'diagnostic-test' && data.test === 'diagnostic-test') {
            eventReceived = true
            cleanup?.()
            resolve(true)
          }
        })
        
        // Timeout after 2 seconds
        setTimeout(() => {
          cleanup?.()
          resolve(false)
        }, 2000)
      })

      // Send the test event
      window.electronWindow.broadcast('diagnostic-test', testData)
      
      // Wait for the result
      const received = await eventPromise
      
      if (received) {
        this.addResult('broadcast-test', 'pass', 'Event broadcasting and receiving works')
      } else {
        this.addResult('broadcast-test', 'fail', 'Event was sent but not received')
      }
    } catch (error) {
      this.addResult('broadcast-test', 'fail', `Broadcasting failed: ${error}`)
    }
  }

  /**
   * Test 3: Check audio service availability
   */
  private async checkAudioService(): Promise<void> {
    console.log('🔍 Test 3: Checking audio service...')

    try {
      // Try to import audio service
      const audioModule = await import('../services/enhanced-audio-recording')
      if (audioModule.EnhancedAudioRecordingService) {
        this.addResult('audio-service', 'pass', 'Enhanced audio service is available')
        
        // Try to create an instance
        try {
          const audioService = new audioModule.EnhancedAudioRecordingService()
          const state = audioService.getState()
          this.addResult('audio-instance', 'pass', 'Audio service instance created', { state })
        } catch (error) {
          this.addResult('audio-instance', 'fail', `Cannot create audio service: ${error}`)
        }
      } else {
        this.addResult('audio-service', 'fail', 'Enhanced audio service class not found')
      }
    } catch (error) {
      this.addResult('audio-service', 'fail', `Cannot import audio service: ${error}`)
    }
  }

  /**
   * Test 4: Check IPC communication
   */
  private async checkIPCCommunication(): Promise<void> {
    console.log('🔍 Test 4: Checking IPC communication...')

    const sendMessage = window.electron?.ipcRenderer?.sendMessage || window.electronAPI?.sendMessage

    if (!sendMessage) {
      this.addResult('ipc-test', 'fail', 'No IPC send method available')
      return
    }

    try {
      // Test the start-immediate-streaming IPC
      sendMessage('start-immediate-streaming', { diagnostic: true })
      this.addResult('ipc-test', 'pass', 'IPC message sent successfully')
    } catch (error) {
      this.addResult('ipc-test', 'fail', `IPC communication failed: ${error}`)
    }
  }

  /**
   * Test 5: Check streaming context availability
   */
  private checkStreamingContext(): void {
    console.log('🔍 Test 5: Checking streaming context...')

    // This would need to be called from within a component that has access to the streaming context
    // For now, just check if the required functions exist in the global scope
    
    if (typeof window !== 'undefined') {
      this.addResult('streaming-context', 'warning', 'Streaming context check requires component context')
    }
  }

  /**
   * Add a diagnostic result
   */
  private addResult(step: string, status: 'pass' | 'fail' | 'warning', message: string, details?: any): void {
    const result: DiagnosticResult = { step, status, message, details }
    this.results.push(result)
    
    const emoji = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️'
    console.log(`${emoji} ${step}: ${message}`, details || '')
  }

  /**
   * Generate a diagnostic report
   */
  generateReport(): string {
    const passed = this.results.filter(r => r.status === 'pass').length
    const failed = this.results.filter(r => r.status === 'fail').length
    const warnings = this.results.filter(r => r.status === 'warning').length

    let report = `
🔍 Transcription System Diagnostic Report
========================================

Summary: ${passed} passed, ${failed} failed, ${warnings} warnings

Detailed Results:
`

    this.results.forEach(result => {
      const emoji = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️'
      report += `${emoji} ${result.step}: ${result.message}\n`
      if (result.details) {
        report += `   Details: ${JSON.stringify(result.details, null, 2)}\n`
      }
    })

    report += `
Recommendations:
`

    // Add specific recommendations based on failures
    const failures = this.results.filter(r => r.status === 'fail')
    if (failures.length === 0) {
      report += '✅ All tests passed! The issue may be in the audio processing or transcription API.\n'
    } else {
      failures.forEach(failure => {
        switch (failure.step) {
          case 'window-electron':
            report += '🔧 Install and configure electron window management\n'
            break
          case 'window-broadcast':
            report += '🔧 Fix broadcast function in electron window setup\n'
            break
          case 'window-ipc':
            report += '🔧 Configure IPC communication between renderer and main process\n'
            break
          case 'broadcast-test':
            report += '🔧 Debug event broadcasting system\n'
            break
          case 'audio-service':
            report += '🔧 Fix audio service imports and dependencies\n'
            break
          case 'ipc-test':
            report += '🔧 Debug IPC message handling in main process\n'
            break
        }
      })
    }

    return report
  }

  /**
   * Test 6: Check stack overflow protection mechanisms
   */
  private async checkStackOverflowProtection(): Promise<void> {
    console.log('🔍 Test 6: Checking stack overflow protection...')

    try {
      const { runStackOverflowProtectionTest } = await import('./stack-overflow-protection-test')
      const results = await runStackOverflowProtectionTest()
      
      const passCount = results.filter(r => r.status === 'PASS').length
      const failCount = results.filter(r => r.status === 'FAIL').length
      
      if (failCount === 0) {
        this.addResult('stack-overflow-protection', 'pass', `All ${passCount} protection mechanisms working`)
      } else {
        this.addResult('stack-overflow-protection', 'warning', `${passCount} working, ${failCount} need attention`)
      }
    } catch (error) {
      this.addResult('stack-overflow-protection', 'fail', `Failed to test protection: ${error}`)
    }
  }

  /**
   * Test 7: Check circuit breaker status
   */
  private checkCircuitBreakerStatus(): void {
    console.log('🔍 Test 7: Checking circuit breaker status...')

    try {
      const breaker = EmergencyCircuitBreaker.getInstance()
      const status = breaker.getEmergencyStatus()
      const trippedBreakers = breaker.getTrippedBreakers()

      if (trippedBreakers.length === 0) {
        this.addResult('circuit-breakers', 'pass', 'All circuit breakers are closed and operational')
      } else {
        this.addResult('circuit-breakers', 'warning', 
          `${trippedBreakers.length} circuit breaker(s) are tripped: ${trippedBreakers.join(', ')}`, 
          status)
      }
    } catch (error) {
      this.addResult('circuit-breakers', 'fail', `Failed to check circuit breakers: ${error}`)
    }
  }

  /**
   * Reset all circuit breakers manually
   */
  resetCircuitBreakers(): boolean {
    console.log('🔄 Attempting to reset all circuit breakers...')

    try {
      const breaker = EmergencyCircuitBreaker.getInstance()
      breaker.manualResetAll()
      
      console.log('✅ All circuit breakers have been reset manually')
      return true
    } catch (error) {
      console.error('❌ Failed to reset circuit breakers:', error)
      return false
    }
  }
}

// Export singleton instance
export const diagnostics = new TranscriptionDiagnostics()

// Helper function to run diagnostics from console
export const runTranscriptionDiagnostics = async () => {
  const results = await diagnostics.runDiagnostics()
  console.log(diagnostics.generateReport())
  return results
}

// Helper function to reset circuit breakers from console
export const resetCircuitBreakers = () => {
  return diagnostics.resetCircuitBreakers()
}

// Helper function to check circuit breaker status from console
export const checkCircuitBreakerStatus = () => {
  try {
    const breaker = EmergencyCircuitBreaker.getInstance()
    const status = breaker.getEmergencyStatus()
    const trippedBreakers = breaker.getTrippedBreakers()
    
    console.log('🔍 Circuit Breaker Status:', {
      trippedBreakers,
      totalBreakers: Object.keys(status).length,
      status
    })
    
    if (trippedBreakers.length > 0) {
      console.warn(`⚠️ ${trippedBreakers.length} circuit breaker(s) are currently tripped:`, trippedBreakers)
      console.info('💡 Use resetCircuitBreakers() to reset them manually')
    } else {
      console.log('✅ All circuit breakers are operational')
    }
    
    return { trippedBreakers, status }
  } catch (error) {
    console.error('❌ Failed to check circuit breaker status:', error)
    return null
  }
}
