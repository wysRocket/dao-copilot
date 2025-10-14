import React, {useState, useCallback, useEffect} from 'react'
import {
  AdvancedAnimationEngine,
  useAdvancedAnimation,
  AnimationMode
} from './AdvancedAnimationEngine'
import AnimationControls from './AnimationControls'
import {
  TextCorrectionHighlighter,
  ConfidenceBadge,
  CorrectionLegend
} from './TextCorrectionHighlighter'
import {TextDiffer, TextDiff, WordDiff} from '../utils/text-differ'
import '../styles/advanced-animations.css'

/**
 * Demo for Advanced Animation Features
 */
export const AdvancedAnimationDemo: React.FC = () => {
  // Sample texts for demonstration
  const [sampleTexts] = useState([
    'This is a demonstration of advanced animation features with multiple modes and controls.',
    'Real-time transcription often requires corrections. This system highlights changes smoothly.',
    'Try different animation speeds! Fast playback helps you catch up quickly.',
    'Sentence-by-sentence mode is perfect for presentations and public speaking.'
  ])

  const [currentTextIndex, setCurrentTextIndex] = useState(0)
  const [currentText, setCurrentText] = useState(sampleTexts[0])
  const [previousText, setPreviousText] = useState('')
  const [corrections, setCorrections] = useState<
    Array<{
      diff: TextDiff | WordDiff
      phase: 'highlight' | 'replace' | 'complete'
      progress: number
    }>
  >([])
  const [confidence, setConfidence] = useState(0.85)
  const [showCorrectionDemo, setShowCorrectionDemo] = useState(false)

  // Animation state and controls
  const [animationState, animationControls] = useAdvancedAnimation(currentText, {
    mode: 'character',
    speed: 1,
    confidence,
    onComplete: () => {
      console.log('Animation completed')
    },
    onProgress: progress => {
      // Update confidence gradually
      if (progress > 0.5) {
        setConfidence(0.85 + progress * 0.15) // 0.85 to 1.0
      }
    }
  })

  /**
   * Cycle to next sample text
   */
  const nextText = useCallback(() => {
    const nextIndex = (currentTextIndex + 1) % sampleTexts.length
    setPreviousText(currentText)
    setCurrentText(sampleTexts[nextIndex])
    setCurrentTextIndex(nextIndex)
    setConfidence(0.75) // Reset confidence for new text
    animationControls.reset()
  }, [currentTextIndex, sampleTexts, currentText, animationControls])

  /**
   * Toggle correction demo
   */
  const toggleCorrectionDemo = useCallback(() => {
    setShowCorrectionDemo(prev => !prev)
  }, [])

  /**
   * Simulate text correction
   */
  const simulateCorrection = useCallback(() => {
    if (!previousText || previousText === currentText) return

    const differ = new TextDiffer({
      minWordLength: 2,
      enableCharacterDiff: true,
      ignoreCase: false
    })

    const wordDiffs = differ.wordDiff(previousText, currentText)
    const corrections = wordDiffs
      .filter(diff => diff.type !== 'unchanged')
      .map(diff => ({
        diff,
        phase: 'highlight' as const,
        progress: 0
      }))

    setCorrections(corrections)

    // Animate correction phases
    setTimeout(() => {
      setCorrections(prev =>
        prev.map(c => ({
          ...c,
          phase: 'replace' as const,
          progress: 0.5
        }))
      )
    }, 500)

    setTimeout(() => {
      setCorrections(prev =>
        prev.map(c => ({
          ...c,
          phase: 'complete' as const,
          progress: 1
        }))
      )
    }, 1000)

    setTimeout(() => {
      setCorrections([])
    }, 1500)
  }, [previousText, currentText])

  /**
   * Update text with a simulated correction
   */
  const updateWithCorrection = useCallback(() => {
    const texts = [
      'This is a demostration of text correction.',
      'This is a demonstration of text correction.'
    ]

    if (currentText === texts[0]) {
      setPreviousText(texts[0])
      setCurrentText(texts[1])
    } else {
      setPreviousText(texts[1])
      setCurrentText(texts[0])
    }

    simulateCorrection()
  }, [currentText, simulateCorrection])

  // Auto-simulate correction when demo is enabled
  useEffect(() => {
    if (showCorrectionDemo && previousText) {
      simulateCorrection()
    }
  }, [showCorrectionDemo, previousText, simulateCorrection])

  return (
    <div className="advanced-animation-demo" style={styles.container}>
      <h2 style={styles.title}>Advanced Animation Features Demo</h2>

      {/* Info panel */}
      <div style={styles.infoPanel}>
        <h3 style={styles.subtitle}>Features:</h3>
        <ul style={styles.featureList}>
          <li>✨ 6 animation modes (character, word, sentence, confidence, realistic, instant)</li>
          <li>⚡ Variable speed control (0.5x to 3x)</li>
          <li>🎮 Play/pause/resume/skip controls</li>
          <li>🎨 Text correction highlighting with color coding</li>
          <li>📊 Confidence visualization</li>
          <li>♿ Full accessibility support</li>
        </ul>
      </div>

      {/* Animation controls */}
      <div style={styles.controlsSection}>
        <h3 style={styles.subtitle}>Animation Controls:</h3>
        <AnimationControls
          controls={animationControls}
          state={animationState}
          showAllControls={true}
          className="demo-controls"
        />
      </div>

      {/* Confidence indicator */}
      <div style={styles.confidenceSection}>
        <h3 style={styles.subtitle}>
          Transcription Confidence: <ConfidenceBadge confidence={confidence} />
        </h3>
      </div>

      {/* Animated text display */}
      <div style={styles.textDisplay}>
        <h3 style={styles.subtitle}>Animated Text:</h3>
        {showCorrectionDemo && corrections.length > 0 ? (
          <TextCorrectionHighlighter
            text={currentText}
            corrections={corrections}
            showConfidence={true}
            confidence={confidence}
            className="demo-text"
          />
        ) : (
          <AdvancedAnimationEngine
            text={currentText}
            config={{
              mode: animationState.mode,
              speed: animationState.speed,
              confidence,
              showCursor: true
            }}
            showCursor={true}
            className="demo-text"
          />
        )}
      </div>

      {/* Correction legend */}
      {showCorrectionDemo && (
        <div style={styles.legendSection}>
          <CorrectionLegend />
        </div>
      )}

      {/* Demo actions */}
      <div style={styles.actionsSection}>
        <button style={styles.actionButton} onClick={nextText}>
          Next Sample Text
        </button>
        <button style={styles.actionButton} onClick={toggleCorrectionDemo}>
          {showCorrectionDemo ? 'Hide' : 'Show'} Correction Demo
        </button>
        {showCorrectionDemo && (
          <button style={styles.actionButton} onClick={updateWithCorrection}>
            Simulate Correction
          </button>
        )}
      </div>

      {/* Current state info */}
      <div style={styles.stateInfo}>
        <h3 style={styles.subtitle}>Current State:</h3>
        <div style={styles.stateGrid}>
          <div>
            <strong>Mode:</strong> {animationState.mode}
          </div>
          <div>
            <strong>Speed:</strong> {animationState.speed.toFixed(1)}x
          </div>
          <div>
            <strong>Progress:</strong> {Math.round(animationState.progress * 100)}%
          </div>
          <div>
            <strong>Status:</strong>{' '}
            {animationState.isPaused ? 'Paused' : animationState.isAnimating ? 'Animating' : 'Ready'}
          </div>
          <div>
            <strong>Confidence:</strong> {Math.round(confidence * 100)}%
          </div>
          <div>
            <strong>Corrections:</strong> {corrections.length}
          </div>
        </div>
      </div>

      {/* Usage instructions */}
      <div style={styles.instructions}>
        <h3 style={styles.subtitle}>How to Use:</h3>
        <ol style={styles.instructionsList}>
          <li>Click the <strong>settings icon</strong> to open animation settings</li>
          <li>Adjust the <strong>speed slider</strong> to change playback speed</li>
          <li>Select different <strong>animation modes</strong> from the dropdown</li>
          <li>Use <strong>play/pause</strong> to control animation</li>
          <li>Click <strong>skip</strong> to jump to the end</li>
          <li>Try <strong>Next Sample Text</strong> to see different content</li>
          <li>Enable <strong>Correction Demo</strong> to see text correction highlighting</li>
        </ol>
      </div>
    </div>
  )
}

