/**
 * Lazy Loading Components with Suspense
 * Code-split components for improved initial load performance
 */

import React, { Suspense, lazy, ComponentType } from 'react'

// Loading spinner component
const LoadingSpinner: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
    <span className="text-gray-600">{message}</span>
  </div>
)

// Error boundary for lazy components
class LazyComponentErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ComponentType }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Lazy component loading error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback
      if (FallbackComponent) {
        return <FallbackComponent />
      }
      
      return (
        <div className="p-8 text-center border border-red-200 bg-red-50 rounded-lg">
          <h3 className="text-red-800 font-semibold mb-2">Component Loading Error</h3>
          <p className="text-red-600 text-sm">
            Failed to load component. Please refresh the page.
          </p>
          <button
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Higher-order component for lazy loading with enhanced features
export function withLazyLoading<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options: {
    fallback?: React.ComponentType
    loadingMessage?: string
    errorBoundary?: boolean
    preload?: boolean
  } = {}
) {
  const {
    fallback,
    loadingMessage = 'Loading component...',
    errorBoundary = true,
    preload = false
  } = options

  // Create lazy component
  const LazyComponent = lazy(importFn)

  // Preload if requested
  if (preload) {
    importFn().catch(console.error)
  }

  // Wrapped component with Suspense and error boundary
  const WrappedComponent: React.FC<P> = (props) => {
    const content = (
      <Suspense fallback={<LoadingSpinner message={loadingMessage} />}>
        <LazyComponent {...props} />
      </Suspense>
    )

    if (errorBoundary) {
      return (
        <LazyComponentErrorBoundary fallback={fallback}>
          {content}
        </LazyComponentErrorBoundary>
      )
    }

    return content
  }

  // Add preload method to component
  ;(WrappedComponent as any).preload = () => importFn()

  return WrappedComponent
}

// Lazy-loaded transcript components
export const LazyOptimizedTranscriptDisplay = withLazyLoading(
  () => import('../components/OptimizedTranscriptDisplay').then(m => ({ default: m.OptimizedTranscriptDisplay })),
  {
    loadingMessage: 'Loading transcript display...',
    preload: true,
    errorBoundary: true
  }
)

export const LazyTranscriptPerformanceMetrics = withLazyLoading(
  () => import('../components/OptimizedTranscriptDisplay').then(m => ({ default: m.TranscriptPerformanceMetrics })),
  {
    loadingMessage: 'Loading performance metrics...',
    errorBoundary: true
  }
)

export const LazyChunkedTranscriptView = withLazyLoading(
  () => import('../components/OptimizedTranscriptDisplay').then(m => ({ default: m.ChunkedTranscriptView })),
  {
    loadingMessage: 'Loading chunked view...',
    errorBoundary: true
  }
)

// Lazy-loaded demo components (for development/testing)
export const LazyGeminiLiveDemo = withLazyLoading(
  () => import('../components/GeminiLiveDemo'),
  {
    loadingMessage: 'Loading Gemini Live demo...',
    preload: false,
    errorBoundary: true
  }
)

export const LazyEnhancedTranscriptionIntegration = withLazyLoading(
  () => import('../components/EnhancedTranscriptionIntegration'),
  {
    loadingMessage: 'Loading transcription integration...',
    preload: true,
    errorBoundary: true
  }
)

// Preloader utility for critical components
export const preloadCriticalComponents = () => {
  // Preload components that are likely to be needed soon
  const componentsToPreload = [
    LazyOptimizedTranscriptDisplay,
    LazyTranscriptPerformanceMetrics,
    LazyEnhancedTranscriptionIntegration
  ]

  componentsToPreload.forEach(component => {
    if ((component as any).preload) {
      (component as any).preload()
    }
  })

  console.log('Critical components preloaded')
}

// Component bundle analyzer (development only)
export const ComponentBundleAnalyzer: React.FC = () => {
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  const [bundleInfo, setBundleInfo] = React.useState<Array<{
    name: string
    loaded: boolean
    size?: number
  }>>([
    { name: 'OptimizedTranscriptDisplay', loaded: false },
    { name: 'TranscriptPerformanceMetrics', loaded: false },
    { name: 'ChunkedTranscriptView', loaded: false },
    { name: 'GeminiLiveDemo', loaded: false },
    { name: 'EnhancedTranscriptionIntegration', loaded: false }
  ])

  const checkBundleStatus = React.useCallback(async () => {
    const updatedInfo = await Promise.all(
      bundleInfo.map(async (info) => {
        try {
          // Attempt to check if module is loaded
          const moduleLoaded = document.querySelector(`script[src*="${info.name}"]`) !== null
          return { ...info, loaded: moduleLoaded }
        } catch {
          return info
        }
      })
    )
    setBundleInfo(updatedInfo)
  }, [bundleInfo])

  React.useEffect(() => {
    checkBundleStatus()
    const interval = setInterval(checkBundleStatus, 2000)
    return () => clearInterval(interval)
  }, [checkBundleStatus])

  return (
    <div className="fixed bottom-4 right-4 p-4 bg-gray-900 text-white rounded-lg text-xs max-w-xs">
      <h4 className="font-semibold mb-2">Bundle Status</h4>
      <div className="space-y-1">
        {bundleInfo.map((info) => (
          <div key={info.name} className="flex justify-between">
            <span className="truncate">{info.name}</span>
            <span className={info.loaded ? 'text-green-400' : 'text-red-400'}>
              {info.loaded ? '✓' : '○'}
            </span>
          </div>
        ))}
      </div>
      <button
        className="mt-2 px-2 py-1 bg-blue-600 rounded text-xs hover:bg-blue-700"
        onClick={preloadCriticalComponents}
      >
        Preload Critical
      </button>
    </div>
  )
}
