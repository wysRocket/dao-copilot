/**
 * Chat Scroll Management Hook
 *
 * Manages scroll behavior, auto-scroll functionality, and navigation controls
 * for the chat interface. Provides smooth scrolling, user interaction detection,
 * and scroll position preservation.
 */

import {useEffect, useRef, useCallback, useState, useMemo} from 'react'

// Throttle utility for performance optimization
const throttle = <T extends (...args: unknown[]) => void>(func: T, delay: number): T => {
  let timeoutId: NodeJS.Timeout | null = null
  let lastExecTime = 0
  return ((...args: Parameters<T>) => {
    const currentTime = Date.now()

    if (currentTime - lastExecTime > delay) {
      func(...args)
      lastExecTime = currentTime
    } else {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(
        () => {
          func(...args)
          lastExecTime = Date.now()
        },
        delay - (currentTime - lastExecTime)
      )
    }
  }) as T
}

export interface ScrollPosition {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  isAtBottom: boolean
  isAtTop: boolean
}

export interface ScrollControls {
  scrollToBottom: (smooth?: boolean) => void
  scrollToTop: (smooth?: boolean) => void
  scrollToMessage: (messageId: string, smooth?: boolean) => void
  isAutoScrollEnabled: boolean
  setAutoScrollEnabled: (enabled: boolean) => void
  scrollPosition: ScrollPosition
  isUserScrolling: boolean
  showScrollToBottom: boolean
  showScrollToTop: boolean
  hasNewMessagesBelow: boolean
  markAllMessagesRead: () => void
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
}

export interface UseChatScrollOptions {
  autoScrollThreshold?: number // Distance from bottom to trigger auto-scroll
  scrollDetectionDelay?: number // Delay to detect if user stopped scrolling
  showControlsThreshold?: number // Distance from edges to show navigation controls
  enableKeyboardNavigation?: boolean
}

const DEFAULT_OPTIONS: Required<UseChatScrollOptions> = {
  autoScrollThreshold: 100,
  scrollDetectionDelay: 150,
  showControlsThreshold: 200,
  enableKeyboardNavigation: true
}

