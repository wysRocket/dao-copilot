/**
 * Tooltip System Component
 * Provides accessible tooltips for status indicators and other UI elements
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type CSSProperties
} from 'react'
import {TransitionWrapper} from './TransitionSystem'
import type {TranscriptStatus} from './TranscriptStatusBadge'

// Tooltip positioning and behavior configuration
export interface TooltipConfig {
  /** Tooltip position relative to trigger element */
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
  /** Offset from trigger element in pixels */
  offset?: number
  /** Delay before showing tooltip (ms) */
  showDelay?: number
  /** Delay before hiding tooltip (ms) */
  hideDelay?: number
  /** Maximum width of tooltip content */
  maxWidth?: number
  /** Whether tooltip should be interactive (hoverable) */
  interactive?: boolean
  /** Custom CSS classes */
  className?: string
  /** Whether to disable on touch devices */
  disableOnTouch?: boolean
  /** Custom z-index */
  zIndex?: number
}

export interface TooltipProps {
  /** Content to display in tooltip */
  content: ReactNode
  /** Configuration options */
  config?: TooltipConfig
  /** Child element that triggers the tooltip */
  children: ReactNode
  /** Whether tooltip is currently disabled */
  disabled?: boolean
  /** Custom trigger events */
  trigger?: 'hover' | 'focus' | 'click' | 'manual'
  /** Manual show/hide control */
  show?: boolean
  /** Callback when tooltip visibility changes */
  onVisibilityChange?: (visible: boolean) => void
}

const DEFAULT_CONFIG: Required<TooltipConfig> = {
  position: 'auto',
  offset: 8,
  showDelay: 300,
  hideDelay: 100,
  maxWidth: 300,
  interactive: false,
  className: '',
  disableOnTouch: false,
  zIndex: 1000
}

// Status explanations for transcript status indicators
export const STATUS_EXPLANATIONS: Record<
  TranscriptStatus,
  {
    title: string
    description: string
    icon: string
  }
> = {
  normal: {
    title: 'Normal Operation',
    description: 'Transcription is running smoothly with optimal performance and accuracy.',
    icon: '✅'
  },
  streaming: {
    title: 'Live Streaming',
    description:
      'Actively receiving and processing live audio stream with real-time transcription.',
    icon: '🔴'
  },
  buffering: {
    title: 'Buffering Audio',
    description: 'Temporarily buffering audio data to maintain smooth transcription flow.',
    icon: '⏳'
  },
  recovered: {
    title: 'Connection Recovered',
    description: 'Recently recovered from a connection issue and resuming normal transcription.',
    icon: '🔄'
  },
  fallback: {
    title: 'Fallback Mode',
    description: 'Using backup transcription service due to primary service unavailability.',
    icon: '🔧'
  },
  degraded: {
    title: 'Degraded Performance',
    description: 'Transcription running with reduced quality or speed due to system constraints.',
    icon: '⚠️'
  },
  reconnecting: {
    title: 'Reconnecting',
    description: 'Attempting to restore connection to transcription service.',
    icon: '🔄'
  },
  error: {
    title: 'Error State',
    description: 'Transcription has encountered an error and may need manual intervention.',
    icon: '❌'
  },
  offline: {
    title: 'Offline Mode',
    description: 'No network connection available. Transcription is temporarily unavailable.',
    icon: '📡'
  },
  paused: {
    title: 'Transcription Paused',
    description: 'Transcription has been manually paused and is not processing audio.',
    icon: '⏸️'
  }
}

/**
 * Calculate optimal tooltip position based on trigger element and viewport
 */
function calculateTooltipPosition(
  triggerRect: DOMRect,
  tooltipSize: {width: number; height: number},
  preferredPosition: TooltipConfig['position'],
  offset: number,
  viewportSize: {width: number; height: number}
): {position: 'top' | 'bottom' | 'left' | 'right'; style: CSSProperties} {
  const positions = {
    top: {
      top: triggerRect.top - tooltipSize.height - offset,
      left: triggerRect.left + triggerRect.width / 2 - tooltipSize.width / 2
    },
    bottom: {
      top: triggerRect.bottom + offset,
      left: triggerRect.left + triggerRect.width / 2 - tooltipSize.width / 2
    },
    left: {
      top: triggerRect.top + triggerRect.height / 2 - tooltipSize.height / 2,
      left: triggerRect.left - tooltipSize.width - offset
    },
    right: {
      top: triggerRect.top + triggerRect.height / 2 - tooltipSize.height / 2,
      left: triggerRect.right + offset
    }
  }

  // Check if preferred position fits in viewport
  const fitsInViewport = (pos: 'top' | 'bottom' | 'left' | 'right') => {
    const style = positions[pos]
    return (
      style.top >= 0 &&
      style.left >= 0 &&
      style.top + tooltipSize.height <= viewportSize.height &&
      style.left + tooltipSize.width <= viewportSize.width
    )
  }

  let finalPosition: 'top' | 'bottom' | 'left' | 'right'

  if (preferredPosition !== 'auto' && fitsInViewport(preferredPosition)) {
    finalPosition = preferredPosition
  } else {
    // Find first position that fits
    finalPosition = (['top', 'bottom', 'right', 'left'] as const).find(fitsInViewport) || 'top'
  }

  const style = positions[finalPosition]

  // Clamp to viewport bounds
  const clampedStyle: CSSProperties = {
    position: 'fixed',
    top: Math.max(0, Math.min(style.top, viewportSize.height - tooltipSize.height)),
    left: Math.max(0, Math.min(style.left, viewportSize.width - tooltipSize.width)),
    zIndex: 1000
  }

  return {position: finalPosition, style: clampedStyle}
}

