import React, {useState, useEffect} from 'react'
import {StreamingTextRenderer} from './StreamingTextRenderer'
import {
  StreamingStateIndicator,
  useStreamingStateManager,
  type StreamingState
} from './StreamingStateIndicator'
import '../styles/streaming-demo.css'

/**
 * Demo component showing StreamingStateIndicator functionality
 */
export const StreamingStateDemo: React.FC = () => {
  const stateManager = useStreamingStateManager()
  const [currentText, setCurrentText] = useState('')
  const [isPartial, setIsPartial] = useState(false)
  const [demoMode, setDemoMode] = useState<'manual' | 'auto'>('manual')

  // Demo text for cycling through states
  const demoTexts = [
    'Hello, this is a streaming text demo.',
    'Watch how the state indicators change...',
    'Processing audio input from microphone.',
    'Converting speech to text in real-time.',
    'Transcription completed successfully!'
  ]

  /**
   * Auto demo cycling through different states
   */
  useEffect(() => {
    if (demoMode !== 'auto') return

    const states: StreamingState[] = [
      'listening',
      'processing',
      'receiving',
      'complete',
      'disconnected',
      'connecting',
      'error'
    ]

    let currentIndex = 0

    const interval = setInterval(() => {
      const state = states[currentIndex]
      stateManager.updateState(
        state,
        undefined,
        state === 'receiving' ? 'good' : state === 'processing' ? 'poor' : 'good'
      )

      // Update text based on state
      if (state === 'receiving') {
        setCurrentText(demoTexts[Math.floor(Math.random() * demoTexts.length)])
        setIsPartial(true)
      } else if (state === 'complete') {
        setIsPartial(false)
      } else if (state === 'error') {
        setCurrentText('Error: Failed to process audio')
        setIsPartial(false)
      }

      currentIndex = (currentIndex + 1) % states.length
    }, 3000)

    return () => clearInterval(interval)
  }, [demoMode, stateManager])

  /**
   * Manual state change handlers
   */
  const handleStateChange = (state: StreamingState) => {
    stateManager.updateState(state)

    // Update demo text based on state
    switch (state) {
      case 'listening':
        setCurrentText('Ready for audio input...')
        setIsPartial(false)
        break
      case 'processing':
        setCurrentText('Processing audio...')
        setIsPartial(true)
        break
      case 'receiving':
        setCurrentText('Live transcription text appearing in real-time')
        setIsPartial(true)
        break
      case 'complete':
        setCurrentText('Transcription completed successfully!')
        setIsPartial(false)
        break
      case 'error':
        setCurrentText('Error: Unable to process audio')
        setIsPartial(false)
        break
      case 'disconnected':
        setCurrentText('Connection lost - reconnecting...')
        setIsPartial(false)
        break
      case 'connecting':
        setCurrentText('Establishing connection...')
        setIsPartial(false)
        break
    }
  }

  return (
    <div className="streaming-demo-container">
      <h2>Streaming State Indicator Demo</h2>

      {/* Demo Controls */}
      <div className="demo-controls">
        <div className="mode-toggle">
          <label>
            <input
              type="radio"
              name="demoMode"
              value="manual"
              checked={demoMode === 'manual'}
              onChange={e => setDemoMode(e.target.value as 'manual' | 'auto')}
            />
            Manual Control
          </label>
          <label>
            <input
              type="radio"
              name="demoMode"
              value="auto"
              checked={demoMode === 'auto'}
              onChange={e => setDemoMode(e.target.value as 'manual' | 'auto')}
            />
            Auto Demo
          </label>
        </div>

        {demoMode === 'manual' && (
          <div className="state-buttons">
            <button onClick={() => handleStateChange('listening')}>Listening</button>
            <button onClick={() => handleStateChange('processing')}>Processing</button>
            <button onClick={() => handleStateChange('receiving')}>Receiving</button>
            <button onClick={() => handleStateChange('complete')}>Complete</button>
            <button onClick={() => handleStateChange('error')}>Error</button>
            <button onClick={() => handleStateChange('disconnected')}>Disconnected</button>
            <button onClick={() => handleStateChange('connecting')}>Connecting</button>
          </div>
        )}
      </div>

      {/* State Indicator Variants */}
      <div className="indicator-variants">
        <h3>Indicator Variants</h3>

        {/* Large with details */}
        <div className="variant-section">
          <h4>Large with Details</h4>
          <StreamingStateIndicator
            state={stateManager.state}
            connectionQuality={stateManager.connectionQuality}
            message={stateManager.message}
            showDetails={true}
            size="large"
          />
        </div>

        {/* Medium default */}
        <div className="variant-section">
          <h4>Medium (Default)</h4>
          <StreamingStateIndicator
            state={stateManager.state}
            connectionQuality={stateManager.connectionQuality}
            message={stateManager.message}
            size="medium"
          />
        </div>

        {/* Small compact */}
        <div className="variant-section">
          <h4>Small Compact</h4>
          <StreamingStateIndicator
            state={stateManager.state}
            connectionQuality={stateManager.connectionQuality}
            message={stateManager.message}
            size="small"
          />
        </div>
      </div>

      {/* Integrated Text Renderer */}
      <div className="integrated-demo">
        <h3>Integrated with Streaming Text Renderer</h3>
        <StreamingTextRenderer
          text={currentText}
          isPartial={isPartial}
          mode="character"
          animationSpeed={50}
          showCursor={true}
          enableTypewriterEffects={true}
          showStateIndicator={true}
          customState={stateManager.state}
          onStateChange={state => console.log('State changed:', state)}
          className="demo-renderer"
        />
      </div>

      {/* State Information */}
      <div className="state-info">
        <h3>Current State Information</h3>
        <div className="info-grid">
          <div>
            <strong>State:</strong> {stateManager.state}
          </div>
          <div>
            <strong>Connection:</strong> {stateManager.connectionQuality}
          </div>
          <div>
            <strong>Is Connected:</strong> {stateManager.isConnected ? 'Yes' : 'No'}
          </div>
          <div>
            <strong>Is Active:</strong> {stateManager.isActive ? 'Yes' : 'No'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default StreamingStateDemo
