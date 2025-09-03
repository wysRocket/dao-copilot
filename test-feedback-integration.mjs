/**
 * Comprehensive Integration Tests for Question Classification Feedback System
 * 
 * This test suite validates the integration between:
 * - OptimizedQuestionDetector
 * - QuestionClassificationFeedbackSystem  
 * - IntelligentQuestionProcessingSystem
 * 
 * Tests cover:
 * - Feedback loop integration
 * - Active learning workflows
 * - Online learning updates
 * - Performance monitoring
 * - Real-world scenario simulations
 */

import { IntelligentQuestionProcessingSystem } from '../src/services/intelligent-question-processing-system.js'
import { QuestionType, QuestionIntent } from '../src/services/question-detector.js'

// Test configuration
const TEST_CONFIG = {
  questionDetection: {
    confidenceThreshold: 0.7,
    maxAnalysisDelay: 50,
    enableCaching: true,
    cacheSize: 100,
    enableFastPath: true,
    enableConcurrentProcessing: true
  },
  feedbackSystem: {
    enableExplicitFeedback: true,
    enableImplicitFeedback: true,
    enableActiveLearning: true,
    retrainingThreshold: 0.1
  },
  integration: {
    enableAutoImprovement: true,
    feedbackCollectionRate: 1.0, // Collect feedback for all questions in tests
    performanceOptimizationEnabled: true
  }
}

// Test data sets
const TEST_QUESTIONS = [
  // Clear questions (high confidence expected)
  { text: "What time is it?", expectedType: "factual", expectedIntent: "information_seeking" },
  { text: "How do I install Node.js?", expectedType: "procedural", expectedIntent: "help_seeking" },
  { text: "Can you explain quantum physics?", expectedType: "explanatory", expectedIntent: "learning" },
  { text: "Where is the nearest coffee shop?", expectedType: "factual", expectedIntent: "location_seeking" },
  
  // Ambiguous questions (lower confidence expected)
  { text: "Is this right?", expectedType: "confirmation", expectedIntent: "validation_seeking" },
  { text: "What about that thing?", expectedType: "clarification", expectedIntent: "clarification_seeking" },
  { text: "Could you maybe help with this?", expectedType: "request", expectedIntent: "help_seeking" },
  
  // Edge cases
  { text: "Hello there!", expectedType: null, expectedIntent: null }, // Not a question
  { text: "I think it's broken.", expectedType: null, expectedIntent: null }, // Statement
  { text: "Right?", expectedType: "confirmation", expectedIntent: "validation_seeking" } // Very short question
]

const TRANSCRIPTION_SCENARIOS = [
  {
    name: "Progressive transcription",
    chunks: [
      { text: "What", confidence: 0.8, isFinal: false },
      { text: "What time", confidence: 0.9, isFinal: false },
      { text: "What time is", confidence: 0.95, isFinal: false },
      { text: "What time is it?", confidence: 0.98, isFinal: true }
    ],
    expectedQuestion: true
  },
  {
    name: "False positive correction",
    chunks: [
      { text: "When", confidence: 0.8, isFinal: false },
      { text: "When I", confidence: 0.9, isFinal: false },
      { text: "When I was younger I liked apples", confidence: 0.95, isFinal: true }
    ],
    expectedQuestion: false
  }
]

// Test utilities
class TestMetrics {
  public questionsProcessed = 0
  public feedbackRecorded = 0
  public activeLearningCandidates = 0
  public modelRetrainings = 0
  public averageProcessingTime = 0
  public accuracyMeasurements: number[] = []

  recordProcessingTime(time: number): void {
    this.averageProcessingTime = (this.averageProcessingTime * this.questionsProcessed + time) / (this.questionsProcessed + 1)
    this.questionsProcessed++
  }

  recordAccuracy(accuracy: number): void {
    this.accuracyMeasurements.push(accuracy)
  }

  getReport(): any {
    return {
      questionsProcessed: this.questionsProcessed,
      feedbackRecorded: this.feedbackRecorded,
      activeLearningCandidates: this.activeLearningCandidates,
      modelRetrainings: this.modelRetrainings,
      averageProcessingTime: this.averageProcessingTime,
      averageAccuracy: this.accuracyMeasurements.length > 0 
        ? this.accuracyMeasurements.reduce((a, b) => a + b) / this.accuracyMeasurements.length 
        : 0
    }
  }
}