/**
 * Core tooltip component with positioning and accessibility
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  config = {},
  children,
  disabled = false,
  trigger = 'hover',
  show: manualShow,
  onVisibilityChange
}) => {
  const finalConfig = {...DEFAULT_CONFIG, ...config}
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('top')
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({})

  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const showTimeoutRef = useRef<NodeJS.Timeout>()
  const hideTimeoutRef = useRef<NodeJS.Timeout>()

  const isManualControl = trigger === 'manual'
  const finalVisible = isManualControl ? (manualShow ?? false) : isVisible

  // Handle show/hide with delays
  const showTooltip = useCallback(() => {
    if (disabled || (finalConfig.disableOnTouch && 'ontouchstart' in window)) {
      return
    }

    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = undefined
    }

    showTimeoutRef.current = setTimeout(() => {
      setIsVisible(true)
      onVisibilityChange?.(true)
    }, finalConfig.showDelay)
  }, [disabled, finalConfig.showDelay, finalConfig.disableOnTouch, onVisibilityChange])

  const hideTooltip = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = undefined
    }

    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false)
      onVisibilityChange?.(false)
    }, finalConfig.hideDelay)
  }, [finalConfig.hideDelay, onVisibilityChange])

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = undefined
    }
  }, [])

  // Position tooltip when visible
  useEffect(() => {
    if (!finalVisible || !triggerRef.current || !tooltipRef.current) {
      return
    }

    const updatePosition = () => {
      const triggerRect = triggerRef.current!.getBoundingClientRect()
      const tooltipRect = tooltipRef.current!.getBoundingClientRect()
      const viewportSize = {
        width: window.innerWidth,
        height: window.innerHeight
      }

      const {position: newPosition, style} = calculateTooltipPosition(
        triggerRect,
        {width: tooltipRect.width, height: tooltipRect.height},
        finalConfig.position,
        finalConfig.offset,
        viewportSize
      )

      setPosition(newPosition)
      setTooltipStyle({
        ...style,
        maxWidth: finalConfig.maxWidth,
        zIndex: finalConfig.zIndex
      })
    }

    // Initial positioning
    updatePosition()

    // Update on scroll/resize
    const handleUpdate = () => requestAnimationFrame(updatePosition)
    window.addEventListener('scroll', handleUpdate, {passive: true})
    window.addEventListener('resize', handleUpdate, {passive: true})

    return () => {
      window.removeEventListener('scroll', handleUpdate)
      window.removeEventListener('resize', handleUpdate)
    }
  }, [
    finalVisible,
    finalConfig.position,
    finalConfig.offset,
    finalConfig.maxWidth,
    finalConfig.zIndex
  ])

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current)
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    }
  }, [])

  // Event handlers for different trigger types
  const getTriggerProps = () => {
    if (isManualControl) return {}

    const props: React.HTMLAttributes<HTMLDivElement> = {
      onFocus: showTooltip,
      onBlur: hideTooltip
    }

    if (trigger === 'hover' || trigger === 'focus') {
      props.onMouseEnter = showTooltip
      props.onMouseLeave = hideTooltip
    }

    if (trigger === 'click') {
      props.onClick = (e: React.MouseEvent) => {
        e.preventDefault()
        if (finalVisible) {
          hideTooltip()
        } else {
          showTooltip()
        }
      }
    }

    return props
  }

  const tooltipProps = finalConfig.interactive
    ? {
        onMouseEnter: cancelHide,
        onMouseLeave: hideTooltip
      }
    : {}

  return (
    <>
      <div ref={triggerRef} className="inline-block" {...getTriggerProps()}>
        {children}
      </div>

      {/* Portal-like rendering for tooltip */}
      {finalVisible && (
        <div
          ref={tooltipRef}
          style={tooltipStyle}
          className={`tooltip ${finalConfig.className} tooltip-${position} `}
          role="tooltip"
          aria-hidden={!finalVisible}
          {...tooltipProps}
        >
          <TransitionWrapper
            show={finalVisible}
            config={{
              type: 'fade',
              duration: 'fast',
              easing: 'ease-out'
            }}
          >
            <div
              className={`relative max-w-sm rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white shadow-lg`}
            >
              {content}

              {/* Arrow pointing to trigger */}
              <div
                className={`absolute h-2 w-2 rotate-45 transform border bg-gray-900 ${position === 'top' ? 'bottom-[-4px] left-1/2 -translate-x-1/2 border-r border-b border-gray-700' : ''} ${position === 'bottom' ? 'top-[-4px] left-1/2 -translate-x-1/2 border-t border-l border-gray-700' : ''} ${position === 'left' ? 'top-1/2 right-[-4px] -translate-y-1/2 border-t border-r border-gray-700' : ''} ${position === 'right' ? 'top-1/2 left-[-4px] -translate-y-1/2 border-b border-l border-gray-700' : ''} `}
              />
            </div>
          </TransitionWrapper>
        </div>
      )}
    </>
  )
}

