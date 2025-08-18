/**
 * Smooth Transition System for UI State Changes
 * Provides performant animations and transitions for transcript UI elements
 */

import React, {useRef, useEffect, useState} from 'react'

// Transition configuration types
export type TransitionType =
  | 'fade' // Opacity transition
  | 'slide-up' // Slide from bottom
  | 'slide-down' // Slide from top
  | 'slide-left' // Slide from right
  | 'slide-right' // Slide from left
  | 'scale' // Scale in/out
  | 'bounce' // Bounce effect
  | 'pulse' // Pulse effect
  | 'shake' // Shake for errors
  | 'glow' // Glow effect
  | 'flip' // 3D flip
  | 'rotate' // Rotation

export type TransitionDuration = 'fast' | 'normal' | 'slow'
export type TransitionEasing = 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear'

export interface TransitionConfig {
  type: TransitionType
  duration?: TransitionDuration
  easing?: TransitionEasing
  delay?: number
  repeat?: boolean
  repeatCount?: number
  reverseOnExit?: boolean
}

interface TransitionState {
  isEntering: boolean
  isExiting: boolean
  isVisible: boolean
}

// Duration mappings in milliseconds
const DURATION_MAP: Record<TransitionDuration, number> = {
  fast: 150,
  normal: 300,
  slow: 500
}

// CSS class mappings for transitions
const TRANSITION_CLASSES: Record<
  TransitionType,
  {
    base: string
    enter: string
    enterActive: string
    exit: string
    exitActive: string
  }
> = {
  fade: {
    base: 'transition-opacity',
    enter: 'opacity-0',
    enterActive: 'opacity-100',
    exit: 'opacity-100',
    exitActive: 'opacity-0'
  },
  'slide-up': {
    base: 'transition-all transform',
    enter: 'translate-y-4 opacity-0',
    enterActive: 'translate-y-0 opacity-100',
    exit: 'translate-y-0 opacity-100',
    exitActive: 'translate-y-4 opacity-0'
  },
  'slide-down': {
    base: 'transition-all transform',
    enter: '-translate-y-4 opacity-0',
    enterActive: 'translate-y-0 opacity-100',
    exit: 'translate-y-0 opacity-100',
    exitActive: '-translate-y-4 opacity-0'
  },
  'slide-left': {
    base: 'transition-all transform',
    enter: 'translate-x-4 opacity-0',
    enterActive: 'translate-x-0 opacity-100',
    exit: 'translate-x-0 opacity-100',
    exitActive: 'translate-x-4 opacity-0'
  },
  'slide-right': {
    base: 'transition-all transform',
    enter: '-translate-x-4 opacity-0',
    enterActive: 'translate-x-0 opacity-100',
    exit: 'translate-x-0 opacity-100',
    exitActive: '-translate-x-4 opacity-0'
  },
  scale: {
    base: 'transition-all transform',
    enter: 'scale-90 opacity-0',
    enterActive: 'scale-100 opacity-100',
    exit: 'scale-100 opacity-100',
    exitActive: 'scale-90 opacity-0'
  },
  bounce: {
    base: 'transition-all transform',
    enter: 'scale-90 opacity-0',
    enterActive: 'scale-100 opacity-100 animate-bounce',
    exit: 'scale-100 opacity-100',
    exitActive: 'scale-90 opacity-0'
  },
  pulse: {
    base: 'transition-all',
    enter: 'opacity-0',
    enterActive: 'opacity-100 animate-pulse',
    exit: 'opacity-100',
    exitActive: 'opacity-0'
  },
  shake: {
    base: 'transition-all',
    enter: 'opacity-0',
    enterActive: 'opacity-100 animate-shake',
    exit: 'opacity-100',
    exitActive: 'opacity-0'
  },
  glow: {
    base: 'transition-all',
    enter: 'opacity-0',
    enterActive: 'opacity-100 shadow-lg',
    exit: 'opacity-100 shadow-lg',
    exitActive: 'opacity-0'
  },
  flip: {
    base: 'transition-all transform',
    enter: 'rotateY-90 opacity-0',
    enterActive: 'rotateY-0 opacity-100',
    exit: 'rotateY-0 opacity-100',
    exitActive: 'rotateY-90 opacity-0'
  },
  rotate: {
    base: 'transition-all transform',
    enter: 'rotate-180 opacity-0',
    enterActive: 'rotate-0 opacity-100',
    exit: 'rotate-0 opacity-100',
    exitActive: 'rotate-180 opacity-0'
  }
}

/**
 * Higher-order component for smooth transitions
 */
export interface TransitionWrapperProps {
  children: React.ReactNode
  show: boolean
  config: TransitionConfig
  className?: string
  onEnter?: () => void
  onEntered?: () => void
  onExit?: () => void
  onExited?: () => void
}

