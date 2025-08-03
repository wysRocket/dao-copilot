import React from 'react'
import {createRoot} from 'react-dom/client'
import App from './App'
import {
  emergencyRecoverTranscription,
  getEmergencyTranscriptionStatus,
  testTranscriptionDisplay,
  testRecordingWorkflow,
  getTranscriptionStateManager,
  getQuotaStatus,
  forceQuotaReset,
  emergencyResetTranscriptionSystem
} from './state/TranscriptionStateManager'

// Extend Window interface for global debug functions
declare global {
  interface Window {
    emergencyRecoverTranscription: () => void
    getEmergencyTranscriptionStatus: () => void
    testTranscriptionDisplay: () => void
    testRecordingWorkflow: () => void
    isTranscriptionServiceAvailable: () => boolean
    resetStackOverflowCounter: () => void
    // Assistant window test functions
    testAssistantDisplay: () => void
    testAssistantEmpty: () => void
    // Audio recording test functions
    forceTestTranscription: () => void
    forceBatchTest: () => Promise<any>
    // Quota management functions
    getQuotaStatus: () => any
    forceQuotaReset: () => void
    // Emergency system reset functions
    emergencyResetTranscriptionSystem: () => void
  }
}

console.log('🚀 DAO Copilot: Renderer starting...')

// 🚨 Automatic Stack Overflow Detection and Recovery System
let stackOverflowCount = 0
const MAX_STACK_OVERFLOW_DETECTIONS = 3

function setupAutomaticStackOverflowRecovery() {
  // Intercept console.error to detect stack overflow errors
  const originalConsoleError = console.error
  console.error = function (...args: unknown[]) {
    // Call original error first
    originalConsoleError.apply(console, args)

    // Check for stack overflow patterns
    const errorMessage = args.join(' ').toLowerCase()
    if (
      errorMessage.includes('maximum call stack size exceeded') ||
      errorMessage.includes('stack overflow') ||
      errorMessage.includes('transcription service temporarily unavailable')
    ) {
      stackOverflowCount++
      console.warn(
        `🚨 AUTOMATIC DETECTION: Stack overflow detected (count: ${stackOverflowCount}/${MAX_STACK_OVERFLOW_DETECTIONS})`
      )

      if (stackOverflowCount <= MAX_STACK_OVERFLOW_DETECTIONS) {
        console.warn('🔧 AUTOMATIC RECOVERY: Triggering emergency transcription recovery...')

        // Delay recovery slightly to avoid immediate re-triggering
        setTimeout(() => {
          try {
            emergencyRecoverTranscription()
            console.log('✅ AUTOMATIC RECOVERY: Emergency recovery completed')

            // Reset counter on successful recovery
            if (stackOverflowCount > 0) {
              stackOverflowCount = Math.max(0, stackOverflowCount - 1)
            }
          } catch (recoveryError) {
            console.error('❌ AUTOMATIC RECOVERY: Failed:', recoveryError)
          }
        }, 1000) // 1 second delay
      } else {
        console.error(
          '🚨 AUTOMATIC RECOVERY: Maximum recovery attempts reached - manual intervention required'
        )
        console.error(
          '🚨 Please call window.emergencyRecoverTranscription() manually to reset the system'
        )
      }
    }
  }
}

// Setup automatic recovery
setupAutomaticStackOverflowRecovery()

// Make emergency functions available globally for debugging
if (typeof window !== 'undefined') {
  window.emergencyRecoverTranscription = () => {
    console.log('🛡️ MANUAL RECOVERY: Performing emergency transcription recovery...')
    stackOverflowCount = 0 // Reset automatic counter
    return emergencyRecoverTranscription()
  }
  window.getEmergencyTranscriptionStatus = getEmergencyTranscriptionStatus
  window.testTranscriptionDisplay = testTranscriptionDisplay
  window.testRecordingWorkflow = testRecordingWorkflow
  window.isTranscriptionServiceAvailable = () => {
    const manager = getTranscriptionStateManager()
    return manager.isTranscriptionServiceAvailable()
  }
  window.resetStackOverflowCounter = () => {
    stackOverflowCount = 0
    console.log('✅ Stack overflow detection counter reset')
  }

  console.log('🛡️ Emergency transcription recovery functions available:')
  console.log('  - window.emergencyRecoverTranscription() - Manual emergency recovery')
  console.log('  - window.getEmergencyTranscriptionStatus() - Check system status')
  console.log('  - window.testTranscriptionDisplay() - Test transcript display')
  console.log('  - window.testRecordingWorkflow() - Complete workflow test')
  console.log('  - window.isTranscriptionServiceAvailable() - Check service availability')
  console.log('  - window.resetStackOverflowCounter() - Reset automatic counter')
  console.log('')
  console.log('🧪 Assistant Window Test Functions:')
  console.log('  - window.testAssistantDisplay() - Test Assistant window display with sample text')
  console.log('  - window.testAssistantEmpty() - Test Assistant window with empty WebSocket result')
  console.log('')
  console.log('🎤 Audio Recording Test Functions:')
  console.log('  - window.forceTestTranscription() - Force test transcription broadcast')
  console.log('  - window.forceBatchTest() - Test batch API with silent audio')
  console.log('')
  console.log('📊 Quota Management Functions:')
  console.log('  - window.getQuotaStatus() - Check current quota status')
  console.log('  - window.forceQuotaReset() - Force reset quota status')
  console.log('')
  console.log('🚨 Emergency System Reset Functions:')
  console.log('  - window.emergencyResetTranscriptionSystem() - Complete system reset (circuit breaker + transcription)')
}

// Add quota debugging functions to window
if (typeof window !== 'undefined') {
  window.getQuotaStatus = getQuotaStatus
  window.forceQuotaReset = forceQuotaReset
  window.emergencyResetTranscriptionSystem = () => {
    console.log('🚨 EMERGENCY: Resetting entire transcription system and circuit breaker...')
    return emergencyResetTranscriptionSystem()
  }
}

// Wait for DOM to be ready
function renderApp() {
  try {
    const container = document.getElementById('app')
    if (!container) {
      console.error('❌ App container not found')
      return
    }

    console.log('🎯 Creating React root...')
    const root = createRoot(container)

    console.log('🎨 Rendering app...')
    root.render(React.createElement(React.StrictMode, null, React.createElement(App)))

    console.log('✅ DAO Copilot: App rendered successfully')
  } catch (error) {
    console.error('❌ Failed to render app:', error)

    // Emergency fallback
    const container = document.getElementById('app')
    if (container) {
      container.innerHTML = `
        <div style="padding: 20px; color: red; font-family: monospace;">
          <h2>🚨 DAO Copilot: Render Error</h2>
          <p>Failed to load the application. Check console for details.</p>
          <p>Error: ${error}</p>
          <button onclick="location.reload()">Reload Application</button>
        </div>
      `
    }
  }
}

// Handle DOM ready state
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderApp)
} else {
  renderApp()
}

console.log('✅ DAO Copilot: Renderer script loaded, waiting for DOM...')
