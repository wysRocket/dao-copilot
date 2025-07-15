import {useState, useEffect, useCallback, useRef, RefObject} from 'react'

/**
 * Configuration options for auto-scroll behavior
 */
export interface AutoScrollConfig {
  /** Whether auto-scroll is enabled by default */
  enabled?: boolean
  /** Threshold in pixels from bottom to trigger auto-scroll */
  bottomThreshold?: number
  /** Duration of scroll animation in milliseconds */
  animationDuration?: number
  /** Whether to use smooth scrolling */
  smooth?: boolean
  /** Debounce delay for user scroll detection in milliseconds */
  userScrollDebounce?: number
  /** Whether to show new content indicator when auto-scroll is paused */
  showNewContentIndicator?: boolean
}

/**
 * Auto-scroll state and metrics
 */
export interface AutoScrollState {
  /** Whether auto-scroll is currently active */
  isAutoScrolling: boolean
  /** Whether user has manually scrolled */
  hasUserScrolled: boolean
  /** Whether there's new content below current view */
  hasNewContent: boolean
  /** Current scroll position percentage (0-100) */
  scrollPercentage: number
  /** Distance from bottom in pixels */
  distanceFromBottom: number
  /** Whether the container is scrollable */
  isScrollable: boolean
}

/**
 * Auto-scroll control methods
 */
export interface AutoScrollControls {
  /** Scroll to bottom with animation */
  scrollToBottom: () => void
  /** Scroll to top with animation */
  scrollToTop: () => void
  /** Scroll to specific position */
  scrollToPosition: (position: number) => void
  /** Enable auto-scroll */
  enableAutoScroll: () => void
  /** Disable auto-scroll */
  disableAutoScroll: () => void
  /** Toggle auto-scroll */
  toggleAutoScroll: () => void
  /** Reset user scroll state */
  resetUserScroll: () => void
  /** Mark new content as seen */
  markContentSeen: () => void
}

/**
 * Return type for useAutoScroll hook
 */
export interface UseAutoScrollReturn {
  /** Current auto-scroll state */
  state: AutoScrollState
  /** Auto-scroll control methods */
  controls: AutoScrollControls
  /** Ref to attach to scrollable container */
  containerRef: RefObject<HTMLDivElement | null>
  /** Callback to trigger when new content is added */
  onNewContent: () => void
}

/**
 * Default configuration for auto-scroll
 */
const defaultConfig: Required<AutoScrollConfig> = {
  enabled: true,
  bottomThreshold: 50,
  animationDuration: 300,
  smooth: true,
  userScrollDebounce: 100,
  showNewContentIndicator: true
}

/**
 * Custom hook for managing auto-scroll functionality in streaming text containers
 *
 * Features:
 * - Automatic scrolling to follow new content
 * - User scroll detection with debouncing
 * - Smooth scroll animations
 * - New content notifications
 * - Scroll position tracking and memory
 * - Configurable behavior options
 *
 * @param config Configuration options for auto-scroll behavior
 * @returns Auto-scroll state, controls, and container ref
 */