export function useChatScroll(
  messagesLength: number,
  options: UseChatScrollOptions = {}
): ScrollControls {
  const config = {...DEFAULT_OPTIONS, ...options}

  // Refs for DOM elements and state tracking
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastScrollTopRef = useRef(0)
  const isAutoScrollingRef = useRef(false)

  // State for scroll management
  const [isAutoScrollEnabled, setIsAutoScrollEnabledState] = useState(true)
  const [isUserScrolling, setIsUserScrolling] = useState(false)
  const [scrollPosition, setScrollPosition] = useState<ScrollPosition>({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
    isAtBottom: true,
    isAtTop: true
  })
  const [hasNewMessagesBelow, setHasNewMessagesBelow] = useState(false)

  // Calculate derived states
  const showScrollToBottom =
    scrollPosition.scrollTop <
    scrollPosition.scrollHeight - scrollPosition.clientHeight - config.showControlsThreshold
  const showScrollToTop = scrollPosition.scrollTop > config.showControlsThreshold

  // Utility to calculate scroll position info
  const calculateScrollPosition = useCallback(
    (element: HTMLElement): ScrollPosition => {
      const {scrollTop, scrollHeight, clientHeight} = element
      const isAtBottom = scrollTop >= scrollHeight - clientHeight - config.autoScrollThreshold
      const isAtTop = scrollTop <= config.autoScrollThreshold

      return {
        scrollTop,
        scrollHeight,
        clientHeight,
        isAtBottom,
        isAtTop
      }
    },
    [config.autoScrollThreshold]
  )

  // Smooth scroll implementation
  const smoothScrollTo = useCallback(
    (element: HTMLElement, top: number, smooth: boolean = true) => {
      if (!smooth) {
        element.scrollTop = top
        return
      }

      // Use native smooth scrolling if supported, otherwise implement custom
      if ('scrollBehavior' in element.style) {
        element.style.scrollBehavior = 'smooth'
        element.scrollTop = top
        // Reset scroll behavior after a delay
        setTimeout(() => {
          element.style.scrollBehavior = ''
        }, 300)
      } else {
        // Fallback smooth scroll implementation
        const start = element.scrollTop
        const change = top - start
        const duration = 300
        let startTime: number

        const animateScroll = (currentTime: number) => {
          if (!startTime) startTime = currentTime
          const timeElapsed = currentTime - startTime
          const progress = Math.min(timeElapsed / duration, 1)

          // Easing function (ease-out)
          const easing = 1 - Math.pow(1 - progress, 3)
          element.scrollTop = start + change * easing

          if (progress < 1) {
            requestAnimationFrame(animateScroll)
          }
        }

        requestAnimationFrame(animateScroll)
      }
    },
    []
  )

  // Scroll control functions
  const scrollToBottom = useCallback(
    (smooth: boolean = true) => {
      const element = scrollContainerRef.current
      if (!element) return

      isAutoScrollingRef.current = true
      smoothScrollTo(element, element.scrollHeight - element.clientHeight, smooth)
      setHasNewMessagesBelow(false)

      // Reset auto-scrolling flag after animation
      setTimeout(() => {
        isAutoScrollingRef.current = false
      }, 350)
    },
    [smoothScrollTo]
  )

  const scrollToTop = useCallback(
    (smooth: boolean = true) => {
      const element = scrollContainerRef.current
      if (!element) return

      isAutoScrollingRef.current = true
      smoothScrollTo(element, 0, smooth)

      setTimeout(() => {
        isAutoScrollingRef.current = false
      }, 350)
    },
    [smoothScrollTo]
  )

  const scrollToMessage = useCallback(
    (messageId: string, smooth: boolean = true) => {
      const element = scrollContainerRef.current
      if (!element) return

      const messageElement = element.querySelector(`[data-message-id="${messageId}"]`)
      if (!messageElement) return

      isAutoScrollingRef.current = true
      const elementTop = (messageElement as HTMLElement).offsetTop
      const offset = 20 // Small offset for better visibility
      smoothScrollTo(element, elementTop - offset, smooth)

      setTimeout(() => {
        isAutoScrollingRef.current = false
      }, 350)
    },
    [smoothScrollTo]
  )

  const setAutoScrollEnabled = useCallback(
    (enabled: boolean) => {
      setIsAutoScrollEnabledState(enabled)
      if (enabled) {
        // If re-enabling auto-scroll, scroll to bottom if there are new messages
        if (hasNewMessagesBelow) {
          scrollToBottom()
        }
      }
    },
    [hasNewMessagesBelow, scrollToBottom]
  )

  const markAllMessagesRead = useCallback(() => {
    setHasNewMessagesBelow(false)
  }, [])

  // Handle scroll events
  const handleScrollInternal = useCallback(() => {
    const element = scrollContainerRef.current
    if (!element || isAutoScrollingRef.current) return

    const newPosition = calculateScrollPosition(element)
    setScrollPosition(newPosition)

    // Detect user scrolling
    if (!isUserScrolling) {
      setIsUserScrolling(true)
    }

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    // Set timeout to detect when user stops scrolling
    scrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false)

      // Update auto-scroll enabled state based on position
      if (newPosition.isAtBottom) {
        if (!isAutoScrollEnabled) {
          setIsAutoScrollEnabledState(true)
          setHasNewMessagesBelow(false)
        }
      } else {
        if (isAutoScrollEnabled) {
          setIsAutoScrollEnabledState(false)
        }
      }
    }, config.scrollDetectionDelay)

    lastScrollTopRef.current = newPosition.scrollTop
  }, [calculateScrollPosition, isUserScrolling, isAutoScrollEnabled, config.scrollDetectionDelay])

  // Create throttled scroll handler for performance
  const handleScroll = useMemo(
    () => throttle(handleScrollInternal, 16), // ~60fps
    [handleScrollInternal]
  )

  // Handle new messages (auto-scroll logic)
  useEffect(() => {
    if (messagesLength === 0) return

    const element = scrollContainerRef.current
    if (!element) return

    // Small delay to let DOM update
    requestAnimationFrame(() => {
      const position = calculateScrollPosition(element)

      if (isAutoScrollEnabled && position.isAtBottom) {
        // Auto-scroll to new message
        scrollToBottom(true)
      } else if (!position.isAtBottom) {
        // Mark that there are new messages below
        setHasNewMessagesBelow(true)
      }
    })
  }, [messagesLength, isAutoScrollEnabled, calculateScrollPosition, scrollToBottom])

  // Keyboard navigation
  useEffect(() => {
    if (!config.enableKeyboardNavigation) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle if focus is on the chat container or its children
      const element = scrollContainerRef.current
      if (!element || !element.contains(document.activeElement)) return

      switch (event.key) {
        case 'Home':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            scrollToTop()
          }
          break
        case 'End':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            scrollToBottom()
          }
          break
        case 'PageUp': {
          event.preventDefault()
          const pageUpTarget = Math.max(
            0,
            scrollPosition.scrollTop - scrollPosition.clientHeight * 0.8
          )
          smoothScrollTo(element, pageUpTarget)
          break
        }
        case 'PageDown': {
          event.preventDefault()
          const pageDownTarget = Math.min(
            scrollPosition.scrollHeight - scrollPosition.clientHeight,
            scrollPosition.scrollTop + scrollPosition.clientHeight * 0.8
          )
          smoothScrollTo(element, pageDownTarget)
          break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [config.enableKeyboardNavigation, scrollPosition, scrollToTop, scrollToBottom, smoothScrollTo])

  // Initialize scroll position
  useEffect(() => {
    const element = scrollContainerRef.current
    if (!element) return

    // Set up scroll event listener
    element.addEventListener('scroll', handleScroll, {passive: true})

    // Initial position calculation
    const initialPosition = calculateScrollPosition(element)
    setScrollPosition(initialPosition)

    return () => {
      element.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [handleScroll, calculateScrollPosition])

  return {
    scrollToBottom,
    scrollToTop,
    scrollToMessage,
    isAutoScrollEnabled,
    setAutoScrollEnabled,
    scrollPosition,
    isUserScrolling,
    showScrollToBottom,
    showScrollToTop,
    hasNewMessagesBelow,
    markAllMessagesRead,
    // Expose ref for attaching to scroll container
    scrollContainerRef
  }
}
