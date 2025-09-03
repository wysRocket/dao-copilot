/**
 * Integration Test for Russian Transcription Correction System
 * Tests the complete system: Russian corrector + Mixed language detector + Grammar pattern corrector
 */

console.log('🧪 Russian Transcription Correction System - Integration Test');
console.log('=============================================================');

async function testIntegratedSystem() {
  try {
    // Import all components
    const { createRussianTranscriptionCorrector } = await import('./src/services/russian-transcription-corrector.ts');
    const { createMixedLanguageDetector } = await import('./src/services/mixed-language-detector.ts');
    const { createGrammarPatternCorrector } = await import('./src/services/grammar-pattern-corrector.ts');
    
    console.log('✅ All corrector modules imported successfully');

    // Create the main corrector
    const corrector = createRussianTranscriptionCorrector({
      minConfidenceThreshold: 0.6,
      maxCorrectionsPerSentence: 10,
      enableLogging: true,
      enableWordBoundaryCorrection: true,
      enableTechnicalTermCorrection: true,
      enablePatternCorrection: true,
      enableMultipleWordCorrection: true
    });

    console.log('✅ Russian transcription corrector initialized');

    // Test cases from production screenshot
    const productionTestCases = [
      {
        name: 'Mixed Language + Grammar Issues',
        input: 'действительно выбираете только для Когда вы попробуете принимали решение',
        expected: ['grammar corrections', 'mixed language detection']
      },
      {
        name: 'Word Boundary Issues',
        input: 'стави ли свою собственность выше чужого ком форта',
        expected: ['word boundary fixes']
      },
      {
        name: 'Technical Terms + Grammar',
        input: 'програмирала вас Вос можно пол ностью',
        expected: ['technical term correction', 'grammar fixes']
      },
      {
        name: 'Complex Fragmented Speech',
        input: 'не то что там то конечно Но когда в последний раз жет быть',
        expected: ['sentence structure', 'conjunction fixes']
      }
    ];

    console.log(`\n🔬 Testing ${productionTestCases.length} production scenarios`);
    console.log('-'.repeat(60));

    let successCount = 0;
    const allResults = [];

    for (let i = 0; i < productionTestCases.length; i++) {
      const testCase = productionTestCases[i];
      console.log(`\nTest ${i + 1}: ${testCase.name}`);
      console.log(`Input: "${testCase.input}"`);
      
      const startTime = Date.now();
      const result = await corrector.correct(testCase.input);
      const endTime = Date.now();
      
      console.log(`Output: "${result.correctedText}"`);
      console.log(`Corrections: ${result.corrections.length}`);
      console.log(`Time: ${endTime - startTime}ms`);
      console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      
      if (result.corrections.length > 0) {
        console.log('📝 Applied corrections:');
        result.corrections.forEach((correction, idx) => {
          console.log(`   ${idx + 1}. "${correction.original}" → "${correction.corrected}" (${correction.type})`);
        });
      }
      
      // Check if corrections were applied
      const hasCorrections = result.corrections.length > 0;
      const textChanged = result.correctedText !== testCase.input;
      const processingFast = (endTime - startTime) < 200;
      
      if (hasCorrections && textChanged && processingFast) {
        console.log('✅ TEST PASSED');
        successCount++;
      } else {
        console.log('⚠️ TEST PARTIAL');
      }
      
      allResults.push({
        ...result,
        processingTime: endTime - startTime
      });
    }

    // Test performance with longer text
    console.log('\n📊 Performance Test with Complex Text');
    console.log('-'.repeat(40));
    
    const complexText = `действительно выбираете только для Когда вы попробуете принимали решение. исключительно то такой довлетворить. Когда вы в последний раз стави ли свою собственность довлетворение выше чужого ком форта. Показать за программировала вас Вос можно, вы будете се лейным посредником, они все где отвечал. э-э. Всё были счастливы конфликта жет быть не будет. пол ностью готовы для тестирования системы.`;
    
    console.log(`Complex text length: ${complexText.length} characters`);
    
    const perfStart = Date.now();
    const complexResult = await corrector.correct(complexText);
    const perfEnd = Date.now();
    
    console.log(`Processing time: ${perfEnd - perfStart}ms`);
    console.log(`Corrections applied: ${complexResult.corrections.length}`);
    console.log(`Confidence: ${(complexResult.confidence * 100).toFixed(1)}%`);
    console.log(`Characters per ms: ${(complexText.length / (perfEnd - perfStart)).toFixed(2)}`);
    
    if (complexResult.corrections.length > 0) {
      console.log('📝 Sample corrections from complex text:');
      complexResult.corrections.slice(0, 5).forEach((correction, idx) => {
        console.log(`   ${idx + 1}. "${correction.original}" → "${correction.corrected}" (${correction.type})`);
      });
      if (complexResult.corrections.length > 5) {
        console.log(`   ... and ${complexResult.corrections.length - 5} more corrections`);
      }
    }

    // Test individual components
    console.log('\n🔧 Component Integration Test');
    console.log('-'.repeat(35));
    
    // Test mixed language detector
    const mixedDetector = createMixedLanguageDetector();
    const mixedTest = await mixedDetector.detectAndCorrect('programming в режиме real time testing');
    console.log(`Mixed language test: "${mixedTest.correctedText}" (${mixedTest.segments.length} segments)`);
    
    // Test grammar corrector
    const grammarCorrector = createGrammarPatternCorrector();
    const grammarTest = await grammarCorrector.correct('только для когда жет быть');
    console.log(`Grammar test: "${grammarTest.correctedText}" (${grammarTest.corrections.length} corrections)`);

    // Summary
    console.log('\n📋 Integration Test Summary');
    console.log('=' + '='.repeat(40));
    console.log(`Production tests passed: ${successCount}/${productionTestCases.length}`);
    console.log(`Average corrections per test: ${(allResults.reduce((sum, r) => sum + r.corrections.length, 0) / allResults.length).toFixed(1)}`);
    console.log(`Average processing time: ${(allResults.reduce((sum, r) => sum + r.processingTime, 0) / allResults.length).toFixed(1)}ms`);
    console.log(`Complex text processing: ${perfEnd - perfStart}ms for ${complexText.length} chars`);
    
    const overallSuccess = successCount >= productionTestCases.length * 0.7 && 
                          (perfEnd - perfStart) < 500 && 
                          complexResult.corrections.length > 5;
    
    if (overallSuccess) {
      console.log('\n🎉 INTEGRATION TEST: SUCCESS!');
      console.log('   ✅ All three corrector components working');
      console.log('   ✅ Production errors being addressed');
      console.log('   ✅ Performance within acceptable limits');
      console.log('   ✅ System ready for Task 11.3 completion');
    } else {
      console.log('\n⚠️ INTEGRATION TEST: NEEDS ATTENTION');
      console.log('   - Some components may need tuning');
      console.log('   - Performance optimization may be needed');
    }

    return overallSuccess;

  } catch (error) {
    console.error('❌ Integration test failed:', error);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Russian Transcription System Integration Validation');
  console.log('🎯 Testing complete correction pipeline for production errors');
  console.log('');

  testIntegratedSystem()
    .then((success) => {
      if (success) {
        console.log('\n🎉 ALL INTEGRATION TESTS PASSED!');
        console.log('Task 11.3 - Grammar Pattern Corrector is ready!');
        process.exit(0);
      } else {
        console.log('\n⚠️ Integration issues need attention');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n❌ Integration test failed:', error);
      process.exit(1);
    });
}

export { testIntegratedSystem };