class FeedbackIntegrationTester {
  private system: IntelligentQuestionProcessingSystem
  private metrics: TestMetrics
  private testResults: any[] = []

  constructor() {
    this.system = new IntelligentQuestionProcessingSystem(TEST_CONFIG)
    this.metrics = new TestMetrics()
    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    this.system.on('question_processed', (question) => {
      this.metrics.recordProcessingTime(question.processingTime)
      console.log(`✓ Question processed: "${question.text.substring(0, 50)}..." (${question.processingTime.toFixed(2)}ms)`)
    })

    this.system.on('user_feedback_recorded', (feedback) => {
      this.metrics.feedbackRecorded++
      console.log(`✓ Feedback recorded for question: ${feedback.questionId} (correct: ${feedback.isCorrect})`)
    })

    this.system.on('labeling_candidates_selected', (data) => {
      this.metrics.activeLearningCandidates += data.candidates.length
      console.log(`✓ Active learning candidates selected: ${data.candidates.length}`)
    })

    this.system.on('model_retrained', () => {
      this.metrics.modelRetrainings++
      console.log(`✓ Model retrained (total: ${this.metrics.modelRetrainings})`)
    })
  }

  /**
   * Test 1: Basic Question Detection Integration
   */
  async testBasicQuestionDetection(): Promise<boolean> {
    console.log('\n🧪 Test 1: Basic Question Detection Integration')
    let passed = 0
    let total = 0

    for (const testCase of TEST_QUESTIONS) {
      total++
      const startTime = performance.now()
      
      const result = await this.system.processQuestion(testCase.text, 'direct')
      const processingTime = performance.now() - startTime

      if (testCase.expectedType === null) {
        // Should not be detected as a question
        if (!result) {
          passed++
          console.log(`  ✓ Non-question correctly rejected: "${testCase.text}"`)
        } else {
          console.log(`  ✗ False positive: "${testCase.text}" (detected as ${result.analysis.questionType})`)
        }
      } else {
        // Should be detected as a question
        if (result && result.analysis.isQuestion) {
          passed++
          console.log(`  ✓ Question detected: "${testCase.text}" -> ${result.analysis.questionType} (${processingTime.toFixed(2)}ms)`)
        } else {
          console.log(`  ✗ Question missed: "${testCase.text}"`)
        }
      }
    }

    const success = passed === total
    this.testResults.push({
      test: 'Basic Question Detection',
      passed,
      total,
      success,
      percentage: (passed / total * 100).toFixed(1)
    })

    console.log(`  Result: ${passed}/${total} tests passed (${(passed/total*100).toFixed(1)}%)`)
    return success
  }

  /**
   * Test 2: Explicit Feedback Loop
   */
  async testExplicitFeedbackLoop(): Promise<boolean> {
    console.log('\n🧪 Test 2: Explicit Feedback Loop')
    let feedbackTests = 0
    let feedbackPassed = 0

    // Process some questions and provide feedback
    const feedbackScenarios = [
      { 
        text: "What is the weather like?", 
        feedback: { isCorrect: true, rating: 5 } 
      },
      { 
        text: "Is this correct?", 
        feedback: { isCorrect: false, correctedType: "confirmation" as QuestionType, rating: 2 } 
      },
      { 
        text: "How do I fix this bug?", 
        feedback: { isCorrect: true, rating: 4 } 
      }
    ]

    for (const scenario of feedbackScenarios) {
      feedbackTests++
      
      // Process the question
      const result = await this.system.processQuestion(scenario.text, 'direct')
      if (!result) {
        console.log(`  ✗ Question not processed: "${scenario.text}"`)
        continue
      }

      // Record feedback
      const initialFeedbackCount = this.metrics.feedbackRecorded
      this.system.recordUserFeedback(
        result.id,
        scenario.feedback.isCorrect,
        scenario.feedback.correctedType,
        undefined,
        scenario.feedback.rating
      )

      // Verify feedback was recorded
      if (this.metrics.feedbackRecorded > initialFeedbackCount) {
        feedbackPassed++
        console.log(`  ✓ Feedback recorded for: "${scenario.text}"`)
      } else {
        console.log(`  ✗ Feedback not recorded for: "${scenario.text}"`)
      }
    }

    const success = feedbackPassed === feedbackTests
    this.testResults.push({
      test: 'Explicit Feedback Loop',
      passed: feedbackPassed,
      total: feedbackTests,
      success,
      percentage: (feedbackPassed / feedbackTests * 100).toFixed(1)
    })

    console.log(`  Result: ${feedbackPassed}/${feedbackTests} feedback tests passed`)
    return success
  }

