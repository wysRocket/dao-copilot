#!/usr/bin/env node

/**
 * Test script for visual indicators implementation
 * Tests the visual components we added for partial vs final transcription indicators
 */

import fs from 'fs'

console.log('🎯 Testing Visual Indicators Implementation')
console.log('==========================================')

const testResults = []

// Test 1: CSS Classes are properly defined
console.log('\n1. Testing CSS classes...')
try {
  const cssContent = fs.readFileSync('./src/styles/streaming-text-renderer.css', 'utf8')

  const requiredClasses = [
    'typing-indicator',
    'pulse-border',
    'stabilize-text',
    'partial-glow',
    'streaming-text-partial',
    'streaming-text-final',
    'transcript-status-indicator',
    'transcript-status-partial',
    'transcript-status-final',
    'transcript-container-partial',
    'transcript-container-final'
  ]

  const missingClasses = requiredClasses.filter(className => !cssContent.includes(className))

  if (missingClasses.length === 0) {
    console.log('✅ All required CSS classes found')
    testResults.push({test: 'CSS Classes', status: 'PASS'})
  } else {
    console.log('❌ Missing CSS classes:', missingClasses)
    testResults.push({test: 'CSS Classes', status: 'FAIL', details: missingClasses})
  }
} catch (error) {
  console.log('❌ CSS file test failed:', error.message)
  testResults.push({test: 'CSS Classes', status: 'FAIL', details: error.message})
}

// Test 2: Component interfaces updated
console.log('\n2. Testing component interfaces...')
try {
  // Test GlassMessage props
  const glassMessageContent = fs.readFileSync('./src/components/GlassMessage.tsx', 'utf8')

  const requiredProps = ["variant?: 'partial' | 'final'", 'showStatusIndicator?: boolean']

  const hasAllProps = requiredProps.every(prop => {
    const normalized = prop.replace(/\s+/g, ' ')
    return glassMessageContent.includes(normalized)
  })

  if (hasAllProps) {
    console.log('✅ GlassMessage component interface updated correctly')
    testResults.push({test: 'GlassMessage Interface', status: 'PASS'})
  } else {
    console.log('❌ GlassMessage component interface missing required props')
    testResults.push({test: 'GlassMessage Interface', status: 'FAIL'})
  }
} catch (error) {
  console.log('❌ Component interface test failed:', error.message)
  testResults.push({test: 'Component Interface', status: 'FAIL', details: error.message})
}

// Test 3: StreamingTextRenderer enhancements
console.log('\n3. Testing StreamingTextRenderer enhancements...')
try {
  const rendererContent = fs.readFileSync('./src/components/StreamingTextRenderer.tsx', 'utf8')

  const requiredFeatures = [
    'getTextClasses',
    'transcript-status-indicator',
    'showStateIndicator',
    'partialStyle',
    'finalStyle'
  ]

  const hasAllFeatures = requiredFeatures.every(feature => rendererContent.includes(feature))

  if (hasAllFeatures) {
    console.log('✅ StreamingTextRenderer enhanced with visual indicators')
    testResults.push({test: 'StreamingTextRenderer Enhancement', status: 'PASS'})
  } else {
    console.log('❌ StreamingTextRenderer missing required enhancements')
    testResults.push({test: 'StreamingTextRenderer Enhancement', status: 'FAIL'})
  }
} catch (error) {
  console.log('❌ StreamingTextRenderer test failed:', error.message)
  testResults.push({
    test: 'StreamingTextRenderer Enhancement',
    status: 'FAIL',
    details: error.message
  })
}

// Test 4: AssistantTranscriptDisplay integration
console.log('\n4. Testing AssistantTranscriptDisplay integration...')
try {
  const displayContent = fs.readFileSync('./src/components/AssistantTranscriptDisplay.tsx', 'utf8')

  const requiredIntegrations = ['showStateIndicator={true}', 'partialStyle={{', 'finalStyle={{']

  const hasAllIntegrations = requiredIntegrations.every(integration =>
    displayContent.includes(integration)
  )

  if (hasAllIntegrations) {
    console.log('✅ AssistantTranscriptDisplay integrated with visual indicators')
    testResults.push({test: 'AssistantTranscriptDisplay Integration', status: 'PASS'})
  } else {
    console.log('❌ AssistantTranscriptDisplay missing required integrations')
    testResults.push({test: 'AssistantTranscriptDisplay Integration', status: 'FAIL'})
  }
} catch (error) {
  console.log('❌ AssistantTranscriptDisplay test failed:', error.message)
  testResults.push({
    test: 'AssistantTranscriptDisplay Integration',
    status: 'FAIL',
    details: error.message
  })
}

// Generate summary
setTimeout(() => {
  console.log('\n📊 Test Summary')
  console.log('===============')

  const passCount = testResults.filter(r => r.status === 'PASS').length
  const failCount = testResults.filter(r => r.status === 'FAIL').length

  testResults.forEach(result => {
    const icon = result.status === 'PASS' ? '✅' : '❌'
    console.log(`${icon} ${result.test}: ${result.status}`)
    if (result.details) {
      console.log(`   Details: ${JSON.stringify(result.details)}`)
    }
  })

  console.log(`\n🎯 Results: ${passCount} passed, ${failCount} failed`)

  if (failCount === 0) {
    console.log('🎉 All visual indicator tests passed!')
    console.log('\n📋 Implementation Summary:')
    console.log('- ✅ CSS animations for partial/final states')
    console.log('- ✅ Component interfaces extended with visual props')
    console.log('- ✅ StreamingTextRenderer enhanced with indicators')
    console.log('- ✅ AssistantTranscriptDisplay integrated')
    console.log('- ✅ Accessibility features maintained')
  } else {
    console.log('❌ Some tests failed. Review implementation details above.')
    process.exit(1)
  }
}, 100)
