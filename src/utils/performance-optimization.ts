import React from 'react'

/**
 * Performance optimization utilities for streaming text components
 */

/**
 * Props comparison function for React.memo optimization
 */
export const shallowEqual = <T extends Record<string, unknown>>(
  prevProps: T,
  nextProps: T
): boolean => {
  const prevKeys = Object.keys(prevProps)
  const nextKeys = Object.keys(nextProps)

  if (prevKeys.length !== nextKeys.length) {
    return false
  }

  for (const key of prevKeys) {
    if (prevProps[key] !== nextProps[key]) {
      return false
    }
  }

  return true
}

/**
 * Deep comparison for complex objects (use sparingly)
 */
export const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true

  if (a == null || b == null) return false

  if (typeof a !== typeof b) return false

  if (typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false
      }
      return true
    }

    const keysA = Object.keys(a as Record<string, unknown>)
    const keysB = Object.keys(b as Record<string, unknown>)

    if (keysA.length !== keysB.length) return false

    for (const key of keysA) {
      if (!keysB.includes(key)) return false
      if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
        return false
    }

    return true
  }

  return false
}

/**
 * Optimized memo HOC with custom comparison
 */
export const optimizedMemo = <P extends object>(
  Component: React.ComponentType<P>,
  areEqual?: (prevProps: P, nextProps: P) => boolean
) => {
  return React.memo(Component, areEqual || shallowEqual)
}

/**
 * Performance-optimized memo for streaming text components
 */
export const streamingMemo = <P extends {text?: string; isPartial?: boolean}>(
  Component: React.ComponentType<P>
) => {
  return React.memo(Component, (prevProps, nextProps) => {
    // Special handling for streaming text properties
    if (prevProps.text !== nextProps.text) return false
    if (prevProps.isPartial !== nextProps.isPartial) return false

    // Use shallow comparison for other props
    return shallowEqual(prevProps as Record<string, unknown>, nextProps as Record<string, unknown>)
  })
}

/**
 * Batched state updates utility
 */
export class StateBatcher {
  private updates: Array<() => void> = []
  private isScheduled = false

  public batch(updateFn: () => void): void {
    this.updates.push(updateFn)

    if (!this.isScheduled) {
      this.isScheduled = true

      // Use React's unstable_batchedUpdates if available, otherwise use setTimeout
      if ('unstable_batchedUpdates' in React) {
        const ReactWithBatch = React as {unstable_batchedUpdates?: (fn: () => void) => void}
        if (typeof ReactWithBatch.unstable_batchedUpdates === 'function') {
          ReactWithBatch.unstable_batchedUpdates(() => {
            this.flushUpdates()
          })
        } else {
          setTimeout(() => {
            this.flushUpdates()
          }, 0)
        }
      } else {
        setTimeout(() => {
          this.flushUpdates()
        }, 0)
      }
    }
  }

  private flushUpdates(): void {
    const updates = this.updates.splice(0)
    this.isScheduled = false

    updates.forEach(update => update())
  }
}

/**
 * Animation frame batching utility
 */
export class AnimationBatcher {
  private callbacks: Array<() => void> = []
  private isScheduled = false

  public schedule(callback: () => void): void {
    this.callbacks.push(callback)

    if (!this.isScheduled) {
      this.isScheduled = true
      requestAnimationFrame(() => {
        this.flush()
      })
    }
  }

  private flush(): void {
    const callbacks = this.callbacks.splice(0)
    this.isScheduled = false

    callbacks.forEach(callback => callback())
  }

  public cancel(): void {
    this.callbacks = []
    this.isScheduled = false
  }
}

/**
 * Debounced function utility
 */
export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      func(...args)
    }, delay)
  }
}

/**
 * Throttled function utility
 */
export const throttle = <T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let lastExecution = 0
  let timeoutId: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    const now = Date.now()

    if (now - lastExecution >= delay) {
      lastExecution = now
      func(...args)
    } else if (!timeoutId) {
      timeoutId = setTimeout(
        () => {
          lastExecution = Date.now()
          timeoutId = null
          func(...args)
        },
        delay - (now - lastExecution)
      )
    }
  }
}

/**
 * Intersection Observer utility for performance
 */
export class IntersectionObserverManager {
  private observer: IntersectionObserver | null = null
  private callbacks = new Map<Element, (isVisible: boolean) => void>()

  constructor(options?: IntersectionObserverInit) {
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            const callback = this.callbacks.get(entry.target)
            if (callback) {
              callback(entry.isIntersecting)
            }
          })
        },
        {
          threshold: 0.1,
          rootMargin: '50px',
          ...options
        }
      )
    }
  }

  public observe(element: Element, callback: (isVisible: boolean) => void): void {
    if (!this.observer) return

    this.callbacks.set(element, callback)
    this.observer.observe(element)
  }

  public unobserve(element: Element): void {
    if (!this.observer) return

    this.callbacks.delete(element)
    this.observer.unobserve(element)
  }

  public disconnect(): void {
    if (this.observer) {
      this.observer.disconnect()
      this.callbacks.clear()
    }
  }
}

/**
 * Memory management utilities
 */
