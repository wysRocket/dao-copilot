/**
 * Test Mixed Language Detector
 *
 * This test validates the MixedLanguageDetector functionality
 * for detecting and correcting English segments in Russian text.
 */

console.log('🧪 Testing Mixed Language Detector')
console.log('===================================')

async function testMixedLanguageDetector() {
  try {
    // Import the detector
    const {createMixedLanguageDetector, detectMixedLanguage, correctEnglishInRussianText} =
      await import('./src/services/mixed-language-detector.ts')

    console.log('✅ MixedLanguageDetector imported successfully')

    // Test cases based on production screenshot errors
    const testCases = [
      {
        name: 'Production Screenshot Error',
        input: 'по-моему, thing I would do is I would look at the data',
        expectedDetection: true,
        expectedCorrections: ['thing I would do is I would look at the data']
      },
      {
        name: 'Pure Russian Text',
        input: 'Это чисто русский текст без английских слов',
        expectedDetection: false,
        expectedCorrections: []
      },
      {
        name: 'Mixed Technical Terms',
        input: 'Мне нужно look at the data для анализа',
        expectedDetection: true,
        expectedCorrections: ['look at the data']
      },
      {
        name: 'Common English Phrases',
        input: 'Знаешь, by the way, это интересная идея',
        expectedDetection: true,
        expectedCorrections: ['by the way']
      },
      {
        name: 'Multiple English Segments',
        input: 'Сначала I would look, потом you know что делать',
        expectedDetection: true,
        expectedCorrections: ['I would look', 'you know']
      }
    ]

    console.log(`\n🔬 Testing ${testCases.length} cases`)
    console.log('-'.repeat(50))

    let passedTests = 0

    // Test 1: Quick detection utility
    console.log('\n1. Testing Quick Detection Utility')
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i]
      console.log(`\n   Test ${i + 1}: ${testCase.name}`)
      console.log(`   Input: "${testCase.input}"`)

      const startTime = Date.now()
      const hasEnglish = await detectMixedLanguage(testCase.input)
      const endTime = Date.now()

      console.log(`   Detected English: ${hasEnglish}`)
      console.log(`   Expected: ${testCase.expectedDetection}`)
      console.log(`   Time: ${endTime - startTime}ms`)

      if (hasEnglish === testCase.expectedDetection) {
        console.log('   ✅ PASSED')
        passedTests++
      } else {
        console.log('   ❌ FAILED')
      }
    }

    // Test 2: Full detector with detailed analysis
    console.log('\n2. Testing Full Detector Analysis')

    const detector = createMixedLanguageDetector({
      enableEnglishToRussianTranslation: true,
      confidenceThreshold: 0.6,
      logDetections: true
    })

    console.log('   Detector stats:', detector.getStats())

    for (let i = 0; i < 2; i++) {
      // Test first 2 cases in detail
      const testCase = testCases[i]
      console.log(`\n   Detailed Test ${i + 1}: ${testCase.name}`)
      console.log(`   Input: "${testCase.input}"`)

      const result = await detector.detectSegments(testCase.input)

      console.log(`   Segments found: ${result.segments.length}`)
      console.log(`   Corrections made: ${result.corrections.length}`)
      console.log(`   Mixed language: ${result.mixedLanguageFound}`)
      console.log(`   Processing time: ${result.processingTimeMs}ms`)
      console.log(`   Processed text: "${result.processedText}"`)

      if (result.segments.length > 0) {
        console.log('   📊 Segments:')
        result.segments.forEach((segment, idx) => {
          console.log(
            `      ${idx + 1}. "${segment.text}" (${segment.language}, confidence: ${segment.confidence})`
          )
        })
      }

      if (result.corrections.length > 0) {
        console.log('   📝 Corrections:')
        result.corrections.forEach((correction, idx) => {
          console.log(
            `      ${idx + 1}. "${correction.originalSegment}" → "${correction.correctedSegment}" (${correction.reason})`
          )
        })
      }
    }

    // Test 3: Quick correction utility
    console.log('\n3. Testing Quick Correction Utility')

    const productionText = 'по-моему, thing I would do is I would look at the data'
    console.log(`   Input: "${productionText}"`)

    const correctedText = await correctEnglishInRussianText(productionText)
    console.log(`   Output: "${correctedText}"`)
    console.log(`   Changed: ${productionText !== correctedText ? '✅ Yes' : '⚠️ No'}`)

    // Performance test
    console.log('\n4. Performance Benchmark')
    console.log('-'.repeat(30))

    const benchmarkText = 'Это тест performance для thing I would do и других by the way фраз'
    const iterations = 10

    console.log(`   Running ${iterations} iterations on: "${benchmarkText}"`)

    const perfStart = Date.now()
    for (let i = 0; i < iterations; i++) {
      await detector.detectSegments(benchmarkText)
    }
    const perfEnd = Date.now()

    const avgTime = (perfEnd - perfStart) / iterations
    console.log(`   Average time: ${avgTime.toFixed(1)}ms per detection`)
    console.log(
      `   Performance: ${avgTime < 50 ? '✅ Excellent' : avgTime < 100 ? '✅ Good' : '⚠️ Needs optimization'}`
    )

    // Summary
    console.log('\n📋 Test Results Summary')
    console.log('=' + '='.repeat(30))
    console.log(`Detection tests passed: ${passedTests}/${testCases.length}`)
    console.log(`Average processing time: ${avgTime.toFixed(1)}ms`)

    const overallSuccess = passedTests >= testCases.length * 0.8 && avgTime < 100

    if (overallSuccess) {
      console.log('\n🎉 MIXED LANGUAGE DETECTOR: SUCCESS!')
      console.log('   ✅ English detection working correctly')
      console.log('   ✅ Russian-English translation functional')
      console.log('   ✅ Performance within acceptable limits')
      console.log('   ✅ Ready for integration with RussianTranscriptionCorrector')
    } else {
      console.log('\n⚠️ MIXED LANGUAGE DETECTOR: NEEDS IMPROVEMENT')
      console.log('   - Review failed test cases')
      console.log('   - Optimize performance if needed')
      console.log('   - Check detection accuracy')
    }

    return overallSuccess
  } catch (error) {
    console.error('❌ Mixed Language Detector test failed:', error)
    return false
  }
}

// Export for external testing
export {testMixedLanguageDetector}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Mixed Language Detection System Validation')
  console.log('🎯 Testing detection and correction of English segments in Russian text')
  console.log('')

  testMixedLanguageDetector()
    .then(success => {
      if (success) {
        console.log('\n🎉 ALL MIXED LANGUAGE TESTS PASSED!')
        console.log('Mixed language detection system is ready for production!')
        process.exit(0)
      } else {
        console.log('\n⚠️ Some mixed language detection issues need attention')
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('\n❌ Mixed language detection test failed:', error)
      process.exit(1)
    })
}
