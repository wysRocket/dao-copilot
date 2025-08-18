/**
 * React Performance Optimization Hooks
 * Custom hooks for optimized rendering and state management
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Performance monitoring hook
export const useRenderTracker = (componentName: string) => {
  const renderCount = useRef(0)
  const renderTimes = useRef<number[]>([])
  const lastRenderStart = useRef(performance.now())

  useEffect(() => {
    renderCount.current++
    const currentTime = performance.now()
    const renderTime = currentTime - lastRenderStart.current
    
    renderTimes.current.push(renderTime)
    if (renderTimes.current.length > 50) {
      renderTimes.current.shift()
    }
    
    lastRenderStart.current = currentTime
    
    if (process.env.NODE_ENV === 'development' && renderCount.current % 10 === 0) {
      const avgTime = renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length
      console.log(`[${componentName}] Renders: ${renderCount.current}, Avg: ${avgTime.toFixed(2)}ms`)
    }
  })

  return {
    renderCount: renderCount.current,
    averageRenderTime: renderTimes.current.length > 0 
      ? renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length 
      : 0
  }
}

// Optimized callback hook with dependency tracking
export const useOptimizedCallback = <T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T => {
  const callbackRef = useRef(callback)
  const depsRef = useRef(deps)
  
  // Update callback if dependencies changed
  const depsChanged = useMemo(() => {
    return deps.some((dep, index) => dep !== depsRef.current[index])
  }, deps)
  
  if (depsChanged) {
    callbackRef.current = callback
    depsRef.current = deps
  }
  
  return useCallback(callbackRef.current, [])
}

// Throttled state updates
export const useThrottledState = <T>(
  initialValue: T,
  delay: number = 16 // ~60fps
): [T, (value: T) => void] => {
  const [state, setState] = useState(initialValue)
  const lastUpdate = useRef(Date.now())
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const throttledSetState = useCallback((newValue: T) => {
    const now = Date.now()
    const timeSinceLastUpdate = now - lastUpdate.current
    
    if (timeSinceLastUpdate >= delay) {
      setState(newValue)
      lastUpdate.current = now
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      timeoutRef.current = setTimeout(() => {
        setState(newValue)
        lastUpdate.current = Date.now()
      }, delay - timeSinceLastUpdate)
    }
  }, [delay])
  
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])
  
  return [state, throttledSetState]
}

// Batched updates hook
export const useBatchedUpdates = <T>(
  initialState: T,
  batchSize: number = 10
): [T, (updater: (prev: T) => T) => void, () => void] => {
  const [state, setState] = useState(initialState)
  const pendingUpdates = useRef<Array<(prev: T) => T>>([])
  const frameRef = useRef<number | null>(null)
  
  const scheduleFlush = useCallback(() => {
    if (frameRef.current) return
    
    frameRef.current = requestAnimationFrame(() => {
      setState(prevState => {
        let newState = prevState
        for (const update of pendingUpdates.current) {
          newState = update(newState)
        }
        pendingUpdates.current = []
        return newState
      })
      frameRef.current = null
    })
  }, [])
  
  const batchedUpdate = useCallback((updater: (prev: T) => T) => {
    pendingUpdates.current.push(updater)
    
    if (pendingUpdates.current.length >= batchSize) {
      scheduleFlush()
    }
  }, [batchSize, scheduleFlush])
  
  const flushUpdates = useCallback(() => {
    if (pendingUpdates.current.length > 0) {
      scheduleFlush()
    }
  }, [scheduleFlush])
  
  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])
  
  return [state, batchedUpdate, flushUpdates]
}

// Virtualization helper hook
export const useVirtualization = <T>(
  items: T[],
  containerHeight: number,
  itemHeight: number,
  overscan: number = 3
) => {
  const [scrollTop, setScrollTop] = useState(0)
  
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const endIndex = Math.min(
      items.length,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    )
    return { startIndex, endIndex }
  }, [scrollTop, containerHeight, itemHeight, overscan, items.length])
  
  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex)
  }, [items, visibleRange.startIndex, visibleRange.endIndex])
  
  const totalHeight = items.length * itemHeight
  const offsetY = visibleRange.startIndex * itemHeight
  
  return {
    visibleItems,
    totalHeight,
    offsetY,
    startIndex: visibleRange.startIndex,
    endIndex: visibleRange.endIndex,
    setScrollTop
  }
}

// Memory usage monitoring
export const useMemoryMonitor = (componentName: string) => {
  const [memoryUsage, setMemoryUsage] = useState<{
    used: number
    total: number
    percentage: number
  } | null>(null)
  
  useEffect(() => {
    const updateMemoryUsage = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory
        const used = memory.usedJSHeapSize / 1024 / 1024 // MB
        const total = memory.totalJSHeapSize / 1024 / 1024 // MB
        const percentage = (used / total) * 100
        
        setMemoryUsage({ used, total, percentage })
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[${componentName}] Memory: ${used.toFixed(1)}MB/${total.toFixed(1)}MB (${percentage.toFixed(1)}%)`)
        }
      }
    }
    
    const interval = setInterval(updateMemoryUsage, 5000) // Check every 5 seconds
    updateMemoryUsage() // Initial check
    
    return () => clearInterval(interval)
  }, [componentName])
  
  return memoryUsage
}

// Intersection Observer hook for lazy loading
export const useIntersectionObserver = (
  ref: React.RefObject<Element>,
  options: IntersectionObserverInit = {}
) => {
  const [isIntersecting, setIsIntersecting] = useState(false)
  const [hasIntersected, setHasIntersected] = useState(false)
  
  useEffect(() => {
    const element = ref.current
    if (!element) return
    
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting)
      if (entry.isIntersecting && !hasIntersected) {
        setHasIntersected(true)
      }
    }, options)
    
    observer.observe(element)
    
    return () => observer.disconnect()
  }, [ref, options, hasIntersected])
  
  return { isIntersecting, hasIntersected }
}

// Debounced search hook
export const useDebouncedSearch = <T>(
  items: T[],
  searchFn: (item: T, query: string) => boolean,
  delay: number = 300
) => {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  
  useEffect(() => {
    setIsSearching(true)
    const handler = setTimeout(() => {
      setDebouncedQuery(query)
      setIsSearching(false)
    }, delay)
    
    return () => clearTimeout(handler)
  }, [query, delay])
  
  const filteredItems = useMemo(() => {
    if (!debouncedQuery.trim()) return items
    return items.filter(item => searchFn(item, debouncedQuery))
  }, [items, debouncedQuery, searchFn])
  
  return {
    query,
    setQuery,
    filteredItems,
    isSearching
  }
}

// Performance boundary hook for error recovery
export const usePerformanceBoundary = (componentName: string) => {
  const [hasError, setHasError] = useState(false)
  const [errorCount, setErrorCount] = useState(0)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const resetError = useCallback(() => {
    setHasError(false)
    setErrorCount(0)
  }, [])
  
  const handleError = useCallback((error: Error) => {
    console.error(`[${componentName}] Performance boundary caught error:`, error)
    setHasError(true)
    setErrorCount(prev => prev + 1)
    
    // Auto-retry after delay (with exponential backoff)
    const retryDelay = Math.min(1000 * Math.pow(2, errorCount), 10000)
    retryTimeoutRef.current = setTimeout(() => {
      resetError()
    }, retryDelay)
  }, [componentName, errorCount, resetError])
  
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
    }
  }, [])
  
  return { hasError, errorCount, resetError, handleError }
}
