/**
 * Animation Utilities for Glass Components
 * Implements requestAnimationFrame-based animations and FLIP technique
 * for optimal performance with glassmorphism effects
 */

export interface AnimationOptions {
  duration?: number
  easing?: EasingFunction
  onComplete?: () => void
  onUpdate?: (progress: number) => void
}

export interface FLIPConfig {
  element: HTMLElement
  duration?: number
  easing?: EasingFunction
  onComplete?: () => void
}

export type EasingFunction = (t: number) => number

// Optimized easing functions
export const Easing = {
  linear: (t: number) => t,
  easeInOut: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeOut: (t: number) => t * (2 - t),
  easeIn: (t: number) => t * t,
  elastic: (t: number) => {
    if (t === 0 || t === 1) return t
    const p = 0.3
    const s = p / 4
    return -(Math.pow(2, 10 * (t -= 1)) * Math.sin(((t - s) * (2 * Math.PI)) / p))
  },
  bounce: (t: number) => {
    if (t < 1 / 2.75) return 7.5625 * t * t
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375
  }
}

/**
 * Performance-optimized animation runner using requestAnimationFrame
 */
export class AnimationRunner {
  private static instance: AnimationRunner
  private activeAnimations = new Map<string, Animation>()
  private rafId: number | null = null

  static getInstance(): AnimationRunner {
    if (!AnimationRunner.instance) {
      AnimationRunner.instance = new AnimationRunner()
    }
    return AnimationRunner.instance
  }

  /**
   * Animate a property using requestAnimationFrame
   */
  animate(id: string, from: number, to: number, options: AnimationOptions = {}): Promise<void> {
    const {duration = 300, easing = Easing.easeInOut, onComplete, onUpdate} = options

    // Cancel existing animation with same ID
    this.cancel(id)

    return new Promise<void>(resolve => {
      const animation: Animation = {
        id,
        startTime: performance.now(),
        duration,
        from,
        to,
        easing,
        onUpdate,
        onComplete: () => {
          onComplete?.()
          resolve()
        }
      }

      this.activeAnimations.set(id, animation)
      this.startLoop()
    })
  }

  /**
   * Cancel a specific animation
   */
  cancel(id: string): void {
    this.activeAnimations.delete(id)
    if (this.activeAnimations.size === 0) {
      this.stopLoop()
    }
  }

  /**
   * Cancel all animations
   */
  cancelAll(): void {
    this.activeAnimations.clear()
    this.stopLoop()
  }

  private startLoop(): void {
    if (this.rafId === null) {
      this.tick()
    }
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private tick = (): void => {
    const currentTime = performance.now()
    const completedAnimations: string[] = []

    for (const [id, animation] of this.activeAnimations) {
      const elapsed = currentTime - animation.startTime
      const progress = Math.min(elapsed / animation.duration, 1)
      const easedProgress = animation.easing(progress)
      const value = animation.from + (animation.to - animation.from) * easedProgress

      animation.onUpdate?.(value)

      if (progress >= 1) {
        completedAnimations.push(id)
        animation.onComplete?.()
      }
    }

    // Remove completed animations
    completedAnimations.forEach(id => this.activeAnimations.delete(id))

    // Continue loop if animations remain
    if (this.activeAnimations.size > 0) {
      this.rafId = requestAnimationFrame(this.tick)
    } else {
      this.rafId = null
    }
  }
}

interface Animation {
  id: string
  startTime: number
  duration: number
  from: number
  to: number
  easing: EasingFunction
  onUpdate?: (value: number) => void
  onComplete?: () => void
}

/**
 * FLIP (First, Last, Invert, Play) animation utility
 * Optimizes layout animations by calculating differences and using transforms
 */
export class FLIPAnimator {
  /**
   * Perform FLIP animation on an element
   */
  static animate(config: FLIPConfig): Promise<void> {
    const {element, duration = 300, easing = Easing.easeInOut, onComplete} = config

    return new Promise<void>(resolve => {
      // First: Record initial position
      const first = element.getBoundingClientRect()

      // Apply any DOM changes that trigger layout
      // (This should be done by the caller before calling this method)

      // Last: Record final position
      const last = element.getBoundingClientRect()

      // Invert: Calculate the difference and apply inverse transform
      const deltaX = first.left - last.left
      const deltaY = first.top - last.top
      const deltaW = first.width / last.width
      const deltaH = first.height / last.height

      // Apply inverse transform instantly (no transition)
      element.style.transform = `
        translate(${deltaX}px, ${deltaY}px)
        scale(${deltaW}, ${deltaH})
      `
      element.style.transformOrigin = 'top left'

      // Play: Animate back to normal
      const runner = AnimationRunner.getInstance()

      runner.animate(`flip-${element.id || Math.random()}`, 0, 1, {
        duration,
        easing,
        onUpdate: progress => {
          const currentDeltaX = deltaX * (1 - progress)
          const currentDeltaY = deltaY * (1 - progress)
          const currentScaleX = deltaW + (1 - deltaW) * progress
          const currentScaleY = deltaH + (1 - deltaH) * progress

          element.style.transform = `
              translate(${currentDeltaX}px, ${currentDeltaY}px)
              scale(${currentScaleX}, ${currentScaleY})
            `
        },
        onComplete: () => {
          // Reset transform
          element.style.transform = ''
          element.style.transformOrigin = ''
          onComplete?.()
          resolve()
        }
      })
    })
  }
}

/**
 * Optimized glass effect animations with hardware acceleration
 */
export class GlassAnimations {
  private static runner = AnimationRunner.getInstance()

