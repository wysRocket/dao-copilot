/**
 * Advanced Intent Classification System Test Suite
 *
 * Comprehensive test suite for validating the Advanced Intent Classifier
 * which enhances question detection with sophisticated NLP capabilities.
 *
 * Test Coverage:
 * 1. Multi-intent classification with confidence scoring
 * 2. Questions without punctuation detection
 * 3. Embedded question recognition within longer utterances
 * 4. Context-aware intent resolution
 * 5. Performance and accuracy benchmarks
 * 6. Edge case handling
 * 7. Integration with existing pipeline
 */

import {AdvancedIntentClassifier} from './src/services/advanced-intent-classifier.ts'

// Test configuration
const TEST_CONFIG = {
  confidenceThreshold: 0.7,
  enableMultiIntentDetection: true,
  multiIntentThreshold: 0.6,
  enableEmbeddedQuestionDetection: true,
  enableContextualIntentResolution: true,
  contextWindowSize: 5,
  nlpProcessingTimeout: 100
}

/**
 * Test Cases Database
 */
const testCases = {
  // Basic intent classification tests
  basicIntents: [
    {
      text: 'What is the capital of France',
      expectedIntent: 'information_seeking',
      expectedConfidence: 0.8,
      hasQuestionMark: false,
      description: 'Question without punctuation'
    },
    {
      text: 'How do I install Node.js on Windows',
      expectedIntent: 'instruction_request',
      expectedConfidence: 0.9,
      hasQuestionMark: false,
      description: 'Instruction request without punctuation'
    },
    {
      text: 'Can you explain what machine learning means',
      expectedIntent: 'clarification',
      expectedConfidence: 0.8,
      hasQuestionMark: false,
      description: 'Clarification request without punctuation'
    },
    {
      text: 'Is this approach correct',
      expectedIntent: 'confirmation',
      expectedConfidence: 0.9,
      hasQuestionMark: false,
      description: 'Confirmation question without punctuation'
    },
    {
      text: 'Which is better Python or JavaScript',
      expectedIntent: 'comparison',
      expectedConfidence: 0.9,
      hasQuestionMark: false,
      description: 'Comparison question without punctuation'
    }
  ],

  // Multi-intent detection tests
  multiIntent: [
    {
      text: 'What is React and how do I get started with it',
      expectedIntents: ['information_seeking', 'instruction_request'],
      expectedDominant: 'information_seeking',
      description: 'Information seeking + instruction request'
    },
    {
      text: 'Can you explain TypeScript and tell me which is better TypeScript or JavaScript',
      expectedIntents: ['clarification', 'comparison'],
      expectedDominant: 'clarification',
      description: 'Clarification + comparison'
    },
    {
      text: 'What do you think about React and should I use it for my project',
      expectedIntents: ['opinion', 'evaluation'],
      expectedDominant: 'opinion',
      description: 'Opinion + evaluation'
    }
  ],

  // Embedded question tests
  embeddedQuestions: [
    {
      text: 'I was wondering if you could tell me what the best practices are for React development',
      hasEmbeddedQuestions: true,
      expectedEmbedded: ['if you could tell me what the best practices are for React development'],
      mainIntent: 'information_seeking',
      description: 'Wonder pattern with embedded question'
    },
    {
      text: 'Could you possibly help me understand how async/await works in JavaScript',
      hasEmbeddedQuestions: true,
      expectedEmbedded: ['how async/await works in JavaScript'],
      mainIntent: 'clarification',
      description: 'Polite request with embedded question'
    },
    {
      text: "I'm curious about whether TypeScript is worth learning for a beginner",
      hasEmbeddedQuestions: true,
      expectedEmbedded: ['whether TypeScript is worth learning for a beginner'],
      mainIntent: 'evaluation',
      description: 'Curiosity expression with embedded question'
    }
  ],

  // Context-aware tests
  contextual: [
    {
      conversation: ['What is React?', 'Also what about Vue.js'],
      expectedContextResolution: true,
      expectedIntent: 'exploration',
      description: "Follow-up question using 'also'"
    },
    {
      conversation: ['How do I deploy a Node.js application?', 'What about using Docker for that'],
      expectedContextResolution: true,
      expectedIntent: 'instruction_request',
      description: 'Contextual follow-up about deployment method'
    },
    {
      conversation: [
        'Which database is better MongoDB or PostgreSQL?',
        'Can you explain more about that comparison'
      ],
      expectedContextResolution: true,
      expectedIntent: 'clarification',
      description: 'Contextual reference to previous comparison'
    }
  ],

  // Edge cases
  edgeCases: [
    {
      text: '',
      expectedResult: null,
      description: 'Empty string'
    },
    {
      text: 'Hi there',
      expectedResult: null,
      description: 'Simple greeting, not a question'
    },
    {
      text: 'This is a very long sentence that contains multiple clauses and complex grammar but ultimately is not asking any question just making a statement about various topics',
      expectedResult: null,
      description: 'Long non-question'
    },
    {
      text: 'What what what what what',
      expectedIntent: 'information_seeking',
      expectedConfidence: 0.6, // Lower confidence for repetitive/unclear
      description: 'Repetitive question words'
    },
    {
      text: 'How to how to how to install',
      expectedIntent: 'instruction_request',
      expectedConfidence: 0.5,
      description: 'Broken instruction request'
    }
  ],

  // Performance benchmarks
  performanceTests: [
    {
      text: 'What is the meaning of life',
      maxProcessingTime: 50, // ms
      description: 'Simple question processing time'
    },
    {
      text: 'I was wondering if you could possibly help me understand the complex relationship between artificial intelligence, machine learning, deep learning, and neural networks, and also explain how they differ from each other and which one should I focus on learning first as a beginner',
      maxProcessingTime: 100, // ms
      description: 'Complex multi-intent question processing time'
    }
  ]
}

