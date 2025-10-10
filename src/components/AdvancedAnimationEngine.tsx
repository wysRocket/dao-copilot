import React, {useState, useEffect, useCallback, useRef, useMemo} from 'react'

/**
 * Animation mode types
 */
export type AnimationMode =
  | 'character' // Character-by-character (current)
  | 'word' // Word-by-word with pauses
  | 'sentence' // Sentence-by-sentence
  | 'confidence' // Speed based on confidence
  | 'realistic' // Variable timing like real typing
  | 'instant' // No animation (accessibility)

/**
 * Animation configuration
 */
export interface AnimationConfig {
  /** Animation mode */
  mode?: AnimationMode
  /** Base speed multiplier (0.5x to 3x) */
  speed?: number
  /** Whether animation is paused */
  isPaused?: boolean
  /** Whether to show cursor */
  showCursor?: boolean
  /** Confidence score (0-1) for confidence-based animation */
  confidence?: number
  /** Callback when animation completes */
  onComplete?: () => void
  /** Callback for progress updates */
  onProgress?: (progress: number) => void
}

/**
 * Animation state
 */
export interface AnimationState {
  /** Currently displayed text */
  displayedText: string
  /** Whether animation is active */
  isAnimating: boolean
  /** Whether animation is paused */
  isPaused: boolean
  /** Current progress (0-1) */
  progress: number
  /** Current animation mode */
  mode: AnimationMode
  /** Current speed multiplier */
  speed: number
}

/**
 * Animation controls
 */
export interface AnimationControls {
  /** Start or restart animation */
  start: () => void
  /** Pause animation */
  pause: () => void
  /** Resume animation */
  resume: () => void
  /** Skip to end (complete immediately) */
  skipToEnd: () => void
  /** Update animation speed */
  setSpeed: (speed: number) => void
  /** Update animation mode */
  setMode: (mode: AnimationMode) => void
  /** Reset animation */
  reset: () => void
}

/**
 * Default configuration
 */
const defaultConfig: Required<AnimationConfig> = {
  mode: 'character',
  speed: 1,
  isPaused: false,
  showCursor: true,
  confidence: 1,
  onComplete: () => {},
  onProgress: () => {}
}

/**
 * useAdvancedAnimation Hook
 *
 * Provides advanced animation capabilities with multiple modes and controls
 */
