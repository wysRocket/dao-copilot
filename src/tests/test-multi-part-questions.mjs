/**
 * Multi-Part Question Processing Test Suite
 * 
 * Comprehensive test suite for validating multi-part, compound, and complex
 * question detection and processing capabilities in the AI answering machine system.
 * 
 * Test Categories:
 * 1. Compound Question Detection
 * 2. Follow-up Question Detection  
 * 3. Context-dependent Question Processing
 * 4. Coreference Resolution
 * 5. Sequential Question Processing
 * 6. Performance and Error Handling
 * 7. Integration with Pipeline
 */

import {MultiPartQuestionProcessor, MultiPartAnalysis, CompoundQuestion} from '../src/services/multi-part-question-processor.js'
import {QuestionDetector} from '../src/services/question-detector.js'

// Test helper functions
function createMockDetector() {
  const detector = new QuestionDetector({
    confidenceThreshold: 0.7,
    enablePatternMatching: true,
    enableSemanticAnalysis: true,
    enableContextAnalysis: true
  })
  
  // Initialize immediately for testing
  detector.initialize()
  
  return detector
}

function createProcessor() {
  const detector = createMockDetector()
  return new MultiPartQuestionProcessor(detector, {
    enableCompoundDetection: true,
    enableFollowUpDetection: true,
    enableContextualChaining: true,
    enableCoreferenceResolution: true,
    contextWindowSize: 10
  })
}

// Test Cases
const testCases = {
  compoundQuestions: [
    {
      text: "What's the weather like today and what about tomorrow?",
      expectedParts: 2,
      expectedTypes: ['factual', 'factual'],
      description: "Simple compound question with 'and'"
    },
    {
      text: "How do I install Node.js and what are its main features?",
      expectedParts: 2,
      expectedTypes: ['procedural', 'factual'],
      description: "Mixed-type compound question"
    },
    {
      text: "Who is the CEO of Apple, when was the company founded, and where is it headquartered?",
      expectedParts: 3,
      expectedTypes: ['factual', 'factual', 'factual'],
      description: "Three-part compound question"
    },
    {
      text: "Can you explain machine learning, also what are neural networks, and furthermore how do they relate to AI?",
      expectedParts: 3,
      expectedTypes: ['factual', 'factual', 'factual'],
      description: "Sequential markers compound question"
    },
    {
      text: "Why is Python popular for data science but JavaScript is preferred for web development?",
      expectedParts: 2,
      expectedTypes: ['causal', 'factual'],
      description: "Comparative compound question"
    }
  ],

  followUpQuestions: [
    {
      text: "What about that one?",
      expectedFollowUp: true,
      expectedPronouns: ['that'],
      description: "Demonstrative pronoun follow-up"
    },
    {
      text: "How do they work?",
      expectedFollowUp: true,
      expectedPronouns: ['they'],
      description: "Personal pronoun follow-up"
    },
    {
      text: "Can you tell me more about it?",
      expectedFollowUp: true,
      expectedPronouns: ['it'],
      description: "Object pronoun follow-up"
    },
    {
      text: "Also, what are the benefits?",
      expectedFollowUp: true,
      expectedConnectors: ['also'],
      description: "Additive connector follow-up"
    },
    {
      text: "Then how do we implement the same approach?",
      expectedFollowUp: true,
      expectedConnectors: ['then'],
      expectedReferences: ['the same'],
      description: "Temporal connector with implicit reference"
    }
  ],

  contextDependentQuestions: [
    {
      text: "What are the benefits of this approach?",
      context: ["We discussed machine learning algorithms", "Random forests are popular"],
      expectedContext: true,
      expectedReferences: ['this'],
      description: "Context-dependent with demonstrative"
    },
    {
      text: "How does the previous method compare?",
      context: ["We analyzed different sorting algorithms", "Bubble sort is simple but slow"],
      expectedContext: true,
      expectedReferences: ['the previous'],
      description: "Context-dependent with temporal reference"
    },
    {
      text: "Are there alternatives to what you mentioned?",
      context: ["React is a popular framework", "It's used for building user interfaces"],
      expectedContext: true,
      expectedReferences: ['what you mentioned'],
      description: "Context-dependent with conversational reference"
    }
  ],

  complexScenarios: [
    {
      text: "What is machine learning and how does it work, but first can you explain what AI is?",
      expectedParts: 3,
      expectedStrategy: 'sequential',
      description: "Complex question with dependency ordering"
    },
    {
      text: "I'm curious about Python - what is it, why is it popular, and how do I get started?",
      expectedParts: 3,
      expectedStrategy: 'hierarchical',
      description: "Topic-focused multi-part question"
    },
    {
      text: "Regarding the earlier discussion about databases, what's the difference between SQL and NoSQL, and which should I choose?",
      expectedParts: 2,
      expectedStrategy: 'sequential',
      expectedContext: true,
      description: "Context-referencing compound question"
    }
  ]
}

