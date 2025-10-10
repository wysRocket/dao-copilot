/**
 * Advanced Animation Features - Test/Example Usage
 *
 * This file demonstrates how to use the new advanced animation components:
 * - AdvancedAnimationEngine
 * - TextCorrectionHighlighter
 * - AnimationControls
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import {AdvancedAnimationDemo} from '../components/AdvancedAnimationDemo'

/**
 * Example 1: Basic Animation Engine Usage
 */
export const BasicAnimationExample = () => {
  const {AdvancedAnimationEngine, useAdvancedAnimation} = require('../components/AdvancedAnimationEngine')
  const [state, controls] = useAdvancedAnimation('Hello, World!', {
    mode: 'character',
    speed: 1.0
  })

  return (
    <div>
      <AdvancedAnimationEngine text="Hello, World!" config={{mode: 'character', speed: 1}} />
    </div>
  )
}

/**
 * Example 2: Text Correction Highlighting
 */
export const CorrectionExample = () => {
  const {TextCorrectionHighlighter} = require('../components/TextCorrectionHighlighter')
  const corrections = [
    {
      diff: {
        id: 'diff-1',
        type: 'replace',
        oldText: 'teh',
        newText: 'the',
        position: 0,
        length: 3,
        wordIndex: 0,
        charOffset: 0
      },
      phase: 'highlight',
      progress: 0.5
    }
  ]

  return (
    <div>
      <TextCorrectionHighlighter text="the quick brown fox" corrections={corrections} showConfidence={true} confidence={0.85} />
    </div>
  )
}

/**
 * Example 3: Full-Featured Demo
 */
export const FullDemo = () => {
  return <AdvancedAnimationDemo />
}

/**
 * Example 4: Custom Animation Modes
 */
export const AnimationModesExample = () => {
  const modes = ['character', 'word', 'sentence', 'confidence', 'realistic', 'instant']

  return (
    <div style={{padding: '20px'}}>
      <h2>Animation Modes Demonstration</h2>
      {modes.map(mode => (
        <div key={mode} style={{marginBottom: '20px', padding: '10px', border: '1px solid #ccc'}}>
          <h3>Mode: {mode}</h3>
          <div style={{padding: '10px', backgroundColor: '#f5f5f5'}}>
            {/* Animation would go here - pseudo code for documentation */}
            <p>Text would animate here in {mode} mode</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Example 5: Speed Control
 */
export const SpeedControlExample = () => {
  const speeds = [0.5, 1.0, 1.5, 2.0, 3.0]

  return (
    <div style={{padding: '20px'}}>
      <h2>Speed Control Examples</h2>
      {speeds.map(speed => (
        <div key={speed} style={{marginBottom: '20px'}}>
          <h3>Speed: {speed}x</h3>
          <p>Animation at {speed}x normal speed</p>
        </div>
      ))}
    </div>
  )
}

/**
 * Example 6: Confidence Visualization
 */
export const ConfidenceVisualizationExample = () => {
  const confidenceLevels = [
    {value: 0.2, label: 'Low (20%)'},
    {value: 0.5, label: 'Medium (50%)'},
    {value: 0.85, label: 'High (85%)'},
    {value: 1.0, label: 'Perfect (100%)'}
  ]

  return (
    <div style={{padding: '20px'}}>
      <h2>Confidence Visualization</h2>
      <p>Text color changes from red (low) → yellow → green (high) based on confidence</p>
      {confidenceLevels.map(({value, label}) => (
        <div key={value} style={{marginBottom: '10px'}}>
          <strong>{label}:</strong> <span>Sample text at this confidence level</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Usage Instructions
 */
export const UsageInstructions = () => {
  return (
    <div style={{padding: '20px', maxWidth: '800px', margin: '0 auto'}}>
      <h1>Advanced Animation Features - Usage Guide</h1>

      <section>
        <h2>1. AdvancedAnimationEngine</h2>
        <p>
          The main animation component that supports multiple animation modes and speed controls.
        </p>
        <pre
          style={{
            backgroundColor: '#f5f5f5',
            padding: '15px',
            borderRadius: '5px',
            overflow: 'auto'
          }}
        >
          {`import { AdvancedAnimationEngine } from './components/AdvancedAnimationEngine'

<AdvancedAnimationEngine
  text="Your text here"
  config={{
    mode: 'character',  // or 'word', 'sentence', 'confidence', 'realistic', 'instant'
    speed: 1.0,         // 0.5 to 3.0
    confidence: 0.85,   // 0 to 1 (for confidence-based mode)
    showCursor: true
  }}
/>`}
        </pre>
      </section>

      <section>
        <h2>2. TextCorrectionHighlighter</h2>
        <p>Highlights text corrections with color-coded animations.</p>
        <pre
          style={{
            backgroundColor: '#f5f5f5',
            padding: '15px',
            borderRadius: '5px',
            overflow: 'auto'
          }}
        >
          {`import { TextCorrectionHighlighter } from './components/TextCorrectionHighlighter'

<TextCorrectionHighlighter
  text="Current text"
  corrections={activeCorrections}
  showConfidence={true}
  confidence={0.85}
  correctionStyles={{
    insert: { /* custom styles */ },
    delete: { /* custom styles */ },
    replace: { /* custom styles */ }
  }}
/>`}
        </pre>
      </section>

      <section>
        <h2>3. AnimationControls</h2>
        <p>User interface controls for animation settings.</p>
        <pre
          style={{
            backgroundColor: '#f5f5f5',
            padding: '15px',
            borderRadius: '5px',
            overflow: 'auto'
          }}
        >
          {`import AnimationControls from './components/AnimationControls'
import { useAdvancedAnimation } from './components/AdvancedAnimationEngine'

const [state, controls] = useAdvancedAnimation(text, config)

<AnimationControls
  controls={controls}
  state={state}
  showAllControls={true}
  onSettingsChange={(settings) => {
    console.log('New settings:', settings)
  }}
/>`}
        </pre>
      </section>

      <section>
        <h2>Animation Modes</h2>
        <ul>
          <li>
            <strong>character:</strong> Character-by-character animation (smooth, default)
          </li>
          <li>
            <strong>word:</strong> Word-by-word with pauses between words
          </li>
          <li>
            <strong>sentence:</strong> Sentence-by-sentence for better readability
          </li>
          <li>
            <strong>confidence:</strong> Speed varies based on transcription confidence
          </li>
          <li>
            <strong>realistic:</strong> Variable timing simulating real typing patterns
          </li>
          <li>
            <strong>instant:</strong> No animation (accessibility mode)
          </li>
        </ul>
      </section>

      <section>
        <h2>Correction Types</h2>
        <ul>
          <li>
            <strong style={{color: 'green'}}>Insert:</strong> New text added (green highlight)
          </li>
          <li>
            <strong style={{color: 'red'}}>Delete:</strong> Text removed (red strikethrough)
          </li>
          <li>
            <strong style={{color: 'orange'}}>Replace:</strong> Text modified (yellow/orange
            highlight)
          </li>
        </ul>
      </section>

      <section>
        <h2>Accessibility Features</h2>
        <ul>
          <li>Respects prefers-reduced-motion settings</li>
          <li>High contrast mode support</li>
          <li>Keyboard navigation for all controls</li>
          <li>ARIA labels and roles</li>
          <li>Instant mode for users who prefer no animation</li>
        </ul>
      </section>
    </div>
  )
}

// Export all examples
export default {
  BasicAnimationExample,
  CorrectionExample,
  FullDemo,
  AnimationModesExample,
  SpeedControlExample,
  ConfidenceVisualizationExample,
  UsageInstructions
}
