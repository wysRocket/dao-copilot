import {useState, useEffect, useCallback, useRef, useMemo} from 'react'
import {TextDiffer, TextDiff, WordDiff, DiffConfig} from '../utils/text-differ'

/**
 * Configuration for text correction animations
 */
export interface TextCorrectionConfig {
  /** Text diffing configuration */
  diffConfig?: DiffConfig
  /** Animation duration for corrections in milliseconds */
  correctionDuration?: number
  /** Highlight duration in milliseconds */
  highlightDuration?: number
  /** Whether to enable sound effects for corrections */
  enableSounds?: boolean
  /** Whether to use word-level or character-level diffing */
  diffLevel?: 'word' | 'character' | 'auto'
  /** Delay between multiple corrections */
  correctionDelay?: number
  /** Maximum number of corrections to animate simultaneously */
  maxSimultaneousCorrections?: number
  /** Whether to show correction previews */
  showPreviews?: boolean
}

/**
 * Represents an active correction animation
 */
export interface ActiveCorrection {
  /** Unique identifier */
  id: string
  /** Text difference being animated */
  diff: TextDiff | WordDiff
  /** Animation start time */
  startTime: number
  /** Animation phase */
  phase: 'highlight' | 'replace' | 'complete'
  /** Progress (0-1) */
  progress: number
}

/**
 * Text correction state
 */
export interface TextCorrectionState {
  /** Current display text with corrections applied */
  displayText: string
  /** Active correction animations */
  activeCorrections: ActiveCorrection[]
  /** Whether corrections are currently being processed */
  isProcessingCorrections: boolean
  /** Queue of pending corrections */
  correctionQueue: (TextDiff | WordDiff)[]
  /** Statistics about corrections */
  stats: {
    totalCorrections: number
    correctionsThisSession: number
    averageLatency: number
  }
}

/**
 * Text correction controls
 */
export interface TextCorrectionControls {
  /** Apply a new text update and detect corrections */
  updateText: (newText: string) => void
  /** Manually trigger a correction animation */
  animateCorrection: (diff: TextDiff | WordDiff) => void
  /** Clear all active corrections */
  clearCorrections: () => void
  /** Pause/resume correction animations */
  pauseCorrections: (paused?: boolean) => void
  /** Reset correction statistics */
  resetStats: () => void
}

/**
 * Default configuration
 */
const defaultConfig: Required<TextCorrectionConfig> = {
  diffConfig: {},
  correctionDuration: 800,
  highlightDuration: 1200,
  enableSounds: false,
  diffLevel: 'auto',
  correctionDelay: 100,
  maxSimultaneousCorrections: 3,
  showPreviews: true
}

/**
 * useTextCorrection Hook
 *
 * Manages text correction detection and animation for streaming text
 */
