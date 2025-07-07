/**
 * Memory Management Utilities for Glass Components
 *
 * Provides utilities for optimizing memory usage in glassmorphism components including:
 * - Lazy loading with Intersection Observer
 * - Resource cleanup and disposal
 * - Memory usage monitoring
 * - Component lifecycle management
 */

import {useEffect, useRef, useState, useCallback} from 'react'

// Memory API interface for performance.memory
interface MemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
  usedPercentage?: number
  isMemoryHigh?: boolean
}

// Extend Performance interface to include memory
interface PerformanceWithMemory extends Performance {
  memory?: MemoryInfo
}

// Memory management configuration
export interface MemoryManagementConfig {
  // Lazy loading thresholds
  rootMargin: string
  threshold: number | number[]

  // Resource cleanup settings
  cleanupDelay: number
  enableAutoCleanup: boolean

  // Memory monitoring
  memoryCheckInterval: number
  enableMemoryMonitoring: boolean
  memoryThreshold: number // MB
}

export const DEFAULT_MEMORY_CONFIG: MemoryManagementConfig = {
  rootMargin: '50px',
  threshold: [0, 0.25, 0.5, 0.75, 1],
  cleanupDelay: 5000, // 5 seconds
  enableAutoCleanup: true,
  memoryCheckInterval: 30000, // 30 seconds
  enableMemoryMonitoring: true,
  memoryThreshold: 100 // 100MB
}

// Intersection Observer hook for lazy loading
export interface LazyLoadHookOptions {
  rootMargin?: string
  threshold?: number | number[]
  once?: boolean
  onIntersect?: (entry: IntersectionObserverEntry) => void
  onExit?: (entry: IntersectionObserverEntry) => void
}

export function useLazyLoad(options: LazyLoadHookOptions = {}) {
  const {
    rootMargin = DEFAULT_MEMORY_CONFIG.rootMargin,
    threshold = 0.1,
    once = true,
    onIntersect,
    onExit
  } = options

  const [isIntersecting, setIsIntersecting] = useState(false)
  const [hasIntersected, setHasIntersected] = useState(false)
  const elementRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    // Create intersection observer
    observerRef.current = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          const isVisible = entry.isIntersecting

          setIsIntersecting(isVisible)

          if (isVisible && !hasIntersected) {
            setHasIntersected(true)
            onIntersect?.(entry)

            // Stop observing if once is true
            if (once && observerRef.current) {
              observerRef.current.unobserve(element)
            }
          } else if (!isVisible && hasIntersected) {
            onExit?.(entry)
          }
        })
      },
      {
        rootMargin,
        threshold
      }
    )

    observerRef.current.observe(element)

    // Cleanup
    return () => {
      if (observerRef.current && element) {
        observerRef.current.unobserve(element)
      }
    }
  }, [rootMargin, threshold, once, hasIntersected, onIntersect, onExit])

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  return {
    ref: elementRef,
    isIntersecting,
    hasIntersected
  }
}

// Resource cleanup hook
export interface ResourceCleanupOptions {
  cleanupDelay?: number
  enableAutoCleanup?: boolean
}

export function useResourceCleanup(
  cleanup: () => void,
  dependencies: React.DependencyList = [],
  options: ResourceCleanupOptions = {}
) {
  const {
    cleanupDelay = DEFAULT_MEMORY_CONFIG.cleanupDelay,
    enableAutoCleanup = DEFAULT_MEMORY_CONFIG.enableAutoCleanup
  } = options

  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const cleanupRef = useRef(cleanup)

  // Update cleanup function reference
  useEffect(() => {
    cleanupRef.current = cleanup
  }, [cleanup])

  // Schedule cleanup when dependencies change
  useEffect(() => {
    if (!enableAutoCleanup) return

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Schedule new cleanup
    timeoutRef.current = setTimeout(() => {
      cleanupRef.current()
    }, cleanupDelay)

    // Cleanup on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, dependencies)

  // Immediate cleanup
  const cleanupNow = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    cleanupRef.current()
  }, [])

  return {cleanupNow}
}

// Memory monitoring hook

