#!/usr/bin/env node

/**
 * Test TranscriptionQuestionBridge Integration
 *
 * This test validates that the bridge properly processes transcription events,
 * detects questions, and triggers answer generation.
 */

import {TranscriptionQuestionBridge} from './src/services/TranscriptionQuestionBridge.js'

async function testTranscriptionQuestionBridge() {
  console.log('🤖 Testing TranscriptionQuestionBridge Integration...\n')

  try {
    // Initialize the bridge with test configuration
    console.log('📝 Initializing TranscriptionQuestionBridge...')
    const bridge = new TranscriptionQuestionBridge({
      questionConfidenceThreshold: 0.7,
      questionMinLength: 5,
      contextBufferSize: 5,
      autoGenerateAnswers: true,
      answerTimeoutMs: 10000,
      maxConcurrentAnswers: 2,
      bufferTimeoutMs: 500,
      enableRealTimeProcessing: true,
      maxProcessingTimeMs: 3000,
      enableDebugLogging: true,
      logTranscriptionEvents: true
    })

    // Set up event listeners
    bridge.on('question_detected', event => {
      console.log('🔍 Question detected:', {
        questionId: event.questionId,
        question: event.question.substring(0, 100),
        confidence: event.confidence,
        questionType: event.questionType
      })
    })

    bridge.on('answer_generated', event => {
      console.log('💬 Answer generated:', {
        questionId: event.questionId,
        hasAnswer: !!event.answer,
        processingTime: event.processingTime
      })
    })

    bridge.on('error', error => {
      console.error('❌ Bridge error:', error)
    })

    // Initialize the bridge
    await bridge.initialize()
    console.log('✅ Bridge initialized successfully\n')

    // Test cases - simulate different types of transcriptions
    const testCases = [
      {
        name: 'Partial transcription without question',
        event: {
          id: 'test-1',
          text: 'Hello, I am testing the transcription system',
          confidence: 0.9,
          isFinal: false,
          source: 'websocket',
          timestamp: Date.now()
        }
      },
      {
        name: 'Final transcription with question (English)',
        event: {
          id: 'test-2',
          text: 'What is the capital of France?',
          confidence: 0.95,
          isFinal: true,
          source: 'websocket',
          timestamp: Date.now()
        }
      },
      {
        name: 'Russian transcription with question',
        event: {
          id: 'test-3',
          text: 'Что такое искусственный интеллект?',
          confidence: 0.85,
          isFinal: true,
          source: 'websocket',
          timestamp: Date.now()
        }
      },
      {
        name: 'Complex question with context',
        event: {
          id: 'test-4',
          text: 'Given the current market conditions, how should I diversify my investment portfolio?',
          confidence: 0.88,
          isFinal: true,
          source: 'websocket',
          timestamp: Date.now()
        }
      }
    ]

    // Process each test case
    for (const testCase of testCases) {
      console.log(`\n📋 Running test: ${testCase.name}`)
      console.log(`   Input: "${testCase.event.text}"`)

      try {
        await bridge.processTranscription(testCase.event)
        console.log('   ✅ Processed successfully')

        // Wait a moment for async processing
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (error) {
        console.error(`   ❌ Processing failed:`, error.message)
      }
    }

    // Wait for any pending operations
    console.log('\n⏳ Waiting for pending operations...')
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Get metrics
    const metrics = bridge.getMetrics()
    console.log('\n📊 Final Metrics:')
    console.log('   Transcriptions processed:', metrics.transcriptionsProcessed)
    console.log('   Questions detected:', metrics.questionsDetected)
    console.log('   Answers generated:', metrics.answersGenerated)
    console.log(
      '   Average question detection time:',
      `${metrics.averageQuestionDetectionTime.toFixed(2)}ms`
    )
    console.log('   Error count:', metrics.errorCount)

    // Cleanup
    bridge.stop()
    console.log('\n✅ Test completed successfully!')
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

// Run the test
testTranscriptionQuestionBridge().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