/**
 * Inline styles for the demo
 */
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '900px',
    margin: '20px auto',
    padding: '24px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '24px',
    textAlign: 'center',
    color: 'inherit'
  },
  subtitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '12px',
    color: 'inherit'
  },
  infoPanel: {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: '8px'
  },
  featureList: {
    margin: '8px 0',
    paddingLeft: '24px',
    lineHeight: '1.8'
  },
  controlsSection: {
    marginBottom: '24px'
  },
  confidenceSection: {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: '8px'
  },
  textDisplay: {
    marginBottom: '24px',
    padding: '24px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '8px',
    minHeight: '100px',
    fontSize: '1.125rem',
    lineHeight: '1.8'
  },
  legendSection: {
    marginBottom: '24px'
  },
  actionsSection: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    flexWrap: 'wrap'
  },
  actionButton: {
    padding: '10px 20px',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    border: '1px solid rgba(76, 175, 80, 0.5)',
    borderRadius: '6px',
    color: 'inherit',
    fontSize: '0.95rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontWeight: '500'
  },
  stateInfo: {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: '8px'
  },
  stateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px',
    fontSize: '0.9rem'
  },
  instructions: {
    padding: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: '8px'
  },
  instructionsList: {
    margin: '8px 0',
    paddingLeft: '24px',
    lineHeight: '1.8'
  }
}

export default AdvancedAnimationDemo
