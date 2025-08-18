/**
 * Transcript Status Badge Component
 * Visual indicators for transcript states with accessibility, responsive design, and smooth transitions
 */

import React, {memo, useState, useEffect} from 'react'
import {TransitionWrapper, StatusTransitions, type TransitionConfig} from './TransitionSystem'
import {StatusTooltip, type TooltipConfig} from './TooltipSystem'

export type TranscriptStatus =
  | 'normal' // Regular transcription, no issues
  | 'streaming' // Active streaming/receiving transcripts
  | 'recovered' // Transcripts recovered after loss/interruption
  | 'fallback' // Operating in fallback mode (backup system)
  | 'degraded' // Degraded performance or quality
  | 'offline' // No connection/offline mode
  | 'error' // Error state
  | 'buffering' // Buffering/loading state
  | 'reconnecting' // Attempting to reconnect
  | 'paused' // Transcription paused

export type BadgeSize = 'sm' | 'md' | 'lg'
export type BadgeVariant = 'solid' | 'outline' | 'soft'

export interface TranscriptStatusBadgeProps {
  status: TranscriptStatus
  previousStatus?: TranscriptStatus
  size?: BadgeSize
  variant?: BadgeVariant
  showIcon?: boolean
  showText?: boolean
  customText?: string
  pulse?: boolean
  enableTransitions?: boolean
  transitionConfig?: TransitionConfig
  enableTooltip?: boolean
  tooltipConfig?: TooltipConfig
  showTechnicalDetails?: boolean
  className?: string
  ariaLabel?: string
  onClick?: () => void
}

interface StatusConfig {
  icon: string
  text: string
  colors: {
    solid: string
    outline: string
    soft: string
  }
  ariaLabel: string
  shouldPulse?: boolean
}

const STATUS_CONFIG: Record<TranscriptStatus, StatusConfig> = {
  normal: {
    icon: '✅',
    text: 'Active',
    colors: {
      solid: 'bg-green-500 text-white border-green-500',
      outline: 'bg-transparent text-green-700 border-green-500',
      soft: 'bg-green-50 text-green-700 border-green-200'
    },
    ariaLabel: 'Transcription is working normally'
  },
  streaming: {
    icon: '🔴',
    text: 'Live',
    colors: {
      solid: 'bg-red-500 text-white border-red-500',
      outline: 'bg-transparent text-red-700 border-red-500',
      soft: 'bg-red-50 text-red-700 border-red-200'
    },
    ariaLabel: 'Transcription is streaming live',
    shouldPulse: true
  },
  recovered: {
    icon: '🔄',
    text: 'Recovered',
    colors: {
      solid: 'bg-blue-500 text-white border-blue-500',
      outline: 'bg-transparent text-blue-700 border-blue-500',
      soft: 'bg-blue-50 text-blue-700 border-blue-200'
    },
    ariaLabel: 'Transcription has been recovered after interruption'
  },
  fallback: {
    icon: '⚠️',
    text: 'Fallback',
    colors: {
      solid: 'bg-orange-500 text-white border-orange-500',
      outline: 'bg-transparent text-orange-700 border-orange-500',
      soft: 'bg-orange-50 text-orange-700 border-orange-200'
    },
    ariaLabel: 'Transcription is running in fallback mode'
  },
  degraded: {
    icon: '⬇️',
    text: 'Degraded',
    colors: {
      solid: 'bg-yellow-500 text-white border-yellow-500',
      outline: 'bg-transparent text-yellow-700 border-yellow-500',
      soft: 'bg-yellow-50 text-yellow-700 border-yellow-200'
    },
    ariaLabel: 'Transcription quality is degraded'
  },
  offline: {
    icon: '📴',
    text: 'Offline',
    colors: {
      solid: 'bg-gray-500 text-white border-gray-500',
      outline: 'bg-transparent text-gray-700 border-gray-500',
      soft: 'bg-gray-50 text-gray-700 border-gray-200'
    },
    ariaLabel: 'Transcription is offline'
  },
  error: {
    icon: '❌',
    text: 'Error',
    colors: {
      solid: 'bg-red-600 text-white border-red-600',
      outline: 'bg-transparent text-red-700 border-red-600',
      soft: 'bg-red-50 text-red-700 border-red-200'
    },
    ariaLabel: 'Transcription error occurred'
  },
  buffering: {
    icon: '⏳',
    text: 'Buffering',
    colors: {
      solid: 'bg-indigo-500 text-white border-indigo-500',
      outline: 'bg-transparent text-indigo-700 border-indigo-500',
      soft: 'bg-indigo-50 text-indigo-700 border-indigo-200'
    },
    ariaLabel: 'Transcription is buffering',
    shouldPulse: true
  },
  reconnecting: {
    icon: '🔄',
    text: 'Reconnecting',
    colors: {
      solid: 'bg-purple-500 text-white border-purple-500',
      outline: 'bg-transparent text-purple-700 border-purple-500',
      soft: 'bg-purple-50 text-purple-700 border-purple-200'
    },
    ariaLabel: 'Transcription is attempting to reconnect',
    shouldPulse: true
  },
  paused: {
    icon: '⏸️',
    text: 'Paused',
    colors: {
      solid: 'bg-gray-600 text-white border-gray-600',
      outline: 'bg-transparent text-gray-700 border-gray-600',
      soft: 'bg-gray-50 text-gray-700 border-gray-200'
    },
    ariaLabel: 'Transcription is paused'
  }
}