export const TransitionWrapper: React.FC<TransitionWrapperProps> = ({
  children,
  show,
  config,
  className = '',
  onEnter,
  onEntered,
  onExit,
  onExited
}) => {
  const [state, setState] = useState<TransitionState>({
    isEntering: false,
    isExiting: false,
    isVisible: show
  })

  const timeoutRef = useRef<NodeJS.Timeout>()
  const elementRef = useRef<HTMLDivElement>(null)

  const duration = DURATION_MAP[config.duration || 'normal']
  const transitionClasses = TRANSITION_CLASSES[config.type]

  useEffect(() => {
    if (show && !state.isVisible) {
      // Start entering
      setState(prev => ({...prev, isEntering: true, isVisible: true}))
      onEnter?.()

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(
        () => {
          setState(prev => ({...prev, isEntering: false}))
          onEntered?.()
        },
        duration + (config.delay || 0)
      )
    } else if (!show && state.isVisible) {
      // Start exiting
      setState(prev => ({...prev, isExiting: true}))
      onExit?.()

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(
        () => {
          setState(prev => ({...prev, isExiting: false, isVisible: false}))
          onExited?.()
        },
        duration + (config.delay || 0)
      )
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [show, state.isVisible, duration, config.delay, onEnter, onEntered, onExit, onExited])

  if (!state.isVisible) {
    return null
  }

  // Build CSS classes
  const durationClass = `duration-${duration}`
  const easingClass = config.easing || 'ease-in-out'
  const delayClass = config.delay ? `delay-${config.delay}` : ''

  let stateClasses = ''
  if (state.isEntering) {
    stateClasses = `${transitionClasses.enter} ${transitionClasses.enterActive}`
  } else if (state.isExiting) {
    stateClasses = `${transitionClasses.exit} ${transitionClasses.exitActive}`
  } else {
    stateClasses = transitionClasses.enterActive
  }

  const allClasses = [
    transitionClasses.base,
    durationClass,
    easingClass,
    delayClass,
    stateClasses,
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={elementRef}
      className={allClasses}
      style={{
        transitionDuration: `${duration}ms`,
        transitionTimingFunction: config.easing || 'ease-in-out',
        transitionDelay: config.delay ? `${config.delay}ms` : undefined
      }}
    >
      {children}
    </div>
  )
}

/**
 * Hook for managing transition state
 */
export const useTransition = (config: TransitionConfig) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const show = () => {
    setIsVisible(true)
    setIsTransitioning(true)
  }

  const hide = () => {
    setIsVisible(false)
    setIsTransitioning(true)
  }

  const toggle = () => {
    isVisible ? hide() : show()
  }

  const handleTransitionEnd = () => {
    setIsTransitioning(false)
  }

  return {
    isVisible,
    isTransitioning,
    show,
    hide,
    toggle,
    handleTransitionEnd
  }
}

/**
 * Status-specific transition configurations
 */
export const StatusTransitions = {
  statusChange: {
    type: 'fade' as TransitionType,
    duration: 'normal' as TransitionDuration,
    easing: 'ease-in-out' as TransitionEasing
  },

  errorAppear: {
    type: 'shake' as TransitionType,
    duration: 'fast' as TransitionDuration,
    easing: 'ease-out' as TransitionEasing
  },

  successAppear: {
    type: 'bounce' as TransitionType,
    duration: 'normal' as TransitionDuration,
    easing: 'ease-out' as TransitionEasing
  },

  streamingStart: {
    type: 'glow' as TransitionType,
    duration: 'normal' as TransitionDuration,
    easing: 'ease-in-out' as TransitionEasing,
    repeat: true
  },

  reconnecting: {
    type: 'pulse' as TransitionType,
    duration: 'slow' as TransitionDuration,
    easing: 'ease-in-out' as TransitionEasing,
    repeat: true
  },

  newTranscript: {
    type: 'slide-up' as TransitionType,
    duration: 'fast' as TransitionDuration,
    easing: 'ease-out' as TransitionEasing
  },

  transcriptUpdate: {
    type: 'scale' as TransitionType,
    duration: 'fast' as TransitionDuration,
    easing: 'ease-in-out' as TransitionEasing
  },

  modalAppear: {
    type: 'fade' as TransitionType,
    duration: 'normal' as TransitionDuration,
    easing: 'ease-out' as TransitionEasing
  },

  tooltipAppear: {
    type: 'slide-down' as TransitionType,
    duration: 'fast' as TransitionDuration,
    easing: 'ease-out' as TransitionEasing
  }
}

/**
 * Animated status badge with transitions
 */
export interface AnimatedStatusBadgeProps {
  status: string
  children: React.ReactNode
  previousStatus?: string
  transitionConfig?: TransitionConfig
  className?: string
}

export const AnimatedStatusBadge: React.FC<AnimatedStatusBadgeProps> = ({
  status,
  children,
  previousStatus,
  transitionConfig,
  className = ''
}) => {
  const [displayStatus, setDisplayStatus] = useState(status)
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Determine transition type based on status change
  const getTransitionForStatusChange = (from?: string, to?: string): TransitionConfig => {
    if (to === 'error') return StatusTransitions.errorAppear
    if (to === 'normal' && from === 'error') return StatusTransitions.successAppear
    if (to === 'streaming') return StatusTransitions.streamingStart
    if (to === 'reconnecting') return StatusTransitions.reconnecting
    return StatusTransitions.statusChange
  }

  const effectiveConfig = transitionConfig || getTransitionForStatusChange(previousStatus, status)

  useEffect(() => {
    if (status !== displayStatus) {
      setIsTransitioning(true)

      // Delay the status update to allow exit transition
      const timeout = setTimeout(
        () => {
          setDisplayStatus(status)
          setIsTransitioning(false)
        },
        DURATION_MAP[effectiveConfig.duration || 'normal'] / 2
      )

      return () => clearTimeout(timeout)
    }
  }, [status, displayStatus, effectiveConfig.duration])

  return (
    <TransitionWrapper show={!isTransitioning} config={effectiveConfig} className={className}>
      {children}
    </TransitionWrapper>
  )
}

/**
 * List transition for transcript entries
 */
export interface TransitionListProps {
  children: React.ReactNode[]
  itemConfig?: TransitionConfig
  staggerDelay?: number
  className?: string
}

export const TransitionList: React.FC<TransitionListProps> = ({
  children,
  itemConfig = StatusTransitions.newTranscript,
  staggerDelay = 50,
  className = ''
}) => {
  return (
    <div className={className}>
      {React.Children.map(children, (child, index) => (
        <TransitionWrapper
          key={index}
          show={true}
          config={{
            ...itemConfig,
            delay: (itemConfig.delay || 0) + index * staggerDelay
          }}
        >
          {child}
        </TransitionWrapper>
      ))}
    </div>
  )
}

/**
 * Page transition wrapper
 */
export interface PageTransitionProps {
  children: React.ReactNode
  isLoading?: boolean
  error?: Error | null
  className?: string
}

export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  isLoading = false,
  error = null,
  className = ''
}) => {
  if (isLoading) {
    return (
      <TransitionWrapper
        show={true}
        config={StatusTransitions.transcriptUpdate}
        className={className}
      >
        <div className="flex items-center justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading...</span>
        </div>
      </TransitionWrapper>
    )
  }

  if (error) {
    return (
      <TransitionWrapper show={true} config={StatusTransitions.errorAppear} className={className}>
        <div className="flex items-center justify-center p-8 text-red-600">
          <span>❌ Error: {error.message}</span>
        </div>
      </TransitionWrapper>
    )
  }

  return (
    <TransitionWrapper show={true} config={StatusTransitions.modalAppear} className={className}>
      {children}
    </TransitionWrapper>
  )
}

