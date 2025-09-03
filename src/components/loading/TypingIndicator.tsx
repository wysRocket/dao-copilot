/**
 * TypingIndicator Component
 *
 * Displays an animated ellipsis (...) to indicate when the AI is "thinking"
 * or processing a request. Uses CSS keyframes for smooth, natural typing animation.
 */

import React from 'react'
import {cn} from '../../utils/tailwind'

export interface TypingIndicatorProps {
  /** Custom CSS class name */
  className?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Text to display before the dots */
  text?: string
  /** Show the indicator */
  show?: boolean
  /** Animation speed (slower = more relaxed, faster = more urgent) */
  speed?: 'slow' | 'normal' | 'fast'
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  className,
  size = 'md',
  text = 'AI is typing',
  show = true,
  speed = 'normal'
}) => {
  if (!show) return null

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  }

  const dotSizeClasses = {
    sm: 'w-1 h-1',
    md: 'w-1.5 h-1.5',
    lg: 'w-2 h-2'
  }

  const speedClasses = {
    slow: 'typing-dots-slow',
    normal: 'typing-dots',
    fast: 'typing-dots-fast'
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-gray-500 dark:text-gray-400',
        'animate-fade-in',
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label={text}
    >
      {/* Optional text label */}
      {text && <span className="italic">{text}</span>}

      {/* Animated dots */}
      <div className="flex items-center gap-1">
        <div
          className={cn(
            'rounded-full bg-current opacity-40',
            'animate-typing-dot-1',
            dotSizeClasses[size],
            speedClasses[speed]
          )}
          style={{animationDelay: '0ms'}}
        />
        <div
          className={cn(
            'rounded-full bg-current opacity-40',
            'animate-typing-dot-2',
            dotSizeClasses[size],
            speedClasses[speed]
          )}
          style={{animationDelay: '200ms'}}
        />
        <div
          className={cn(
            'rounded-full bg-current opacity-40',
            'animate-typing-dot-3',
            dotSizeClasses[size],
            speedClasses[speed]
          )}
          style={{animationDelay: '400ms'}}
        />
      </div>
    </div>
  )
}

/**
 * Minimal TypingDots Component
 *
 * Just the animated dots without text, useful for inline usage
 */
export interface TypingDotsProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  speed?: 'slow' | 'normal' | 'fast'
}

export const TypingDots: React.FC<TypingDotsProps> = ({
  className,
  size = 'md',
  speed = 'normal'
}) => {
  const dotSizeClasses = {
    sm: 'w-1 h-1',
    md: 'w-1.5 h-1.5',
    lg: 'w-2 h-2'
  }

  const speedClasses = {
    slow: 'typing-dots-slow',
    normal: 'typing-dots',
    fast: 'typing-dots-fast'
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div
        className={cn(
          'rounded-full bg-current opacity-40',
          'animate-typing-dot-1',
          dotSizeClasses[size],
          speedClasses[speed]
        )}
        style={{animationDelay: '0ms'}}
      />
      <div
        className={cn(
          'rounded-full bg-current opacity-40',
          'animate-typing-dot-2',
          dotSizeClasses[size],
          speedClasses[speed]
        )}
        style={{animationDelay: '200ms'}}
      />
      <div
        className={cn(
          'rounded-full bg-current opacity-40',
          'animate-typing-dot-3',
          dotSizeClasses[size],
          speedClasses[speed]
        )}
        style={{animationDelay: '400ms'}}
      />
    </div>
  )
}

export default TypingIndicator
