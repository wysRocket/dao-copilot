/**
 * React hooks for optimized glass animations
 * Provides easy-to-use animation utilities for glass components
 */

import {useRef, useEffect, useCallback} from 'react'
import {
  GlassAnimations,
  FLIPAnimator,
  AnimationBatcher,
  Easing,
  type EasingFunction,
  supportsHighPerformanceAnimations,
  createDebouncedAnimation
} from '../utils/animations'

export interface UseGlassAnimationOptions {
  enabled?: boolean
  respectReducedMotion?: boolean
  fallbackDuration?: number
}

/**
 * Hook for glass component entrance animations
 */
export function useGlassEntrance(
  options: UseGlassAnimationOptions & {
    direction?: 'up' | 'down' | 'left' | 'right'
    distance?: number
    duration?: number
    easing?: EasingFunction
    delay?: number
  } = {}
) {
  const elementRef = useRef<HTMLElement>(null)
  const hasAnimated = useRef(false)

  const {
    enabled = true,
    respectReducedMotion = true,
    direction = 'up',
    distance = 20,
    duration = 400,
    easing = Easing.easeOut,
    delay = 0
  } = options

  const animate = useCallback(async () => {
    if (!elementRef.current || hasAnimated.current || !enabled) return

    // Check for reduced motion preference
    if (respectReducedMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    // Check device performance capabilities
    if (!supportsHighPerformanceAnimations()) {
      return
    }

    hasAnimated.current = true

    // Add delay if specified
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    await GlassAnimations.slideIn(elementRef.current, direction, distance, {
      duration,
      easing
    })
  }, [enabled, respectReducedMotion, direction, distance, duration, easing, delay])

  // Auto-animate when component mounts
  useEffect(() => {
    const timeoutId = setTimeout(animate, 16) // Wait for next frame
    return () => clearTimeout(timeoutId)
  }, [animate])

  return {
    ref: elementRef,
    animate,
    reset: () => {
      hasAnimated.current = false
    }
  }
}

/**
 * Hook for interactive glass animations (hover, focus, etc.)
 */
export function useGlassInteractive(
  options: UseGlassAnimationOptions & {
    scaleOnHover?: boolean
    blurOnHover?: boolean
    hoverScale?: number
    hoverBlur?: number
    duration?: number
  } = {}
) {
  const elementRef = useRef<HTMLElement>(null)
  const isHovered = useRef(false)

  const {
    enabled = true,
    respectReducedMotion = true,
    scaleOnHover = true,
    blurOnHover = false,
    hoverScale = 1.02,
    hoverBlur = 15,
    duration = 200
  } = options

  const onMouseEnter = useCallback(async () => {
    if (!elementRef.current || !enabled || isHovered.current) return

    if (respectReducedMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    isHovered.current = true

    const promises: Promise<void>[] = []

    if (scaleOnHover) {
      promises.push(GlassAnimations.scale(elementRef.current, 1, hoverScale, {duration}))
    }

    if (blurOnHover) {
      promises.push(GlassAnimations.animateBlur(elementRef.current, 12, hoverBlur, {duration}))
    }

    await Promise.all(promises)
  }, [enabled, respectReducedMotion, scaleOnHover, blurOnHover, hoverScale, hoverBlur, duration])

  const onMouseLeave = useCallback(async () => {
    if (!elementRef.current || !enabled || !isHovered.current) return

    isHovered.current = false

    const promises: Promise<void>[] = []

    if (scaleOnHover) {
      promises.push(GlassAnimations.scale(elementRef.current, hoverScale, 1, {duration}))
    }

    if (blurOnHover) {
      promises.push(GlassAnimations.animateBlur(elementRef.current, hoverBlur, 12, {duration}))
    }

    await Promise.all(promises)
  }, [enabled, respectReducedMotion, scaleOnHover, blurOnHover, hoverScale, hoverBlur, duration])

  return {
    ref: elementRef,
    onMouseEnter,
    onMouseLeave,
    eventHandlers: {
      onMouseEnter,
      onMouseLeave
    }
  }
}

/**
 * Hook for FLIP animations when layout changes
 */
export function useGlassFLIP(
  options: UseGlassAnimationOptions & {
    duration?: number
    easing?: EasingFunction
  } = {}
) {
  const elementRef = useRef<HTMLElement>(null)

  const {
    enabled = true,
    respectReducedMotion = true,
    duration = 300,
    easing = Easing.easeInOut
  } = options

  const animate = useCallback(async () => {
    if (!elementRef.current || !enabled) return

    if (respectReducedMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    if (!supportsHighPerformanceAnimations()) {
      return
    }

    await FLIPAnimator.animate({
      element: elementRef.current,
      duration,
      easing
    })
  }, [enabled, respectReducedMotion, duration, easing])

  return {
    ref: elementRef,
    animate
  }
}

/**
 * Hook for batched DOM operations to prevent layout thrashing
 */
export function useAnimationBatcher() {
  const read = useCallback((fn: () => void) => {
    AnimationBatcher.read(fn)
  }, [])

  const write = useCallback((fn: () => void) => {
    AnimationBatcher.write(fn)
  }, [])

  const batch = useCallback(
    (operations: {reads?: (() => void)[]; writes?: (() => void)[]}) => {
      const {reads = [], writes = []} = operations

      reads.forEach(read)
      writes.forEach(write)
    },
    [read, write]
  )

  return {read, write, batch}
}

/**
 * Hook for scroll-triggered glass animations
 */
export function useGlassScrollAnimation(
  options: UseGlassAnimationOptions & {
    threshold?: number
    rootMargin?: string
    direction?: 'up' | 'down' | 'left' | 'right'
    distance?: number
    duration?: number
    staggerDelay?: number
  } = {}
) {
  const elementRef = useRef<HTMLElement>(null)
  const hasAnimated = useRef(false)

  const {
    enabled = true,
    respectReducedMotion = true,
    threshold = 0.1,
    rootMargin = '0px',
    direction = 'up',
    distance = 30,
    duration = 500,
    staggerDelay = 0
  } = options

  useEffect(() => {
    if (!elementRef.current || !enabled || hasAnimated.current) return

    if (respectReducedMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    if (!supportsHighPerformanceAnimations()) {
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !hasAnimated.current) {
            hasAnimated.current = true

            setTimeout(async () => {
              if (elementRef.current) {
                await GlassAnimations.slideIn(elementRef.current, direction, distance, {
                  duration,
                  easing: Easing.easeOut
                })
              }
            }, staggerDelay)
          }
        })
      },
      {threshold, rootMargin}
    )

    observer.observe(elementRef.current)

    return () => {
      observer.disconnect()
    }
  }, [
    enabled,
    respectReducedMotion,
    threshold,
    rootMargin,
    direction,
    distance,
    duration,
    staggerDelay
  ])

  return {
    ref: elementRef,
    reset: () => {
      hasAnimated.current = false
    }
  }
}