const SIZE_CONFIG: Record<
  BadgeSize,
  {
    container: string
    text: string
    icon: string
    iconOnly: string
  }
> = {
  sm: {
    container: 'px-2 py-1 text-xs',
    text: 'text-xs',
    icon: 'text-sm',
    iconOnly: 'p-1'
  },
  md: {
    container: 'px-3 py-1.5 text-sm',
    text: 'text-sm',
    icon: 'text-base',
    iconOnly: 'p-1.5'
  },
  lg: {
    container: 'px-4 py-2 text-base',
    text: 'text-base',
    icon: 'text-lg',
    iconOnly: 'p-2'
  }
}

export const TranscriptStatusBadge = memo<TranscriptStatusBadgeProps>(
  ({
    status,
    previousStatus,
    size = 'md',
    variant = 'solid',
    showIcon = true,
    showText = true,
    customText,
    pulse = false,
    enableTransitions = true,
    transitionConfig,
    enableTooltip = true,
    tooltipConfig,
    showTechnicalDetails = false,
    className = '',
    ariaLabel,
    onClick
  }) => {
    const [displayStatus, setDisplayStatus] = useState(status)

    const config = STATUS_CONFIG[status]
    const sizeConfig = SIZE_CONFIG[size]

    if (!config) {
      console.warn(`Unknown transcript status: ${status}`)
      return null
    }

    // Handle status transitions
    useEffect(() => {
      if (enableTransitions && status !== displayStatus) {
        // Short delay to show transition effect
        const timeout = setTimeout(() => {
          setDisplayStatus(status)
        }, 150)

        return () => clearTimeout(timeout)
      } else {
        setDisplayStatus(status)
      }
    }, [status, displayStatus, enableTransitions])

    // Determine transition configuration
    const getTransitionConfig = (): TransitionConfig => {
      if (transitionConfig) return transitionConfig

      // Status-specific transitions
      if (status === 'error') return StatusTransitions.errorAppear
      if (status === 'normal' && previousStatus === 'error') return StatusTransitions.successAppear
      if (status === 'streaming') return StatusTransitions.streamingStart
      if (status === 'reconnecting') return StatusTransitions.reconnecting

      return StatusTransitions.statusChange
    }

    const shouldPulse = pulse || config.shouldPulse
    const displayText = customText || config.text
    const effectiveAriaLabel = ariaLabel || config.ariaLabel

    // Base classes
    const baseClasses = [
      'inline-flex',
      'items-center',
      'justify-center',
      'font-medium',
      'rounded-full',
      'border',
      'transition-all',
      'duration-200',
      'ease-in-out',
      'focus:outline-none',
      'focus:ring-2',
      'focus:ring-offset-2',
      'focus:ring-opacity-50'
    ]

    // Size classes
    const isIconOnly = showIcon && !showText
    const sizeClasses = isIconOnly ? sizeConfig.iconOnly : sizeConfig.container

    // Color classes
    const colorClasses = config.colors[variant]

    // Focus ring color
    const focusRingColor =
      variant === 'solid'
        ? 'focus:ring-white'
        : colorClasses.includes('border-green-')
          ? 'focus:ring-green-500'
          : colorClasses.includes('border-red-')
            ? 'focus:ring-red-500'
            : colorClasses.includes('border-blue-')
              ? 'focus:ring-blue-500'
              : colorClasses.includes('border-orange-')
                ? 'focus:ring-orange-500'
                : colorClasses.includes('border-yellow-')
                  ? 'focus:ring-yellow-500'
                  : colorClasses.includes('border-purple-')
                    ? 'focus:ring-purple-500'
                    : colorClasses.includes('border-indigo-')
                      ? 'focus:ring-indigo-500'
                      : 'focus:ring-gray-500'

    // Pulse animation
    const pulseClasses = shouldPulse ? 'animate-pulse' : ''

    // Hover classes for interactive badges
    const hoverClasses = onClick ? 'hover:opacity-80 cursor-pointer' : ''

    const allClasses = [
      ...baseClasses,
      sizeClasses,
      colorClasses,
      focusRingColor,
      pulseClasses,
      hoverClasses,
      className
    ]
      .filter(Boolean)
      .join(' ')

    const handleClick = (event: React.MouseEvent) => {
      if (onClick) {
        event.preventDefault()
        onClick()
      }
    }

    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (onClick && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault()
        onClick()
      }
    }

    const badgeContent = (
      <>
        {showIcon && (
          <span className={`${sizeConfig.icon} ${showText ? 'mr-1.5' : ''}`} aria-hidden="true">
            {config.icon}
          </span>
        )}
        {showText && <span className={sizeConfig.text}>{displayText}</span>}
      </>
    )

    const wrappedContent = enableTransitions ? (
      <TransitionWrapper
        show={true}
        config={getTransitionConfig()}
        className="inline-flex items-center"
      >
        {badgeContent}
      </TransitionWrapper>
    ) : (
      badgeContent
    )

    const badgeElement = onClick ? (
      <button
        type="button"
        className={allClasses}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={effectiveAriaLabel}
        title={effectiveAriaLabel}
      >
        {wrappedContent}
      </button>
    ) : (
      <span
        className={allClasses}
        role="status"
        aria-label={effectiveAriaLabel}
        title={effectiveAriaLabel}
      >
        {wrappedContent}
      </span>
    )

    // Wrap with tooltip if enabled
    if (enableTooltip) {
      return (
        <StatusTooltip
          status={status}
          config={tooltipConfig}
          showTechnicalDetails={showTechnicalDetails}
        >
          {badgeElement}
        </StatusTooltip>
      )
    }

    return badgeElement
  }
)

