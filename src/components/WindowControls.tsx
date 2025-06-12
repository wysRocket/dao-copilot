import React from 'react'
import {cn} from '@/utils/tailwind'
import {useWindowState} from '../contexts/WindowStateProvider'
import {WindowButton} from './ui/window-button'

export interface WindowControlsProps {
  className?: string
  showMinimize?: boolean
  showMaximize?: boolean
  showClose?: boolean
  variant?: 'default' | 'overlay' | 'assistant' | 'settings'
  position?: 'left' | 'right'
}

export const WindowControls: React.FC<WindowControlsProps> = ({
  className,
  showMinimize = true,
  showMaximize = true,
  showClose = true,
  variant = 'default',
  position = 'right'
}) => {
  const {windowState, hideWindow} = useWindowState()

  const handleMinimize = () => {
    window.electronWindow?.minimize()
  }

  const handleMaximize = () => {
    window.electronWindow?.maximize()
  }

  const handleClose = () => {
    if (windowState.windowType === 'main') {
      // For main window, use electron close
      window.electronWindow?.close()
    } else {
      // For other windows, hide them instead of closing
      hideWindow()
    }
  }

  // Get platform-specific styling
  const getPlatformStyles = () => {
    // Use browser-based platform detection instead of Node.js process.platform
    const isMac =
      navigator.platform.toUpperCase().includes('MAC') ||
      navigator.userAgent.toUpperCase().includes('MAC')

    if (isMac) {
      // macOS style - left aligned traffic lights
      return position === 'left' ? 'flex-row' : 'flex-row-reverse'
    } else {
      // Windows/Linux style - right aligned
      return position === 'right' ? 'flex-row' : 'flex-row-reverse'
    }
  }

  // Get variant-specific button styles
  const getButtonProps = (action: 'minimize' | 'maximize' | 'close') => {
    const baseProps = {
      size: 'icon-sm' as const,
      className: 'h-6 w-6'
    }

    switch (variant) {
      case 'overlay':
        return {
          ...baseProps,
          variant: 'ghost' as const,
          className: cn(baseProps.className, 'hover:bg-accent/50')
        }

      case 'assistant':
      case 'settings':
        return {
          ...baseProps,
          variant: 'ghost' as const,
          className: cn(baseProps.className, 'hover:bg-accent')
        }

      default:
        if (action === 'close') {
          return {
            ...baseProps,
            variant: 'ghost' as const,
            className: cn(
              baseProps.className,
              'hover:bg-destructive hover:text-destructive-foreground'
            )
          }
        }
        return {
          ...baseProps,
          variant: 'ghost' as const
        }
    }
  }

  // Platform-specific button content
  const getButtonContent = (action: 'minimize' | 'maximize' | 'close') => {
    // Use browser-based platform detection instead of Node.js process.platform
    const isMac =
      navigator.platform.toUpperCase().includes('MAC') ||
      navigator.userAgent.toUpperCase().includes('MAC')

    if (isMac) {
      // macOS style dots
      switch (action) {
        case 'minimize':
          return '○'
        case 'maximize':
          return '○'
        case 'close':
          return '○'
      }
    } else {
      // Windows/Linux style symbols
      switch (action) {
        case 'minimize':
          return '−'
        case 'maximize':
          return '□'
        case 'close':
          return '✕'
      }
    }
  }

  const getAriaLabel = (action: 'minimize' | 'maximize' | 'close') => {
    switch (action) {
      case 'minimize':
        return 'Minimize window'
      case 'maximize':
        return 'Maximize window'
      case 'close':
        return windowState.windowType === 'main'
          ? 'Close application'
          : `Close ${windowState.windowType} window`
    }
  }

  return (
    <div
      className={cn('flex gap-1 p-1', getPlatformStyles(), className)}
      role="group"
      aria-label="Window controls"
    >
      {/* Minimize button */}
      {showMinimize && (
        <WindowButton
          {...getButtonProps('minimize')}
          onClick={handleMinimize}
          aria-label={getAriaLabel('minimize')}
          title={getAriaLabel('minimize')}
        >
          {getButtonContent('minimize')}
        </WindowButton>
      )}

      {/* Maximize button */}
      {showMaximize && windowState.windowType === 'main' && (
        <WindowButton
          {...getButtonProps('maximize')}
          onClick={handleMaximize}
          aria-label={getAriaLabel('maximize')}
          title={getAriaLabel('maximize')}
        >
          {getButtonContent('maximize')}
        </WindowButton>
      )}

      {/* Close button */}
      {showClose && (
        <WindowButton
          {...getButtonProps('close')}
          onClick={handleClose}
          aria-label={getAriaLabel('close')}
          title={getAriaLabel('close')}
        >
          {getButtonContent('close')}
        </WindowButton>
      )}
    </div>
  )
}
