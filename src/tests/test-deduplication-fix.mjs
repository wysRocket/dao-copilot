/**
 * Test for TranscriptionDeduplicator and Analysis Page Duplicate Fix
 *
 * This test validates the deduplication functionality that resolves the
 * duplicate transcription entries issue on the Analysis page.
 */

import {
  createTranscriptionDeduplicator,
  deduplicateTranscriptions
} from './src/services/TranscriptionDeduplicator.js'

async function runDeduplicationTests() {
  console.log('🧪 Testing TranscriptionDeduplicator - Analysis Page Duplicate Fix')
  console.log('='.repeat(70))

  const passed = []
  const failed = []

  function test(name, fn) {
    try {
      fn()
      passed.push(name)
      console.log(`✅ ${name}`)
    } catch (error) {
      failed.push({name, error: error.message})
      console.log(`❌ ${name}: ${error.message}`)
    }
  }

  // Test 1: Exact ID Deduplication
  test('Remove exact duplicate IDs', () => {
    const transcriptions = [
      {id: '1', text: 'Hello world', timestamp: 1000, confidence: 0.9, source: 'websocket'},
      {id: '2', text: 'How are you?', timestamp: 2000, confidence: 0.8, source: 'batch'},
      {id: '1', text: 'Hello world again', timestamp: 3000, confidence: 0.95, source: 'websocket'}, // Duplicate ID
      {id: '3', text: 'Good morning', timestamp: 4000, confidence: 0.85, source: 'streaming'}
    ]

    const result = deduplicateTranscriptions(transcriptions, {
      deduplicateById: true,
      deduplicateByContent: false,
      deduplicateByTimestamp: false
    })

    if (result.deduplicated.length !== 3) {
      throw new Error(`Expected 3 transcriptions, got ${result.deduplicated.length}`)
    }
    if (result.duplicateCount !== 1) {
      throw new Error(`Expected 1 duplicate, got ${result.duplicateCount}`)
    }
    if (result.removalReasons.length !== 1 || result.removalReasons[0].reason !== 'exact_id') {
      throw new Error(`Expected 1 exact_id removal reason`)
    }
  })

  // Test 2: Content and Timestamp Deduplication
  test('Remove content duplicates with close timestamps', () => {
    const transcriptions = [
      {id: '1', text: 'подлинным, и я тремя жду', timestamp: 1629724769000, confidence: 0.8},
      {id: '2', text: 'подлинным, и я тремя жду', timestamp: 1629724769001, confidence: 0.8}, // Same content, close time
      {id: '3', text: 'По сотрудникам', timestamp: 1629724764000, confidence: 0.8},
      {id: '4', text: 'По сотрудникам', timestamp: 1629724764002, confidence: 0.8}, // Same content, close time
      {id: '5', text: 'Doctor', timestamp: 1629724758000, confidence: 0.8},
      {id: '6', text: 'Doctor', timestamp: 1629724758001, confidence: 0.8} // Same content, close time
    ]

    const result = deduplicateTranscriptions(transcriptions, {
      deduplicateById: true,
      deduplicateByContent: true,
      deduplicateByTimestamp: true,
      timeThreshold: 5000 // 5 seconds
    })

    if (result.deduplicated.length !== 3) {
      throw new Error(`Expected 3 unique transcriptions, got ${result.deduplicated.length}`)
    }
    if (result.duplicateCount !== 3) {
      throw new Error(`Expected 3 duplicates removed, got ${result.duplicateCount}`)
    }

    // Verify we kept the first occurrence of each unique content
    const texts = result.deduplicated.map(t => t.text)
    const expectedTexts = ['подлинным, и я тремя жду', 'По сотрудникам', 'Doctor']
    expectedTexts.forEach(expected => {
      if (!texts.includes(expected)) {
        throw new Error(`Expected to keep "${expected}" but it was not found`)
      }
    })
  })

  // Test 3: Screenshot-specific duplicates (from the issue image)
  test('Handle screenshot-specific duplicate patterns', () => {
    const transcriptions = [
      {
        id: '1',
        text: 'подлинным, и я тремя жду',
        timestamp: 1629724769290,
        confidence: 0.8,
        source: 'websocket'
      },
      {
        id: '2',
        text: 'подлинным, и я тремя жду',
        timestamp: 1629724769290,
        confidence: 0.8,
        source: 'websocket'
      }, // Exact duplicate
      {id: '3', text: 'По сотрудникам', timestamp: 1629724764240, confidence: 0.8, source: 'batch'},
      {id: '4', text: 'По сотрудникам', timestamp: 1629724764240, confidence: 0.8, source: 'batch'}, // Exact duplicate
      {
        id: '5',
        text: 'водитель своих брат ский ребёнок, это моциональное лицо. У п...',
        timestamp: 1629724759190,
        confidence: 0.95,
        source: 'websocket'
      },
      {id: '6', text: 'когда', timestamp: 1629724759190, confidence: 0.8, source: 'streaming'},
      {id: '7', text: 'когда', timestamp: 1629724759190, confidence: 0.8, source: 'streaming'}, // Exact duplicate
      {id: '8', text: 'Doctor', timestamp: 1629724758180, confidence: 0.8, source: 'batch'},
      {id: '9', text: 'Doctor', timestamp: 1629724758180, confidence: 0.8, source: 'batch'} // Exact duplicate
    ]

    const result = deduplicateTranscriptions(transcriptions)

    // Should remove 4 duplicates (IDs 2, 4, 7, 9)
    if (result.deduplicated.length !== 5) {
      throw new Error(`Expected 5 unique transcriptions, got ${result.deduplicated.length}`)
    }
    if (result.duplicateCount !== 4) {
      throw new Error(`Expected 4 duplicates removed, got ${result.duplicateCount}`)
    }

    // Verify each unique text appears only once
    const textCounts = result.deduplicated.reduce((acc, t) => {
      acc[t.text] = (acc[t.text] || 0) + 1
      return acc
    }, {})

    Object.entries(textCounts).forEach(([text, count]) => {
      if (count > 1) {
        throw new Error(`Text "${text}" appears ${count} times, should be unique`)
      }
    })
  })

  // Test 4: Mixed source deduplication
  test('Handle duplicates from different sources', () => {
    const transcriptions = [
      {id: 'ws-1', text: 'Hello world', timestamp: 1000, source: 'websocket-gemini'},
      {id: 'batch-1', text: 'Hello world', timestamp: 1001, source: 'batch'}, // Same content, different source
      {id: 'stream-1', text: 'Good morning', timestamp: 2000, source: 'streaming'},
      {id: 'ws-2', text: 'Good morning', timestamp: 2002, source: 'websocket'}, // Same content, different source
      {id: 'unique-1', text: 'Unique message', timestamp: 3000, source: 'batch'}
    ]

    const result = deduplicateTranscriptions(transcriptions, {
      timeThreshold: 3000 // 3 seconds
    })

    if (result.deduplicated.length !== 3) {
      throw new Error(`Expected 3 unique transcriptions, got ${result.deduplicated.length}`)
    }
    if (result.duplicateCount !== 2) {
      throw new Error(`Expected 2 duplicates removed, got ${result.duplicateCount}`)
    }

    // Should keep the first occurrence of each unique content
    const texts = result.deduplicated.map(t => t.text)
    const expectedTexts = ['Hello world', 'Good morning', 'Unique message']
    expectedTexts.forEach(expected => {
      if (!texts.includes(expected)) {
        throw new Error(`Expected to keep "${expected}" but it was not found`)
      }
    })
  })

  // Test 5: Performance test with large dataset
  test('Performance with large dataset', () => {
    const transcriptions = []
    const duplicateEvery = 5 // Every 5th item is a duplicate

    // Create 1000 transcriptions with 20% duplicates
    for (let i = 0; i < 1000; i++) {
      const isDuplicate = i > 0 && i % duplicateEvery === 0
      transcriptions.push({
        id: isDuplicate ? `${i - duplicateEvery}` : `${i}`, // Duplicate ID every 5th item
        text: `Transcription content ${isDuplicate ? i - duplicateEvery : i}`,
        timestamp: Date.now() + i * 100,
        confidence: 0.8 + Math.random() * 0.2
      })
    }

    const startTime = performance.now()
    const result = deduplicateTranscriptions(transcriptions)
    const endTime = performance.now()

    const processingTime = endTime - startTime
    if (processingTime > 500) {
      // Should complete in under 500ms
      throw new Error(`Processing took ${processingTime.toFixed(2)}ms, expected under 500ms`)
    }

    const expectedDuplicates = Math.floor(1000 / duplicateEvery) // 200 duplicates
    if (result.duplicateCount !== expectedDuplicates) {
      throw new Error(`Expected ${expectedDuplicates} duplicates, got ${result.duplicateCount}`)
    }

    console.log(`   Processing time: ${processingTime.toFixed(2)}ms for 1000 items`)
  })

  // Test 6: Deduplicator configuration
  test('Configuration options work correctly', () => {
    const deduplicator = createTranscriptionDeduplicator({
      deduplicateById: false,
      deduplicateByContent: true,
      timeThreshold: 1000, // 1 second
      enableFuzzyMatching: false
    })

    const transcriptions = [
      {id: '1', text: 'Hello', timestamp: 1000},
      {id: '1', text: 'World', timestamp: 2000}, // Same ID, should NOT be removed
      {id: '2', text: 'Hello', timestamp: 1500} // Same content, close time, SHOULD be removed
    ]

    const result = deduplicator.deduplicate(transcriptions)

    if (result.deduplicated.length !== 2) {
      throw new Error(
        `Expected 2 transcriptions (ID dedup disabled), got ${result.deduplicated.length}`
      )
    }
    if (result.duplicateCount !== 1) {
      throw new Error(`Expected 1 content duplicate, got ${result.duplicateCount}`)
    }

    const config = deduplicator.getConfig()
    if (config.deduplicateById !== false) {
      throw new Error('Configuration not applied correctly')
    }
  })

  // Test 7: Empty and edge cases
  test('Handle empty and edge cases', () => {
    const result1 = deduplicateTranscriptions([])
    if (result1.deduplicated.length !== 0 || result1.duplicateCount !== 0) {
      throw new Error('Empty array should return empty result')
    }

    const result2 = deduplicateTranscriptions([{id: '1', text: 'Single item', timestamp: 1000}])
    if (result2.deduplicated.length !== 1 || result2.duplicateCount !== 0) {
      throw new Error('Single item should be unchanged')
    }

    const result3 = deduplicateTranscriptions([
      {id: '1', text: '', timestamp: 1000}, // Empty text
      {id: '2', text: '   ', timestamp: 2000} // Whitespace only
    ])
    if (result3.deduplicated.length !== 2) {
      throw new Error('Empty/whitespace texts should be kept as separate')
    }
  })

  // Summary
  console.log('\n' + '='.repeat(70))
  console.log(`📊 Test Results: ${passed.length} passed, ${failed.length} failed`)

  if (failed.length > 0) {
    console.log('\n❌ Failed tests:')
    failed.forEach(({name, error}) => {
      console.log(`   - ${name}: ${error}`)
    })
  } else {
    console.log('\n✅ All deduplication tests passed!')
    console.log('\n🎉 Analysis Page Duplicate Issue - RESOLVED!')
    console.log('\n📋 Features verified:')
    console.log('   ✅ Exact ID duplicate removal')
    console.log('   ✅ Content + timestamp proximity deduplication')
    console.log('   ✅ Multi-source duplicate handling')
    console.log('   ✅ Screenshot-specific duplicate patterns')
    console.log('   ✅ Performance optimization (<500ms for 1000 items)')
    console.log('   ✅ Configurable deduplication strategies')
    console.log('   ✅ Edge case handling')
    console.log('\n🚀 Ready for production deployment!')
  }

  return {passed: passed.length, failed: failed.length}
}

// Run the tests
runDeduplicationTests()
  .then(({failed}) => {
    if (failed > 0) {
      process.exit(1)
    }
    console.log(`\n✨ TranscriptionDeduplicator validated successfully!`)
  })
  .catch(error => {
    console.error('💥 Test execution failed:', error)
    process.exit(1)
  })
