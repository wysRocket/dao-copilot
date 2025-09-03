/**
 * Smooth Transition Wrapper
 * 
 * A component that provides smooth enter/exit transitions with various animation types.
 * Perfect for showing/hiding answer content, search states, and other dynamic content.
 */

import React, { useEffect, useState, useRef } from 'react'
import { cn } from '../utils/tailwind'

export interface SmoothTransitionProps {
  /** Whether to show the children */
  show: boolean
  /** Children to animate */
  children: React.ReactNode
  /** Animation type */
  animation?: 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'scale' | 'flip'
  /** Animation duration in ms */
  duration?: number
  /** Animation easing */
  easing?: 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear'
  /** Delay before animation starts (ms) */
  delay?: number
  /** Custom CSS classes */
  className?: string
  /** Whether to unmount when hidden */
  unmountOnExit?: boolean
  /** Callback when enter animation starts */
  onEnterStart?: () => void
  /** Callback when enter animation completes */
  onEnterComplete?: () => void
  /** Callback when exit animation starts */
  onExitStart?: () => void
  /** Callback when exit animation completes */
  onExitComplete?: () => void
}

type AnimationState = 'entering' | 'entered' | 'exiting' | 'exited'

const SmoothTransition: React.FC<SmoothTransitionProps> = ({
  show,
  children,
  animation = 'fade',
  duration = 300,
  easing = 'ease-in-out',
  delay = 0,
  className,
  unmountOnExit = false,
  onEnterStart,
  onEnterComplete,
  onExitStart,
  onExitComplete
}) => {
  const [animationState, setAnimationState] = useState<AnimationState>(
    show ? 'entered' : 'exited'
  )
  const timeoutRef = useRef<NodeJS.Timeout>()
  const elementRef = useRef<HTMLDivElement>(null)

  // Animation class mappings
  const getAnimationClasses = (state: AnimationState) => {
    const baseTransition = `transition-all duration-${Math.round(duration / 100) * 100}`
    
    switch (animation) {
      case 'fade':
        return {
          entering: `${baseTransition} opacity-0`,
          entered: `${baseTransition} opacity-100`,
          exiting: `${baseTransition} opacity-100`,
          exited: `${baseTransition} opacity-0`
        }[state]

      case 'slide-up':
        return {
          entering: `${baseTransition} translate-y-4 opacity-0`,
          entered: `${baseTransition} translate-y-0 opacity-100`,
          exiting: `${baseTransition} translate-y-0 opacity-100`,
          exited: `${baseTransition} translate-y-4 opacity-0`
        }[state]

      case 'slide-down':
        return {
          entering: `${baseTransition} -translate-y-4 opacity-0`,
          entered: `${baseTransition} translate-y-0 opacity-100`,
          exiting: `${baseTransition} translate-y-0 opacity-100`,
          exited: `${baseTransition} -translate-y-4 opacity-0`
        }[state]

      case 'slide-left':
        return {
          entering: `${baseTransition} translate-x-4 opacity-0`,
          entered: `${baseTransition} translate-x-0 opacity-100`,
          exiting: `${baseTransition} translate-x-0 opacity-100`,
          exited: `${baseTransition} translate-x-4 opacity-0`
        }[state]

      case 'slide-right':
        return {
          entering: `${baseTransition} -translate-x-4 opacity-0`,
          entered: `${baseTransition} translate-x-0 opacity-100`,
          exiting: `${baseTransition} translate-x-0 opacity-100`,
          exited: `${baseTransition} -translate-x-4 opacity-0`
        }[state]

      case 'scale':
        return {
          entering: `${baseTransition} scale-95 opacity-0`,
          entered: `${baseTransition} scale-100 opacity-100`,
          exiting: `${baseTransition} scale-100 opacity-100`,
          exited: `${baseTransition} scale-95 opacity-0`
        }[state]

      case 'flip':
        return {
          entering: `${baseTransition} rotate-y-90 opacity-0`,
          entered: `${baseTransition} rotate-y-0 opacity-100`,
          exiting: `${baseTransition} rotate-y-0 opacity-100`,
          exited: `${baseTransition} rotate-y-90 opacity-0`
        }[state]

      default:
        return baseTransition
    }
  }

  // Handle show/hide transitions
  useEffect(() => {
    // Clear any existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    if (show) {
      // Show animation sequence
      if (animationState === 'exited') {
        // Start enter animation
        setAnimationState('entering')
        onEnterStart?.()
        
        timeoutRef.current = setTimeout(() => {
          setAnimationState('entered')
          onEnterComplete?.()
        }, delay + duration)
      }
    } else {
      // Hide animation sequence
      if (animationState === 'entered' || animationState === 'entering') {
        // Start exit animation
        setAnimationState('exiting')
        onExitStart?.()
        
        timeoutRef.current = setTimeout(() => {
          setAnimationState('exited')
          onExitComplete?.()
        }, delay + duration)
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [show, duration, delay, animationState, onEnterStart, onEnterComplete, onExitStart, onExitComplete])

  // Don't render if exited and unmountOnExit is true
  if (animationState === 'exited' && unmountOnExit) {
    return null
  }

  // Custom CSS properties for advanced animations
  const customStyles = {
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: easing,
    transitionDelay: `${delay}ms`
  }

  return (
    <div
      ref={elementRef}
      className={cn(
        getAnimationClasses(animationState),
        className,
        // Hide visually but keep in DOM when exited and not unmounting
        animationState === 'exited' && !unmountOnExit && 'sr-only'
      )}
      style={customStyles}
      aria-hidden={animationState === 'exited' || animationState === 'exiting'}
    >
      {children}
    </div>
  )
}

export default SmoothTransition

// Helper hook for managing multiple transitions
export const useTransitionGroup = (items: Array<{ key: string; show: boolean }>) => {
  const [visibleItems, setVisibleItems] = useState<Set<string>>(new Set())

  useEffect(() => {
    const newVisibleItems = new Set<string>()
    items.forEach(item => {
      if (item.show) {
        newVisibleItems.add(item.key)
      }
    })
    setVisibleItems(newVisibleItems)
  }, [items])

  return visibleItems
}

// Pre-configured transition components for common use cases
export const FadeTransition: React.FC<Omit<SmoothTransitionProps, 'animation'>> = (props) => (
  <SmoothTransition {...props} animation="fade" />
)

export const SlideUpTransition: React.FC<Omit<SmoothTransitionProps, 'animation'>> = (props) => (
  <SmoothTransition {...props} animation="slide-up" />
)

export const ScaleTransition: React.FC<Omit<SmoothTransitionProps, 'animation'>> = (props) => (
  <SmoothTransition {...props} animation="scale" />
)