/**
 * Specialized tooltip for status indicators with predefined content
 */
export interface StatusTooltipProps {
  /** Status to show explanation for */
  status: TranscriptStatus
  /** Tooltip configuration */
  config?: TooltipConfig
  /** Child element that triggers the tooltip */
  children: ReactNode
  /** Whether to show additional technical details */
  showTechnicalDetails?: boolean
}

export const StatusTooltip: React.FC<StatusTooltipProps> = ({
  status,
  config,
  children,
  showTechnicalDetails = false
}) => {
  const explanation = STATUS_EXPLANATIONS[status]

  const content = (
    <div className="space-y-2">
      <div className="flex items-center gap-2 font-semibold">
        <span className="text-base">{explanation.icon}</span>
        <span>{explanation.title}</span>
      </div>

      <p className="leading-relaxed text-gray-200">{explanation.description}</p>

      {showTechnicalDetails && (
        <div className="border-t border-gray-600 pt-2">
          <div className="space-y-1 text-xs text-gray-400">
            <div>
              <strong>Status Code:</strong> {status}
            </div>
            <div>
              <strong>Category:</strong> {getStatusCategory(status)}
            </div>
            {getStatusActions(status).length > 0 && (
              <div className="mt-2">
                <strong>Suggested Actions:</strong>
                <ul className="mt-1 ml-2 space-y-0.5">
                  {getStatusActions(status).map((action, index) => (
                    <li key={index} className="text-gray-300">
                      • {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <Tooltip
      content={content}
      config={{
        position: 'top',
        maxWidth: showTechnicalDetails ? 350 : 300,
        showDelay: 500,
        ...config
      }}
    >
      {children}
    </Tooltip>
  )
}

/**
 * Get category for status grouping
 */
function getStatusCategory(status: TranscriptStatus): string {
  const categories: Record<TranscriptStatus, string> = {
    normal: 'Operational',
    streaming: 'Active',
    buffering: 'Processing',
    recovered: 'Recovery',
    fallback: 'Backup',
    degraded: 'Warning',
    reconnecting: 'Connection',
    error: 'Error',
    offline: 'Connection',
    paused: 'User Control'
  }
  return categories[status]
}

/**
 * Get suggested actions for each status
 */
function getStatusActions(status: TranscriptStatus): string[] {
  const actions: Record<TranscriptStatus, string[]> = {
    normal: [],
    streaming: ['Monitor for quality', 'Check audio levels'],
    buffering: ['Wait for processing', 'Check network speed'],
    recovered: ['Monitor stability', 'Check connection quality'],
    fallback: ['Wait for primary service', 'Check service status'],
    degraded: ['Check system resources', 'Reduce other applications'],
    reconnecting: ['Wait for reconnection', 'Check network connection'],
    error: ['Check error details', 'Try refreshing', 'Contact support'],
    offline: ['Check internet connection', 'Try again when online'],
    paused: ['Click to resume', 'Check audio input']
  }
  return actions[status]
}

/**
 * Utility for creating consistent tooltip configurations
 */
export const TooltipPresets = {
  /** Quick help tooltip */
  help: {
    position: 'top' as const,
    showDelay: 200,
    maxWidth: 250
  },

  /** Detailed information tooltip */
  info: {
    position: 'auto' as const,
    showDelay: 500,
    hideDelay: 200,
    maxWidth: 350,
    interactive: true
  },

  /** Warning or error tooltip */
  warning: {
    position: 'top' as const,
    showDelay: 100,
    maxWidth: 300,
    className: 'tooltip-warning'
  },

  /** Mobile-friendly tooltip */
  mobile: {
    disableOnTouch: false,
    showDelay: 0,
    hideDelay: 3000,
    maxWidth: 250
  }
} as const

export default Tooltip
