import React from 'react'
import {useTypewriterEffect, TypewriterConfig} from '../hooks/useTypewriterEffect'
import '../styles/typewriter-text.css'

/**
 * Props for the TypewriterText component
 */
export interface TypewriterTextProps extends TypewriterConfig {
  /** Text to type */
  text: string
  /** Additional CSS classes */
  className?: string
  /** Custom styling */
  style?: React.CSSProperties
  /** Whether to show progress indicator */
  showProgress?: boolean
}

/**
 * TypewriterText component with advanced animation effects
 *
 * Provides a realistic typewriter effect with configurable speed,
 * cursor animation, sound effects, and progress indication.
 */
export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  className = '',
  style = {},
  showProgress = false,
  ...config
}) => {
  const typewriterState = useTypewriterEffect(text, config)

  return (
    <div
      className={`typewriter-container ${className}`}
      style={style}
      data-testid="typewriter-text"
    >
      <span className="typewriter-text">
        {typewriterState.displayedText}
        {typewriterState.showCursor && (
          <span className="typewriter-cursor" aria-hidden="true">
            {config.cursorChar || '|'}
          </span>
        )}
      </span>

      {showProgress && (
        <div
          className="typewriter-progress"
          role="progressbar"
          aria-valuenow={Math.round(typewriterState.progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Typing progress"
        >
          <div
            className="typewriter-progress-bar"
            style={{width: `${typewriterState.progress}%`}}
          />
        </div>
      )}

      {/* Screen reader announcements */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {typewriterState.isTyping ? 'Typing in progress...' : 'Typing complete'}
      </span>
    </div>
  )
}

export default TypewriterText