/**
 * Hook for performance-optimized list animations
 */
export function useGlassListAnimation(
  items: unknown[],
  options: UseGlassAnimationOptions & {
    staggerDelay?: number
    maxConcurrent?: number
  } = {}
) {
  const listRef = useRef<HTMLElement>(null)
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map())

  const {
    enabled = true,
    respectReducedMotion = true,
    staggerDelay = 50,
    maxConcurrent = 5
  } = options

  const animateItems = useCallback(async () => {
    if (!enabled || !listRef.current) return

    if (respectReducedMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    if (!supportsHighPerformanceAnimations()) {
      return
    }

    const itemElements = Array.from(itemRefs.current.values())

    // Animate in batches to prevent performance issues
    for (let i = 0; i < itemElements.length; i += maxConcurrent) {
      const batch = itemElements.slice(i, i + maxConcurrent)

      const promises = batch.map((element, index) => {
        return new Promise<void>(resolve => {
          setTimeout(async () => {
            await GlassAnimations.slideIn(element, 'up', 20, {
              duration: 300,
              easing: Easing.easeOut
            })
            resolve()
          }, index * staggerDelay)
        })
      })

      await Promise.all(promises)
    }
  }, [enabled, respectReducedMotion, staggerDelay, maxConcurrent])

  const setItemRef = useCallback(
    (index: number) => (element: HTMLElement | null) => {
      if (element) {
        itemRefs.current.set(index, element)
      } else {
        itemRefs.current.delete(index)
      }
    },
    []
  )

  // Auto-animate when items change
  useEffect(() => {
    const timeoutId = setTimeout(animateItems, 16)
    return () => clearTimeout(timeoutId)
  }, [items.length, animateItems])

  return {
    listRef,
    setItemRef,
    animateItems
  }
}

/**
 * Hook for debounced animations on high-frequency events
 */
export function useDebouncedGlassAnimation(
  animationFn: () => void | Promise<void>,
  enabled: boolean = true
) {
  const debouncedAnimation = useRef(createDebouncedAnimation(animationFn))

  useEffect(() => {
    debouncedAnimation.current = createDebouncedAnimation(animationFn)
  }, [animationFn])

  const trigger = useCallback(() => {
    if (enabled) {
      debouncedAnimation.current()
    }
  }, [enabled])

  return trigger
}

/**
 * Hook for tracking animation performance
 */
export function useAnimationPerformance() {
  const frameTimeRef = useRef<number[]>([])
  const isMonitoring = useRef(false)

  const startMonitoring = useCallback(() => {
    if (isMonitoring.current) return

    isMonitoring.current = true
    frameTimeRef.current = []

    const monitor = () => {
      if (!isMonitoring.current) return

      const now = performance.now()
      frameTimeRef.current.push(now)

      // Keep only last 60 frames
      if (frameTimeRef.current.length > 60) {
        frameTimeRef.current.shift()
      }

      requestAnimationFrame(monitor)
    }

    monitor()
  }, [])

  const stopMonitoring = useCallback(() => {
    isMonitoring.current = false
  }, [])

  const getMetrics = useCallback(() => {
    if (frameTimeRef.current.length < 2) {
      return {fps: 0, averageFrameTime: 0, jankCount: 0}
    }

    const frameTimes: number[] = []
    for (let i = 1; i < frameTimeRef.current.length; i++) {
      frameTimes.push(frameTimeRef.current[i] - frameTimeRef.current[i - 1])
    }

    const averageFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
    const fps = Math.round(1000 / averageFrameTime)
    const jankCount = frameTimes.filter(time => time > 16.67).length // 60fps threshold

    return {fps, averageFrameTime, jankCount}
  }, [])

  return {
    startMonitoring,
    stopMonitoring,
    getMetrics,
    isMonitoring: () => isMonitoring.current
  }
}
