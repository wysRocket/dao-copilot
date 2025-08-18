import {useState, useEffect, useCallback, useRef} from 'react'
import {
  AccessibilityPreferences,
  AriaLiveRegionManager,
  FocusManager,
  AnnouncementPriority,
  detectAccessibilityPreferences,
  KeyboardUtils
} from '../utils/accessibility'

/**
 * Accessibility hook options
 */
export interface UseAccessibilityOptions {
  /** Enable automatic preference detection */
  autoDetect?: boolean
  /** Override specific preferences */
  overrides?: Partial<AccessibilityPreferences>
  /** Enable keyboard event handling */
  enableKeyboardHandling?: boolean
  /** Enable focus management */
  enableFocusManagement?: boolean
}

/**
 * Accessibility hook return type
 */
export interface UseAccessibilityReturn {
  /** Current accessibility preferences */
  preferences: AccessibilityPreferences
  /** Whether screen reader is detected as active */
  isScreenReaderActive: boolean
  /** Announce text to screen readers */
  announce: (text: string, priority?: AnnouncementPriority) => void
  /** Set focus on an element */
  setFocus: (element: HTMLElement, options?: FocusOptions) => boolean
  /** Create an accessible button handler */
  createButtonHandler: (onClick: () => void) => {
    onClick: () => void
    onKeyDown: (event: React.KeyboardEvent) => void
    tabIndex: number
    role: string
  }
  /** Create accessible navigation handlers */
  createNavigationHandlers: (options: {
    onUp?: () => void
    onDown?: () => void
    onLeft?: () => void
    onRight?: () => void
    onEscape?: () => void
  }) => {
    onKeyDown: (event: React.KeyboardEvent) => void
    tabIndex: number
  }
  /** Update preferences */
  updatePreferences: (newPreferences: Partial<AccessibilityPreferences>) => void
  /** Check if animations should be reduced */
  shouldReduceMotion: boolean
  /** Check if high contrast is preferred */
  shouldUseHighContrast: boolean
}

/**
 * React hook for accessibility support
 */
export const useAccessibility = (options: UseAccessibilityOptions = {}): UseAccessibilityReturn => {
  const {
    autoDetect = true,
    overrides = {},
    enableKeyboardHandling = true,
    enableFocusManagement = true
  } = options

  // State
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(() => {
    const detected = autoDetect
      ? detectAccessibilityPreferences()
      : {
          reducedMotion: false,
          highContrast: false,
          forceFocus: false,
          announceChanges: true,
          keyboardNavigation: true,
          screenReaderOptimized: false
        }
    return {...detected, ...overrides}
  })

  // Refs for managers
  const liveRegionManagerRef = useRef<AriaLiveRegionManager | null>(null)
  const focusManagerRef = useRef<FocusManager | null>(null)

  // Initialize managers
  useEffect(() => {
    if (preferences.announceChanges && !liveRegionManagerRef.current) {
      liveRegionManagerRef.current = new AriaLiveRegionManager()
    }

    if (enableFocusManagement && !focusManagerRef.current) {
      focusManagerRef.current = new FocusManager()
    }

    return () => {
      // Cleanup managers on unmount
      if (liveRegionManagerRef.current) {
        liveRegionManagerRef.current.destroy()
        liveRegionManagerRef.current = null
      }
    }
  }, [preferences.announceChanges, enableFocusManagement])

  // Listen for preference changes
  useEffect(() => {
    if (!autoDetect) return

    const mediaQueries = [
      window.matchMedia('(prefers-reduced-motion: reduce)'),
      window.matchMedia('(prefers-contrast: high)'),
      window.matchMedia('(forced-colors: active)')
    ]

    const updatePreferences = () => {
      const newPreferences = detectAccessibilityPreferences()
      setPreferences({...newPreferences, ...overrides})
    }

    mediaQueries.forEach(mq => {
      mq.addEventListener('change', updatePreferences)
    })

    return () => {
      mediaQueries.forEach(mq => {
        mq.removeEventListener('change', updatePreferences)
      })
    }
  }, [autoDetect, overrides])

  // Announce function
  const announce = useCallback(
    (text: string, priority: AnnouncementPriority = 'medium') => {
      if (preferences.announceChanges && liveRegionManagerRef.current) {
        liveRegionManagerRef.current.announce(text, priority)
      }
    },
    [preferences.announceChanges]
  )

  // Focus function
  const setFocus = useCallback(
    (element: HTMLElement, options?: FocusOptions): boolean => {
      if (enableFocusManagement && focusManagerRef.current) {
        return focusManagerRef.current.setFocus(element, options)
      }
      return false
    },
    [enableFocusManagement]
  )

  // Create accessible button handler
  const createButtonHandler = useCallback(
    (onClick: () => void) => {
      return {
        onClick,
        onKeyDown: (event: React.KeyboardEvent) => {
          if (enableKeyboardHandling && KeyboardUtils.isActivationKey(event.nativeEvent)) {
            event.preventDefault()
            onClick()
          }
        },
        tabIndex: 0,
        role: 'button'
      }
    },
    [enableKeyboardHandling]
  )

  // Create navigation handlers
  const createNavigationHandlers = useCallback(
    (navigationOptions: {
      onUp?: () => void
      onDown?: () => void
      onLeft?: () => void
      onRight?: () => void
      onEscape?: () => void
    }) => {
      return {
        onKeyDown: (event: React.KeyboardEvent) => {
          if (!enableKeyboardHandling) return

          const {key} = event.nativeEvent

          switch (key) {
            case 'ArrowUp':
              if (navigationOptions.onUp) {
                event.preventDefault()
                navigationOptions.onUp()
              }
              break
            case 'ArrowDown':
              if (navigationOptions.onDown) {
                event.preventDefault()
                navigationOptions.onDown()
              }
              break
            case 'ArrowLeft':
              if (navigationOptions.onLeft) {
                event.preventDefault()
                navigationOptions.onLeft()
              }
              break
            case 'ArrowRight':
              if (navigationOptions.onRight) {
                event.preventDefault()
                navigationOptions.onRight()
              }
              break
            case 'Escape':
              if (navigationOptions.onEscape) {
                event.preventDefault()
                navigationOptions.onEscape()
              }
              break
          }
        },
        tabIndex: 0
      }
    },
    [enableKeyboardHandling]
  )

  // Update preferences function
  const updatePreferences = useCallback((newPreferences: Partial<AccessibilityPreferences>) => {
    setPreferences(prev => ({...prev, ...newPreferences}))
  }, [])

  return {
    preferences,
    isScreenReaderActive: preferences.screenReaderOptimized,
    announce,
    setFocus,
    createButtonHandler,
    createNavigationHandlers,
    updatePreferences,
    shouldReduceMotion: preferences.reducedMotion,
    shouldUseHighContrast: preferences.highContrast
  }
}
