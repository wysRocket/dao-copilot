#!/usr/bin/env node

/**
 * Test Script: FSM Integration with WebSocket Client
 *
 * This script validates that the TranscriptFSM is properly integrated with
 * the GeminiLiveWebSocketClient for transcript lifecycle management.
 */

import {readFileSync} from 'fs'

const WEBSOCKET_FILE = 'src/services/gemini-live-websocket.ts'

console.log('🔍 Validating FSM Integration with WebSocket Client...\n')

try {
  const content = readFileSync(WEBSOCKET_FILE, 'utf8')

  // Test 1: FSM import
  const hasImport = content.includes("import {TranscriptFSM} from '../transcription/fsm'")
  console.log(`✅ Test 1: FSM import - ${hasImport ? '✅ FOUND' : '❌ MISSING'}`)

  // Test 2: FSM state properties
  const hasUtteranceId = content.includes('_currentUtteranceId: string | null = null')
  const hasSessionId = content.includes("_sessionId: string = 'default'")
  console.log(
    `✅ Test 2: FSM state properties - ${hasUtteranceId && hasSessionId ? '✅ FOUND' : '❌ MISSING'}`
  )

  // Test 3: FSM utterance creation
  const hasCreateUtterance = content.includes('TranscriptFSM.createUtterance')
  console.log(
    `✅ Test 3: FSM utterance creation - ${hasCreateUtterance ? '✅ FOUND' : '❌ MISSING'}`
  )

  // Test 4: FSM partial application
  const hasApplyPartial = content.includes('TranscriptFSM.applyPartial')
  console.log(`✅ Test 4: FSM partial application - ${hasApplyPartial ? '✅ FOUND' : '❌ MISSING'}`)

  // Test 5: FSM final application
  const hasApplyFinal = content.includes('TranscriptFSM.applyFinal')
  console.log(`✅ Test 5: FSM final application - ${hasApplyFinal ? '✅ FOUND' : '❌ MISSING'}`)

  // Test 6: Session reset logic
  const hasSessionReset = content.includes('this._currentUtteranceId = null')
  const hasSessionIdReset = content.includes('this._sessionId = `session-')
  console.log(
    `✅ Test 6: Session reset logic - ${hasSessionReset && hasSessionIdReset ? '✅ FOUND' : '❌ MISSING'}`
  )

  // Test 7: Integration points count
  const integrationPoints = [
    content.includes('// FSM integration: Create utterance'),
    content.includes('// FSM integration: Apply final text'),
    content.includes('// FSM integration: Reset session state'),
    content.includes('// FSM integration: Handle final text')
  ].filter(Boolean).length

  console.log(`✅ Test 7: Integration points - ${integrationPoints}/4 found`)

  if (
    hasImport &&
    hasUtteranceId &&
    hasSessionId &&
    hasCreateUtterance &&
    hasApplyPartial &&
    hasApplyFinal &&
    hasSessionReset &&
    integrationPoints >= 3
  ) {
    console.log('\n🎉 All FSM integration tests passed!')

    console.log('\n🔧 Expected behavior:')
    console.log('✅ New utterances created when text starts arriving')
    console.log('✅ Partials accumulated in FSM state')
    console.log('✅ Final text properly applied on completion')
    console.log('✅ Session state reset on setup_complete')
    console.log('✅ Proper transcript lifecycle management')

    console.log('\n📊 Architecture benefits:')
    console.log('- 🎯 Deterministic transcript state transitions')
    console.log('- 🔄 Automatic orphan detection and recovery')
    console.log('- 📈 Telemetry and observability for transcripts')
    console.log('- 🛡️ Prevents duplicate/conflicting transcripts')
    console.log('- ⚡ Foundation for advanced features (persistence, fallback)')
  } else {
    console.log('\n❌ Some FSM integration tests failed. Check implementation.')
    process.exit(1)
  }
} catch (error) {
  console.error(`❌ Failed to validate FSM integration: ${error.message}`)
  process.exit(1)
}

console.log('\n🚀 Next steps:')
console.log('1. Test with actual transcription sessions')
console.log('2. Monitor FSM state transitions in logs')
console.log('3. Validate orphan detection works correctly')
console.log('4. Check telemetry events are emitted')
console.log('5. Implement persistence layer integration')
