/**
 * SkeletonScreen Component
 *
 * Provides placeholder UI elements that mimic the shape of expected content
 * while data is loading. Includes subtle shimmer animation effects.
 */

import React from 'react'
import {cn} from '../../utils/tailwind'

export interface SkeletonProps {
  /** Custom CSS class name */
  className?: string
  /** Width as CSS value (e.g., '100%', '200px', 'auto') */
  width?: string
  /** Height as CSS value (e.g., '20px', '2rem') */
  height?: string
  /** Border radius */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full'
  /** Enable shimmer animation */
  animate?: boolean
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  width = '100%',
  height = '1rem',
  rounded = 'md',
  animate = true
}) => {
  const roundedClasses = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full'
  }

  return (
    <div
      className={cn(
        'bg-gray-200 dark:bg-gray-700',
        animate &&
          'animate-shimmer bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] dark:from-gray-700 dark:via-gray-600 dark:to-gray-700',
        roundedClasses[rounded],
        className
      )}
      style={{width, height}}
      role="progressbar"
      aria-label="Loading content"
    />
  )
}

/**
 * SkeletonText Component
 *
 * Skeleton for text content with multiple lines
 */
export interface SkeletonTextProps {
  className?: string
  /** Number of lines */
  lines?: number
  /** Width of the last line (to create natural text flow) */
  lastLineWidth?: string
  /** Line height */
  lineHeight?: string
  /** Gap between lines */
  gap?: string
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  className,
  lines = 3,
  lastLineWidth = '75%',
  lineHeight = '1rem',
  gap = '0.5rem'
}) => {
  return (
    <div className={cn('space-y-2', className)} style={{gap}}>
      {Array.from({length: lines}).map((_, index) => (
        <Skeleton
          key={index}
          height={lineHeight}
          width={index === lines - 1 ? lastLineWidth : '100%'}
          rounded="sm"
        />
      ))}
    </div>
  )
}

/**
 * SkeletonCard Component
 *
 * Skeleton for card-like content (similar to SearchResultCard)
 */
export interface SkeletonCardProps {
  className?: string
  /** Show thumbnail placeholder */
  showThumbnail?: boolean
  /** Show action buttons placeholder */
  showActions?: boolean
  /** Compact mode */
  compact?: boolean
  /** Inline style for animations */
  style?: React.CSSProperties
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  className,
  showThumbnail = true,
  showActions = true,
  compact = false,
  style
}) => {
  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700',
        'bg-white/70 backdrop-blur-sm dark:bg-gray-800/70',
        className
      )}
      style={style}
    >
      <div className={cn('flex gap-3', compact ? 'flex-col sm:flex-row' : 'flex-col md:flex-row')}>
        {/* Thumbnail skeleton */}
        {showThumbnail && !compact && (
          <div
            className={cn(
              'flex-shrink-0',
              compact ? 'h-32 w-full md:h-16 md:w-16' : 'h-32 w-full md:h-16 md:w-16'
            )}
          >
            <Skeleton width="100%" height="100%" rounded="lg" />
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          {/* Title skeleton */}
          <Skeleton height={compact ? '1.25rem' : '1.5rem'} width="85%" rounded="sm" />

          {/* URL skeleton */}
          <div className="flex items-center justify-between">
            <Skeleton height="0.875rem" width="50%" rounded="sm" />
            <Skeleton height="0.875rem" width="4rem" rounded="sm" />
          </div>

          {/* Content skeleton */}
          <SkeletonText
            lines={compact ? 2 : 3}
            lineHeight={compact ? '0.875rem' : '1rem'}
            lastLineWidth="60%"
          />
        </div>
      </div>

      {/* Actions skeleton */}
      {showActions && (
        <div className="flex items-center justify-between border-t border-gray-200 pt-2 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Skeleton height="0.875rem" width="5rem" rounded="sm" />
            <Skeleton height="0.875rem" width="4rem" rounded="sm" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton height="1.5rem" width="1.5rem" rounded="md" />
            <Skeleton height="1.5rem" width="1.5rem" rounded="md" />
            <Skeleton height="1.5rem" width="1.5rem" rounded="md" />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * SkeletonGrid Component
 *
 * Multiple skeleton cards arranged in a grid
 */
export interface SkeletonGridProps {
  className?: string
  /** Number of skeleton items */
  count?: number
  /** Show header skeleton */
  showHeader?: boolean
  /** Compact mode */
  compact?: boolean
}

export const SkeletonGrid: React.FC<SkeletonGridProps> = ({
  className,
  count = 3,
  showHeader = true,
  compact = false
}) => {
  return (
    <div className={cn('w-full', className)}>
      {/* Header skeleton */}
      {showHeader && (
        <div className="mb-4 flex items-center justify-between">
          <Skeleton height="1.5rem" width="8rem" rounded="sm" />
          <Skeleton height="1rem" width="6rem" rounded="sm" />
        </div>
      )}

      {/* Cards grid */}
      <div className="space-y-3">
        {Array.from({length: count}).map((_, index) => (
          <SkeletonCard
            key={index}
            compact={compact}
            className="animate-pulse"
            style={{animationDelay: `${index * 0.1}s`} as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * SkeletonMessage Component
 *
 * Skeleton for chat messages
 */
export interface SkeletonMessageProps {
  className?: string
  /** Message from user or AI */
  type?: 'user' | 'ai'
  /** Show avatar placeholder */
  showAvatar?: boolean
}

export const SkeletonMessage: React.FC<SkeletonMessageProps> = ({
  className,
  type = 'ai',
  showAvatar = true
}) => {
  return (
    <div
      className={cn('flex gap-3 p-4', type === 'user' ? 'flex-row-reverse' : 'flex-row', className)}
    >
      {/* Avatar skeleton */}
      {showAvatar && <Skeleton width="2rem" height="2rem" rounded="full" />}

      {/* Message content skeleton */}
      <div className="flex-1 space-y-2">
        <SkeletonText
          lines={type === 'user' ? 1 : 3}
          lastLineWidth={type === 'user' ? '100%' : '70%'}
          lineHeight="1.25rem"
        />

        {/* Tool call placeholder for AI messages */}
        {type === 'ai' && (
          <div className="mt-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <div className="mb-2 flex items-center gap-2">
              <Skeleton height="1rem" width="1rem" rounded="sm" />
              <Skeleton height="1rem" width="8rem" rounded="sm" />
            </div>
            <SkeletonText lines={2} lastLineWidth="85%" />
          </div>
        )}
      </div>
    </div>
  )
}

export default Skeleton
