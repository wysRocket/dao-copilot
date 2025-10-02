import React, {useState, useCallback} from 'react'
import {AnimationMode, AnimationControls as IAnimationControls} from './AdvancedAnimationEngine'
import '../styles/advanced-animations.css'

/**
 * Props for AnimationControls component
 */
export interface AnimationControlsProps {
  /** Animation controls from useAdvancedAnimation hook */
  controls: IAnimationControls
  /** Current animation state */
  state: {
    isAnimating: boolean
    isPaused: boolean
    progress: number
    mode: AnimationMode
    speed: number
  }
  /** Whether to show all controls */
  showAllControls?: boolean
  /** Whether controls are disabled */
  disabled?: boolean
  /** Additional CSS classes */
  className?: string
  /** Callback when settings change */
  onSettingsChange?: (settings: {mode: AnimationMode; speed: number}) => void
}

/**
 * AnimationControls Component
 *
 * Provides user interface controls for animation settings
 */
export const AnimationControls: React.FC<AnimationControlsProps> = ({
  controls,
  state,
  showAllControls = true,
  disabled = false,
  className = '',
  onSettingsChange
}) => {
  const [showSettings, setShowSettings] = useState(false)

  /**
   * Handle play/pause toggle
   */
  const handlePlayPause = useCallback(() => {
    if (state.isPaused) {
      controls.resume()
    } else if (state.isAnimating) {
      controls.pause()
    } else {
      controls.start()
    }
  }, [state.isPaused, state.isAnimating, controls])

  /**
   * Handle speed change
   */
  const handleSpeedChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newSpeed = parseFloat(event.target.value)
      controls.setSpeed(newSpeed)
      onSettingsChange?.({mode: state.mode, speed: newSpeed})
    },
    [controls, state.mode, onSettingsChange]
  )

  /**
   * Handle mode change
   */
  const handleModeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newMode = event.target.value as AnimationMode
      controls.setMode(newMode)
      onSettingsChange?.({mode: newMode, speed: state.speed})
    },
    [controls, state.speed, onSettingsChange]
  )

  /**
   * Handle skip to end
   */
  const handleSkipToEnd = useCallback(() => {
    controls.skipToEnd()
  }, [controls])

  /**
   * Handle reset
   */
  const handleReset = useCallback(() => {
    controls.reset()
  }, [controls])

  /**
   * Format speed for display
   */
  const formatSpeed = (speed: number): string => {
    return `${speed.toFixed(1)}x`
  }

  /**
   * Get mode display name
   */
  const getModeDisplayName = (mode: AnimationMode): string => {
    const modeNames: Record<AnimationMode, string> = {
      character: 'Character',
      word: 'Word',
      sentence: 'Sentence',
      confidence: 'Confidence-based',
      realistic: 'Realistic',
      instant: 'Instant'
    }
    return modeNames[mode] || mode
  }

  return (
    <div className={`animation-controls ${className}`}>
      {/* Main controls */}
      <div className="controls-main">
        {/* Play/Pause button */}
        <button
          className="control-button control-play-pause"
          onClick={handlePlayPause}
          disabled={disabled}
          title={state.isPaused ? 'Resume' : state.isAnimating ? 'Pause' : 'Play'}
          aria-label={state.isPaused ? 'Resume animation' : state.isAnimating ? 'Pause animation' : 'Play animation'}
        >
          {state.isPaused ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2l10 6-10 6z" />
            </svg>
          ) : state.isAnimating ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2h3v12H4zM9 2h3v12H9z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2l10 6-10 6z" />
            </svg>
          )}
        </button>

        {/* Skip to end button */}
        {showAllControls && (
          <button
            className="control-button control-skip"
            onClick={handleSkipToEnd}
            disabled={disabled || !state.isAnimating}
            title="Skip to end"
            aria-label="Skip to end of animation"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2l8 6-8 6zM11 2h2v12h-2z" />
            </svg>
          </button>
        )}

        {/* Reset button */}
        {showAllControls && (
          <button
            className="control-button control-reset"
            onClick={handleReset}
            disabled={disabled}
            title="Reset"
            aria-label="Reset animation"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a6 6 0 1 0 4.9 9.5l-1.5-1a4 4 0 1 1-1-5.7V2z" />
              <path d="M8 0l3 3-3 3z" />
            </svg>
          </button>
        )}

        {/* Progress bar */}
        <div className="controls-progress">
          <div
            className="progress-bar"
            role="progressbar"
            aria-valuenow={Math.round(state.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="progress-fill"
              style={{width: `${state.progress * 100}%`}}
            />
          </div>
          <span className="progress-label">{Math.round(state.progress * 100)}%</span>
        </div>

        {/* Settings toggle */}
        {showAllControls && (
          <button
            className="control-button control-settings"
            onClick={() => setShowSettings(!showSettings)}
            disabled={disabled}
            title="Settings"
            aria-label="Toggle settings"
            aria-expanded={showSettings}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM14 8a6 6 0 0 1-.1 1l1.7 1.3-1 1.7-2-.8a6 6 0 0 1-1.7 1l-.4 2.1H9l-.4-2.1a6 6 0 0 1-1.7-1l-2 .8-1-1.7L5.6 9A6 6 0 0 1 5.5 8a6 6 0 0 1 .1-1L3.9 5.7l1-1.7 2 .8a6 6 0 0 1 1.7-1L9 1.7h1.5l.4 2.1a6 6 0 0 1 1.7 1l2-.8 1 1.7L14 7a6 6 0 0 1 .1 1z" />
            </svg>
          </button>
        )}
      </div>

      {/* Settings panel */}
      {showSettings && showAllControls && (
        <div className="controls-settings">
          {/* Speed control */}
          <div className="setting-item">
            <label htmlFor="speed-slider" className="setting-label">
              Speed: <span className="setting-value">{formatSpeed(state.speed)}</span>
            </label>
            <input
              id="speed-slider"
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={state.speed}
              onChange={handleSpeedChange}
              disabled={disabled}
              className="setting-slider"
              aria-label="Animation speed"
            />
            <div className="slider-marks">
              <span>0.5x</span>
              <span>1x</span>
              <span>2x</span>
              <span>3x</span>
            </div>
          </div>

          {/* Animation mode selector */}
          <div className="setting-item">
            <label htmlFor="mode-select" className="setting-label">
              Animation Mode:
            </label>
            <select
              id="mode-select"
              value={state.mode}
              onChange={handleModeChange}
              disabled={disabled}
              className="setting-select"
              aria-label="Animation mode"
            >
              <option value="character">Character-by-character</option>
              <option value="word">Word-by-word</option>
              <option value="sentence">Sentence-by-sentence</option>
              <option value="confidence">Confidence-based</option>
              <option value="realistic">Realistic typing</option>
              <option value="instant">Instant (No animation)</option>
            </select>
            <p className="setting-description">
              {state.mode === 'character' && 'Smooth character-by-character animation'}
              {state.mode === 'word' && 'Display text word-by-word with pauses'}
              {state.mode === 'sentence' && 'Display text sentence-by-sentence'}
              {state.mode === 'confidence' && 'Speed varies based on transcription confidence'}
              {state.mode === 'realistic' && 'Variable timing simulating real typing'}
              {state.mode === 'instant' && 'No animation for better accessibility'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Compact AnimationControls Component
 *
 * Minimal version with just play/pause and speed
 */
export const CompactAnimationControls: React.FC<AnimationControlsProps> = props => {
  return <AnimationControls {...props} showAllControls={false} />
}

export default AnimationControls