export const useTextCorrection = (
  initialText: string = '',
  config: TextCorrectionConfig = {}
): [TextCorrectionState, TextCorrectionControls] => {
  const finalConfig = useMemo(() => ({...defaultConfig, ...config}), [config])

  // State management
  const [currentText, setCurrentText] = useState(initialText)
  const [activeCorrections, setActiveCorrections] = useState<ActiveCorrection[]>([])
  const [correctionQueue, setCorrectionQueue] = useState<(TextDiff | WordDiff)[]>([])
  const [isProcessingCorrections, setIsProcessingCorrections] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [stats, setStats] = useState({
    totalCorrections: 0,
    correctionsThisSession: 0,
    averageLatency: 0
  })

  // Refs for managing animations and timers
  const animationFrameRef = useRef<number | null>(null)
  const textDifferRef = useRef(new TextDiffer(finalConfig.diffConfig))
  const correctionTimerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef(Date.now())

  /**
   * Generate correction sound effect
   */
  const playCorrectionsound = useCallback(() => {
    if (!finalConfig.enableSounds) return

    try {
      // Create a subtle correction sound using Web Audio API
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext
      const audioContext = new AudioContextClass()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1)

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.1)
    } catch (error) {
      console.warn('Could not play correction sound:', error)
    }
  }, [finalConfig.enableSounds])

  /**
   * Detect corrections between old and new text
   */
  const detectCorrections = useCallback(
    (oldText: string, newText: string): (TextDiff | WordDiff)[] => {
      if (oldText === newText) return []

      const differ = textDifferRef.current

      // Determine diff level automatically or use configured level
      let diffLevel = finalConfig.diffLevel
      if (diffLevel === 'auto') {
        const wordCount = oldText.split(/\s+/).length
        diffLevel = wordCount > 5 ? 'word' : 'character'
      }

      if (diffLevel === 'word') {
        return differ.wordDiff(oldText, newText).filter(diff => diff.type !== 'unchanged')
      } else {
        return differ.characterDiff(oldText, newText).filter(diff => diff.type !== 'unchanged')
      }
    },
    [finalConfig.diffLevel]
  )

  /**
   * Apply text with integrated corrections for display
   */
  const applyCorrectionsToText = useCallback(
    (baseText: string, corrections: ActiveCorrection[]): string => {
      let resultText = baseText

      // Sort corrections by position (reverse order for proper offset handling)
      const sortedCorrections = [...corrections].sort((a, b) => b.diff.position - a.diff.position)

      for (const correction of sortedCorrections) {
        const {diff, phase, progress} = correction

        if (phase === 'complete') continue

        const startPos = diff.position
        const endPos = diff.position + (diff.oldText?.length || 0)

        // Extract the parts of the text
        const before = resultText.slice(0, startPos)
        const after = resultText.slice(endPos)

        let replacement = ''

        if (phase === 'highlight') {
          // During highlight phase, show original text with highlight class
          replacement = diff.oldText || ''
        } else if (phase === 'replace') {
          // During replace phase, gradually show new text
          const newText = diff.newText || ''
          const oldText = diff.oldText || ''

          if (diff.type === 'insert') {
            // Gradually reveal inserted text
            const revealLength = Math.floor(newText.length * progress)
            replacement = newText.slice(0, revealLength)
          } else if (diff.type === 'delete') {
            // Gradually hide deleted text
            const hideLength = Math.floor(oldText.length * (1 - progress))
            replacement = oldText.slice(0, hideLength)
          } else if (diff.type === 'replace') {
            // Crossfade between old and new text
            if (progress < 0.5) {
              // First half: fade out old text
              const fadeOutLength = Math.floor(oldText.length * (1 - progress * 2))
              replacement = oldText.slice(0, fadeOutLength)
            } else {
              // Second half: fade in new text
              const fadeInLength = Math.floor(newText.length * ((progress - 0.5) * 2))
              replacement = newText.slice(0, fadeInLength)
            }
          }
        }

        resultText = before + replacement + after
      }

      return resultText
    },
    []
  )

  /**
   * Update animation frame
   */
  const updateAnimations = useCallback(() => {
    if (isPaused) return

    const now = Date.now()

    setActiveCorrections(prevCorrections => {
      return prevCorrections
        .map(correction => {
          const elapsed = now - correction.startTime
          const totalDuration = finalConfig.correctionDuration + finalConfig.highlightDuration

          let newPhase = correction.phase
          let progress = correction.progress

          if (elapsed < finalConfig.highlightDuration) {
            // Highlight phase
            newPhase = 'highlight'
            progress = elapsed / finalConfig.highlightDuration
          } else if (elapsed < totalDuration) {
            // Replace phase
            newPhase = 'replace'
            progress = (elapsed - finalConfig.highlightDuration) / finalConfig.correctionDuration
          } else {
            // Complete phase
            newPhase = 'complete'
            progress = 1
          }

          return {
            ...correction,
            phase: newPhase as 'highlight' | 'replace' | 'complete',
            progress: Math.min(1, Math.max(0, progress))
          }
        })
        .filter(correction => correction.phase !== 'complete')
    })

    // Continue animation if there are active corrections
    if (activeCorrections.length > 0 && !isPaused) {
      animationFrameRef.current = requestAnimationFrame(updateAnimations)
    }
  }, [
    activeCorrections.length,
    isPaused,
    finalConfig.correctionDuration,
    finalConfig.highlightDuration
  ])

  /**
   * Start correction animation
   */
  const startCorrection = useCallback(
    (diff: TextDiff | WordDiff) => {
      const correction: ActiveCorrection = {
        id: `correction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        diff,
        startTime: Date.now(),
        phase: 'highlight',
        progress: 0
      }

      setActiveCorrections(prev => {
        // Limit simultaneous corrections
        const newCorrections = [...prev, correction]
        if (newCorrections.length > finalConfig.maxSimultaneousCorrections) {
          return newCorrections.slice(-finalConfig.maxSimultaneousCorrections)
        }
        return newCorrections
      })

      // Update statistics
      setStats(prev => ({
        totalCorrections: prev.totalCorrections + 1,
        correctionsThisSession: prev.correctionsThisSession + 1,
        averageLatency:
          (prev.averageLatency * prev.totalCorrections + (Date.now() - startTimeRef.current)) /
          (prev.totalCorrections + 1)
      }))

      playCorrectionsound()

      // Start animation loop if not already running
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(updateAnimations)
      }
    },
    [finalConfig.maxSimultaneousCorrections, playCorrectionsound, updateAnimations]
  )

  /**
   * Process correction queue
   */
  const processQueue = useCallback(() => {
    if (correctionQueue.length === 0 || isProcessingCorrections || isPaused) return

    setIsProcessingCorrections(true)

    const processNext = () => {
      setCorrectionQueue(prev => {
        if (prev.length === 0) {
          setIsProcessingCorrections(false)
          return prev
        }

        const [nextCorrection, ...remaining] = prev
        startCorrection(nextCorrection)

        // Schedule next correction
        if (remaining.length > 0) {
          correctionTimerRef.current = setTimeout(processNext, finalConfig.correctionDelay)
        } else {
          setIsProcessingCorrections(false)
        }

        return remaining
      })
    }

    processNext()
  }, [
    correctionQueue.length,
    isProcessingCorrections,
    isPaused,
    startCorrection,
    finalConfig.correctionDelay
  ])

  /**
   * Update text and detect corrections
   */
  const updateText = useCallback(
    (newText: string) => {
      const corrections = detectCorrections(currentText, newText)

      setCurrentText(newText)

      if (corrections.length > 0) {
        setCorrectionQueue(prev => [...prev, ...corrections])
      }
    },
    [currentText, detectCorrections]
  )

  /**
   * Manual correction animation trigger
   */
  const animateCorrection = useCallback(
    (diff: TextDiff | WordDiff) => {
      startCorrection(diff)
    },
    [startCorrection]
  )

  /**
   * Clear all corrections
   */
  const clearCorrections = useCallback(() => {
    setActiveCorrections([])
    setCorrectionQueue([])
    setIsProcessingCorrections(false)

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (correctionTimerRef.current !== null) {
      clearTimeout(correctionTimerRef.current)
      correctionTimerRef.current = null
    }
  }, [])

  /**
   * Pause/resume corrections
   */
  const pauseCorrections = useCallback((paused: boolean = true) => {
    setIsPaused(paused)
  }, [])

  /**
   * Reset statistics
   */
  const resetStats = useCallback(() => {
    setStats({
      totalCorrections: 0,
      correctionsThisSession: 0,
      averageLatency: 0
    })
    startTimeRef.current = Date.now()
  }, [])

  // Process queue when it changes
  useEffect(() => {
    processQueue()
  }, [processQueue])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (correctionTimerRef.current !== null) {
        clearTimeout(correctionTimerRef.current)
      }
    }
  }, [])

  // Calculate display text with corrections
  const displayText = useMemo(() => {
    return applyCorrectionsToText(currentText, activeCorrections)
  }, [currentText, activeCorrections, applyCorrectionsToText])

  // Construct state and controls
  const state: TextCorrectionState = {
    displayText,
    activeCorrections,
    isProcessingCorrections,
    correctionQueue,
    stats
  }

  const controls: TextCorrectionControls = {
    updateText,
    animateCorrection,
    clearCorrections,
    pauseCorrections,
    resetStats
  }

  return [state, controls]
}

export default useTextCorrection
