/**
 * React Optimization Hooks
 * Advanced hooks for performance optimization in React components
 */

import {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useState,
  DependencyList,
  EffectCallback,
  MutableRefObject
} from 'react'
import {
  usePerformanceScheduler,
  useThrottledUpdate,
  useDebouncedUpdate,
  TaskPriority
} from './react-performance-scheduler'

// Deep comparison for objects and arrays
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }

  if (!a || !b || (typeof a !== 'object' && typeof b !== 'object')) {
    return a === b
  }

  if (a === null || a === undefined || b === null || b === undefined) {
    return false
  }

  if (a.prototype !== b.prototype) return false

  let keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) {
    return false
  }

  return keys.every(k => deepEqual(a[k], b[k]))
}

// Hook for stable references with deep comparison
export const useDeepMemo = <T>(factory: () => T, deps: DependencyList): T => {
  const ref = useRef<{deps: DependencyList; value: T}>()

  if (!ref.current || !deepEqual(ref.current.deps, deps)) {
    ref.current = {
      deps,
      value: factory()
    }
  }

  return ref.current.value
}

// Hook for stable callbacks with deep dependency comparison
export const useDeepCallback = <T extends (...args: any[]) => any>(
  callback: T,
  deps: DependencyList
): T => {
  return useDeepMemo(() => callback, deps)
}

// Hook for expensive computations with intelligent caching
export const useExpensiveComputation = <T, D extends DependencyList>(
  computeFn: () => T,
  deps: D,
  options: {
    priority?: TaskPriority
    timeout?: number
    enablePersistence?: boolean
    cacheKey?: string
  } = {}
): {value: T | undefined; isComputing: boolean; error: Error | null} => {
  const {
    priority = TaskPriority.NORMAL,
    timeout = 5000,
    enablePersistence = false,
    cacheKey
  } = options

  const [result, setResult] = useState<{
    value: T | undefined
    isComputing: boolean
    error: Error | null
  }>({
    value: undefined,
    isComputing: false,
    error: null
  })

  const lastDeps = useRef<D>()
  const computationId = useRef<string | null>(null)
  const {schedule, cancel} = usePerformanceScheduler()

  // Load from cache if persistence is enabled
  useEffect(() => {
    if (enablePersistence && cacheKey) {
      try {
        const cached = localStorage.getItem(`computation_cache_${cacheKey}`)
        if (cached) {
          const parsedCache = JSON.parse(cached)
          if (deepEqual(parsedCache.deps, deps)) {
            setResult({
              value: parsedCache.value,
              isComputing: false,
              error: null
            })
            return
          }
        }
      } catch (error) {
        console.warn('Failed to load computation cache:', error)
      }
    }
  }, [enablePersistence, cacheKey])

  useEffect(() => {
    // Skip if dependencies haven't changed
    if (lastDeps.current && deepEqual(lastDeps.current, deps)) {
      return
    }

    lastDeps.current = deps

    // Cancel previous computation
    if (computationId.current) {
      cancel(computationId.current)
    }

    setResult(prev => ({...prev, isComputing: true, error: null}))

    // Schedule computation
    computationId.current = schedule(
      () => {
        try {
          const startTime = performance.now()
          const value = computeFn()
          const endTime = performance.now()

          // Save to cache if persistence is enabled
          if (enablePersistence && cacheKey) {
            try {
              localStorage.setItem(
                `computation_cache_${cacheKey}`,
                JSON.stringify({
                  deps,
                  value,
                  timestamp: Date.now()
                })
              )
            } catch (error) {
              console.warn('Failed to save computation cache:', error)
            }
          }

          setResult({
            value,
            isComputing: false,
            error: null
          })

          if (process.env.NODE_ENV === 'development') {
            console.log(`Expensive computation completed in ${(endTime - startTime).toFixed(2)}ms`)
          }
        } catch (error) {
          setResult({
            value: undefined,
            isComputing: false,
            error: error as Error
          })
        }

        computationId.current = null
      },
      priority,
      timeout
    )

    return () => {
      if (computationId.current) {
        cancel(computationId.current)
        computationId.current = null
      }
    }
  }, deps)

  return result
}

// Hook for smart effect scheduling
export const useScheduledEffect = (
  effect: EffectCallback,
  deps: DependencyList,
  priority: TaskPriority = TaskPriority.NORMAL
) => {
  const {schedule} = usePerformanceScheduler()
  const cleanupRef = useRef<void | (() => void)>()

  useEffect(() => {
    const taskId = schedule(() => {
      // Run cleanup from previous effect
      if (cleanupRef.current) {
        cleanupRef.current()
      }

      // Run new effect
      cleanupRef.current = effect()
    }, priority)

    return () => {
      // Run cleanup when dependencies change or component unmounts
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = undefined
      }
    }
  }, deps)
}

