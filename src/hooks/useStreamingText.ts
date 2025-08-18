import {useState, useEffect, useCallback, useRef} from 'react'

/**
 * Configuration options for streaming text behavior
 */
export interface StreamingTextConfig {
  /** Animation speed in characters per second */
  animationSpeed?: number
  /** Debounce delay for rapid updates in milliseconds */
  debounceDelay?: number
  /** Enable typewriter effect animation */
  enableAnimation?: boolean
  /** Animation mode: 'character' or 'word' */
  animationMode?: 'character' | 'word'
  /** Callback when animation completes */
  onAnimationComplete?: () => void
  /** Callback when text is updated */
  onTextUpdate?: (text: string, isPartial: boolean) => void
}

/**
 * Streaming text state interface
 */
export interface StreamingTextState {
  /** Currently displayed text */
  displayedText: string
  /** Full target text to be displayed */
  targetText: string
  /** Whether the current text is partial (still being updated) */
  isPartial: boolean
  /** Whether animation is currently running */
  isAnimating: boolean
  /** Whether the text was recently corrected */
  hasCorrection: boolean
  /** Current streaming connection state */
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error'
}

/**
 * Streaming text control methods
 */
export interface StreamingTextControls {
  /** Update the text content */
  updateText: (text: string, isPartial?: boolean) => void
  /** Set the connection state */
  setConnectionState: (state: StreamingTextState['connectionState']) => void
  /** Clear all text */
  clearText: () => void
  /** Force complete animation immediately */
  completeAnimation: () => void
  /** Reset correction state */
  clearCorrection: () => void
}

/**
 * Default configuration for streaming text
 */
const defaultConfig: Required<StreamingTextConfig> = {
  animationSpeed: 30, // characters per second
  debounceDelay: 100, // ms
  enableAnimation: true,
  animationMode: 'character',
  onAnimationComplete: () => {},
  onTextUpdate: () => {}
}

/**
 * Custom React hook for managing streaming text state and animations
 *
 * This hook provides the foundation for all streaming text components,
 * handling text buffering, animation timing, and connection state management.
 *
 * @param config Configuration options for streaming behavior
 * @returns Tuple of [state, controls] for streaming text management
 */
export const useStreamingText = (
  config: StreamingTextConfig = {}
): [StreamingTextState, StreamingTextControls] => {
  const mergedConfig = {...defaultConfig, ...config}

  // State management
  const [targetText, setTargetText] = useState('')
  const [displayedText, setDisplayedText] = useState('')
  const [isPartial, setIsPartial] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [hasCorrection, setHasCorrection] = useState(false)
  const [connectionState, setConnectionStateInternal] =
    useState<StreamingTextState['connectionState']>('disconnected')

  // Refs for managing timers and animation state
  const animationFrameRef = useRef<number | undefined>(undefined)
  const debounceTimerRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const animationStartTimeRef = useRef<number | undefined>(undefined)
  const previousTextRef = useRef<string>('')

  /**
   * Calculate the number of characters to display based on animation progress
   */
  const calculateDisplayLength = useCallback(
    (
      elapsed: number,
      targetLength: number,
      animationSpeed: number,
      mode: 'character' | 'word'
    ): number => {
      if (mode === 'word') {
        const words = targetText.split(' ')
        const targetWords = Math.floor((elapsed / 1000) * (animationSpeed / 5)) // Roughly 5 chars per word
        const wordIndex = Math.min(targetWords, words.length)
        return words.slice(0, wordIndex).join(' ').length
      } else {
        return Math.min(Math.floor((elapsed / 1000) * animationSpeed), targetLength)
      }
    },
    [targetText]
  )

  /**
   * Animation loop for typewriter effect
   */
  const animateText = useCallback(() => {
    if (!animationStartTimeRef.current) {
      animationStartTimeRef.current = performance.now()
    }

    const elapsed = performance.now() - animationStartTimeRef.current
    const targetLength = targetText.length

    if (targetLength === 0) {
      setDisplayedText('')
      setIsAnimating(false)
      mergedConfig.onAnimationComplete()
      return
    }

    const displayLength = calculateDisplayLength(
      elapsed,
      targetLength,
      mergedConfig.animationSpeed,
      mergedConfig.animationMode
    )

    if (displayLength >= targetLength) {
      // Animation complete
      setDisplayedText(targetText)
      setIsAnimating(false)
      mergedConfig.onAnimationComplete()
    } else {
      // Continue animation
      setDisplayedText(targetText.slice(0, displayLength))
      animationFrameRef.current = requestAnimationFrame(animateText)
    }
  }, [targetText, mergedConfig, calculateDisplayLength])

  /**
   * Start animation with the current target text
   */
  const startAnimation = useCallback(() => {
    if (!mergedConfig.enableAnimation) {
      setDisplayedText(targetText)
      setIsAnimating(false)
      mergedConfig.onAnimationComplete()
      return
    }

    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    setIsAnimating(true)
    animationStartTimeRef.current = performance.now()
    animateText()
  }, [targetText, mergedConfig, animateText])

  /**
   * Detect if text was corrected (previous text is different from new text start)
   */
  const detectCorrection = useCallback((newText: string, previousText: string): boolean => {
    if (previousText.length === 0) return false

    // Check if the new text is completely different or if beginning changed
    const minLength = Math.min(newText.length, previousText.length)
    const commonPrefix = newText.slice(0, minLength)
    const previousPrefix = previousText.slice(0, minLength)

    return commonPrefix !== previousPrefix
  }, [])

  /**
   * Update text content with debouncing and correction detection
   */
  const updateText = useCallback(
    (text: string, partial: boolean = false) => {
      // Clear existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      // Debounce rapid updates
      debounceTimerRef.current = setTimeout(() => {
        const previousText = previousTextRef.current
        const hasTextCorrection = detectCorrection(text, previousText)

        setTargetText(text)
        setIsPartial(partial)
        setHasCorrection(hasTextCorrection)
        previousTextRef.current = text

        // Trigger animation
        startAnimation()

        // Call text update callback
        mergedConfig.onTextUpdate(text, partial)

        // Clear correction flag after a delay
        if (hasTextCorrection) {
          setTimeout(() => setHasCorrection(false), 1000)
        }
      }, mergedConfig.debounceDelay)
    },
    [detectCorrection, startAnimation, mergedConfig]
  )

  /**
   * Set connection state
   */
  const setConnectionState = useCallback((state: StreamingTextState['connectionState']) => {
    setConnectionStateInternal(state)
  }, [])

  /**
   * Clear all text
   */
  const clearText = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    setTargetText('')
    setDisplayedText('')
    setIsPartial(false)
    setIsAnimating(false)
    setHasCorrection(false)
    previousTextRef.current = ''
    animationStartTimeRef.current = undefined
  }, [])

  /**
   * Force complete animation immediately
   */
  const completeAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    setDisplayedText(targetText)
    setIsAnimating(false)
    mergedConfig.onAnimationComplete()
  }, [targetText, mergedConfig])

  /**
   * Clear correction state
   */
  const clearCorrection = useCallback(() => {
    setHasCorrection(false)
  }, [])

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // State object
  const state: StreamingTextState = {
    displayedText,
    targetText,
    isPartial,
    isAnimating,
    hasCorrection,
    connectionState
  }

  // Controls object
  const controls: StreamingTextControls = {
    updateText,
    setConnectionState,
    clearText,
    completeAnimation,
    clearCorrection
  }

  return [state, controls]
}

export default useStreamingText