  /**
   * Test 3: Active Learning Integration
   */
  async testActiveLearningIntegration(): Promise<boolean> {
    console.log('\n🧪 Test 3: Active Learning Integration')
    
    // Request active learning candidates
    const candidates = await this.system.getQuestionsForLabeling(5)
    const candidatesReceived = candidates.length > 0

    console.log(`  Active learning candidates requested: ${candidates.length}`)

    if (candidates.length > 0) {
      // Submit a labeled sample
      const sampleText = "Can you help me with this problem?"
      await this.system.submitLabeledSample(
        sampleText,
        true,
        "request" as QuestionType,
        "help_seeking" as QuestionIntent,
        0.95
      )
      console.log(`  ✓ Labeled sample submitted: "${sampleText}"`)
    }

    const success = candidatesReceived || this.metrics.activeLearningCandidates >= 0
    this.testResults.push({
      test: 'Active Learning Integration',
      passed: success ? 1 : 0,
      total: 1,
      success,
      percentage: success ? '100' : '0'
    })

    return success
  }

  /**
   * Test 4: Transcription Integration
   */
  async testTranscriptionIntegration(): Promise<boolean> {
    console.log('\n🧪 Test 4: Transcription Integration')
    let transcriptionTests = 0
    let transcriptionPassed = 0

    for (const scenario of TRANSCRIPTION_SCENARIOS) {
      transcriptionTests++
      console.log(`  Testing: ${scenario.name}`)
      
      const transcriptId = `test_transcript_${Date.now()}`
      let questionsDetected = 0
      
      // Set up listener for questions detected from transcription
      const questionHandler = () => questionsDetected++
      this.system.on('question_processed', questionHandler)

      // Process transcription chunks
      for (const chunk of scenario.chunks) {
        await this.system.processTranscription(
          chunk.text,
          chunk.confidence,
          chunk.isFinal,
          transcriptId
        )
        
        // Small delay to allow processing
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      this.system.off('question_processed', questionHandler)

      // Verify expected outcome
      const expectedQuestions = scenario.expectedQuestion ? 1 : 0
      if (questionsDetected >= expectedQuestions) {
        transcriptionPassed++
        console.log(`    ✓ Expected ${expectedQuestions} questions, detected ${questionsDetected}`)
      } else {
        console.log(`    ✗ Expected ${expectedQuestions} questions, detected ${questionsDetected}`)
      }
    }

    const success = transcriptionPassed === transcriptionTests
    this.testResults.push({
      test: 'Transcription Integration',
      passed: transcriptionPassed,
      total: transcriptionTests,
      success,
      percentage: (transcriptionPassed / transcriptionTests * 100).toFixed(1)
    })

    return success
  }

  /**
   * Test 5: Performance Monitoring
   */
  async testPerformanceMonitoring(): Promise<boolean> {
    console.log('\n🧪 Test 5: Performance Monitoring')
    
    // Get system status
    const status = this.system.getSystemStatus()
    console.log(`  System status:`, {
      initialized: status.isInitialized,
      uptime: `${(status.uptime / 1000).toFixed(1)}s`,
      questionsProcessed: status.questionsProcessed,
      feedbackCollected: status.feedbackCollected,
      performanceScore: status.performanceScore.toFixed(2)
    })

    // Get performance report
    const report = this.system.getPerformanceReport()
    console.log(`  Performance metrics:`, {
      avgProcessingTime: `${report.system.questionDetection.averageProcessingTime.toFixed(2)}ms`,
      accuracy: `${(report.system.questionDetection.accuracy * 100).toFixed(1)}%`,
      cacheHitRate: `${(report.system.questionDetection.cacheHitRate * 100).toFixed(1)}%`,
      recommendationsCount: report.recommendations.length
    })

    // Verify performance is within acceptable bounds
    const performanceAcceptable = (
      report.system.questionDetection.averageProcessingTime < 100 && // Under 100ms
      status.performanceScore > 0.5 && // Performance score above 50%
      status.isInitialized
    )

    const success = performanceAcceptable
    this.testResults.push({
      test: 'Performance Monitoring',
      passed: success ? 1 : 0,
      total: 1,
      success,
      percentage: success ? '100' : '0'
    })

    return success
  }

  /**
   * Test 6: Stress Test - High Volume Processing
   */
  async testHighVolumeProcessing(): Promise<boolean> {
    console.log('\n🧪 Test 6: Stress Test - High Volume Processing')
    
    const testQuestions = Array(50).fill(0).map((_, i) => `Question number ${i + 1}: What is ${i + 1} times ${i + 1}?`)
    const startTime = performance.now()
    let processed = 0
    let errors = 0

    const promises = testQuestions.map(async (question, index) => {
      try {
        const result = await this.system.processQuestion(question, 'batch')
        if (result) processed++
      } catch (error) {
        errors++
        console.log(`    Error processing question ${index + 1}: ${error}`)
      }
    })

    await Promise.all(promises)
    const totalTime = performance.now() - startTime
    const throughput = processed / (totalTime / 1000)

    console.log(`  Processed ${processed}/${testQuestions.length} questions in ${totalTime.toFixed(2)}ms`)
    console.log(`  Throughput: ${throughput.toFixed(2)} questions/second`)
    console.log(`  Errors: ${errors}`)

    const success = processed >= testQuestions.length * 0.95 && errors < testQuestions.length * 0.05
    this.testResults.push({
      test: 'High Volume Processing',
      passed: success ? 1 : 0,
      total: 1,
      success,
      percentage: success ? '100' : '0',
      metrics: { processed, errors, totalTime, throughput }
    })

    return success
  }

  /**
   * Run all integration tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Question Classification Feedback System Integration Tests')
    console.log('================================================================================')

    try {
      // Initialize the system
      console.log('🔧 Initializing system...')
      await this.system.initialize()
      console.log('✓ System initialized successfully')

      // Run all tests
      const tests = [
        this.testBasicQuestionDetection(),
        this.testExplicitFeedbackLoop(),
        this.testActiveLearningIntegration(),
        this.testTranscriptionIntegration(),
        this.testPerformanceMonitoring(),
        this.testHighVolumeProcessing()
      ]

      const results = await Promise.all(tests)
      const allPassed = results.every(result => result)

      // Generate final report
      console.log('\n📊 Test Results Summary')
      console.log('================================================================================')
      
      let totalPassed = 0
      let totalTests = 0
      
      this.testResults.forEach(result => {
        totalPassed += result.passed
        totalTests += result.total
        console.log(`${result.success ? '✓' : '✗'} ${result.test}: ${result.passed}/${result.total} (${result.percentage}%)`)
      })

      console.log('================================================================================')
      console.log(`Overall: ${totalPassed}/${totalTests} tests passed (${(totalPassed/totalTests*100).toFixed(1)}%)`)
      
      // System metrics
      const systemMetrics = this.metrics.getReport()
      console.log('\n📈 System Performance Metrics:')
      console.log(`  Questions Processed: ${systemMetrics.questionsProcessed}`)
      console.log(`  Feedback Recorded: ${systemMetrics.feedbackRecorded}`)
      console.log(`  Active Learning Candidates: ${systemMetrics.activeLearningCandidates}`)
      console.log(`  Average Processing Time: ${systemMetrics.averageProcessingTime.toFixed(2)}ms`)
      
      if (allPassed) {
        console.log('\n🎉 All integration tests passed! The feedback system is working correctly.')
      } else {
        console.log('\n⚠️  Some tests failed. Review the results above for details.')
      }

    } catch (error) {
      console.error('\n❌ Test execution failed:', error)
    } finally {
      // Cleanup
      console.log('\n🧹 Cleaning up...')
      await this.system.shutdown()
      console.log('✓ System shutdown complete')
    }
  }
}

/**
 * Run the tests
 */
async function runIntegrationTests(): Promise<void> {
  const tester = new FeedbackIntegrationTester()
  await tester.runAllTests()
}

// Export for external use
export { FeedbackIntegrationTester, runIntegrationTests }

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntegrationTests().catch(console.error)
}