/**
 * Test Helper Functions
 */
function createTestClassifier(customConfig = {}) {
  return new AdvancedIntentClassifier({
    ...TEST_CONFIG,
    ...customConfig
  })
}

async function initializeClassifier(classifier) {
  await classifier.initialize()
  return classifier
}

function validateIntentResult(result, expected) {
  return {
    intentMatch:
      result?.metadata?.advancedClassification?.dominant_intent.primary === expected.expectedIntent,
    confidenceInRange: result?.confidence >= expected.expectedConfidence - 0.1,
    isQuestion: result?.isQuestion === true
  }
}

/**
 * Main Test Execution
 */
async function runAllTests() {
  console.log('🚀 Starting Advanced Intent Classification Test Suite...\n')

  const classifier = await initializeClassifier(createTestClassifier())
  const testResults = {
    basicIntents: [],
    multiIntent: [],
    embeddedQuestions: [],
    contextual: [],
    edgeCases: [],
    performance: []
  }

  try {
    // Test 1: Basic Intent Classification
    console.log('📋 Test 1: Basic Intent Classification (Questions without punctuation)')
    for (const testCase of testCases.basicIntents) {
      const startTime = performance.now()
      const result = await classifier.detectQuestion(testCase.text)
      const processingTime = performance.now() - startTime

      const validation = validateIntentResult(result, testCase)
      testResults.basicIntents.push({
        ...testCase,
        result,
        validation,
        processingTime,
        passed: validation.intentMatch && validation.confidenceInRange && validation.isQuestion
      })

      console.log(
        `  ${validation.intentMatch && validation.confidenceInRange && validation.isQuestion ? '✅' : '❌'} ${testCase.description}`
      )
      console.log(`     Text: "${testCase.text}"`)
      console.log(
        `     Expected: ${testCase.expectedIntent} | Got: ${result?.metadata?.advancedClassification?.dominant_intent.primary || 'null'}`
      )
      console.log(
        `     Confidence: ${result?.confidence?.toFixed(2) || 'N/A'} | Time: ${processingTime.toFixed(1)}ms\n`
      )
    }

    // Test 2: Multi-Intent Detection
    console.log('📋 Test 2: Multi-Intent Detection')
    for (const testCase of testCases.multiIntent) {
      const result = await classifier.detectQuestion(testCase.text)
      const multiIntentResult = result?.metadata?.advancedClassification

      const hasMultipleIntents = multiIntentResult?.has_multiple_intents || false
      const detectedIntents = multiIntentResult?.intents?.map(i => i.primary) || []
      const dominantIntent = multiIntentResult?.dominant_intent?.primary

      const validation = {
        hasMultipleIntents,
        intentsMatch: testCase.expectedIntents.every(expected =>
          detectedIntents.includes(expected)
        ),
        dominantMatch: dominantIntent === testCase.expectedDominant
      }

      testResults.multiIntent.push({
        ...testCase,
        result,
        validation,
        detectedIntents,
        passed: validation.hasMultipleIntents && validation.intentsMatch && validation.dominantMatch
      })

      console.log(
        `  ${validation.hasMultipleIntents && validation.intentsMatch ? '✅' : '❌'} ${testCase.description}`
      )
      console.log(`     Text: "${testCase.text}"`)
      console.log(`     Expected intents: [${testCase.expectedIntents.join(', ')}]`)
      console.log(`     Detected intents: [${detectedIntents.join(', ')}]`)
      console.log(`     Multiple intents detected: ${hasMultipleIntents}\n`)
    }

    // Test 3: Embedded Question Detection
    console.log('📋 Test 3: Embedded Question Detection')
    for (const testCase of testCases.embeddedQuestions) {
      const result = await classifier.detectQuestion(testCase.text)
      const embeddedResult = result?.metadata?.embeddedQuestions

      const validation = {
        hasEmbeddedQuestions: embeddedResult?.has_embedded_questions || false,
        correctMainIntent: embeddedResult?.main_intent?.primary === testCase.mainIntent
      }

      testResults.embeddedQuestions.push({
        ...testCase,
        result,
        validation,
        passed: validation.hasEmbeddedQuestions && validation.correctMainIntent
      })

      console.log(`  ${validation.hasEmbeddedQuestions ? '✅' : '❌'} ${testCase.description}`)
      console.log(`     Text: "${testCase.text}"`)
      console.log(`     Has embedded questions: ${validation.hasEmbeddedQuestions}`)
      console.log(`     Main intent: ${embeddedResult?.main_intent?.primary || 'unknown'}\n`)
    }

    // Test 4: Context-Aware Intent Resolution
    console.log('📋 Test 4: Context-Aware Intent Resolution')
    for (const testCase of testCases.contextual) {
      // Process conversation in sequence
      for (const utterance of testCase.conversation.slice(0, -1)) {
        await classifier.detectQuestion(utterance, true) // Build context
      }

      // Test the final utterance with context
      const finalUtterance = testCase.conversation[testCase.conversation.length - 1]
      const result = await classifier.detectQuestion(finalUtterance, true)

      const validation = {
        contextResolved: result?.requiresContext === testCase.expectedContextResolution,
        intentMatch:
          result?.metadata?.advancedClassification?.dominant_intent?.primary ===
          testCase.expectedIntent
      }

      testResults.contextual.push({
        ...testCase,
        result,
        validation,
        passed: validation.contextResolved || validation.intentMatch // Either is acceptable
      })

      console.log(`  ${validation.intentMatch ? '✅' : '❌'} ${testCase.description}`)
      console.log(`     Conversation: ${testCase.conversation.join(' -> ')}`)
      console.log(`     Context resolved: ${validation.contextResolved}`)
      console.log(
        `     Intent: ${result?.metadata?.advancedClassification?.dominant_intent?.primary || 'unknown'}\n`
      )
    }

    // Test 5: Edge Cases
    console.log('📋 Test 5: Edge Case Handling')
    for (const testCase of testCases.edgeCases) {
      const result = await classifier.detectQuestion(testCase.text)

      const validation =
        testCase.expectedResult === null ? result === null : validateIntentResult(result, testCase)

      testResults.edgeCases.push({
        ...testCase,
        result,
        validation,
        passed: validation === true || (validation.intentMatch && validation.isQuestion)
      })

      console.log(
        `  ${validation === true || (validation.intentMatch && validation.isQuestion) ? '✅' : '❌'} ${testCase.description}`
      )
      console.log(`     Text: "${testCase.text}"`)
      console.log(
        `     Expected null: ${testCase.expectedResult === null}, Got null: ${result === null}\n`
      )
    }

    // Test 6: Performance Benchmarks
    console.log('📋 Test 6: Performance Benchmarks')
    for (const testCase of testCases.performanceTests) {
      const startTime = performance.now()
      const result = await classifier.detectQuestion(testCase.text)
      const processingTime = performance.now() - startTime

      const validation = {
        withinTimeLimit: processingTime <= testCase.maxProcessingTime,
        correctlyProcessed: result !== null && result.isQuestion
      }

      testResults.performance.push({
        ...testCase,
        processingTime,
        result,
        validation,
        passed: validation.withinTimeLimit && validation.correctlyProcessed
      })

      console.log(`  ${validation.withinTimeLimit ? '✅' : '❌'} ${testCase.description}`)
      console.log(
        `     Processing time: ${processingTime.toFixed(1)}ms (max: ${testCase.maxProcessingTime}ms)`
      )
      console.log(`     Result: ${result ? 'Detected as question' : 'Not detected'}\n`)
    }

    // Calculate overall results
    console.log('📊 Test Results Summary:')
    console.log('='.repeat(50))

    const categories = Object.keys(testResults)
    let totalTests = 0
    let totalPassed = 0

    categories.forEach(category => {
      const tests = testResults[category]
      const passed = tests.filter(t => t.passed).length
      const total = tests.length
      const accuracy = total > 0 ? ((passed / total) * 100).toFixed(1) : 'N/A'

      console.log(`${category.toUpperCase()}: ${passed}/${total} (${accuracy}%)`)

      totalTests += total
      totalPassed += passed
    })

    const overallAccuracy = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 'N/A'
    console.log('='.repeat(50))
    console.log(`OVERALL: ${totalPassed}/${totalTests} (${overallAccuracy}%)`)

    // Enhanced metrics
    const enhancedMetrics = classifier.getEnhancedMetrics()
    console.log('\n📈 Enhanced System Metrics:')
    console.log(`Total classified: ${enhancedMetrics.totalClassified}`)
    console.log(`Multi-intent detected: ${enhancedMetrics.multiIntentDetected}`)
    console.log(`Embedded questions found: ${enhancedMetrics.embeddedQuestionsFound}`)
    console.log(
      `Average NLP processing time: ${enhancedMetrics.averageNLPProcessingTime.toFixed(1)}ms`
    )
    console.log(`NLP cache hits: ${enhancedMetrics.nlpCacheHits}`)
    console.log(`Context resolutions: ${enhancedMetrics.contextResolutions}`)

    return {
      success: overallAccuracy >= 80, // 80% threshold for success
      overallAccuracy: parseFloat(overallAccuracy),
      testResults,
      enhancedMetrics
    }
  } catch (error) {
    console.error('❌ Test execution failed:', error)
    return {
      success: false,
      error: error.message,
      testResults
    }
  }
}

