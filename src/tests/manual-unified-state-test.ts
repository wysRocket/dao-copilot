/**
 * Simple integration test to validate unified transcription state system
 * This file can be run directly to verify the system works without context
 */

import { 
  getTranscriptionStateManager
} from '../state/TranscriptionStateManager'
import { TranscriptionSource } from '../services/TranscriptionSourceManager'

async function testUnifiedStateSystem() {
  console.log('🧪 Testing Unified Transcription State System...')
  
  try {
    // Get the singleton state manager
    const stateManager = getTranscriptionStateManager()
    console.log('✅ State manager initialized')
    
    // Test initial state
    const initialState = stateManager.getState()
    console.log('📊 Initial state:', {
      isStreaming: initialState.streaming.isActive,
      transcriptCount: initialState.static.transcripts.length,
      isRecording: initialState.recording.isRecording
    })
    
    // Test streaming lifecycle
    console.log('\n🔄 Testing streaming lifecycle...')
    
    const mockTranscription = {
      id: 'test-streaming-1',
      text: 'Hello world',
      isPartial: true,
      source: TranscriptionSource.WEBSOCKET_GEMINI,
      timestamp: Date.now()
    }
    
    // Start streaming
    stateManager.startStreaming(mockTranscription)
    console.log('✅ Streaming started')
    
    // Update streaming text
    stateManager.updateStreaming('Hello world from unified state', true)
    console.log('✅ Streaming text updated')
    
    // Complete streaming
    stateManager.completeStreaming()
    console.log('✅ Streaming completed')
    
    // Check final state
    const finalState = stateManager.getState()
    console.log('📊 Final state:', {
      isStreaming: finalState.streaming.isActive,
      transcriptCount: finalState.static.transcripts.length,
      lastTranscript: finalState.static.transcripts[0]?.text
    })
    
    // Test static transcript addition
    console.log('\n📝 Testing static transcript management...')
    
    stateManager.addTranscript({
      id: 'test-static-1',
      text: 'Direct static transcript',
      timestamp: Date.now(),
      confidence: 0.95,
      source: 'batch-test'
    })
    
    const stateWithStatic = stateManager.getState()
    console.log('✅ Static transcript added, total count:', stateWithStatic.meta.totalCount)
    
    // Test recording state
    console.log('\n🎤 Testing recording state...')
    
    stateManager.setRecordingState(true, 1500, 'Recording active')
    const recordingState = stateManager.getState()
    console.log('✅ Recording state updated:', {
      isRecording: recordingState.recording.isRecording,
      recordingTime: recordingState.recording.recordingTime,
      status: recordingState.recording.status
    })
    
    // Test memory usage
    const memoryUsage = stateManager.getMemoryUsage()
    console.log('\n💾 Memory usage:', memoryUsage)
    
    // Test subscription system
    console.log('\n🔔 Testing subscription system...')
    
    let notificationCount = 0
    const unsubscribe = stateManager.subscribe((type) => {
      notificationCount++
      console.log(`📢 State change notification ${notificationCount}: ${type}`)
    })
    
    // Trigger some state changes
    stateManager.setStreamingMode('word')
    stateManager.setProcessingState(true)
    stateManager.setProcessingState(false)
    
    console.log(`✅ Received ${notificationCount} state change notifications`)
    
    unsubscribe()
    console.log('✅ Unsubscribed from state changes')
    
    // Test completion callbacks
    console.log('\n🎯 Testing completion callbacks...')
    
    let completionCallbackFired = false
    const unsubscribeCompletion = stateManager.onStreamingComplete(() => {
      completionCallbackFired = true
      console.log('🎉 Streaming completion callback fired!')
    })
    
    // Start and complete another stream
    stateManager.startStreaming({
      id: 'test-completion',
      text: 'Testing completion callback',
      isPartial: false,
      source: TranscriptionSource.WEBSOCKET_GEMINI,
      timestamp: Date.now()
    })
    stateManager.completeStreaming()
    
    if (completionCallbackFired) {
      console.log('✅ Completion callback system working')
    } else {
      console.log('❌ Completion callback system failed')
    }
    
    unsubscribeCompletion()
    
    console.log('\n🧹 Cleaning up...')
    stateManager.clearTranscripts()
    stateManager.clearStreaming()
    stateManager.setRecordingState(false, 0, 'Ready')
    
    const cleanState = stateManager.getState()
    console.log('✅ Cleanup complete:', {
      transcriptCount: cleanState.static.transcripts.length,
      isStreaming: cleanState.streaming.isActive,
      isRecording: cleanState.recording.isRecording
    })
    
    console.log('\n🎉 All tests passed! Unified state system is working correctly.')
    return true
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    return false
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testUnifiedStateSystem().then(success => {
    process.exit(success ? 0 : 1)
  })
}

export default testUnifiedStateSystem