// Hook for intersection observer with performance optimization
export const useIntersectionObserver = (
  options: IntersectionObserverInit = {}
): [MutableRefObject<null>, boolean] => {
  const elementRef = useRef(null)
  const [isIntersecting, setIsIntersecting] = useState(false)
  const {schedule} = usePerformanceScheduler()

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      entries => {
        // Schedule intersection updates with low priority
        schedule(() => {
          const [entry] = entries
          setIsIntersecting(entry.isIntersecting)
        }, TaskPriority.LOW)
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
        ...options
      }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [options.threshold, options.rootMargin, options.root])

  return [elementRef, isIntersecting]
}

// Hook for resize observer with performance optimization
export const useResizeObserver = (): [MutableRefObject<null>, {width: number; height: number}] => {
  const elementRef = useRef(null)
  const [size, setSize] = useState({width: 0, height: 0})
  const {schedule} = usePerformanceScheduler()

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const resizeObserver = new ResizeObserver(entries => {
      // Schedule resize updates with normal priority
      schedule(() => {
        const [entry] = entries
        const {width, height} = entry.contentRect
        setSize({width, height})
      }, TaskPriority.NORMAL)
    })

    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  return [elementRef, size]
}

// Hook for optimized event listeners
export const useOptimizedEventListener = <K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  element: HTMLElement | Window = window,
  options: AddEventListenerOptions & {
    throttle?: number
    debounce?: number
    priority?: TaskPriority
  } = {}
) => {
  const {throttle, debounce, priority = TaskPriority.NORMAL, ...listenerOptions} = options

  const {schedule} = usePerformanceScheduler()
  const savedHandler = useRef(handler)
  const taskId = useRef<string | null>(null)

  // Update handler reference
  useEffect(() => {
    savedHandler.current = handler
  }, [handler])

  useEffect(() => {
    if (!element) return

    const eventListener = (event: WindowEventMap[K]) => {
      // Cancel previous scheduled task if using debounce
      if (debounce && taskId.current) {
        // Cancel for debounce behavior
        return
      }

      // Cancel previous task for throttle
      if (throttle && taskId.current) {
        return // Skip if already scheduled
      }

      const executeHandler = () => {
        savedHandler.current(event)
        taskId.current = null
      }

      if (throttle || debounce) {
        taskId.current = schedule(executeHandler, priority)
      } else {
        // Execute immediately for high priority events
        if (priority === TaskPriority.IMMEDIATE) {
          executeHandler()
        } else {
          taskId.current = schedule(executeHandler, priority)
        }
      }
    }

    element.addEventListener(eventName, eventListener as EventListener, listenerOptions)

    return () => {
      element.removeEventListener(eventName, eventListener as EventListener, listenerOptions)
      if (taskId.current) {
        // Note: We can't cancel here as the scheduler reference isn't available
        taskId.current = null
      }
    }
  }, [eventName, element, throttle, debounce, priority, listenerOptions])
}

// Hook for component visibility tracking
export const useComponentVisibility = () => {
  const [isVisible, setIsVisible] = useState(true)
  const {schedule} = usePerformanceScheduler()

  useEffect(() => {
    const handleVisibilityChange = () => {
      schedule(() => {
        setIsVisible(!document.hidden)
      }, TaskPriority.HIGH)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return isVisible
}

// Hook for performance-aware state updates
export const usePerformantState = <T>(
  initialState: T,
  updateStrategy: 'immediate' | 'throttled' | 'debounced' = 'throttled',
  delay: number = 16.67
): [T, (newState: T | ((prev: T) => T)) => void] => {
  const [immediateState, setImmediateState] = useState(initialState)

  // Choose update strategy
  const optimizedState = useMemo(() => {
    switch (updateStrategy) {
      case 'throttled':
        return useThrottledUpdate(immediateState, delay, TaskPriority.NORMAL)
      case 'debounced':
        return useDebouncedUpdate(immediateState, delay, TaskPriority.NORMAL)
      case 'immediate':
      default:
        return immediateState
    }
  }, [immediateState, updateStrategy, delay])

  const setState = useCallback((newState: T | ((prev: T) => T)) => {
    setImmediateState(newState)
  }, [])

  return [optimizedState, setState]
}

// Hook for memory usage tracking
export const useMemoryMonitor = (sampleInterval: number = 5000) => {
  const [memoryInfo, setMemoryInfo] = useState<{
    usedJSHeapSize: number
    totalJSHeapSize: number
    jsHeapSizeLimit: number
  } | null>(null)

  const {schedule} = usePerformanceScheduler()

  useEffect(() => {
    if (!('memory' in performance)) {
      console.warn('Memory API not available')
      return
    }

    const updateMemoryInfo = () => {
      const memory = (performance as any).memory
      setMemoryInfo({
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      })

      // Schedule next update
      setTimeout(() => {
        schedule(updateMemoryInfo, TaskPriority.IDLE)
      }, sampleInterval)
    }

    // Initial update
    schedule(updateMemoryInfo, TaskPriority.IDLE)
  }, [sampleInterval])

  return memoryInfo
}

// Export optimized React.memo with custom comparison
export const createOptimizedMemo = <P extends object>(
  Component: React.ComponentType<P>,
  propsAreEqual?: (prevProps: P, nextProps: P) => boolean
) => {
  return React.memo(Component, propsAreEqual || ((prev, next) => deepEqual(prev, next)))
}
