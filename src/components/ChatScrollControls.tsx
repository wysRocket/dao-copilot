/**
 * Chat Scroll Navigation Controls
 *
 * Floating action buttons and indicators for chat scrolling navigation.
 * Includes scroll-to-bottom, scroll-to-top, and new messages indicator.
 */

import React from 'react'
import {cn} from '../utils/tailwind'

export interface ScrollNavigationControlsProps {
  showScrollToTop: boolean
  showScrollToBottom: boolean
  hasNewMessagesBelow: boolean
  onScrollToTop: () => void
  onScrollToBottom: () => void
  className?: string
  unreadCount?: number
}

export function ScrollNavigationControls({
  showScrollToTop,
  showScrollToBottom,
  hasNewMessagesBelow,
  onScrollToTop,
  onScrollToBottom,
  className,
  unreadCount = 0
}: ScrollNavigationControlsProps) {
  return (
    <div className={cn('fixed right-6 z-50 flex flex-col gap-2', className)}>
      {/* Scroll to Top Button */}
      {showScrollToTop && (
        <button
          onClick={onScrollToTop}
          className="group flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-200 hover:scale-110 active:scale-95"
          style={{
            background: 'var(--glass-medium)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 4px 20px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          }}
          aria-label="Scroll to top"
          title="Scroll to top (Ctrl/Cmd + Home)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="transition-colors group-hover:stroke-blue-500"
            style={{color: 'var(--text-primary)'}}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12V4m0 0l-3 3m3-3l3 3" />
          </svg>
        </button>
      )}

      {/* Scroll to Bottom Button with New Messages Indicator */}
      {showScrollToBottom && (
        <button
          onClick={onScrollToBottom}
          className={cn(
            'group relative flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-200 hover:scale-110 active:scale-95',
            hasNewMessagesBelow && 'ring-opacity-50 ring-2 ring-blue-400'
          )}
          style={{
            background: hasNewMessagesBelow
              ? 'linear-gradient(135deg, var(--interactive-primary) 0%, var(--interactive-primary-hover) 100%)'
              : 'var(--glass-medium)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: hasNewMessagesBelow
              ? '0 4px 20px rgba(96, 165, 250, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
              : '0 4px 20px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          }}
          aria-label={hasNewMessagesBelow ? 'New messages - scroll to bottom' : 'Scroll to bottom'}
          title={
            hasNewMessagesBelow
              ? 'New messages - scroll to bottom (Ctrl/Cmd + End)'
              : 'Scroll to bottom (Ctrl/Cmd + End)'
          }
        >
          {/* New messages indicator dot */}
          {hasNewMessagesBelow && (
            <div className="absolute -top-1 -right-1 h-3 w-3 animate-pulse rounded-full bg-red-500 ring-2 ring-white" />
          )}

          {/* Unread count badge */}
          {unreadCount > 0 && (
            <div className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}

          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={cn(
              'transition-colors',
              hasNewMessagesBelow ? 'stroke-white' : 'group-hover:stroke-blue-500'
            )}
            style={{color: hasNewMessagesBelow ? 'white' : 'var(--text-primary)'}}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 4v8m0 0l3-3m-3 3l-3-3" />
          </svg>
        </button>
      )}
    </div>
  )
}

/**
 * New Message Toast Notification
 *
 * Shows when new messages arrive and auto-scroll is disabled.
 */
export interface NewMessageToastProps {
  show: boolean
  messageCount: number
  onScrollToNew: () => void
  onDismiss: () => void
  className?: string
}

export function NewMessageToast({
  show,
  messageCount,
  onScrollToNew,
  onDismiss,
  className
}: NewMessageToastProps) {
  if (!show) return null

  return (
    <div className={cn('fixed top-6 left-1/2 z-50 -translate-x-1/2 transform', className)}>
      <div
        className="flex items-center gap-3 rounded-lg px-4 py-2 shadow-lg transition-all duration-300 hover:scale-105"
        style={{
          background: 'var(--glass-heavy)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Indicator */}
        <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />

        {/* Message */}
        <span className="text-sm font-medium" style={{color: 'var(--text-primary)'}}>
          {messageCount} new message{messageCount > 1 ? 's' : ''}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onScrollToNew}
            className="rounded-md px-3 py-1 text-xs transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/30"
            style={{color: 'var(--text-accent)'}}
          >
            View
          </button>

          <button
            onClick={onDismiss}
            className="flex h-5 w-5 items-center justify-center rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Dismiss notification"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{color: 'var(--text-muted)'}}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3L3 9m0-6l6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Scroll Position Indicator
 *
 * Shows current position in chat history as a progress bar.
 */
export interface ScrollPositionIndicatorProps {
  scrollPercentage: number
  show: boolean
  className?: string
}

export function ScrollPositionIndicator({
  scrollPercentage,
  show,
  className
}: ScrollPositionIndicatorProps) {
  if (!show || scrollPercentage >= 100) return null

  return (
    <div className={cn('fixed top-1/2 right-2 z-40 -translate-y-1/2 transform', className)}>
      <div
        className="h-24 w-1 overflow-hidden rounded-full"
        style={{
          background: 'var(--glass-medium)',
          border: '1px solid var(--glass-border)'
        }}
      >
        <div
          className="w-full rounded-full transition-all duration-300"
          style={{
            height: `${Math.max(scrollPercentage, 5)}%`,
            background:
              'linear-gradient(180deg, var(--interactive-primary) 0%, var(--interactive-primary-hover) 100%)'
          }}
        />
      </div>

      {/* Percentage tooltip */}
      <div
        className="absolute top-1/2 right-3 -translate-y-1/2 transform rounded px-2 py-1 text-xs whitespace-nowrap"
        style={{
          background: 'var(--glass-heavy)',
          border: '1px solid var(--glass-border)',
          color: 'var(--text-secondary)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)'
        }}
      >
        {Math.round(scrollPercentage)}%
      </div>
    </div>
  )
}

export default ScrollNavigationControls