  /**
   * Animate glass opacity with hardware acceleration
   */
  static fadeIn(element: HTMLElement, options: AnimationOptions = {}): Promise<void> {
    const {duration = 300, easing = Easing.easeOut} = options

    // Ensure hardware acceleration
    element.style.willChange = 'opacity'
    element.style.transform = 'translateZ(0)'

    return this.runner.animate(`fade-in-${element.id || Math.random()}`, 0, 1, {
      ...options,
      duration,
      easing,
      onUpdate: value => {
        element.style.opacity = value.toString()
      },
      onComplete: () => {
        element.style.willChange = 'auto'
        options.onComplete?.()
      }
    })
  }

  /**
   * Animate glass blur effect
   */
  static animateBlur(
    element: HTMLElement,
    fromBlur: number,
    toBlur: number,
    options: AnimationOptions = {}
  ): Promise<void> {
    const {duration = 300, easing = Easing.easeInOut} = options

    element.style.willChange = 'backdrop-filter'

    return this.runner.animate(`blur-${element.id || Math.random()}`, fromBlur, toBlur, {
      ...options,
      duration,
      easing,
      onUpdate: value => {
        element.style.backdropFilter = `blur(${value}px)`
        const style = element.style as CSSStyleDeclaration & {webkitBackdropFilter?: string}
        style.webkitBackdropFilter = `blur(${value}px)`
      },
      onComplete: () => {
        element.style.willChange = 'auto'
        options.onComplete?.()
      }
    })
  }

  /**
   * Optimized scale animation for glass components
   */
  static scale(
    element: HTMLElement,
    fromScale: number,
    toScale: number,
    options: AnimationOptions = {}
  ): Promise<void> {
    const {duration = 200, easing = Easing.easeOut} = options

    element.style.willChange = 'transform'
    element.style.transformOrigin = 'center'

    return this.runner.animate(`scale-${element.id || Math.random()}`, fromScale, toScale, {
      ...options,
      duration,
      easing,
      onUpdate: value => {
        element.style.transform = `scale(${value}) translateZ(0)`
      },
      onComplete: () => {
        element.style.willChange = 'auto'
        options.onComplete?.()
      }
    })
  }

