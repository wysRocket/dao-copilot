import {ipcMain} from 'electron'
import {
  TRANSCRIPTION_TRANSCRIBE_CHANNEL,
  TRANSCRIPTION_TRANSCRIBE_BATCH_CHANNEL,
  TRANSCRIPTION_TEST_STREAMING_CHANNEL
} from './transcription-channels'
import {
  transcribeAudio,
  testStreamingTranscriptionIPC,
  startImmediateStreamingSession
} from '../../../services/main-stt-transcription'
import { EmergencyCircuitBreaker } from '../../../utils/EmergencyCircuitBreaker'

export function addTranscriptionEventListeners() {
  ipcMain.handle(TRANSCRIPTION_TRANSCRIBE_CHANNEL, async (_event, audioData: Uint8Array) => {
    const breaker = EmergencyCircuitBreaker.getInstance()
    
    // 🛡️ EMERGENCY IPC PROTECTION: Check circuit breaker before processing
    if (!breaker.emergencyCallGuard('transcription-ipc-handler')) {
      console.error('🚨 EMERGENCY: IPC transcription handler blocked by circuit breaker')
      throw new Error('🚨 EMERGENCY: Transcription service temporarily unavailable due to stack overflow protection')
    }
    
    try {
      console.log(
        'Received transcription request in main process, audio data size:',
        audioData.length
      )

      // Convert Uint8Array to Buffer for the transcription function
      const buffer = Buffer.from(audioData)

      try {
        // Try direct API call first
        const result = await transcribeAudio(buffer)
        console.log(
          '✅ Direct transcription completed successfully:',
          result.text.substring(0, 50) + '...'
        )
        console.log('✅ IPC RETURNING RESULT:', {
          type: typeof result,
          keys: result ? Object.keys(result) : 'null',
          textLength: result?.text?.length,
          source: result?.source,
          duration: result?.duration
        })
        
        // Mark successful completion
        breaker.emergencyCallComplete('transcription-ipc-handler')
        return result
      } catch (directError: unknown) {
        const directErrorMessage =
          directError instanceof Error ? directError.message : 'Unknown error'
        console.error('❌ WebSocket transcription failed (WEBSOCKET-ONLY MODE, NO FALLBACK):', directErrorMessage)

        // Check if this is a circuit breaker error and handle gracefully
        if (directErrorMessage.includes('circuit breaker') || directErrorMessage.includes('EMERGENCY')) {
          breaker.emergencyCallComplete('transcription-ipc-handler')
          throw new Error(`🚨 EMERGENCY: Transcription service temporarily blocked due to protection system activation`)
        }

        // ✅ WEBSOCKET-ONLY: Throw error instead of falling back to batch
        breaker.emergencyCallComplete('transcription-ipc-handler')
        throw new Error(`WebSocket transcription failed: ${directErrorMessage}`)
      }
    } catch (error) {
      // Report any other errors to circuit breaker
      if (error instanceof Error) {
        breaker.reportError('transcription-ipc-handler', error)
      }
      breaker.emergencyCallComplete('transcription-ipc-handler')
      
      console.error('Transcription error in main process:', error)
      throw error
    }
  })

  // Add handler for forced batch transcription (no WebSocket streaming)
  ipcMain.handle(TRANSCRIPTION_TRANSCRIBE_BATCH_CHANNEL, async (_event, audioData: Uint8Array) => {
    const breaker = EmergencyCircuitBreaker.getInstance()
    
    // 🛡️ EMERGENCY IPC PROTECTION: Check circuit breaker before processing
    if (!breaker.emergencyCallGuard('transcription-batch-ipc-handler')) {
      console.error('🚨 EMERGENCY: Batch IPC transcription handler blocked by circuit breaker')
      throw new Error('🚨 EMERGENCY: Batch transcription service temporarily unavailable due to stack overflow protection')
    }
    
    try {
      console.log(
        'Received BATCH transcription request in main process, audio data size:',
        audioData.length
      )

      // Convert Uint8Array to Buffer for the transcription function
      const buffer = Buffer.from(audioData)

      // ✅ WEBSOCKET-ONLY: Use main WebSocket transcription function
      const result = await transcribeAudio(buffer)

      console.log(
        '✅ WebSocket transcription completed successfully:',
        result.text.substring(0, 50) + '...'
      )
      console.log('✅ WEBSOCKET IPC RETURNING RESULT:', {
        type: typeof result,
        keys: result ? Object.keys(result) : 'null',
        textLength: result?.text?.length,
        source: result?.source,
        duration: result?.duration
      })
      
      // Mark successful completion
      breaker.emergencyCallComplete('transcription-batch-ipc-handler')
      return result
    } catch (error) {
      // Report any errors to circuit breaker
      if (error instanceof Error) {
        breaker.reportError('transcription-batch-ipc-handler', error)
      }
      breaker.emergencyCallComplete('transcription-batch-ipc-handler')
      
      console.error('WebSocket transcription error in main process:', error)
      throw error
    }
  })

  // Add handler for testing streaming transcription IPC
  ipcMain.handle(TRANSCRIPTION_TEST_STREAMING_CHANNEL, async () => {
    try {
      console.log('🧪 Received test streaming transcription request')
      await testStreamingTranscriptionIPC()
      return {success: true, message: 'Test streaming transcription IPC initiated'}
    } catch (error) {
      console.error('🧪 Failed to test streaming transcription IPC:', error)
      return {success: false, error: String(error)}
    }
  })

  // Add handler for immediate streaming session start
  ipcMain.on('start-immediate-streaming', async () => {
    try {
      console.log('🚀 Received start-immediate-streaming request')
      await startImmediateStreamingSession()
      console.log('✅ Started immediate streaming session successfully')
    } catch (error) {
      console.error('❌ Failed to start immediate streaming session:', error)
    }
  })

  // 🔄 Add emergency circuit breaker reset handler
  ipcMain.handle('reset-circuit-breakers', async () => {
    try {
      console.log('🔄 EMERGENCY RESET: Resetting all circuit breakers via IPC')
      const breaker = EmergencyCircuitBreaker.getInstance()
      breaker.manualResetAll()
      console.log('✅ All circuit breakers reset successfully via IPC')
      return { success: true, message: 'All circuit breakers have been reset' }
    } catch (error) {
      console.error('❌ Failed to reset circuit breakers via IPC:', error)
      return { success: false, error: String(error) }
    }
  })

  // 🔍 Add circuit breaker status check handler
  ipcMain.handle('check-circuit-breaker-status', async () => {
    try {
      const breaker = EmergencyCircuitBreaker.getInstance()
      const status = breaker.getEmergencyStatus()
      const trippedBreakers = breaker.getTrippedBreakers()
      
      console.log('🔍 Circuit breaker status check:', {
        totalBreakers: Object.keys(status).length,
        trippedBreakers,
        status
      })
      
      return { 
        success: true, 
        totalBreakers: Object.keys(status).length,
        trippedBreakers,
        allStatus: status
      }
    } catch (error) {
      console.error('❌ Failed to check circuit breaker status:', error)
      return { success: false, error: String(error) }
    }
  })
}
