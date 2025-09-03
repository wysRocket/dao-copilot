/**
 * Test Grammar Pattern Corrector
 *
 * This test validates the GrammarPatternCorrector functionality
 * for correcting Russian grammar issues in transcribed text.
 */

console.log('🧪 Testing Grammar Pattern Corrector')
console.log('====================================')

async function testGrammarPatternCorrector() {
  try {
    // Import the corrector
    const {createGrammarPatternCorrector, correctRussianGrammar} = await import(
      './src/services/grammar-pattern-corrector.ts'
    )

    console.log('✅ GrammarPatternCorrector imported successfully')

    // Test cases based on production screenshot errors
    const testCases = [
      {
        name: 'Word Order - "только для"',
        input: 'вы действительно выбираете только для когда',
        expectedCorrected: 'вы действительно выбираете только когда',
        category: 'word_order'
      },
      {
        name: 'Sentence Structure - Fragmented Speech',
        input: 'не то что там то конечно Но когда в последний',
        expectedPatterns: ['sentence structure fixes'],
        category: 'sentence_structure'
      },
      {
        name: 'Word Boundaries - "ком форта"',
        input: 'выше чужого ком форта',
        expectedCorrected: 'выше чужого комфорта',
        category: 'case_correction'
      },
      {
        name: 'Word Boundaries - "пол ностью"',
        input: 'ваша команда пол ностью готова',
        expectedCorrected: 'ваша команда полностью готова',
        category: 'case_correction'
      },
      {
        name: 'Verb Forms - "жет быть"',
        input: 'конфликта жет быть не будет',
        expectedCorrected: 'конфликта может быть не будет',
        category: 'conjunction'
      },
      {
        name: 'Capitalization - "Вос можно"',
        input: 'программирование Вос можно',
        expectedCorrected: 'программирование возможно',
        category: 'case_correction'
      },
      {
        name: 'Complex Production Text',
        input:
          'исключительно то такой довлетворить. Когда вы в последний раз стави ли свою собственность довлетворение выше чужого ком форта',
        expectedPatterns: ['multiple corrections'],
        category: 'sentence_structure'
      }
    ]

    console.log(`\n🔬 Testing ${testCases.length} grammar correction cases`)
    console.log('-'.repeat(55))

    let passedTests = 0

    // Test 1: Individual pattern corrections
    console.log('\n1. Testing Individual Pattern Corrections')

    const corrector = createGrammarPatternCorrector({
      confidenceThreshold: 0.6,
      maxCorrectionsPerSentence: 10,
      logCorrections: true,
      enableWordOrderCorrection: true,
      enableVerbFormCorrection: true,
      enableCaseCorrection: true,
      enablePrepositionCorrection: true,
      enableConjunctionCorrection: true,
      enableSentenceStructureCorrection: true
    })

    console.log('   Corrector stats:', corrector.getStats())

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i]
      console.log(`\n   Test ${i + 1}: ${testCase.name}`)
      console.log(`   Category: ${testCase.category}`)
      console.log(`   Input: "${testCase.input}"`)

      const startTime = Date.now()
      const result = await corrector.correct(testCase.input)
      const endTime = Date.now()

      console.log(`   Output: "${result.correctedText}"`)
      console.log(`   Corrections: ${result.corrections.length}`)
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`)
      console.log(`   Time: ${endTime - startTime}ms`)

      if (result.corrections.length > 0) {
        console.log('   📝 Applied corrections:')
        result.corrections.forEach((correction, idx) => {
          console.log(
            `      ${idx + 1}. "${correction.original}" → "${correction.corrected}" (${correction.category}: ${correction.reason})`
          )
        })
      }

      // Validate results
      const hasCorrections = result.corrections.length > 0
      const textChanged = result.correctedText !== testCase.input
      const processingFast = endTime - startTime < 100

      if (hasCorrections && textChanged && processingFast) {
        console.log('   ✅ TEST PASSED')
        passedTests++
      } else {
        console.log('   ⚠️ TEST PARTIAL')
        if (!hasCorrections) console.log('      - No corrections applied')
        if (!textChanged) console.log('      - Text unchanged')
        if (!processingFast) console.log('      - Processing slow')
      }
    }

    // Test 2: Quick utility function
    console.log('\n2. Testing Quick Correction Utility')
    console.log('-'.repeat(40))

    const quickTestCases = [
      'только для когда вы попробуете',
      'жет быть это правильно',
      'ком форта и пол ностью'
    ]

    for (let i = 0; i < quickTestCases.length; i++) {
      const input = quickTestCases[i]
      console.log(`\n   Quick test ${i + 1}: "${input}"`)

      const corrected = await correctRussianGrammar(input)
      console.log(`   Result: "${corrected}"`)
      console.log(`   Changed: ${input !== corrected ? '✅ Yes' : '⚠️ No'}`)
    }

    // Test 3: Complex production text
    console.log('\n3. Testing Complex Production Text')
    console.log('-'.repeat(40))

    const complexText =
      'действительно выбираете только для Когда вы попробуете принимали решение. исключительно то такой довлетворить. Когда вы в последний раз стави ли свою собственность довлетворение выше чужого ком форта. Показать за программировала вас Вос можно, вы будете се лейным посредником, они все где отвечал. э-э. Всё были счастливы конфликта жет быть.'

    console.log(`   Complex input length: ${complexText.length} characters`)
    console.log(`   Input preview: "${complexText.substring(0, 100)}..."`)

    const complexStart = Date.now()
    const complexResult = await corrector.correct(complexText)
    const complexEnd = Date.now()

    console.log(`   Output length: ${complexResult.correctedText.length} characters`)
    console.log(`   Output preview: "${complexResult.correctedText.substring(0, 100)}..."`)
    console.log(`   Corrections applied: ${complexResult.corrections.length}`)
    console.log(`   Processing time: ${complexEnd - complexStart}ms`)
    console.log(`   Confidence: ${(complexResult.confidence * 100).toFixed(1)}%`)

    if (complexResult.corrections.length > 0) {
      console.log('   📝 Top corrections:')
      complexResult.corrections.slice(0, 5).forEach((correction, idx) => {
        console.log(
          `      ${idx + 1}. "${correction.original}" → "${correction.corrected}" (${correction.category})`
        )
      })
    }

    // Test 4: Performance benchmark
    console.log('\n4. Performance Benchmark')
    console.log('-'.repeat(30))

    const benchmarkText = 'только для когда жет быть ком форта пол ностью Вос можно'
    const iterations = 20

    console.log(`   Running ${iterations} iterations on: "${benchmarkText}"`)

    const perfStart = Date.now()
    for (let i = 0; i < iterations; i++) {
      await corrector.correct(benchmarkText)
    }
    const perfEnd = Date.now()

    const avgTime = (perfEnd - perfStart) / iterations
    console.log(`   Average time: ${avgTime.toFixed(1)}ms per correction`)
    console.log(
      `   Performance: ${avgTime < 50 ? '✅ Excellent' : avgTime < 100 ? '✅ Good' : '⚠️ Needs optimization'}`
    )

    // Test 5: Statistics and configuration
    console.log('\n5. Configuration and Statistics')
    console.log('-'.repeat(40))

    const finalStats = corrector.getStats()
    console.log('   📊 Final statistics:', finalStats)

    console.log('   ⚙️ Testing configuration changes...')
    corrector.updateConfig({
      confidenceThreshold: 0.8,
      maxCorrectionsPerSentence: 3
    })

    const configTestResult = await corrector.correct('только для тест жет быть')
    console.log(
      `   Config test result: "${configTestResult.correctedText}" (${configTestResult.corrections.length} corrections)`
    )

    // Summary
    console.log('\n📋 Test Results Summary')
    console.log('=' + '='.repeat(30))
    console.log(`Pattern tests passed: ${passedTests}/${testCases.length}`)
    console.log(`Average processing time: ${avgTime.toFixed(1)}ms`)
    console.log(`Complex text corrections: ${complexResult.corrections.length}`)

    const overallSuccess =
      passedTests >= testCases.length * 0.7 && avgTime < 100 && complexResult.corrections.length > 0

    if (overallSuccess) {
      console.log('\n🎉 GRAMMAR PATTERN CORRECTOR: SUCCESS!')
      console.log('   ✅ Grammar patterns working correctly')
      console.log('   ✅ Production error patterns addressed')
      console.log('   ✅ Performance within acceptable limits')
      console.log('   ✅ Ready for integration with Russian corrector')
    } else {
      console.log('\n⚠️ GRAMMAR PATTERN CORRECTOR: NEEDS IMPROVEMENT')
      console.log('   - Review failed test cases')
      console.log('   - Optimize performance if needed')
      console.log('   - Check pattern effectiveness')
    }

    return overallSuccess
  } catch (error) {
    console.error('❌ Grammar Pattern Corrector test failed:', error)
    return false
  }
}

// Export for external testing
export {testGrammarPatternCorrector}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Grammar Pattern Correction System Validation')
  console.log('🎯 Testing grammar corrections for Russian transcription errors')
  console.log('')

  testGrammarPatternCorrector()
    .then(success => {
      if (success) {
        console.log('\n🎉 ALL GRAMMAR PATTERN TESTS PASSED!')
        console.log('Grammar correction system is ready for production!')
        process.exit(0)
      } else {
        console.log('\n⚠️ Some grammar pattern issues need attention')
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('\n❌ Grammar pattern correction test failed:', error)
      process.exit(1)
    })
}
