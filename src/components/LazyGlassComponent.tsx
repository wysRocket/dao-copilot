/**
 * Lazy Glass Component
 *
 * A wrapper component that provides lazy loading capabilities for glass components
 * to optimize memory usage and rendering performance.
 */

import React, {useState, useCallback} from 'react'
import {useLazyLoad, type LazyGlassComponentProps} from '../utils/memory-management'

export function LazyGlassComponent({
  children,
  fallback = null,
  className,
  style,
  threshold = 0.1,
  rootMargin = '50px',
  onLoad,
  onUnload
}: LazyGlassComponentProps) {
  const [shouldRender, setShouldRender] = useState(false)

  const handleIntersect = useCallback(() => {
    setShouldRender(true)
    onLoad?.()
  }, [onLoad])

  const handleExit = useCallback(() => {
    // Optionally unload when not visible (aggressive memory management)
    // setShouldRender(false)
    onUnload?.()
  }, [onUnload])

  const {ref, hasIntersected} = useLazyLoad({
    threshold,
    rootMargin,
    once: false,
    onIntersect: handleIntersect,
    onExit: handleExit
  })

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={className}
      style={{
        minHeight: '100px', // Ensure element has size for intersection observer
        ...style
      }}
    >
      {shouldRender || hasIntersected ? children : fallback}
    </div>
  )
}

export default LazyGlassComponent