  /**
   * Slide animation for glass panels
   */
  static slideIn(
    element: HTMLElement,
    direction: 'up' | 'down' | 'left' | 'right' = 'up',
    distance: number = 20,
    options: AnimationOptions = {}
  ): Promise<void> {
    const {duration = 400, easing = Easing.easeOut} = options

    element.style.willChange = 'transform, opacity'

    const getTransform = (progress: number) => {
      const currentDistance = distance * (1 - progress)
      const opacity = progress

      let translateValue = ''
      switch (direction) {
        case 'up':
          translateValue = `translateY(${currentDistance}px)`
          break
        case 'down':
          translateValue = `translateY(-${currentDistance}px)`
          break
        case 'left':
          translateValue = `translateX(${currentDistance}px)`
          break
        case 'right':
          translateValue = `translateX(-${currentDistance}px)`
          break
      }

      element.style.transform = `${translateValue} translateZ(0)`
      element.style.opacity = opacity.toString()
    }

    // Set initial state
    getTransform(0)

    return this.runner.animate(`slide-in-${element.id || Math.random()}`, 0, 1, {
      ...options,
      duration,
      easing,
      onUpdate: getTransform,
      onComplete: () => {
        element.style.willChange = 'auto'
        element.style.transform = 'translateZ(0)'
        element.style.opacity = '1'
        options.onComplete?.()
      }
    })
  }
}

/**
 * Animation batching utility to minimize layout thrashing
 */
export class AnimationBatcher {
  private static pendingReads: (() => void)[] = []
  private static pendingWrites: (() => void)[] = []
  private static isFlushPending = false

  /**
   * Schedule a DOM read operation
   */
  static read(fn: () => void): void {
    this.pendingReads.push(fn)
    this.scheduleFlush()
  }

  /**
   * Schedule a DOM write operation
   */
  static write(fn: () => void): void {
    this.pendingWrites.push(fn)
    this.scheduleFlush()
  }

  private static scheduleFlush(): void {
    if (!this.isFlushPending) {
      this.isFlushPending = true
      requestAnimationFrame(this.flush)
    }
  }

  private static flush = (): void => {
    // Execute all reads first
    while (this.pendingReads.length > 0) {
      const readFn = this.pendingReads.shift()
      readFn?.()
    }

    // Then execute all writes
    while (this.pendingWrites.length > 0) {
      const writeFn = this.pendingWrites.shift()
      writeFn?.()
    }

    this.isFlushPending = false
  }
}

/**
 * Performance monitoring for animations
 */
export class AnimationPerformanceMonitor {
  private static instance: AnimationPerformanceMonitor
  private frameCount = 0
  private lastTime = 0
  private fps = 0
  private isMonitoring = false

  static getInstance(): AnimationPerformanceMonitor {
    if (!AnimationPerformanceMonitor.instance) {
      AnimationPerformanceMonitor.instance = new AnimationPerformanceMonitor()
    }
    return AnimationPerformanceMonitor.instance
  }

  startMonitoring(): void {
    if (this.isMonitoring) return

    this.isMonitoring = true
    this.frameCount = 0
    this.lastTime = performance.now()
    this.tick()
  }

  stopMonitoring(): void {
    this.isMonitoring = false
  }

  getFPS(): number {
    return this.fps
  }

  private tick = (): void => {
    if (!this.isMonitoring) return

    this.frameCount++
    const currentTime = performance.now()

    if (currentTime >= this.lastTime + 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime))
      this.frameCount = 0
      this.lastTime = currentTime
    }

    requestAnimationFrame(this.tick)
  }
}

/**
 * Utility function to check if device supports smooth animations
 */
export function supportsHighPerformanceAnimations(): boolean {
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false
  }

  // Basic performance heuristics
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')

  // Check for hardware acceleration support
  const hasWebGL = !!gl
  const hasRAF = typeof requestAnimationFrame !== 'undefined'
  const hasBackdropFilter = CSS.supports('backdrop-filter', 'blur(1px)')

  return hasWebGL && hasRAF && hasBackdropFilter
}

/**
 * Debounced animation helper for high-frequency events
 */
export function createDebouncedAnimation(animationFn: () => void): () => void {
  let timeoutId: number | null = null

  return () => {
    if (timeoutId !== null) {
      cancelAnimationFrame(timeoutId)
    }

    timeoutId = requestAnimationFrame(() => {
      animationFn()
      timeoutId = null
    })
  }
}

export default {
  AnimationRunner,
  FLIPAnimator,
  GlassAnimations,
  AnimationBatcher,
  AnimationPerformanceMonitor,
  Easing,
  supportsHighPerformanceAnimations,
  createDebouncedAnimation
}