/**
 * Specific Feature Tests
 */
async function testSpecificFeatures() {
  console.log('\n🎯 Running Specific Feature Tests...\n')

  const classifier = await initializeClassifier(createTestClassifier())

  // Test question detection without punctuation
  console.log('Feature Test 1: Questions without punctuation')
  const noPunctuationTests = [
    'What is your name',
    'How are you doing today',
    'When will this be completed',
    'Where should I go for help',
    'Why is this happening'
  ]

  for (const text of noPunctuationTests) {
    const result = await classifier.detectQuestion(text)
    console.log(
      `  "${text}" -> ${result?.isQuestion ? '✅ DETECTED' : '❌ MISSED'} (confidence: ${result?.confidence?.toFixed(2) || 'N/A'})`
    )
  }

  // Test embedded questions
  console.log('\nFeature Test 2: Embedded questions in complex sentences')
  const embeddedTests = [
    'I was wondering if you could help me with this problem',
    "Do you know how to solve this issue that I'm having",
    'Could you possibly tell me what the best approach would be',
    "I'm curious about whether this is the right way to do it"
  ]

  for (const text of embeddedTests) {
    const result = await classifier.detectQuestion(text)
    const hasEmbedded = result?.metadata?.embeddedQuestions?.has_embedded_questions
    console.log(
      `  "${text}" -> ${result?.isQuestion ? '✅ DETECTED' : '❌ MISSED'} | Embedded: ${hasEmbedded ? '✅' : '❌'}`
    )
  }

  // Test multi-intent classification
  console.log('\nFeature Test 3: Multi-intent classification')
  const multiIntentTests = [
    'What is React and how do I install it',
    'Can you explain TypeScript and is it better than JavaScript',
    'Tell me about Python and should I learn it or Java first'
  ]

  for (const text of multiIntentTests) {
    const result = await classifier.detectQuestion(text)
    const multiIntent = result?.metadata?.advancedClassification
    const hasMultiple = multiIntent?.has_multiple_intents
    const intents = multiIntent?.intents?.map(i => i.primary).join(', ') || 'none'
    console.log(`  "${text}"`)
    console.log(`    -> Multiple intents: ${hasMultiple ? '✅' : '❌'} | Detected: [${intents}]`)
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  ;(async () => {
    const results = await runAllTests()
    await testSpecificFeatures()

    console.log(`\n🏁 Test Suite Complete! Overall Success: ${results.success ? '✅' : '❌'}`)
    process.exit(results.success ? 0 : 1)
  })()
}

export {runAllTests, testSpecificFeatures, createTestClassifier, testCases}
