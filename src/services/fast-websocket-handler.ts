/**
 * 🚀 SIMPLIFIED WebSocket Handler for Performance Fix
 * 
 * This is a direct replacement for the complex WebSocket response handler
 * that was causing 990ms render times and empty transcriptions.
 * 
 * Usage: Replace the complex geminiResponse handler in main-stt-transcription.ts
 * with this simple version.
 */

export const createFastWebSocketHandler = (
  audioSent: () => boolean,
  startTime: number,
  windowManager: {
    broadcastToAllWindows: (event: string, type: string, data: Record<string, unknown>) => void
  }
) => {
  let collectedText = ''
  let finalConfidence = 0.8
  
  return {
    // Simple, fast geminiResponse handler
    handleGeminiResponse: (response: unknown) => {
      if (!audioSent()) {
        console.log('🔍 Skipping - audio not sent yet')
        return
      }
      
      console.log('📥 WebSocket response received:', typeof response)
      
      let extractedText = ''
      let confidence = 0.8
      
      try {
        // Handle different response formats efficiently
        if (typeof response === 'string') {
          extractedText = response.trim()
        } else if (response && typeof response === 'object') {
          const resp = response as Record<string, unknown>
          
          if (resp.content && typeof resp.content === 'string') {
            extractedText = resp.content.trim()
            confidence = resp.confidence || 0.8
          } else if (resp.text && typeof resp.text === 'string') {
            extractedText = resp.text.trim()
            confidence = resp.confidence || 0.8
          } else if (resp.server_content?.model_turn?.parts) {
            for (const part of resp.server_content.model_turn.parts) {
              if (part.text) extractedText += part.text
            }
          } else if (resp.model_turn?.parts) {
            for (const part of resp.model_turn.parts) {
              if (part.text) extractedText += part.text
            }
          }
        }
        
        if (extractedText && extractedText.length > 0) {
          collectedText = extractedText
          finalConfidence = confidence
          
          console.log('✅ Text extracted successfully:', {
            text: extractedText.substring(0, 100) + (extractedText.length > 100 ? '...' : ''),
            length: extractedText.length,
            confidence
          })
          
          // Stream to windows immediately for real-time display
          try {
            windowManager.broadcastToAllWindows(
              'inter-window-message',
              'streaming-transcription',
              {
                text: extractedText,
                isFinal: true,
                source: 'websocket',
                confidence
              }
            )
            console.log('📡 Streamed to windows successfully')
          } catch (streamError) {
            console.warn('📡 Stream error:', streamError)
          }
        } else {
          console.log('⚠️ No text extracted from response')
        }
        
      } catch (error) {
        console.error('❌ Error processing WebSocket response:', error)
      }
    },
    
    // Get final result
    getFinalResult: () => ({
      text: collectedText,
      duration: Date.now() - startTime,
      source: 'websocket-fast' as const,
      confidence: finalConfidence
    }),
    
    // Get collected text
    getCollectedText: () => collectedText,
    
    // Get confidence
    getConfidence: () => finalConfidence
  }
}

/**
 * 🎯 INTEGRATION EXAMPLE
 * 
 * Replace your complex geminiResponse handler with this:
 */
export const INTEGRATION_EXAMPLE = `
// In your WebSocket setup code, replace the complex handler:

// ❌ REMOVE the complex 100+ line geminiResponse handler

// ✅ ADD this simple version:
import { createFastWebSocketHandler } from './fast-websocket-handler'

const fastHandler = createFastWebSocketHandler(
  () => audioSent,
  startTime,
  WindowManager.getInstance()
)

client.on('geminiResponse', fastHandler.handleGeminiResponse)

// Later, in your return statement:
const result = fastHandler.getFinalResult()
console.log('🎯 Final result:', result)
return result
`

export default createFastWebSocketHandler
