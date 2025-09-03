/**
 * Loading Spinner Component
 * 
 * A reusable loading spinner with multiple variants and sizes.
 * Includes accessibility features and animation controls.
 */

import React from 'react'
import { cn } from '../utils/tailwind'

export interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Variant of the spinner */
  variant?: 'dots' | 'bars' | 'pulse' | 'spin' | 'bounce'
  /** Color theme */
  color?: 'primary' | 'secondary' | 'accent' | 'muted'
  /** Custom CSS classes */
  className?: string
  /** Loading message for screen readers */
  label?: string
  /** Whether to show the loading text */
  showText?: boolean
  /** Animation speed */
  speed?: 'slow' | 'normal' | 'fast'
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'spin',
  color = 'primary',
  className,
  label = 'Loading...',
  showText = false,
  speed = 'normal'
}) => {
  // Size mappings
  const sizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4', 
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  }

  // Color mappings
  const colorClasses = {
    primary: 'text-blue-500',
    secondary: 'text-gray-500',
    accent: 'text-purple-500',
    muted: 'text-gray-400'
  }

  // Speed mappings
  const speedClasses = {
    slow: 'animate-spin [animation-duration:2s]',
    normal: 'animate-spin [animation-duration:1s]',
    fast: 'animate-spin [animation-duration:0.5s]'
  }

  const renderSpinner = () => {
    switch (variant) {
      case 'spin':
        return (
          <div
            className={cn(
              'border-2 border-current border-t-transparent rounded-full',
              sizeClasses[size],
              colorClasses[color],
              speedClasses[speed],
              className
            )}
            role="progressbar"
            aria-label={label}
          />
        )

      case 'dots':
        return (
          <div className={cn('flex space-x-1', className)} role="progressbar" aria-label={label}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn(
                  'rounded-full bg-current animate-bounce',
                  size === 'xs' ? 'w-1 h-1' : 
                  size === 'sm' ? 'w-1.5 h-1.5' :
                  size === 'md' ? 'w-2 h-2' :
                  size === 'lg' ? 'w-3 h-3' : 'w-4 h-4',
                  colorClasses[color]
                )}
                style={{ 
                  animationDelay: `${i * 0.2}s`,
                  animationDuration: speed === 'slow' ? '1.5s' : speed === 'fast' ? '0.8s' : '1.2s'
                }}
              />
            ))}
          </div>
        )

      case 'bars':
        return (
          <div className={cn('flex space-x-1', className)} role="progressbar" aria-label={label}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  'bg-current animate-pulse',
                  size === 'xs' ? 'w-0.5 h-2' :
                  size === 'sm' ? 'w-0.5 h-3' :
                  size === 'md' ? 'w-1 h-4' :
                  size === 'lg' ? 'w-1.5 h-6' : 'w-2 h-8',
                  colorClasses[color]
                )}
                style={{ 
                  animationDelay: `${i * 0.15}s`,
                  animationDuration: speed === 'slow' ? '2s' : speed === 'fast' ? '1s' : '1.5s'
                }}
              />
            ))}
          </div>
        )

      case 'pulse':
        return (
          <div
            className={cn(
              'rounded-full bg-current animate-pulse',
              sizeClasses[size],
              colorClasses[color],
              className
            )}
            style={{
              animationDuration: speed === 'slow' ? '2s' : speed === 'fast' ? '1s' : '1.5s'
            }}
            role="progressbar"
            aria-label={label}
          />
        )

      case 'bounce':
        return (
          <div
            className={cn(
              'rounded-full bg-current animate-bounce',
              sizeClasses[size],
              colorClasses[color],
              className
            )}
            style={{
              animationDuration: speed === 'slow' ? '1.5s' : speed === 'fast' ? '0.8s' : '1s'
            }}
            role="progressbar"
            aria-label={label}
          />
        )

      default:
        return null
    }
  }

  return (
    <div className="flex items-center space-x-2">
      {renderSpinner()}
      {showText && (
        <span className={cn('text-sm', colorClasses[color])}>
          {label}
        </span>
      )}
    </div>
  )
}

export default LoadingSpinner