export const useAdvancedAnimation = (
  targetText: string,
  config: AnimationConfig = {}
): [AnimationState, AnimationControls] => {
  const finalConfig = useMemo(() => ({...defaultConfig, ...config}), [config])

  // State management
  const [displayedText, setDisplayedText] = useState('')
  const [isAnimating, setIsAnimating] = useState(false)
  const [isPaused, setIsPaused] = useState(finalConfig.isPaused)
  const [progress, setProgress] = useState(0)
  const [currentMode, setCurrentMode] = useState<AnimationMode>(finalConfig.mode)
  const [currentSpeed, setCurrentSpeed] = useState(finalConfig.speed)

  // Refs for animation control
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const pauseTimeRef = useRef<number | null>(null)
  const currentIndexRef = useRef(0)

  /**
   * Calculate character interval based on mode and speed
   */
  const getCharacterInterval = useCallback(
    (char: string, index: number): number => {
      const baseInterval = 1000 / (50 * currentSpeed) // Base: 50 chars/sec * speed

      switch (currentMode) {
        case 'instant':
          return 0

        case 'character':
          return baseInterval

        case 'word':
          // Pause at word boundaries
          return /\s/.test(char) ? baseInterval * 3 : baseInterval * 0.5

        case 'sentence':
          // Pause at sentence boundaries
          return /[.!?]/.test(char) ? baseInterval * 5 : baseInterval * 0.3

        case 'confidence':
          // Slower for lower confidence
          const confidenceMultiplier = 1 + (1 - finalConfig.confidence) * 2
          return baseInterval * confidenceMultiplier

        case 'realistic':
          // Variable timing like real typing
          const variation = (Math.random() - 0.5) * 0.4
          let interval = baseInterval * (1 + variation)

          // Slower for capitals and special chars
          if (/[A-Z]/.test(char)) {
            interval *= 1.2
          }
          if (/[.!?,;:]/.test(char)) {
            interval *= 2
          }

          return interval

        default:
          return baseInterval
      }
    },
    [currentMode, currentSpeed, finalConfig.confidence]
  )

  /**
   * Get text chunk based on animation mode
   */
  const getNextChunk = useCallback(
    (text: string, currentIndex: number): {chunk: string; newIndex: number} => {
      if (currentIndex >= text.length) {
        return {chunk: '', newIndex: currentIndex}
      }

      switch (currentMode) {
        case 'instant':
          return {chunk: text, newIndex: text.length}

        case 'character':
          return {chunk: text[currentIndex], newIndex: currentIndex + 1}

        case 'word': {
          // Extract next word
          let endIndex = currentIndex
          while (endIndex < text.length && !/\s/.test(text[endIndex])) {
            endIndex++
          }
          // Include trailing space
          if (endIndex < text.length && /\s/.test(text[endIndex])) {
            endIndex++
          }
          return {chunk: text.slice(currentIndex, endIndex), newIndex: endIndex}
        }

        case 'sentence': {
          // Extract next sentence
          let endIndex = currentIndex
          while (endIndex < text.length && !/[.!?]/.test(text[endIndex])) {
            endIndex++
          }
          // Include punctuation and trailing space
          if (endIndex < text.length) {
            endIndex++
            if (endIndex < text.length && /\s/.test(text[endIndex])) {
              endIndex++
            }
          }
          return {chunk: text.slice(currentIndex, endIndex), newIndex: endIndex}
        }

        case 'confidence':
        case 'realistic':
          // Same as character for these modes
          return {chunk: text[currentIndex], newIndex: currentIndex + 1}

        default:
          return {chunk: text[currentIndex], newIndex: currentIndex + 1}
      }
    },
    [currentMode]
  )

  /**
   * Animation loop
   */
  const animate = useCallback(() => {
    if (isPaused || currentIndexRef.current >= targetText.length) {
      if (currentIndexRef.current >= targetText.length) {
        setIsAnimating(false)
        setProgress(1)
        finalConfig.onComplete()
      }
      return
    }

    const now = Date.now()

    if (!startTimeRef.current) {
      startTimeRef.current = now
    }

    // Get next chunk to display
    const {chunk, newIndex} = getNextChunk(targetText, currentIndexRef.current)

    if (chunk) {
      setDisplayedText(prev => prev + chunk)
      currentIndexRef.current = newIndex

      // Update progress
      const newProgress = currentIndexRef.current / targetText.length
      setProgress(newProgress)
      finalConfig.onProgress(newProgress)

      // Schedule next frame based on interval
      const interval = getCharacterInterval(
        chunk[chunk.length - 1] || '',
        currentIndexRef.current
      )

      if (interval > 0) {
        const timeoutId = window.setTimeout(() => {
          animationFrameRef.current = requestAnimationFrame(animate)
        }, interval)
        return () => clearTimeout(timeoutId)
      } else {
        animationFrameRef.current = requestAnimationFrame(animate)
      }
    }
  }, [
    isPaused,
    targetText,
    getNextChunk,
    getCharacterInterval,
    finalConfig
  ])

  /**
   * Start animation
   */
  const start = useCallback(() => {
    setIsAnimating(true)
    setIsPaused(false)
    currentIndexRef.current = 0
    setDisplayedText('')
    setProgress(0)
    startTimeRef.current = null
    animationFrameRef.current = requestAnimationFrame(animate)
  }, [animate])

  /**
   * Pause animation
   */
  const pause = useCallback(() => {
    setIsPaused(true)
    pauseTimeRef.current = Date.now()
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  /**
   * Resume animation
   */
  const resume = useCallback(() => {
    setIsPaused(false)
    if (pauseTimeRef.current && startTimeRef.current) {
      const pauseDuration = Date.now() - pauseTimeRef.current
      startTimeRef.current += pauseDuration
    }
    pauseTimeRef.current = null
    animationFrameRef.current = requestAnimationFrame(animate)
  }, [animate])

  /**
   * Skip to end
   */
  const skipToEnd = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    setDisplayedText(targetText)
    currentIndexRef.current = targetText.length
    setProgress(1)
    setIsAnimating(false)
    finalConfig.onComplete()
  }, [targetText, finalConfig])

  /**
   * Update speed
   */
  const setSpeed = useCallback((speed: number) => {
    setCurrentSpeed(Math.max(0.5, Math.min(3, speed)))
  }, [])

  /**
   * Update mode
   */
  const setMode = useCallback((mode: AnimationMode) => {
    setCurrentMode(mode)
  }, [])

  /**
   * Reset animation
   */
  const reset = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    setDisplayedText('')
    currentIndexRef.current = 0
    setProgress(0)
    setIsAnimating(false)
    setIsPaused(false)
    startTimeRef.current = null
    pauseTimeRef.current = null
  }, [])

  // Auto-start when target text changes
  useEffect(() => {
    if (targetText && !isAnimating && currentIndexRef.current === 0) {
      start()
    }
  }, [targetText, isAnimating, start])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // State object
  const state: AnimationState = {
    displayedText,
    isAnimating,
    isPaused,
    progress,
    mode: currentMode,
    speed: currentSpeed
  }

  // Controls object
  const controls: AnimationControls = {
    start,
    pause,
    resume,
    skipToEnd,
    setSpeed,
    setMode,
    reset
  }

  return [state, controls]
}

/**
 * AdvancedAnimationEngine Component
 *
 * Renders text with advanced animation capabilities
 */
export interface AdvancedAnimationEngineProps {
  /** Text to animate */
  text: string
  /** Animation configuration */
  config?: AnimationConfig
  /** Additional CSS classes */
  className?: string
  /** Whether to show cursor */
  showCursor?: boolean
  /** Custom render function for animated text */
  renderText?: (text: string, state: AnimationState) => React.ReactNode
}

export const AdvancedAnimationEngine: React.FC<AdvancedAnimationEngineProps> = ({
  text,
  config = {},
  className = '',
  showCursor = true,
  renderText
}) => {
  const [state] = useAdvancedAnimation(text, config)

  const defaultRender = useCallback(
    (displayText: string, animState: AnimationState) => (
      <span className={`animated-text animated-text-${animState.mode}`}>
        {displayText}
        {showCursor && animState.isAnimating && !animState.isPaused && (
          <span className="animated-cursor">|</span>
        )}
      </span>
    ),
    [showCursor]
  )

  return (
    <div className={`advanced-animation-engine ${className}`}>
      {renderText ? renderText(state.displayedText, state) : defaultRender(state.displayedText, state)}
    </div>
  )
}

export default AdvancedAnimationEngine