export function useMemoryMonitoring(config: Partial<MemoryManagementConfig> = {}) {
  const {
    memoryCheckInterval = DEFAULT_MEMORY_CONFIG.memoryCheckInterval,
    enableMemoryMonitoring = DEFAULT_MEMORY_CONFIG.enableMemoryMonitoring,
    memoryThreshold = DEFAULT_MEMORY_CONFIG.memoryThreshold
  } = config

  const [memoryInfo, setMemoryInfo] = useState<MemoryInfo | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined)

  const getMemoryInfo = useCallback((): MemoryInfo | null => {
    if (!enableMemoryMonitoring) return null

    // Check if performance.memory is available (Chrome only)
    if (typeof performance === 'undefined' || !('memory' in performance)) {
      return null
    }

    const memory = (performance as PerformanceWithMemory).memory
    if (!memory) return null

    const usedMB = memory.usedJSHeapSize / (1024 * 1024)
    const limitMB = memory.jsHeapSizeLimit / (1024 * 1024)
    const usedPercentage = (usedMB / limitMB) * 100

    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usedPercentage,
      isMemoryHigh: usedMB > memoryThreshold
    }
  }, [enableMemoryMonitoring, memoryThreshold])

  useEffect(() => {
    if (!enableMemoryMonitoring) return

    // Initial check
    setMemoryInfo(getMemoryInfo())

    // Set up interval
    intervalRef.current = setInterval(() => {
      setMemoryInfo(getMemoryInfo())
    }, memoryCheckInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [enableMemoryMonitoring, memoryCheckInterval, getMemoryInfo])

  const triggerGarbageCollection = useCallback(() => {
    // Force garbage collection if available (dev tools)
    if (typeof window !== 'undefined' && 'gc' in window) {
      ;(window as Window & {gc?: () => void}).gc?.()
    }
  }, [])

  return {
    memoryInfo,
    triggerGarbageCollection,
    refreshMemoryInfo: () => setMemoryInfo(getMemoryInfo())
  }
}

// Glass component lazy loading wrapper interface
export interface LazyGlassComponentProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  threshold?: number
  rootMargin?: string
  onLoad?: () => void
  onUnload?: () => void
}

// Note: LazyGlassComponent implementation moved to separate component file
// to avoid JSX compilation issues in utility file

// Memory management context
export interface MemoryManagementContext {
  config: MemoryManagementConfig
  memoryInfo: MemoryInfo | null
  triggerCleanup: () => void
  updateConfig: (updates: Partial<MemoryManagementConfig>) => void
}

export class MemoryManager {
  private config: MemoryManagementConfig
  private cleanup: (() => void)[] = []
  private memoryCheckInterval?: NodeJS.Timeout

  constructor(config: Partial<MemoryManagementConfig> = {}) {
    this.config = {...DEFAULT_MEMORY_CONFIG, ...config}
  }

  // Register cleanup function
  registerCleanup(cleanup: () => void): () => void {
    this.cleanup.push(cleanup)

    // Return unregister function
    return () => {
      const index = this.cleanup.indexOf(cleanup)
      if (index > -1) {
        this.cleanup.splice(index, 1)
      }
    }
  }

  // Trigger all cleanup functions
  triggerCleanup(): void {
    this.cleanup.forEach(fn => {
      try {
        fn()
      } catch (error) {
        console.warn('Error during memory cleanup:', error)
      }
    })
  }

  // Start memory monitoring
  startMonitoring(): void {
    if (!this.config.enableMemoryMonitoring) return

    this.memoryCheckInterval = setInterval(() => {
      const memoryInfo = this.getMemoryInfo()
      if (memoryInfo?.isMemoryHigh) {
        console.warn('High memory usage detected, triggering cleanup')
        this.triggerCleanup()
      }
    }, this.config.memoryCheckInterval)
  }

  // Stop memory monitoring
  stopMonitoring(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval)
      this.memoryCheckInterval = undefined
    }
  }

  // Get current memory info
  private getMemoryInfo(): MemoryInfo | null {
    if (typeof performance === 'undefined' || !('memory' in performance)) {
      return null
    }

    const memory = (performance as PerformanceWithMemory).memory
    if (!memory) return null

    const usedMB = memory.usedJSHeapSize / (1024 * 1024)
    const limitMB = memory.jsHeapSizeLimit / (1024 * 1024)
    const usedPercentage = (usedMB / limitMB) * 100

    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usedPercentage,
      isMemoryHigh: usedMB > this.config.memoryThreshold
    }
  }

  // Update configuration
  updateConfig(updates: Partial<MemoryManagementConfig>): void {
    this.config = {...this.config, ...updates}
  }

  // Destroy manager
  destroy(): void {
    this.stopMonitoring()
    this.triggerCleanup()
    this.cleanup = []
  }
}

// Global memory manager instance
export const globalMemoryManager = new MemoryManager()

// Auto-start monitoring in browser environment
if (typeof window !== 'undefined') {
  globalMemoryManager.startMonitoring()
}