export class MemoryManager {
  private static instance: MemoryManager | null = null
  private cleanupCallbacks: Array<() => void> = []

  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager()
    }
    return MemoryManager.instance
  }

  public addCleanupCallback(callback: () => void): () => void {
    this.cleanupCallbacks.push(callback)

    // Return function to remove the callback
    return () => {
      const index = this.cleanupCallbacks.indexOf(callback)
      if (index > -1) {
        this.cleanupCallbacks.splice(index, 1)
      }
    }
  }

  public cleanup(): void {
    this.cleanupCallbacks.forEach(callback => {
      try {
        callback()
      } catch (error) {
        console.warn('Error during cleanup:', error)
      }
    })
  }

  public getMemoryUsage(): number {
    if ('memory' in performance) {
      const memInfo = (performance as {memory?: {usedJSHeapSize: number}}).memory
      if (memInfo?.usedJSHeapSize) {
        return Math.round((memInfo.usedJSHeapSize / 1024 / 1024) * 100) / 100
      }
    }
    return 0
  }

  public triggerGC(): void {
    const windowWithGC = window as {gc?: () => void}
    if ('gc' in window && typeof windowWithGC.gc === 'function') {
      windowWithGC.gc()
    }
  }
}

/**
 * Virtual list utilities for large datasets
 */
export interface VirtualListItem {
  id: string | number
  height: number
  data: unknown
}

export interface VirtualListRange {
  startIndex: number
  endIndex: number
  visibleItems: VirtualListItem[]
}

export const calculateVirtualListRange = (
  items: VirtualListItem[],
  containerHeight: number,
  scrollTop: number,
  overscan: number = 5
): VirtualListRange => {
  if (items.length === 0) {
    return {startIndex: 0, endIndex: 0, visibleItems: []}
  }

  let totalHeight = 0
  let startIndex = 0
  let endIndex = 0

  // Find start index
  for (let i = 0; i < items.length; i++) {
    if (totalHeight + items[i].height > scrollTop) {
      startIndex = Math.max(0, i - overscan)
      break
    }
    totalHeight += items[i].height
  }

  // Find end index
  let visibleHeight = 0
  for (let i = startIndex; i < items.length; i++) {
    visibleHeight += items[i].height
    if (visibleHeight >= containerHeight + (overscan * 2 * items[0]?.height || 50)) {
      endIndex = Math.min(items.length - 1, i + overscan)
      break
    }
  }

  if (endIndex === 0) {
    endIndex = items.length - 1
  }

  const visibleItems = items.slice(startIndex, endIndex + 1)

  return {startIndex, endIndex, visibleItems}
}

/**
 * Web Worker utilities for offloading processing
 */
export class WorkerManager {
  private workers: Map<string, Worker> = new Map()

  public createWorker(name: string, script: string): Worker | null {
    try {
      const blob = new Blob([script], {type: 'application/javascript'})
      const workerUrl = URL.createObjectURL(blob)
      const worker = new Worker(workerUrl)

      this.workers.set(name, worker)

      // Cleanup URL after worker is created
      worker.addEventListener(
        'message',
        () => {
          URL.revokeObjectURL(workerUrl)
        },
        {once: true}
      )

      return worker
    } catch (error) {
      console.warn('Failed to create worker:', error)
      return null
    }
  }

  public getWorker(name: string): Worker | undefined {
    return this.workers.get(name)
  }

  public terminateWorker(name: string): void {
    const worker = this.workers.get(name)
    if (worker) {
      worker.terminate()
      this.workers.delete(name)
    }
  }

  public terminateAll(): void {
    this.workers.forEach(worker => {
      worker.terminate()
    })
    this.workers.clear()
  }
}

/**
 * CSS optimization utilities
 */
export const optimizeForAnimations = (element: HTMLElement): void => {
  element.style.willChange = 'transform, opacity'
  element.style.backfaceVisibility = 'hidden'
  element.style.transform = 'translateZ(0)' // Force hardware acceleration
}

export const removeAnimationOptimizations = (element: HTMLElement): void => {
  element.style.willChange = ''
  element.style.backfaceVisibility = ''
  element.style.transform = ''
}

/**
 * Performance monitoring utilities
 */
export const measurePerformance = async <T>(name: string, fn: () => T | Promise<T>): Promise<T> => {
  const start = performance.now()

  try {
    const result = await fn()
    const end = performance.now()
    const duration = end - start

    console.log(`Performance [${name}]: ${duration.toFixed(2)}ms`)

    if (duration > 16) {
      // > 60fps threshold
      console.warn(`Performance Warning [${name}]: ${duration.toFixed(2)}ms exceeds 16ms threshold`)
    }

    return result
  } catch (error) {
    const end = performance.now()
    const duration = end - start
    console.error(`Performance Error [${name}]: ${duration.toFixed(2)}ms - Error:`, error)
    throw error
  }
}

/**
 * Global performance optimization setup
 */
export const initializePerformanceOptimizations = (): (() => void) => {
  const memoryManager = MemoryManager.getInstance()

  // Setup periodic cleanup
  const cleanupInterval = setInterval(() => {
    memoryManager.cleanup()
  }, 30000) // Every 30 seconds

  // Setup memory monitoring
  const memoryInterval = setInterval(() => {
    const usage = memoryManager.getMemoryUsage()
    if (usage > 100) {
      // More than 100MB
      console.warn(`High memory usage detected: ${usage}MB`)
      memoryManager.triggerGC()
    }
  }, 10000) // Every 10 seconds

  // Return cleanup function
  return () => {
    clearInterval(cleanupInterval)
    clearInterval(memoryInterval)
    memoryManager.cleanup()
  }
}
