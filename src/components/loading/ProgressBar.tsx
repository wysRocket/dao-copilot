/**
 * ProgressBar Component
 *
 * Displays progress indicators for function calls and other operations.
 * Supports both determinate (with known progress percentage) and indeterminate
 * (unknown duration) progress states.
 */

import React from 'react'
import {cn} from '../../utils/tailwind'

export interface ProgressBarProps {
  /** Progress percentage (0-100). If undefined, shows indeterminate progress */
  progress?: number
  /** Custom CSS class name */
  className?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Color variant */
  variant?: 'primary' | 'success' | 'warning' | 'error'
  /** Show percentage text */
  showPercentage?: boolean
  /** Custom label text */
  label?: string
  /** Animation speed for indeterminate progress */
  speed?: 'slow' | 'normal' | 'fast'
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  className,
  size = 'md',
  variant = 'primary',
  showPercentage = false,
  label,
  speed = 'normal'
}) => {
  const isIndeterminate = progress === undefined
  const clampedProgress = Math.max(0, Math.min(100, progress || 0))

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  }

  const variantClasses = {
    primary: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500'
  }

  const backgroundClasses = {
    primary: 'bg-blue-100 dark:bg-blue-900/30',
    success: 'bg-green-100 dark:bg-green-900/30',
    warning: 'bg-yellow-100 dark:bg-yellow-900/30',
    error: 'bg-red-100 dark:bg-red-900/30'
  }

  const speedClasses = {
    slow: 'animate-progress-slow',
    normal: 'animate-progress',
    fast: 'animate-progress-fast'
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Label */}
      {label && (
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
          {showPercentage && !isIndeterminate && (
            <span className="text-sm text-gray-500 dark:text-gray-500">
              {Math.round(clampedProgress)}%
            </span>
          )}
        </div>
      )}

      {/* Progress track */}
      <div
        className={cn(
          'w-full overflow-hidden rounded-full',
          backgroundClasses[variant],
          sizeClasses[size]
        )}
        role="progressbar"
        aria-valuenow={isIndeterminate ? undefined : clampedProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
      >
        {/* Progress bar */}
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-out',
            variantClasses[variant],
            isIndeterminate && cn('animate-indeterminate', speedClasses[speed])
          )}
          style={{
            width: isIndeterminate ? '100%' : `${clampedProgress}%`,
            transformOrigin: 'left'
          }}
        />
      </div>
    </div>
  )
}

/**
 * Linear Progress Component
 *
 * Simplified linear progress indicator without labels
 */
export interface LinearProgressProps {
  progress?: number
  className?: string
  variant?: 'primary' | 'success' | 'warning' | 'error'
  height?: number
}

export const LinearProgress: React.FC<LinearProgressProps> = ({
  progress,
  className,
  variant = 'primary',
  height = 4
}) => {
  const isIndeterminate = progress === undefined
  const clampedProgress = Math.max(0, Math.min(100, progress || 0))

  const variantClasses = {
    primary: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500'
  }

  const backgroundClasses = {
    primary: 'bg-blue-100 dark:bg-blue-900/30',
    success: 'bg-green-100 dark:bg-green-900/30',
    warning: 'bg-yellow-100 dark:bg-yellow-900/30',
    error: 'bg-red-100 dark:bg-red-900/30'
  }

  return (
    <div
      className={cn('w-full overflow-hidden rounded-full', backgroundClasses[variant], className)}
      style={{height: `${height}px`}}
      role="progressbar"
      aria-valuenow={isIndeterminate ? undefined : clampedProgress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all duration-300 ease-out',
          variantClasses[variant],
          isIndeterminate && 'animate-indeterminate'
        )}
        style={{
          width: isIndeterminate ? '100%' : `${clampedProgress}%`,
          transformOrigin: 'left'
        }}
      />
    </div>
  )
}

/**
 * Circular Progress Component
 *
 * Circular progress indicator for smaller spaces
 */
export interface CircularProgressProps {
  progress?: number
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'primary' | 'success' | 'warning' | 'error'
  showPercentage?: boolean
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  progress,
  className,
  size = 'md',
  variant = 'primary',
  showPercentage = false
}) => {
  const isIndeterminate = progress === undefined
  const clampedProgress = Math.max(0, Math.min(100, progress || 0))

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  }

  const strokeWidthMap = {
    sm: 2,
    md: 2.5,
    lg: 3
  }

  const radiusMap = {
    sm: 10,
    md: 13,
    lg: 18
  }

  const variantClasses = {
    primary: 'text-blue-500',
    success: 'text-green-500',
    warning: 'text-yellow-500',
    error: 'text-red-500'
  }

  const radius = radiusMap[size]
  const circumference = 2 * Math.PI * radius
  const strokeDasharray = circumference
  const strokeDashoffset = isIndeterminate
    ? 0
    : circumference - (clampedProgress / 100) * circumference

  return (
    <div className={cn('relative', sizeClasses[size], className)}>
      <svg className={cn('-rotate-90 transform', sizeClasses[size])} viewBox="0 0 32 32">
        {/* Background circle */}
        <circle
          cx="16"
          cy="16"
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidthMap[size]}
          fill="none"
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <circle
          cx="16"
          cy="16"
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidthMap[size]}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className={cn(
            'transition-all duration-300 ease-out',
            variantClasses[variant],
            isIndeterminate && 'animate-spin'
          )}
          style={{
            strokeDasharray: isIndeterminate
              ? `${circumference * 0.25} ${circumference * 0.75}`
              : strokeDasharray
          }}
        />
      </svg>

      {/* Percentage text */}
      {showPercentage && !isIndeterminate && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              'font-medium',
              size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base',
              variantClasses[variant]
            )}
          >
            {Math.round(clampedProgress)}%
          </span>
        </div>
      )}
    </div>
  )
}

export default ProgressBar
