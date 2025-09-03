/**
 * RealTimeAnswerDisplay Demo Component
 *
 * Demonstrates the usage of the RealTimeAnswerDisplay component
 * with mock data and various configuration options.
 */

import React, {useState, useCallback} from 'react'
import {RealTimeAnswerDisplay} from './RealTimeAnswerDisplay'
import GlassCard from './GlassCard'
import {GlassButton} from './GlassButton'
import {AnswerDisplay, SearchState} from '../services/AnswerDisplayManager'

interface DemoProps {
  className?: string
}

export const RealTimeAnswerDisplayDemo: React.FC<DemoProps> = ({className}) => {
  const [demoState, setDemoState] = useState({
    showDisplay: false,
    currentQuestion: '',
    showDebug: false,
    compact: false,
    theme: 'glass' as 'light' | 'dark' | 'glass'
  })

  const sampleQuestions = [
    'What are the latest developments in artificial intelligence?',
    'How does quantum computing work?',
    'What are the benefits of renewable energy?',
    'Explain the basics of machine learning',
    'What is the current state of electric vehicles?'
  ]

  const handleStartDemo = useCallback((question: string) => {
    setDemoState(prev => ({
      ...prev,
      showDisplay: true,
      currentQuestion: question
    }))
  }, [])

  const handleStopDemo = useCallback(() => {
    setDemoState(prev => ({
      ...prev,
      showDisplay: false,
      currentQuestion: ''
    }))
  }, [])

  const handleAnswerComplete = useCallback((answer: AnswerDisplay) => {
    console.log('Demo: Answer completed:', answer)
  }, [])

  const handleSearchStateChange = useCallback((state: SearchState) => {
    console.log('Demo: Search state changed:', state)
  }, [])

  const handleDisplayCleared = useCallback(() => {
    console.log('Demo: Display cleared')
  }, [])

  return (
    <div className={`real-time-answer-demo space-y-6 p-6 ${className || ''}`}>
      <GlassCard className="p-6">
        <h2 className="mb-4 text-2xl font-bold text-white">Real-time Answer Display Demo</h2>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-white">Theme:</label>
              <select
                value={demoState.theme}
                onChange={e =>
                  setDemoState(prev => ({
                    ...prev,
                    theme: e.target.value as 'light' | 'dark' | 'glass'
                  }))
                }
                className="rounded bg-white/10 px-2 py-1 text-sm text-white"
              >
                <option value="glass">Glass</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>

            <label className="flex items-center space-x-2 text-sm text-white">
              <input
                type="checkbox"
                checked={demoState.compact}
                onChange={e =>
                  setDemoState(prev => ({
                    ...prev,
                    compact: e.target.checked
                  }))
                }
                className="rounded"
              />
              <span>Compact Mode</span>
            </label>

            <label className="flex items-center space-x-2 text-sm text-white">
              <input
                type="checkbox"
                checked={demoState.showDebug}
                onChange={e =>
                  setDemoState(prev => ({
                    ...prev,
                    showDebug: e.target.checked
                  }))
                }
                className="rounded"
              />
              <span>Show Debug</span>
            </label>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-white">Sample Questions:</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {sampleQuestions.map((question, index) => (
                <GlassButton
                  key={index}
                  onClick={() => handleStartDemo(question)}
                  className="p-3 text-left text-sm"
                  disabled={demoState.showDisplay}
                >
                  {question}
                </GlassButton>
              ))}
            </div>
          </div>

          <div className="flex space-x-2">
            <GlassButton
              onClick={handleStopDemo}
              disabled={!demoState.showDisplay}
              className="px-4 py-2"
            >
              Stop Demo
            </GlassButton>

            <input
              type="text"
              placeholder="Enter your own question..."
              value={demoState.currentQuestion}
              onChange={e =>
                setDemoState(prev => ({
                  ...prev,
                  currentQuestion: e.target.value
                }))
              }
              onKeyPress={e => {
                if (e.key === 'Enter' && demoState.currentQuestion.trim()) {
                  handleStartDemo(demoState.currentQuestion.trim())
                }
              }}
              className="flex-1 rounded bg-white/10 px-3 py-2 text-sm text-white placeholder-white/60"
              disabled={demoState.showDisplay}
            />

            <GlassButton
              onClick={() => handleStartDemo(demoState.currentQuestion.trim())}
              disabled={demoState.showDisplay || !demoState.currentQuestion.trim()}
              className="px-4 py-2"
            >
              Ask
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Answer Display */}
      {demoState.showDisplay && (
        <RealTimeAnswerDisplay
          show={true}
          question={demoState.currentQuestion}
          config={{
            showSearchProgress: true,
            showConfidence: true,
            showSources: true,
            enableTypewriterEffect: true,
            typewriterSpeed: 30,
            updateThrottleMs: 100,
            enableDebugLogging: demoState.showDebug
          }}
          onAnswerComplete={handleAnswerComplete}
          onSearchStateChange={handleSearchStateChange}
          onDisplayCleared={handleDisplayCleared}
          compact={demoState.compact}
          showDebug={demoState.showDebug}
          showControls={true}
          theme={demoState.theme}
          className="mx-auto max-w-4xl"
        />
      )}

      {/* Usage Instructions */}
      <GlassCard className="p-6">
        <details>
          <summary className="mb-4 cursor-pointer font-medium text-white">
            Usage Instructions
          </summary>
          <div className="space-y-3 text-sm text-white/80">
            <p>
              This demo showcases the RealTimeAnswerDisplay component, which integrates with the
              AnswerDisplayManager and WebSocket infrastructure for real-time AI answer streaming.
            </p>

            <div>
              <strong>Features:</strong>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>Real-time answer streaming with typewriter effects</li>
                <li>Search progress indicators with visual feedback</li>
                <li>Source display with credibility scores</li>
                <li>Confidence indicators with color coding</li>
                <li>Responsive design with accessibility support</li>
                <li>Multiple themes (glass, dark, light)</li>
                <li>Compact mode for space-constrained layouts</li>
                <li>Debug mode for development insights</li>
              </ul>
            </div>

            <div>
              <strong>Integration:</strong>
              <pre className="mt-2 overflow-x-auto rounded bg-black/20 p-2 font-mono text-xs">
                {`import { RealTimeAnswerDisplay } from './RealTimeAnswerDisplay'

<RealTimeAnswerDisplay
  show={true}
  question="Your question here"
  config={{
    showSearchProgress: true,
    showConfidence: true,
    showSources: true,
    enableTypewriterEffect: true
  }}
  onAnswerComplete={(answer) => console.log(answer)}
  theme="glass"
  showControls={true}
/>`}
              </pre>
            </div>
          </div>
        </details>
      </GlassCard>
    </div>
  )
}

export default RealTimeAnswerDisplayDemo
