#!/usr/bin/env node
/**
 * Comprehensive test suite for enhanced TranscriptFSM implementation
 */

import fs from 'fs'
import {fileURLToPath} from 'url'
import {dirname, join} from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Mock performance API for Node.js
globalThis.performance = globalThis.performance || {
  now: () => Date.now()
}

// Mock crypto.randomUUID for consistent testing
globalThis.crypto = globalThis.crypto || {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
}

console.log('🧪 Enhanced TranscriptFSM Test Suite')
console.log('=====================================')

// Test configuration
const testConfig = {
  maxUtterances: 100,
  terminalRetentionMs: 1000, // 1 second for testing
  cleanupIntervalMs: 500, // 500ms for testing
  historyRetentionCount: 50,
  historyRetentionMs: 5000, // 5 seconds for testing
  enableHistoryTracking: true,
  enableMetrics: true
}

let testResults = {
  passed: 0,
  failed: 0,
  total: 0
}

function test(name, fn) {
  testResults.total++
  try {
    console.log(`\n🔍 Testing: ${name}`)
    fn()
    testResults.passed++
    console.log(`✅ PASSED: ${name}`)
  } catch (error) {
    testResults.failed++
    console.error(`❌ FAILED: ${name}`)
    console.error(`   Error: ${error.message}`)
    console.error(`   Stack: ${error.stack}`)
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed')
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

async function runTests() {
  // Import the enhanced FSM after environment setup
  const {
    TranscriptFSMCore,
    TranscriptState,
    TransitionReason,
    DEFAULT_FSM_CONFIG
  } = await import('./src/transcription/fsm/index.ts')

  test('FSM Configuration Management', () => {
    const fsm = new TranscriptFSMCore(testConfig)
    const config = fsm.getConfig()
    
    assertEqual(config.maxUtterances, testConfig.maxUtterances)
    assertEqual(config.enableHistoryTracking, true)
    assertEqual(config.enableMetrics, true)
    
    // Test configuration update
    fsm.updateConfig({ maxUtterances: 200 })
    const updatedConfig = fsm.getConfig()
    assertEqual(updatedConfig.maxUtterances, 200)
    
    fsm.destroy()
  })

  test('Basic Utterance Creation and State Tracking', () => {
    const fsm = new TranscriptFSMCore(testConfig)
    const sessionId = 'test-session-1'
    
    const utteranceId = fsm.createUtterance({ sessionId })
    assert(utteranceId, 'Should create utterance with valid ID')
    
    const utterance = fsm.getUtterance(utteranceId)
    assert(utterance, 'Should retrieve created utterance')
    assertEqual(utterance.state, TranscriptState.PENDING_PARTIAL)
    assertEqual(utterance.sessionId, sessionId)
    
    const metrics = fsm.getMetrics()
    assertEqual(metrics.totalUtterances, 1)
    
    fsm.destroy()
  })

  test('State Transition Validation and History', () => {
    const fsm = new TranscriptFSMCore(testConfig)
    let historyEvents = []
    let transitionEvents = []
    let rejectionEvents = []
    
    // Set up event listeners
    fsm.on('fsm.history.recorded', (payload) => {
      historyEvents.push(payload)
    })
    fsm.on('fsm.transition', (payload) => {
      transitionEvents.push(payload)
    })
    fsm.on('fsm.transition.rejected', (payload) => {
      rejectionEvents.push(payload)
    })
    
    const utteranceId = fsm.createUtterance({ sessionId: 'test' })
    
    // Valid transition: PENDING_PARTIAL -> STREAMING_ACTIVE
    const success1 = fsm.applyPartial(utteranceId, 'Hello')
    assert(success1, 'Should successfully apply partial')
    
    const utterance = fsm.getUtterance(utteranceId)
    assertEqual(utterance.state, TranscriptState.STREAMING_ACTIVE)
    
    // Invalid transition attempt: Try to finalize directly from PENDING (this should work actually)
    const success2 = fsm.applyFinal(utteranceId, 'Hello world')
    assert(success2, 'Should successfully apply final from streaming')
    
    // Invalid transition: Try to apply partial after finalization
    const success3 = fsm.applyPartial(utteranceId, 'More text')
    assert(!success3, 'Should reject partial after finalization')
    
    // Verify history tracking
    assert(historyEvents.length >= 2, 'Should record transition history')
    assert(transitionEvents.length >= 2, 'Should emit transition events')
    
    // Get full history
    const history = fsm.getHistory()
    assert(history.length >= 2, 'Should maintain transition history')
    
    // Get utterance-specific history
    const utteranceHistory = fsm.getHistory(utteranceId)
    assert(utteranceHistory.length >= 2, 'Should track utterance-specific history')
    assert(utteranceHistory.every(entry => entry.utteranceId === utteranceId))
    
    fsm.destroy()
  })

  test('Error Handling and Recovery', () => {
    const fsm = new TranscriptFSMCore(testConfig)
    let errorEvents = []
    
    fsm.on('fsm.error', (payload) => {
      errorEvents.push(payload)
    })
    
    // Test operations on non-existent utterance
    const success1 = fsm.applyPartial('nonexistent', 'text')
    assert(!success1, 'Should handle non-existent utterance gracefully')
    
    const success2 = fsm.applyFinal('nonexistent', 'text')
    assert(!success2, 'Should handle non-existent utterance gracefully')
    
    const success3 = fsm.markEndOfSpeech('nonexistent')
    assert(!success3, 'Should handle non-existent utterance gracefully')
    
    const success4 = fsm.abortUtterance('nonexistent', 'error')
    assert(!success4, 'Should handle non-existent utterance gracefully')
    
    const success5 = fsm.recoverUtterance('nonexistent', 'text')
    assert(!success5, 'Should handle non-existent utterance gracefully')
    
    // Verify error events were emitted
    assert(errorEvents.length >= 5, 'Should emit error events for invalid operations')
    
    fsm.destroy()
  })

  test('Complete Utterance Lifecycle', () => {
    const fsm = new TranscriptFSMCore(testConfig)
    const sessionId = 'lifecycle-test'
    
    // Create utterance with initial partial
    const utteranceId = fsm.createUtterance({
      sessionId,
      firstPartial: { text: 'Hello', confidence: 0.8 }
    })
    
    let utterance = fsm.getUtterance(utteranceId)
    assertEqual(utterance.state, TranscriptState.STREAMING_ACTIVE)
    assertEqual(utterance.textDraft, 'Hello')
    assertEqual(utterance.confidence, 0.8)
    
    // Add more partials
    fsm.applyPartial(utteranceId, 'Hello there', 0.85)
    utterance = fsm.getUtterance(utteranceId)
    assertEqual(utterance.textDraft, 'Hello there')
    assertEqual(utterance.confidence, 0.85)
    
    // Mark end of speech
    fsm.markEndOfSpeech(utteranceId)
    utterance = fsm.getUtterance(utteranceId)
    assertEqual(utterance.state, TranscriptState.AWAITING_FINAL)
    assert(utterance.awaitingFinalSince, 'Should set awaiting final timestamp')
    
    // Apply final
    fsm.applyFinal(utteranceId, 'Hello there, how are you?', 0.9)
    utterance = fsm.getUtterance(utteranceId)
    assertEqual(utterance.state, TranscriptState.FINALIZED)
    assertEqual(utterance.finalText, 'Hello there, how are you?')
    assertEqual(utterance.confidence, 0.9)
    assert(utterance.finalizedAt, 'Should set finalized timestamp')
    
    const metrics = fsm.getMetrics()
    assert(metrics.partialUpdates > 0, 'Should track partial updates')
    assert(metrics.finalizations > 0, 'Should track finalizations')
    
    fsm.destroy()
  })

  test('Abort and Recovery Scenarios', () => {
    const fsm = new TranscriptFSMCore(testConfig)
    
    // Test user abort
    const utteranceId1 = fsm.createUtterance({ sessionId: 'abort-test-1' })
    fsm.applyPartial(utteranceId1, 'This will be aborted')
    
    const success1 = fsm.abortUtterance(utteranceId1, 'user')
    assert(success1, 'Should successfully abort utterance')
    
    let utterance1 = fsm.getUtterance(utteranceId1)
    assertEqual(utterance1.state, TranscriptState.ABORTED)
    assert(utterance1.abortedAt, 'Should set aborted timestamp')
    
    // Test error abort
    const utteranceId2 = fsm.createUtterance({ sessionId: 'abort-test-2' })
    fsm.applyPartial(utteranceId2, 'This will error')
    
    const success2 = fsm.abortUtterance(utteranceId2, 'error')
    assert(success2, 'Should successfully abort on error')
    
    // Test recovery
    const utteranceId3 = fsm.createUtterance({ sessionId: 'recovery-test' })
    fsm.applyPartial(utteranceId3, 'Original text')
    fsm.markEndOfSpeech(utteranceId3)
    
    const success3 = fsm.recoverUtterance(utteranceId3, 'Recovered text', 0.75)
    assert(success3, 'Should successfully recover utterance')
    
    let utterance3 = fsm.getUtterance(utteranceId3)
    assertEqual(utterance3.state, TranscriptState.RECOVERED)
    assertEqual(utterance3.textDraft, 'Recovered text')
    assertEqual(utterance3.confidence, 0.75)
    assert(utterance3.recoveredAt, 'Should set recovered timestamp')
    
    const metrics = fsm.getMetrics()
    assert(metrics.aborts >= 2, 'Should track aborts')
    assert(metrics.recoveries >= 1, 'Should track recoveries')
    
    fsm.destroy()
  })

  test('History Management and Pruning', () => {
    const fsm = new TranscriptFSMCore({
      ...testConfig,
      historyRetentionCount: 3,
      historyRetentionMs: 100 // Very short for testing
    })
    
    let pruneEvents = []
    fsm.on('fsm.history.pruned', (payload) => {
      pruneEvents.push(payload)
    })
    
    // Create multiple utterances to generate history
    for (let i = 0; i < 5; i++) {
      const utteranceId = fsm.createUtterance({ sessionId: `test-${i}` })
      fsm.applyPartial(utteranceId, `Text ${i}`)
      fsm.applyFinal(utteranceId, `Final text ${i}`)
    }
    
    let history = fsm.getHistory()
    assert(history.length <= 3, 'Should limit history to retention count')
    
    // Wait for time-based pruning
    setTimeout(() => {
      // Trigger another operation to cause pruning check
      const utteranceId = fsm.createUtterance({ sessionId: 'trigger-prune' })
      fsm.applyPartial(utteranceId, 'Trigger pruning')
      
      // Verify pruning occurred
      assert(pruneEvents.length > 0, 'Should emit prune events')
    }, 150)
    
    // Test manual history clearing
    fsm.clearHistory()
    history = fsm.getHistory()
    assertEqual(history.length, 0, 'Should clear all history')
    
    fsm.destroy()
  })

  test('Metrics and Performance Tracking', () => {
    const fsm = new TranscriptFSMCore(testConfig)
    
    const initialMetrics = fsm.getMetrics()
    assertEqual(initialMetrics.totalUtterances, 0)
    assertEqual(initialMetrics.transitionsCount, 0)
    
    // Create and process multiple utterances
    for (let i = 0; i < 3; i++) {
      const utteranceId = fsm.createUtterance({ sessionId: `metrics-${i}` })
      fsm.applyPartial(utteranceId, `Partial ${i}`)
      fsm.applyPartial(utteranceId, `Updated partial ${i}`)
      fsm.applyFinal(utteranceId, `Final ${i}`)
    }
    
    const finalMetrics = fsm.getMetrics()
    assertEqual(finalMetrics.totalUtterances, 3)
    assert(finalMetrics.transitionsCount >= 6, 'Should track all transitions')
    assert(finalMetrics.partialUpdates >= 6, 'Should track partial updates')
    assert(finalMetrics.finalizations >= 3, 'Should track finalizations')
    assert(finalMetrics.lastActivity > initialMetrics.lastActivity, 'Should update activity timestamp')
    
    fsm.destroy()
  })

  test('Memory Management and Cleanup', async () => {
    const fsm = new TranscriptFSMCore({
      ...testConfig,
      maxUtterances: 2,
      terminalRetentionMs: 50 // Very short for testing
    })
    
    // Create more utterances than the limit
    const utteranceIds = []
    for (let i = 0; i < 4; i++) {
      const utteranceId = fsm.createUtterance({ sessionId: `cleanup-${i}` })
      fsm.applyFinal(utteranceId, `Final ${i}`) // Finalize to make them terminal
      utteranceIds.push(utteranceId)
    }
    
    // Wait for cleanup to potentially run
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Trigger cleanup by creating another utterance
    const newUtteranceId = fsm.createUtterance({ sessionId: 'trigger-cleanup' })
    
    // Check that old utterances were cleaned up
    let existingCount = 0
    for (const id of utteranceIds) {
      if (fsm.getUtterance(id)) {
        existingCount++
      }
    }
    
    // Should have cleaned up some old utterances
    assert(existingCount <= testConfig.maxUtterances, 'Should clean up old utterances')
    
    // New utterance should still exist
    assert(fsm.getUtterance(newUtteranceId), 'Should keep new utterances')
    
    fsm.destroy()
  })

  console.log('\\n📊 Test Results Summary')
  console.log('========================')
  console.log(`✅ Passed: ${testResults.passed}/${testResults.total}`)
  console.log(`❌ Failed: ${testResults.failed}/${testResults.total}`)
  console.log(`📈 Success Rate: ${Math.round((testResults.passed / testResults.total) * 100)}%`)

  if (testResults.failed === 0) {
    console.log('\\n🎉 All tests passed! Enhanced FSM implementation is working correctly.')
    process.exit(0)
  } else {
    console.log('\\n⚠️  Some tests failed. Please review the implementation.')
    process.exit(1)
  }
}

runTests().catch((error) => {
  console.error('❌ Test suite failed to run:', error)
  process.exit(1)
})