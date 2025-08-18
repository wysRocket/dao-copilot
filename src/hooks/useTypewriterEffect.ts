import {useState, useEffect, useCallback, useRef} from 'react'

/**
 * Configuration for typewriter animation effects
 */
export interface TypewriterConfig {
  /** Speed in characters per second */
  speed?: number
  /** Delay before starting animation in milliseconds */
  startDelay?: number
  /** Whether to show cursor during typing */
  showCursor?: boolean
  /** Cursor character */
  cursorChar?: string
  /** Whether to pause at punctuation */
  pauseAtPunctuation?: boolean
  /** Pause duration at punctuation in milliseconds */
  punctuationPause?: number
  /** Whether to vary typing speed randomly */
  variableSpeed?: boolean
  /** Speed variation range (0-1) */
  speedVariation?: number
  /** Sound effects for typing */
  enableSounds?: boolean
  /** Callback when typing completes */
  onComplete?: () => void
  /** Callback for each character typed */
  onCharacterTyped?: (char: string, index: number) => void
}

/**
 * Typewriter animation state
 */
export interface TypewriterState {
  /** Currently displayed text */
  displayedText: string
  /** Whether animation is active */
  isTyping: boolean
  /** Current character index being typed */
  currentIndex: number
  /** Whether cursor is visible */
  showCursor: boolean
  /** Progress percentage (0-100) */
  progress: number
}

/**
 * Default configuration for typewriter effects
 */
const defaultConfig: Required<TypewriterConfig> = {
  speed: 50,
  startDelay: 0,
  showCursor: true,
  cursorChar: '|',
  pauseAtPunctuation: true,
  punctuationPause: 300,
  variableSpeed: true,
  speedVariation: 0.3,
  enableSounds: false,
  onComplete: () => {},
  onCharacterTyped: () => {}
}

/**
 * Custom hook for advanced typewriter animation effects
 *
 * Provides smooth, configurable typewriter animations with realistic typing patterns,
 * cursor effects, and sound support.
 */
export const useTypewriterEffect = (
  text: string,
  config: TypewriterConfig = {}
): TypewriterState => {
  const mergedConfig = {...defaultConfig, ...config}

  // State management
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showCursor, setShowCursor] = useState(mergedConfig.showCursor)

  // Refs for managing timers and audio
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const cursorTimerRef = useRef<NodeJS.Timeout | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  /**
   * Generate realistic typing intervals with variation
   */
  const getTypingInterval = useCallback(
    (char: string): number => {
      const baseInterval = 1000 / mergedConfig.speed
      let interval = baseInterval

      // Add punctuation pauses
      if (mergedConfig.pauseAtPunctuation && /[.!?,:;]/.test(char)) {
        interval += mergedConfig.punctuationPause
      }

      // Add speed variation for realism
      if (mergedConfig.variableSpeed) {
        const variation = (Math.random() - 0.5) * 2 * mergedConfig.speedVariation
        interval *= 1 + variation
      }

      // Slower for complex characters
      if (/[A-Z]/.test(char)) {
        interval *= 1.2 // Slightly slower for capitals
      }

      return Math.max(interval, 20) // Minimum 20ms interval
    },
    [mergedConfig]
  )

  /**
   * Play typing sound effect
   */
  const playTypingSound = useCallback(
    (char: string) => {
      if (!mergedConfig.enableSounds) return

      try {
        if (!audioContextRef.current) {
          const AudioContextClass =
            window.AudioContext ||
            (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext
          audioContextRef.current = new AudioContextClass()
        }

        const audioContext = audioContextRef.current
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        // Different frequencies for different character types
        let frequency = 800 // Default
        if (/[aeiouAEIOU]/.test(char)) {
          frequency = 600 // Lower for vowels
        } else if (/[.!?]/.test(char)) {
          frequency = 400 // Even lower for punctuation
        } else if (/[A-Z]/.test(char)) {
          frequency = 1000 // Higher for capitals
        }

        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime)
        oscillator.type = 'square'

        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.1)
      } catch (error) {
        console.warn('Failed to play typing sound:', error)
      }
    },
    [mergedConfig.enableSounds]
  )

  /**
   * Type the next character - optimized with requestAnimationFrame
   */
  const typeNextCharacter = useCallback(() => {
    if (currentIndex >= text.length) {
      setIsTyping(false)
      mergedConfig.onComplete()
      return
    }

    const char = text[currentIndex]
    const newDisplayedText = text.slice(0, currentIndex + 1)

    // Batch state updates to reduce re-renders
    requestAnimationFrame(() => {
      setDisplayedText(newDisplayedText)
      setCurrentIndex(prev => prev + 1)
    })

    // Play sound effect (only if enabled to avoid unnecessary processing)
    if (mergedConfig.enableSounds) {
      playTypingSound(char)
    }

    // Call character typed callback
    mergedConfig.onCharacterTyped(char, currentIndex)

    // Schedule next character with optimized timing
    const interval = getTypingInterval(char)
    typingTimerRef.current = setTimeout(typeNextCharacter, interval)
  }, [currentIndex, text, getTypingInterval, playTypingSound, mergedConfig])

  /**
   * Start the typing animation
   */
  const startTyping = useCallback(() => {
    if (text.length === 0) {
      setDisplayedText('')
      setIsTyping(false)
      setCurrentIndex(0)
      return
    }

    setIsTyping(true)
    setCurrentIndex(0)
    setDisplayedText('')

    // Start typing after delay
    typingTimerRef.current = setTimeout(() => {
      typeNextCharacter()
    }, mergedConfig.startDelay)
  }, [text, typeNextCharacter, mergedConfig.startDelay])

  /**
   * Manage cursor blinking - optimized with requestAnimationFrame
   */
  useEffect(() => {
    if (!mergedConfig.showCursor) {
      setShowCursor(false)
      return
    }

    let animationFrameId: number
    let lastBlinkTime = 0
    const BLINK_INTERVAL = 530 // Realistic cursor blink rate

    const animateCursor = (timestamp: number) => {
      if (timestamp - lastBlinkTime >= BLINK_INTERVAL) {
        setShowCursor(prev => !prev)
        lastBlinkTime = timestamp
      }
      animationFrameId = requestAnimationFrame(animateCursor)
    }

    animationFrameId = requestAnimationFrame(animateCursor)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [mergedConfig.showCursor])

  /**
   * Start typing when text changes
   */
  useEffect(() => {
    // Clear existing timers
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current)
    }

    startTyping()

    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current)
      }
    }
  }, [text, startTyping])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current)
      }
      if (cursorTimerRef.current) {
        clearInterval(cursorTimerRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.warn)
      }
    }
  }, [])

  // Calculate progress
  const progress = text.length > 0 ? (currentIndex / text.length) * 100 : 0

  return {
    displayedText,
    isTyping,
    currentIndex,
    showCursor: mergedConfig.showCursor && showCursor,
    progress
  }
}

export default useTypewriterEffect
