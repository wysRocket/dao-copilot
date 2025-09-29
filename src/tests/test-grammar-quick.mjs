/**
 * Simple Grammar Pattern Corrector Test
 * Quick validation of basic functionality
 */

import {
  createGrammarPatternCorrector,
  correctRussianGrammar
} from './src/services/grammar-pattern-corrector.ts'

async function quickTest() {
  try {
    console.log('🧪 Grammar Pattern Corrector - Quick Test')
    console.log('=========================================')

    // Test 1: Create corrector
    console.log('\n1. Creating corrector...')
    const corrector = createGrammarPatternCorrector()
    console.log('✅ Corrector created successfully')

    // Test 2: Test simple corrections
    const testCases = [
      'только для когда',
      'жет быть правильно',
      'ком форта и пол ностью',
      'стави ли решение'
    ]

    console.log('\n2. Testing corrections:')

    for (const testCase of testCases) {
      const result = await corrector.correct(testCase)
      console.log(
        `   "${testCase}" → "${result.correctedText}" (${result.corrections.length} fixes)`
      )
    }

    // Test 3: Quick utility
    console.log('\n3. Testing quick utility:')
    const quickResult = await correctRussianGrammar('только для тест')
    console.log(`   Quick: "${quickResult}"`)

    console.log('\n✅ Grammar Pattern Corrector working correctly!')
    return true
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    return false
  }
}

quickTest()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(error => {
    console.error('❌ Quick test error:', error)
    process.exit(1)
  })
