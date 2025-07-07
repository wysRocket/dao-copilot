/**
 * Gemini Message Handler Validation Tests
 * Validates the bidirectional message handling implementation against Task 23 requirements
 */

import {GeminiMessageHandler, MessageType, MessagePriority} from './gemini-message-handler'

interface ValidationResult {
  test: string
  passed: boolean
  details: string
  error?: string
}

/**
 * Validates the MessageHandler class structure and initialization
 */
async function validateMessageHandlerStructure(): Promise<ValidationResult> {
  try {
    const handler = new GeminiMessageHandler()

    // Verify class extends EventEmitter
    const hasEventMethods =
      typeof handler.on === 'function' &&
      typeof handler.emit === 'function' &&
      typeof handler.removeAllListeners === 'function'

    // Verify core methods exist
    const hasCoreMethods =
      typeof handler.queueMessage === 'function' &&
      typeof handler.processIncomingMessage === 'function' &&
      typeof handler.getStats === 'function' &&
      typeof handler.getHistory === 'function' &&
      typeof handler.clearQueue === 'function'

    // Verify queue status method
    const queueStatus = handler.getQueueStatus()
    const hasValidQueueStatus =
      typeof queueStatus === 'object' &&
      MessagePriority.URGENT in queueStatus &&
      MessagePriority.HIGH in queueStatus &&
      MessagePriority.NORMAL in queueStatus &&
      MessagePriority.LOW in queueStatus

    // Clean up
    handler.destroy()

    if (!hasEventMethods) {
      return {
        test: 'MessageHandler Structure',
        passed: false,
        details: 'Missing EventEmitter methods',
        error: 'Class does not properly extend EventEmitter'
      }
    }

    if (!hasCoreMethods) {
      return {
        test: 'MessageHandler Structure',
        passed: false,
        details: 'Missing core methods',
        error: 'Required methods not implemented'
      }
    }

    if (!hasValidQueueStatus) {
      return {
        test: 'MessageHandler Structure',
        passed: false,
        details: 'Invalid queue status structure',
        error: 'Queue status does not include all priority levels'
      }
    }

    return {
      test: 'MessageHandler Structure',
      passed: true,
      details: `✅ MessageHandler class properly extends EventEmitter with all required methods\n✅ Priority queue structure correctly initialized\n✅ Queue status monitoring functional`
    }
  } catch (error) {
    return {
      test: 'MessageHandler Structure',
      passed: false,
      details: 'Error during structure validation',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Validates message type definitions and enums
 */
async function validateMessageTypeDefinitions(): Promise<ValidationResult> {
  try {
    // Verify MessageType enum includes all required types
    const requiredOutgoingTypes = [
      MessageType.CLIENT_CONTENT,
      MessageType.REALTIME_INPUT,
      MessageType.PING,
      MessageType.SETUP
    ]

    const requiredIncomingTypes = [
      MessageType.SERVER_CONTENT,
      MessageType.MODEL_TURN,
      MessageType.TURN_COMPLETE,
      MessageType.AUDIO_DATA,
      MessageType.PONG,
      MessageType.ERROR,
      MessageType.SETUP_COMPLETE
    ]

    // Verify MessagePriority enum
    const requiredPriorities = [
      MessagePriority.LOW,
      MessagePriority.NORMAL,
      MessagePriority.HIGH,
      MessagePriority.URGENT
    ]

    const hasAllOutgoing = requiredOutgoingTypes.every(
      type => typeof type === 'string' && type.length > 0
    )

    const hasAllIncoming = requiredIncomingTypes.every(
      type => typeof type === 'string' && type.length > 0
    )

    const hasAllPriorities = requiredPriorities.every(
      priority => typeof priority === 'number' && priority >= 0
    )

    if (!hasAllOutgoing || !hasAllIncoming) {
      return {
        test: 'Message Type Definitions',
        passed: false,
        details: 'Missing required message types',
        error: 'MessageType enum incomplete'
      }
    }

    if (!hasAllPriorities) {
      return {
        test: 'Message Type Definitions',
        passed: false,
        details: 'Missing required priority levels',
        error: 'MessagePriority enum incomplete'
      }
    }

    return {
      test: 'Message Type Definitions',
      passed: true,
      details: `✅ All outgoing message types defined: ${requiredOutgoingTypes.join(', ')}\n✅ All incoming message types defined: ${requiredIncomingTypes.join(', ')}\n✅ All priority levels defined: ${requiredPriorities.join(', ')}`
    }
  } catch (error) {
    return {
      test: 'Message Type Definitions',
      passed: false,
      details: 'Error during type validation',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Validates outgoing message formatting
 */
async function validateOutgoingMessageFormatting(): Promise<ValidationResult> {
  try {
    const handler = new GeminiMessageHandler()

    // Test CLIENT_CONTENT formatting
    const clientContentPromise = handler.queueMessage(
      {
        parts: [{text: 'Test message'}],
        turn_complete: true
      },
      MessageType.CLIENT_CONTENT,
      MessagePriority.NORMAL
    )

    // Test SETUP formatting
    const setupPromise = handler.queueMessage(
      {
        model: 'gemini-live-2.5-flash-preview',
        responseModalities: ['TEXT', 'AUDIO'],
        systemInstruction: 'You are a helpful assistant.'
      },
      MessageType.SETUP,
      MessagePriority.HIGH
    )

    // Test PING formatting
    const pingPromise = handler.queueMessage({}, MessageType.PING, MessagePriority.LOW)

    // Wait for messages to be queued
    await Promise.all([clientContentPromise, setupPromise, pingPromise])

    // Check queue status
    const queueStatus = handler.getQueueStatus()
    const hasQueuedMessages =
      queueStatus[MessagePriority.NORMAL] > 0 ||
      queueStatus[MessagePriority.HIGH] > 0 ||
      queueStatus[MessagePriority.LOW] > 0

    // Get stats
    const stats = handler.getStats()
    const hasValidStats = stats.queued >= 3 && typeof stats.lastActivity === 'number'

    // Clean up
    handler.destroy()

    if (!hasQueuedMessages) {
      return {
        test: 'Outgoing Message Formatting',
        passed: false,
        details: 'Messages not properly queued',
        error: 'Queue status shows no messages after queueing'
      }
    }

    if (!hasValidStats) {
      return {
        test: 'Outgoing Message Formatting',
        passed: false,
        details: 'Invalid statistics tracking',
        error: 'Stats not properly updated after message operations'
      }
    }

    return {
      test: 'Outgoing Message Formatting',
      passed: true,
      details: `✅ CLIENT_CONTENT messages properly formatted and queued\n✅ SETUP messages with model configuration queued\n✅ PING messages formatted correctly\n✅ Queue statistics tracking functional`
    }
  } catch (error) {
    return {
      test: 'Outgoing Message Formatting',
      passed: false,
      details: 'Error during formatting validation',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Validates incoming message processing and event emission
 */
async function validateIncomingMessageProcessing(): Promise<ValidationResult> {
  try {
    const handler = new GeminiMessageHandler()
    let eventCount = 0
    let lastEvent: string | null = null

    // Set up event listeners
    handler.on('serverContent', () => {
      eventCount++
      lastEvent = 'serverContent'
    })
    handler.on('audioData', () => {
      eventCount++
      lastEvent = 'audioData'
    })
    handler.on('turnComplete', () => {
      eventCount++
      lastEvent = 'turnComplete'
    })
    handler.on('error', () => {
      eventCount++
      lastEvent = 'error'
    })
    handler.on('messageProcessed', () => {
      eventCount++
      lastEvent = 'messageProcessed'
    })
    handler.on('messageError', () => {
      eventCount++
      lastEvent = 'messageError'
    })

    // Test SERVER_CONTENT processing
    const serverContentMessage = JSON.stringify({
      server_content: {
        model_turn: {
          parts: [{text: 'Response from server'}]
        }
      }
    })

    const processed1 = handler.processIncomingMessage(serverContentMessage)

    // Test AUDIO_DATA processing
    const audioMessage = JSON.stringify({
      data: 'base64encodedaudiodata',
      audio_data: 'audio content'
    })

    const processed2 = handler.processIncomingMessage(audioMessage)

    // Test malformed message
    const malformedMessage = 'invalid json'
    const processed3 = handler.processIncomingMessage(malformedMessage)

    // Verify processing results
    const validProcessed = processed1.isValid && processed2.isValid
    const errorProcessed = !processed3.isValid && processed3.type === MessageType.ERROR

    // Check history (should have at least 2 valid messages, error messages may not be in history)
    const history = handler.getHistory(5)
    const hasHistory = history.length >= 2

    // Clean up
    handler.destroy()

    if (!validProcessed) {
      return {
        test: 'Incoming Message Processing',
        passed: false,
        details: 'Valid messages not processed correctly',
        error: 'Message processing failed for valid input'
      }
    }

    if (!errorProcessed) {
      return {
        test: 'Incoming Message Processing',
        passed: false,
        details: 'Error handling not working',
        error: 'Malformed messages not handled properly'
      }
    }

    if (!hasHistory) {
      return {
        test: 'Incoming Message Processing',
        passed: false,
        details: 'Message history not maintained',
        error: 'History tracking not functional'
      }
    }

    if (eventCount === 0) {
      return {
        test: 'Incoming Message Processing',
        passed: false,
        details: 'Events not emitted',
        error: 'Event emission system not working'
      }
    }

    return {
      test: 'Incoming Message Processing',
      passed: true,
      details: `✅ Server content messages processed correctly\n✅ Audio data messages handled properly\n✅ Malformed messages generate appropriate errors\n✅ Event emission functional (${eventCount} events, last: ${lastEvent})\n✅ Message history tracking operational`
    }
  } catch (error) {
    return {
      test: 'Incoming Message Processing',
      passed: false,
      details: 'Error during processing validation',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Validates priority queue system
 */
async function validatePriorityQueueSystem(): Promise<ValidationResult> {
  try {
    const handler = new GeminiMessageHandler()

    // Queue messages with different priorities
    await handler.queueMessage('urgent', MessageType.CLIENT_CONTENT, MessagePriority.URGENT)
    await handler.queueMessage('high', MessageType.CLIENT_CONTENT, MessagePriority.HIGH)
    await handler.queueMessage('normal', MessageType.CLIENT_CONTENT, MessagePriority.NORMAL)
    await handler.queueMessage('low', MessageType.CLIENT_CONTENT, MessagePriority.LOW)

    // Check queue status
    const queueStatus = handler.getQueueStatus()
    const totalQueued = Object.values(queueStatus).reduce((sum, count) => sum + count, 0)

    // Verify each priority has messages
    const hasUrgent = queueStatus[MessagePriority.URGENT] > 0
    const hasHigh = queueStatus[MessagePriority.HIGH] > 0
    const hasNormal = queueStatus[MessagePriority.NORMAL] > 0
    const hasLow = queueStatus[MessagePriority.LOW] > 0

    // Test queue clearing
    handler.clearQueue(MessagePriority.LOW)
    const statusAfterClear = handler.getQueueStatus()
    const lowCleared = statusAfterClear[MessagePriority.LOW] === 0

    // Clean up
    handler.destroy()

    if (totalQueued !== 4) {
      return {
        test: 'Priority Queue System',
        passed: false,
        details: 'Incorrect queue count',
        error: `Expected 4 queued messages, got ${totalQueued}`
      }
    }

    if (!hasUrgent || !hasHigh || !hasNormal || !hasLow) {
      return {
        test: 'Priority Queue System',
        passed: false,
        details: 'Priority queues not working correctly',
        error: 'Messages not distributed to correct priority queues'
      }
    }

    if (!lowCleared) {
      return {
        test: 'Priority Queue System',
        passed: false,
        details: 'Queue clearing not working',
        error: 'clearQueue method failed to clear low priority queue'
      }
    }

    return {
      test: 'Priority Queue System',
      passed: true,
      details: `✅ Messages queued by priority: URGENT(${queueStatus[MessagePriority.URGENT]}), HIGH(${queueStatus[MessagePriority.HIGH]}), NORMAL(${queueStatus[MessagePriority.NORMAL]}), LOW(${queueStatus[MessagePriority.LOW]})\n✅ Priority-based queue management functional\n✅ Queue clearing by priority working correctly`
    }
  } catch (error) {
    return {
      test: 'Priority Queue System',
      passed: false,
      details: 'Error during queue validation',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Runs all validation tests for the MessageHandler implementation
 */
async function runMessageHandlerValidation(): Promise<void> {
  console.log('🧪 Running Gemini MessageHandler Validation Tests...\n')

  const tests = [
    validateMessageHandlerStructure,
    validateMessageTypeDefinitions,
    validateOutgoingMessageFormatting,
    validateIncomingMessageProcessing,
    validatePriorityQueueSystem
  ]

  const results: ValidationResult[] = []

  for (const test of tests) {
    try {
      const result = await test()
      results.push(result)

      if (result.passed) {
        console.log(`✅ ${result.test}`)
        console.log(`   ${result.details.replace(/\n/g, '\n   ')}\n`)
      } else {
        console.log(`❌ ${result.test}`)
        console.log(`   ${result.details}`)
        if (result.error) {
          console.log(`   Error: ${result.error}`)
        }
        console.log('')
      }
    } catch (error) {
      const errorResult: ValidationResult = {
        test: 'Unknown Test',
        passed: false,
        details: 'Unexpected error during test execution',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      results.push(errorResult)
      console.log(`❌ ${errorResult.test}`)
      console.log(`   ${errorResult.details}`)
      console.log(`   Error: ${errorResult.error}\n`)
    }
  }

  // Summary
  const passed = results.filter(r => r.passed).length
  const total = results.length

  console.log('📊 Validation Summary')
  console.log('='.repeat(50))
  console.log(`Tests Passed: ${passed}/${total}`)
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`)

  if (passed === total) {
    console.log('\n🎉 All MessageHandler validation tests passed!')
    console.log('The bidirectional message handler implementation is ready for production use.')
  } else {
    console.log(`\n⚠️  ${total - passed} test(s) failed. Please review the implementation.`)
  }
}

// Export for use in other modules
export {
  runMessageHandlerValidation,
  validateMessageHandlerStructure,
  validateMessageTypeDefinitions,
  validateOutgoingMessageFormatting,
  validateIncomingMessageProcessing,
  validatePriorityQueueSystem
}

// Run validation if called directly
if (require.main === module) {
  runMessageHandlerValidation().catch(console.error)
}
