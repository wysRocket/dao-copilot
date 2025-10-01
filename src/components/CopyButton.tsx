/**
 * CopyButton Component
 *
 * A reusable button component that copies text content to the clipboard
 * with visual feedback and proper error handling.
 */

import React, {useState, useCallback} from 'react'
import {cn} from '../utils/tailwind'

export interface CopyButtonProps {
  text: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'icon' | 'button' | 'inline'
  label?: string
  successMessage?: string
  showLabel?: boolean
}

export function CopyButton({
  text,
  className,
  size = 'md',
  variant = 'icon',
  label = 'Copy',
  successMessage = 'Copied!',
  showLabel = false
}: CopyButtonProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'success' | 'error'>('idle')

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation() // Prevent event bubbling
      e.preventDefault()

      setCopyState('copying')

      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(text)
        } else {
          // Fallback for older browsers
          const textArea = document.createElement('textarea')
          textArea.value = text
          textArea.style.position = 'absolute'
          textArea.style.left = '-9999px'
          document.body.appendChild(textArea)
          textArea.select()
          document.execCommand('copy')
          document.body.removeChild(textArea)
        }

        setCopyState('success')
        setTimeout(() => setCopyState('idle'), 2000)
      } catch (err) {
        setCopyState('error')
        setTimeout(() => setCopyState('idle'), 2000)
        console.error('Failed to copy text:', err)
      }
    },
    [text]
  )

  const sizeClasses = {
    sm: 'w-4 h-4 p-1',
    md: 'w-5 h-5 p-1.5',
    lg: 'w-6 h-6 p-2'
  }

  const variantClasses = {
    icon: 'rounded-full hover:bg-gray-100 dark:hover:bg-gray-700',
    button:
      'rounded-md px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600',
    inline: 'rounded hover:bg-gray-100 dark:hover:bg-gray-700'
  }

  const sizeClass = variant === 'icon' ? sizeClasses[size] : ''

  const Icon = () => {
    switch (copyState) {
      case 'success':
        return (
          <svg
            className="h-full w-full"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        )
      case 'error':
        return (
          <svg
            className="h-full w-full"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        )
      default:
        return (
          <svg
            className="h-full w-full"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )
    }
  }

  const getButtonText = () => {
    switch (copyState) {
      case 'copying':
        return 'Copying...'
      case 'success':
        return successMessage
      case 'error':
        return 'Failed'
      default:
        return label
    }
  }

  const getAriaLabel = () => {
    switch (copyState) {
      case 'copying':
        return 'Copying to clipboard...'
      case 'success':
        return `${successMessage} Copied to clipboard`
      case 'error':
        return 'Failed to copy to clipboard'
      default:
        return `Copy "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" to clipboard`
    }
  }

  return (
    <button
      onClick={handleCopy}
      disabled={copyState === 'copying'}
      className={cn(
        'flex items-center gap-2 text-gray-500 transition-all duration-200 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
        'focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        sizeClass,
        variantClasses[variant],
        copyState === 'success' && 'text-green-600 dark:text-green-400',
        copyState === 'error' && 'text-red-600 dark:text-red-400',
        className
      )}
      title={getAriaLabel()}
      aria-label={getAriaLabel()}
    >
      <Icon />
      {(showLabel || variant === 'button') && (
        <span className="text-sm font-medium">{getButtonText()}</span>
      )}
    </button>
  )
}

export default CopyButton