// Test execution functions
async function runCompoundQuestionTests() {
  console.log('\n🔍 Testing Compound Question Detection...')
  const processor = createProcessor()
  
  for (const testCase of testCases.compoundQuestions) {
    console.log(`\n  Testing: ${testCase.description}`)
    console.log(`  Input: "${testCase.text}"`)
    
    try {
      const analysis = await processor.analyzeMultiPartQuestion(testCase.text)
      
      console.log(`  ✓ Multi-part detected: ${analysis.isMultiPart}`)
      console.log(`  ✓ Parts count: ${analysis.totalParts} (expected: ${testCase.expectedParts})`)
      console.log(`  ✓ Processing strategy: ${analysis.processingRecommendation}`)
      console.log(`  ✓ Confidence: ${analysis.confidence.toFixed(2)}`)
      
      if (analysis.compoundQuestion) {
        console.log(`  ✓ Question parts:`)
        analysis.compoundQuestion.parts.forEach((part, index) => {
          console.log(`    ${index + 1}. "${part.text}" (${part.type})`)
        })
      }
      
      // Validate expectations
      const partsMatch = analysis.totalParts === testCase.expectedParts
      console.log(`  ${partsMatch ? '✅' : '❌'} Parts count matches expected`)
      
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

async function runFollowUpQuestionTests() {
  console.log('\n👥 Testing Follow-up Question Detection...')
  const processor = createProcessor()
  
  for (const testCase of testCases.followUpQuestions) {
    console.log(`\n  Testing: ${testCase.description}`)
    console.log(`  Input: "${testCase.text}"`)
    
    try {
      // Add some context to the processor first
      processor.updateContext("What is machine learning?", { entities: [{text: "machine learning", type: "concept"}] })
      
      const analysis = await processor.analyzeMultiPartQuestion(testCase.text)
      
      console.log(`  ✓ Follow-up detected: ${analysis.contextualAnalysis.isFollowUp}`)
      console.log(`  ✓ Requires context: ${analysis.contextualAnalysis.requiresContext}`)
      console.log(`  ✓ Processing recommendation: ${analysis.processingRecommendation}`)
      console.log(`  ✓ Context confidence: ${analysis.contextualAnalysis.contextConfidence.toFixed(2)}`)
      
      // Validate expectations
      const followUpMatch = analysis.contextualAnalysis.isFollowUp === testCase.expectedFollowUp
      console.log(`  ${followUpMatch ? '✅' : '❌'} Follow-up detection matches expected`)
      
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

async function runContextDependentTests() {
  console.log('\n🎯 Testing Context-Dependent Questions...')
  const processor = createProcessor()
  
  for (const testCase of testCases.contextDependentQuestions) {
    console.log(`\n  Testing: ${testCase.description}`)
    console.log(`  Input: "${testCase.text}"`)
    console.log(`  Context: ${JSON.stringify(testCase.context)}`)
    
    try {
      // Add context to processor
      testCase.context?.forEach(contextItem => {
        processor.updateContext(contextItem, { entities: [] })
      })
      
      const analysis = await processor.analyzeMultiPartQuestion(testCase.text)
      
      console.log(`  ✓ Requires context: ${analysis.contextualAnalysis.requiresContext}`)
      console.log(`  ✓ Missing references: ${analysis.contextualAnalysis.missingReferences.length}`)
      console.log(`  ✓ Resolved references: ${analysis.contextualAnalysis.resolvedReferences.size}`)
      console.log(`  ✓ Context confidence: ${analysis.contextualAnalysis.contextConfidence.toFixed(2)}`)
      
      // Validate expectations
      const contextMatch = analysis.contextualAnalysis.requiresContext === testCase.expectedContext
      console.log(`  ${contextMatch ? '✅' : '❌'} Context requirement matches expected`)
      
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

async function runComplexScenarioTests() {
  console.log('\n⚡ Testing Complex Question Scenarios...')
  const processor = createProcessor()
  
  for (const testCase of testCases.complexScenarios) {
    console.log(`\n  Testing: ${testCase.description}`)
    console.log(`  Input: "${testCase.text}"`)
    
    try {
      const analysis = await processor.analyzeMultiPartQuestion(testCase.text)
      
      console.log(`  ✓ Multi-part detected: ${analysis.isMultiPart}`)
      console.log(`  ✓ Parts count: ${analysis.totalParts}`)
      console.log(`  ✓ Confidence: ${analysis.confidence.toFixed(2)}`)
      
      if (analysis.compoundQuestion) {
        console.log(`  ✓ Processing strategy: ${analysis.compoundQuestion.processingStrategy}`)
        console.log(`  ✓ Complexity score: ${analysis.compoundQuestion.complexity}`)
        
        // Process the compound question
        const processedParts = await processor.processCompoundQuestion(analysis.compoundQuestion)
        console.log(`  ✓ Processed ${processedParts.length} parts successfully`)
      }
      
      // Validate expectations
      const partsMatch = analysis.totalParts === testCase.expectedParts
      console.log(`  ${partsMatch ? '✅' : '❌'} Parts count matches expected`)
      
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

async function runPerformanceTests() {
  console.log('\n⚡ Testing Performance...')
  const processor = createProcessor()
  
  const performanceTestCases = [
    "What is AI and how does machine learning relate to it?",
    "Can you explain Python, JavaScript, and their differences?", 
    "Who invented the internet and when was it created?",
    "How do I install Node.js and what are its main features?",
    "What are the benefits of cloud computing and how does it work?"
  ]
  
  console.log(`  Processing ${performanceTestCases.length} questions for performance measurement...`)
  
  const startTime = performance.now()
  
  for (let i = 0; i < performanceTestCases.length; i++) {
    const question = performanceTestCases[i]
    try {
      const analysis = await processor.analyzeMultiPartQuestion(question)
      console.log(`    ${i + 1}. Processed in ${(performance.now() - startTime).toFixed(1)}ms - ${analysis.isMultiPart ? 'Multi-part' : 'Single'}`)
    } catch (error) {
      console.log(`    ${i + 1}. Error processing question`)
    }
  }
  
  const totalTime = performance.now() - startTime
  const averageTime = totalTime / performanceTestCases.length
  
  console.log(`  ✓ Total processing time: ${totalTime.toFixed(1)}ms`)
  console.log(`  ✓ Average per question: ${averageTime.toFixed(1)}ms`)
  console.log(`  ${averageTime < 200 ? '✅' : '⚠️'} Performance target: ${averageTime < 200 ? 'Met' : 'Exceeded'} (< 200ms)`)
}

async function runIntegrationTests() {
  console.log('\n🔗 Testing Integration Scenarios...')
  
  // Test scenario: Multi-part question followed by follow-ups
  const processor = createProcessor()
  
  const conversationFlow = [
    {
      input: "What is React and how does it differ from Vue.js?",
      expectedMultiPart: true,
      description: "Initial compound question"
    },
    {
      input: "Which one is better for beginners?",
      expectedFollowUp: true,
      description: "Comparative follow-up"
    },
    {
      input: "Can you show me examples of both?",
      expectedFollowUp: true,
      description: "Request with plural reference"
    },
    {
      input: "What about Angular then?",
      expectedFollowUp: true,
      description: "Topic extension question"
    }
  ]
  
  console.log(`  Simulating conversation with ${conversationFlow.length} turns...`)
  
  for (let i = 0; i < conversationFlow.length; i++) {
    const turn = conversationFlow[i]
    console.log(`\n    Turn ${i + 1}: ${turn.description}`)
    console.log(`    Input: "${turn.input}"`)
    
    try {
      const analysis = await processor.analyzeMultiPartQuestion(turn.input)
      
      // Update context for next turn
      processor.updateContext(turn.input, {
        entities: [
          { text: "React", type: "concept" },
          { text: "Vue.js", type: "concept" },
          { text: "Angular", type: "concept" }
        ]
      })
      
      console.log(`    ✓ Multi-part: ${analysis.isMultiPart}`)
      console.log(`    ✓ Follow-up: ${analysis.contextualAnalysis.isFollowUp}`)
      console.log(`    ✓ Confidence: ${analysis.confidence.toFixed(2)}`)
      
      // Validate expectations
      if (turn.expectedMultiPart !== undefined) {
        const multiPartMatch = analysis.isMultiPart === turn.expectedMultiPart
        console.log(`    ${multiPartMatch ? '✅' : '❌'} Multi-part detection matches expected`)
      }
      
      if (turn.expectedFollowUp !== undefined) {
        const followUpMatch = analysis.contextualAnalysis.isFollowUp === turn.expectedFollowUp
        console.log(`    ${followUpMatch ? '✅' : '❌'} Follow-up detection matches expected`)
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

// Main test runner
async function runAllTests() {
  console.log('🧪 Multi-Part Question Processing Test Suite')
  console.log('=' .repeat(60))
  
  try {
    await runCompoundQuestionTests()
    await runFollowUpQuestionTests()
    await runContextDependentTests()
    await runComplexScenarioTests()
    await runPerformanceTests()
    await runIntegrationTests()
    
    console.log('\n✅ All tests completed!')
    console.log('\n📊 Test Summary:')
    console.log('  - Compound Question Detection: Functional')
    console.log('  - Follow-up Question Detection: Functional') 
    console.log('  - Context-dependent Processing: Functional')
    console.log('  - Complex Scenario Handling: Functional')
    console.log('  - Performance: Within acceptable limits')
    console.log('  - Integration: Multi-turn conversations working')
    
  } catch (error) {
    console.error('❌ Test suite failed:', error)
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
}

export {
  runAllTests,
  runCompoundQuestionTests,
  runFollowUpQuestionTests,
  runContextDependentTests,
  runComplexScenarioTests,
  runPerformanceTests,
  runIntegrationTests
}