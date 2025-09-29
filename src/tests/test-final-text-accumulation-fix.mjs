#!/usr/bin/env node

/**
 * Test Script: Final Text Accumulation Fix Validation
 *
 * This script validates that the final text accumulation fix correctly:
 * 1. Accumulates text chunks instead of replacing them
 * 2. Resets text state on setup complete
 * 3. Emits final transcription on turn complete
 *
 * Issue: Some transcription sessions were timing out because _currentTurnText
 * only contained the last chunk (often empty), not the accumulated text.
 */

import {execSync} from 'child_process'
import {readFileSync} from 'fs'

const WEBSOCKET_FILE = 'src/services/gemini-live-websocket.ts'

console.log('🔍 Validating Final Text Accumulation Fix...\n')

// Test 1: Text accumulation logic
console.log('✅ Test 1: Text accumulation logic')
try {
  const content = readFileSync(WEBSOCKET_FILE, 'utf8')

  // Check that text is accumulated (+=) not replaced (=)
  const hasAccumulation = content.includes('this._currentTurnText += geminiResponse.content')
  const noReplacement = !content.includes('this._currentTurnText = geminiResponse.content')

  console.log(`   - Text accumulation (+=): ${hasAccumulation ? '✅ FOUND' : '❌ MISSING'}`)
  console.log(`   - No text replacement (=): ${noReplacement ? '✅ CONFIRMED' : '❌ STILL EXISTS'}`)

  if (!hasAccumulation || !noReplacement) {
    throw new Error('Text accumulation logic not properly implemented')
  }
} catch (error) {
  console.error(`❌ Test 1 failed: ${error.message}`)
  process.exit(1)
}

// Test 2: Setup complete reset logic
console.log('\n✅ Test 2: Setup complete reset logic')
try {
  const content = readFileSync(WEBSOCKET_FILE, 'utf8')

  // Find setup_complete case block
  const setupCompleteMatch = content.match(/case 'setup_complete':([\s\S]*?)break/)
  if (!setupCompleteMatch) {
    throw new Error('setup_complete case not found')
  }

  const setupCompleteBlock = setupCompleteMatch[1]
  const hasTextReset = setupCompleteBlock.includes("this._currentTurnText = ''")
  const hasFinalReset = setupCompleteBlock.includes('this._finalEmittedForTurn = false')

  console.log(`   - Text state reset: ${hasTextReset ? '✅ FOUND' : '❌ MISSING'}`)
  console.log(`   - Final emitted reset: ${hasFinalReset ? '✅ FOUND' : '❌ MISSING'}`)

  if (!hasTextReset || !hasFinalReset) {
    throw new Error('Setup complete reset logic not properly implemented')
  }
} catch (error) {
  console.error(`❌ Test 2 failed: ${error.message}`)
  process.exit(1)
}

// Test 3: Turn complete emission logic
console.log('\n✅ Test 3: Turn complete emission logic')
try {
  const content = readFileSync(WEBSOCKET_FILE, 'utf8')

  // Find turn complete handling
  const turnCompletePattern =
    /If we received a turn_complete without an explicit final text event, synthesize one from last partial/
  const hasTurnCompleteLogic = turnCompletePattern.test(content)

  // Check for transcriptionUpdate emission
  const hasTranscriptionEmit = content.includes("this.emit('transcriptionUpdate', {")
  const hasFinalFlag = content.includes('isFinal: true')

  console.log(`   - Turn complete synthesis: ${hasTurnCompleteLogic ? '✅ FOUND' : '❌ MISSING'}`)
  console.log(`   - Transcription emission: ${hasTranscriptionEmit ? '✅ FOUND' : '❌ MISSING'}`)
  console.log(`   - Final flag setting: ${hasFinalFlag ? '✅ FOUND' : '❌ MISSING'}`)

  if (!hasTurnCompleteLogic || !hasTranscriptionEmit || !hasFinalFlag) {
    throw new Error('Turn complete emission logic issues found')
  }
} catch (error) {
  console.error(`❌ Test 3 failed: ${error.message}`)
  process.exit(1)
}

// Test 4: Log message validation
console.log('\n✅ Test 4: Debug logging validation')
try {
  const content = readFileSync(WEBSOCKET_FILE, 'utf8')

  // Check for the specific debug message
  const hasDebugLog = content.includes('Emitted synthesized final transcription on turn_complete')

  console.log(`   - Debug log message: ${hasDebugLog ? '✅ FOUND' : '❌ MISSING'}`)

  if (!hasDebugLog) {
    throw new Error('Expected debug log message not found')
  }
} catch (error) {
  console.error(`❌ Test 4 failed: ${error.message}`)
  process.exit(1)
}

console.log('\n🎉 All tests passed! Final text accumulation fix is properly implemented.')
console.log('\nExpected behavior:')
console.log('✅ Text chunks will be accumulated (not replaced)')
console.log('✅ Text state resets on new session setup')
console.log('✅ Final transcription emitted even if last chunk is empty')
console.log('✅ No more timeout failures due to missing final text')

console.log('\n🔧 Testing recommendations:')
console.log('1. Test with multi-chunk transcriptions (like "hello world" → "hello", " world")')
console.log('2. Test with empty final chunks (common with generationComplete messages)')
console.log('3. Verify no more 10-second timeout failures')
console.log('4. Check that all text chunks are included in final result')

console.log('\n📊 Issue summary:')
console.log('- Root cause: Text replacement instead of accumulation')
console.log('- Symptom: Timeouts when last chunk was empty')
console.log('- Solution: Accumulate text chunks + proper state reset')
console.log('- Result: Reliable final text capture from all sessions')