export const useAutoScroll = (config: AutoScrollConfig = {}): UseAutoScrollReturn => {
  const mergedConfig = {...defaultConfig, ...config}
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastScrollTopRef = useRef<number>(0)
  const isScrollingProgrammaticallyRef = useRef<boolean>(false)

  // State management
  const [isAutoScrolling, setIsAutoScrolling] = useState(mergedConfig.enabled)
  const [hasUserScrolled, setHasUserScrolled] = useState(false)
  const [hasNewContent, setHasNewContent] = useState(false)
  const [scrollPercentage, setScrollPercentage] = useState(100)
  const [distanceFromBottom, setDistanceFromBottom] = useState(0)
  const [isScrollable, setIsScrollable] = useState(false)

  /**
   * Calculate scroll metrics and update state
   */
  const updateScrollMetrics = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const {scrollTop, scrollHeight, clientHeight} = container
    const maxScroll = scrollHeight - clientHeight
    const currentScrollPercentage = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 100
    const currentDistanceFromBottom = maxScroll - scrollTop
    const currentIsScrollable = scrollHeight > clientHeight

    setScrollPercentage(Math.round(currentScrollPercentage))
    setDistanceFromBottom(Math.round(currentDistanceFromBottom))
    setIsScrollable(currentIsScrollable)

    return {
      scrollTop,
      scrollHeight,
      clientHeight,
      maxScroll,
      scrollPercentage: currentScrollPercentage,
      distanceFromBottom: currentDistanceFromBottom,
      isScrollable: currentIsScrollable
    }
  }, [])

  /**
   * Smooth scroll to a specific position
   */
  const smoothScrollTo = useCallback(
    (targetPosition: number) => {
      const container = containerRef.current
      if (!container) return

      isScrollingProgrammaticallyRef.current = true

      if (mergedConfig.smooth) {
        container.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        })

        // Reset programmatic scroll flag after animation
        setTimeout(() => {
          isScrollingProgrammaticallyRef.current = false
        }, mergedConfig.animationDuration)
      } else {
        container.scrollTop = targetPosition
        isScrollingProgrammaticallyRef.current = false
      }
    },
    [mergedConfig.smooth, mergedConfig.animationDuration]
  )

  /**
   * Scroll to bottom of container
   */
  const scrollToBottom = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const metrics = updateScrollMetrics()
    if (metrics) {
      smoothScrollTo(metrics.maxScroll)
      setHasNewContent(false)
      setHasUserScrolled(false)
    }
  }, [updateScrollMetrics, smoothScrollTo])

  /**
   * Scroll to top of container
   */
  const scrollToTop = useCallback(() => {
    smoothScrollTo(0)
    setHasUserScrolled(true)
    setIsAutoScrolling(false)
  }, [smoothScrollTo])

  /**
   * Scroll to specific position (0-100 percentage)
   */
  const scrollToPosition = useCallback(
    (position: number) => {
      const container = containerRef.current
      if (!container) return

      const metrics = updateScrollMetrics()
      if (metrics) {
        const targetPosition = (Math.max(0, Math.min(100, position)) / 100) * metrics.maxScroll
        smoothScrollTo(targetPosition)

        if (position < 95) {
          setHasUserScrolled(true)
          setIsAutoScrolling(false)
        }
      }
    },
    [updateScrollMetrics, smoothScrollTo]
  )

  /**
   * Enable auto-scroll
   */
  const enableAutoScroll = useCallback(() => {
    setIsAutoScrolling(true)
    setHasUserScrolled(false)
    scrollToBottom()
  }, [scrollToBottom])

  /**
   * Disable auto-scroll
   */
  const disableAutoScroll = useCallback(() => {
    setIsAutoScrolling(false)
  }, [])

  /**
   * Toggle auto-scroll state
   */
  const toggleAutoScroll = useCallback(() => {
    if (isAutoScrolling) {
      disableAutoScroll()
    } else {
      enableAutoScroll()
    }
  }, [isAutoScrolling, enableAutoScroll, disableAutoScroll])

  /**
   * Reset user scroll state
   */
  const resetUserScroll = useCallback(() => {
    setHasUserScrolled(false)
  }, [])

  /**
   * Mark new content as seen
   */
  const markContentSeen = useCallback(() => {
    setHasNewContent(false)
  }, [])

  /**
   * Handle user scroll events with debouncing
   */
  const handleUserScroll = useCallback(() => {
    if (isScrollingProgrammaticallyRef.current) {
      return
    }

    const container = containerRef.current
    if (!container) return

    // Clear existing timeout
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current)
    }

    // Debounce scroll detection
    userScrollTimeoutRef.current = setTimeout(() => {
      const metrics = updateScrollMetrics()
      if (!metrics) return

      const isNearBottom = metrics.distanceFromBottom <= mergedConfig.bottomThreshold

      if (isNearBottom) {
        // User scrolled back to bottom, re-enable auto-scroll
        if (hasUserScrolled) {
          setHasUserScrolled(false)
          setIsAutoScrolling(true)
          setHasNewContent(false)
        }
      } else {
        // User scrolled away from bottom, disable auto-scroll
        if (!hasUserScrolled) {
          setHasUserScrolled(true)
          setIsAutoScrolling(false)
        }
      }

      lastScrollTopRef.current = container.scrollTop
    }, mergedConfig.userScrollDebounce)
  }, [
    updateScrollMetrics,
    hasUserScrolled,
    mergedConfig.bottomThreshold,
    mergedConfig.userScrollDebounce
  ])

  /**
   * Callback to trigger when new content is added
   */
  const onNewContent = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    // Update scroll metrics first
    updateScrollMetrics()

    if (isAutoScrolling && !hasUserScrolled) {
      // Auto-scroll to bottom if enabled
      setTimeout(() => {
        scrollToBottom()
      }, 10) // Small delay to ensure DOM is updated
    } else if (mergedConfig.showNewContentIndicator) {
      // Show new content indicator if user has scrolled away
      setHasNewContent(true)
    }
  }, [
    isAutoScrolling,
    hasUserScrolled,
    scrollToBottom,
    updateScrollMetrics,
    mergedConfig.showNewContentIndicator
  ])

  /**
   * Set up scroll event listener
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('scroll', handleUserScroll, {passive: true})

    return () => {
      container.removeEventListener('scroll', handleUserScroll)
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current)
      }
    }
  }, [handleUserScroll])

  /**
   * Set up resize observer to handle container size changes
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver(() => {
      updateScrollMetrics()

      // If auto-scrolling is enabled, scroll to bottom after resize
      if (isAutoScrolling) {
        setTimeout(() => {
          scrollToBottom()
        }, 10)
      }
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [updateScrollMetrics, isAutoScrolling, scrollToBottom])

  /**
   * Initial scroll metrics calculation
   */
  useEffect(() => {
    updateScrollMetrics()
  }, [updateScrollMetrics])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current)
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return {
    state: {
      isAutoScrolling,
      hasUserScrolled,
      hasNewContent,
      scrollPercentage,
      distanceFromBottom,
      isScrollable
    },
    controls: {
      scrollToBottom,
      scrollToTop,
      scrollToPosition,
      enableAutoScroll,
      disableAutoScroll,
      toggleAutoScroll,
      resetUserScroll,
      markContentSeen
    },
    containerRef,
    onNewContent
  }
}