TranscriptStatusBadge.displayName = 'TranscriptStatusBadge'

// Preset configurations for common use cases
export const TranscriptStatusPresets = {
  /**
   * Normal operation indicator
   */
  normal: (props?: Partial<TranscriptStatusBadgeProps>) => (
    <TranscriptStatusBadge status="normal" {...props} />
  ),

  /**
   * Live streaming indicator with pulse
   */
  streaming: (props?: Partial<TranscriptStatusBadgeProps>) => (
    <TranscriptStatusBadge status="streaming" pulse {...props} />
  ),

  /**
   * Recovery notification
   */
  recovered: (props?: Partial<TranscriptStatusBadgeProps>) => (
    <TranscriptStatusBadge status="recovered" {...props} />
  ),

  /**
   * Warning indicator for fallback mode
   */
  fallback: (props?: Partial<TranscriptStatusBadgeProps>) => (
    <TranscriptStatusBadge status="fallback" {...props} />
  ),

  /**
   * Performance degradation warning
   */
  degraded: (props?: Partial<TranscriptStatusBadgeProps>) => (
    <TranscriptStatusBadge status="degraded" {...props} />
  ),

  /**
   * Offline state indicator
   */
  offline: (props?: Partial<TranscriptStatusBadgeProps>) => (
    <TranscriptStatusBadge status="offline" {...props} />
  ),

  /**
   * Error state indicator
   */
  error: (props?: Partial<TranscriptStatusBadgeProps>) => (
    <TranscriptStatusBadge status="error" {...props} />
  ),

  /**
   * Loading/buffering indicator with pulse
   */
  buffering: (props?: Partial<TranscriptStatusBadgeProps>) => (
    <TranscriptStatusBadge status="buffering" pulse {...props} />
  ),

  /**
   * Reconnection attempt indicator
   */
  reconnecting: (props?: Partial<TranscriptStatusBadgeProps>) => (
    <TranscriptStatusBadge status="reconnecting" pulse {...props} />
  ),

  /**
   * Paused state indicator
   */
  paused: (props?: Partial<TranscriptStatusBadgeProps>) => (
    <TranscriptStatusBadge status="paused" {...props} />
  )
}

// Utility hooks for status determination
export const useTranscriptStatus = (
  isStreaming: boolean,
  isConnected: boolean,
  hasError: boolean,
  isRecovered: boolean,
  isBuffering: boolean,
  isPaused: boolean
): TranscriptStatus => {
  if (hasError) return 'error'
  if (isPaused) return 'paused'
  if (!isConnected) return 'offline'
  if (isBuffering) return 'buffering'
  if (isRecovered) return 'recovered'
  if (isStreaming) return 'streaming'
  return 'normal'
}

// Export utility functions
export const TranscriptStatusUtils = {
  /**
   * Get status badge color scheme
   */
  getStatusColors: (status: TranscriptStatus, variant: BadgeVariant = 'solid') => {
    return STATUS_CONFIG[status]?.colors[variant] || STATUS_CONFIG.normal.colors[variant]
  },

  /**
   * Check if status indicates an issue
   */
  isStatusCritical: (status: TranscriptStatus): boolean => {
    return ['error', 'offline', 'degraded'].includes(status)
  },

  /**
   * Check if status indicates warning
   */
  isStatusWarning: (status: TranscriptStatus): boolean => {
    return ['fallback', 'degraded', 'reconnecting'].includes(status)
  },

  /**
   * Check if status indicates normal operation
   */
  isStatusNormal: (status: TranscriptStatus): boolean => {
    return ['normal', 'streaming'].includes(status)
  },

  /**
   * Get appropriate size for context
   */
  getSizeForContext: (context: 'header' | 'sidebar' | 'inline' | 'mobile'): BadgeSize => {
    switch (context) {
      case 'header':
        return 'lg'
      case 'sidebar':
        return 'md'
      case 'mobile':
        return 'sm'
      case 'inline':
      default:
        return 'md'
    }
  }
}

export default TranscriptStatusBadge