/**
 * Utility functions for transition management
 */
export const TransitionUtils = {
  /**
   * Create a staggered delay for list items
   */
  createStaggeredDelay: (index: number, baseDelay = 0, increment = 50) => {
    return baseDelay + index * increment
  },

  /**
   * Get optimal transition for content type
   */
  getOptimalTransition: (
    contentType: 'status' | 'transcript' | 'modal' | 'tooltip' | 'error'
  ): TransitionConfig => {
    switch (contentType) {
      case 'status':
        return StatusTransitions.statusChange
      case 'transcript':
        return StatusTransitions.newTranscript
      case 'modal':
        return StatusTransitions.modalAppear
      case 'tooltip':
        return StatusTransitions.tooltipAppear
      case 'error':
        return StatusTransitions.errorAppear
      default:
        return StatusTransitions.statusChange
    }
  },

  /**
   * Check if reduced motion is preferred
   */
  shouldReduceMotion: () => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  },

  /**
   * Get duration with reduced motion consideration
   */
  getAccessibleDuration: (baseDuration: TransitionDuration): TransitionDuration => {
    if (TransitionUtils.shouldReduceMotion()) {
      return 'fast' // Use fast transitions for accessibility
    }
    return baseDuration
  }
}

// CSS animations for complex effects (to be added to global CSS)
export const CUSTOM_ANIMATIONS = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 5px rgba(59, 130, 246, 0.5); }
  50% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.8), 0 0 30px rgba(59, 130, 246, 0.6); }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}

.animate-glow {
  animation: glow 2s ease-in-out infinite;
}
`

export default TransitionWrapper
