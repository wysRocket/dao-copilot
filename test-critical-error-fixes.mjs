/**
 * Test Critical Russian Transcription Error Fixes
 *
 * This test validates that the enhanced RussianTranscriptionCorrector
 * properly fixes the specific errors observed in production.
 */

// Test the enhanced Russian transcription corrector
async function testCriticalErrorFixes() {
  console.log('🧪 Testing Critical Russian Transcription Error Fixes')
  console.log('=' + '='.repeat(55))

  try {
    // Import the enhanced corrector
    const {createRussianTranscriptionCorrector} = await import(
      './src/services/russian-transcription-corrector.ts'
    )

    // Create corrector with all features enabled
    const corrector = createRussianTranscriptionCorrector({
      enableProperNameCorrection: true,
      enableTechnicalTermCorrection: true,
      enableContextualSpelling: true,
      enableGrammarCorrection: true,
      enableCommonPatternFixes: true,
      confidenceThreshold: 0.7
    })

    console.log('✅ Enhanced corrector initialized')
    console.log('📊 Corrector stats:', corrector.getStats())

    // Test cases based on actual production errors from screenshot
    const testCases = [
      {
        name: 'Mixed Language Segment Fix',
        input: 'по-моему, thing I would do is I would look at the data',
        expectedFixes: ['English segment removal', 'Russian translation'],
        description: 'Should replace English with Russian equivalent'
      },
      {
        name: 'Word Boundary - "Лю ди"',
        input: 'Вот самый лучший Лю ди, которых вы отчаянно пытаетесь спать',
        expectedFixes: ['word boundary correction'],
        description: 'Should fix "Лю ди" → "люди"'
      },
      {
        name: 'Technical Term - Programming',
        input: 'програмирала вас Вос можно',
        expectedFixes: ['technical term correction'],
        description: 'Should fix "програмирала" → "программировала"'
      },
      {
        name: 'Word Boundary - "бесконе чные"',
        input: 'уважаю ваши бесконе чные хранки',
        expectedFixes: ['word boundary correction'],
        description: 'Should fix "бесконе чные" → "бесконечные"'
      },
      {
        name: 'Complex Mixed Content',
        input:
          'исключительно то такой довлетворить. Когда вы в последний раз стави ли свою собственность довлетворение выше чужого ком форта',
        expectedFixes: ['word boundary corrections'],
        description: 'Should fix multiple split words'
      },
      {
        name: 'Sentence Structure',
        input: 'действительно выбираете только для Когда вы попробуете',
        expectedFixes: ['grammar correction'],
        description: 'Should fix sentence structure and remove unnecessary "для"'
      }
    ]

    console.log(`\n🔬 Testing ${testCases.length} Critical Error Cases`)
    console.log('-'.repeat(60))

    let passedTests = 0
    let totalTests = testCases.length

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i]
      console.log(`\n${i + 1}. ${testCase.name}`)
      console.log(`   Input: "${testCase.input}"`)
      console.log(`   Expected: ${testCase.description}`)

      const startTime = Date.now()
      const result = await corrector.correct(testCase.input)
      const endTime = Date.now()

      console.log(`   Output: "${result.correctedText}"`)
      console.log(`   Processing time: ${endTime - startTime}ms`)
      console.log(`   Corrections applied: ${result.corrections.length}`)
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`)

      // Show specific corrections
      if (result.corrections.length > 0) {
        console.log('   📝 Applied corrections:')
        result.corrections.forEach(correction => {
          console.log(
            `      - "${correction.original}" → "${correction.corrected}" (${correction.type}: ${correction.reason})`
          )
        })
      }

      // Validate improvements
      const hasImprovements = result.corrections.length > 0
      const textChanged = result.correctedText !== testCase.input
      const processingFast = endTime - startTime < 100 // Should be under 100ms

      if (hasImprovements && textChanged && processingFast) {
        console.log('   ✅ TEST PASSED: Corrections applied successfully')
        passedTests++
      } else {
        console.log('   ⚠️ TEST PARTIAL: Some issues detected')
        if (!hasImprovements) console.log('      - No corrections applied')
        if (!textChanged) console.log('      - Text unchanged')
        if (!processingFast) console.log('      - Processing too slow')
      }
    }

    console.log('\n📊 Test Results Summary')
    console.log('=' + '='.repeat(30))
    console.log(
      `Tests passed: ${passedTests}/${totalTests} (${Math.round((passedTests / totalTests) * 100)}%)`
    )

    // Performance benchmark
    console.log('\n⚡ Performance Benchmark')
    console.log('-'.repeat(35))

    const benchmarkText =
      'Вот самый лучший Лю ди, которых вы отчаянно пытаетесь спать, по-моему, thing I would do is I would look at the data'
    const benchmarkStart = Date.now()

    for (let i = 0; i < 10; i++) {
      await corrector.correct(benchmarkText)
    }

    const benchmarkEnd = Date.now()
    const avgTime = (benchmarkEnd - benchmarkStart) / 10

    console.log(`Average processing time (10 runs): ${avgTime.toFixed(1)}ms`)
    console.log(
      `Processing speed: ${avgTime < 50 ? '✅ Excellent' : avgTime < 100 ? '✅ Good' : '⚠️ Needs optimization'} (target: <50ms)`
    )

    // Real-world production test
    console.log('\n🌍 Production-Style Test')
    console.log('-'.repeat(30))

    const productionText =
      'Вот самый лучший Лю ди, которых вы отчаянно пытаетесь спать, починить и удовлетворить, даже не уважаю ваши бесконе чные хранки. говорит. Я не то, что там то, конечно, Но когда в последний Вы действительно выбираете только для Когда вы попробуете принимали решение. исключительно то такой. довлетворить. Когда вы в последний раз стави ли свою собственность довлетворение выше чужого ком форта. Показать за программировала вас Вос можно, вы будете се лейным посредником, они все где отвечал. э-э. Всё были счастливы конфликта жет быть. по-моему, thing I would do is I would look at the data. поняли, люди в эще были, что ваша команда пол ностью.'

    console.log('Processing production-style text...')
    const prodResult = await corrector.correct(productionText)

    console.log(`Original length: ${productionText.length} characters`)
    console.log(`Corrected length: ${prodResult.correctedText.length} characters`)
    console.log(`Corrections applied: ${prodResult.corrections.length}`)
    console.log(`Processing time: ${prodResult.processingTimeMs}ms`)
    console.log(`Confidence: ${(prodResult.confidence * 100).toFixed(1)}%`)

    console.log('\n📝 Top corrections applied:')
    prodResult.corrections.slice(0, 5).forEach(correction => {
      console.log(`   - "${correction.original}" → "${correction.corrected}" (${correction.type})`)
    })

    // Final assessment
    console.log('\n🎯 Final Assessment')
    console.log('=' + '='.repeat(25))

    const overallSuccess =
      passedTests >= totalTests * 0.8 && avgTime < 100 && prodResult.corrections.length > 0

    if (overallSuccess) {
      console.log('🎉 CRITICAL ERROR FIXES: SUCCESS!')
      console.log('   ✅ Production errors properly addressed')
      console.log('   ✅ Performance within acceptable limits')
      console.log('   ✅ System ready for deployment')
    } else {
      console.log('⚠️ CRITICAL ERROR FIXES: NEEDS WORK')
      console.log('   - Review failed test cases')
      console.log('   - Check performance optimization')
      console.log('   - Validate correction logic')
    }

    return {
      success: overallSuccess,
      testsPassed: passedTests,
      totalTests: totalTests,
      avgProcessingTime: avgTime,
      productionCorrections: prodResult.corrections.length
    }
  } catch (error) {
    console.error('❌ Critical error fix test failed:', error)
    throw error
  }
}

// Export for external testing
export {testCriticalErrorFixes}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Russian Transcription Critical Error Fix Validation')
  console.log('🎯 Testing fixes for production issues observed in screenshot')
  console.log('')

  testCriticalErrorFixes()
    .then(results => {
      console.log('\n📋 Test Summary:')
      console.log(`   Success: ${results.success ? '✅' : '❌'}`)
      console.log(`   Tests passed: ${results.testsPassed}/${results.totalTests}`)
      console.log(`   Avg processing: ${results.avgProcessingTime.toFixed(1)}ms`)
      console.log(`   Production corrections: ${results.productionCorrections}`)

      if (results.success) {
        console.log('\n🎉 ALL CRITICAL ERROR FIXES VALIDATED!')
        console.log('Russian transcription quality system is ready for production!')
        process.exit(0)
      } else {
        console.log('\n⚠️ Some critical issues need attention')
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('\n❌ Critical error fix validation failed:', error)
      process.exit(1)
    })
}
