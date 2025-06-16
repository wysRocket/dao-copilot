import React from 'react'
import {useWindowState} from '../../contexts/WindowStateProvider'
import {GlassButton} from '../ui/glass-button'
import {cn} from '../../utils/tailwind'

interface GlassWindowControlsProps {
  className?: string
  variant?: 'default' | 'assistant' | 'minimal'
  showMinimize?: boolean
  showMaximize?: boolean
  showClose?: boolean
  size?: 'sm' | 'md'
}

export const GlassWindowControls: React.FC<GlassWindowControlsProps> = ({
  className,
  variant = 'default',
  showMinimize = true,
  showMaximize = true,
  showClose = true,
  size = 'sm'
}) => {
  const {windowState} = useWindowState()

  const handleMinimize = () => {
    if (window.electronWindow?.minimize) {
      window.electronWindow.minimize()
    }
  }

  const handleMaximize = () => {
    if (window.electronWindow?.maximize) {
      window.electronWindow.maximize()
    }
  }

  const handleClose = () => {
    if (windowState.windowType === 'main') {
      if (window.electronWindow?.quit) {
        window.electronWindow.quit()
      }
    } else {
      if (window.electronWindow?.close) {
        window.electronWindow.close()
      }
    }
  }

  const getPlatformStyles = () => {
    const isMac =
      navigator.platform.toUpperCase().includes('MAC') ||
      navigator.userAgent.toUpperCase().includes('MAC')

    return isMac ? 'order-first' : 'order-last'
  }

  const getButtonVariant = (action: 'minimize' | 'maximize' | 'close') => {
    switch (variant) {
      case 'assistant':
        return action === 'close' ? 'destructive' : 'secondary'
      case 'minimal':
        return 'ghost'
      default:
        return action === 'close' ? 'destructive' : 'default'
    }
  }

  const getButtonContent = (action: 'minimize' | 'maximize' | 'close') => {
    const isMac =
      navigator.platform.toUpperCase().includes('MAC') ||
      navigator.userAgent.toUpperCase().includes('MAC')

    if (isMac) {
      // macOS style dots
      const colors = {
        minimize: 'text-yellow-400',
        maximize: 'text-green-400',
        close: 'text-red-400'
      }
      return <div className={cn('h-3 w-3 rounded-full border', colors[action])}>●</div>
    } else {
      // Windows/Linux style symbols
      const symbols = {
        minimize: '−',
        maximize: '□',
        close: '✕'
      }
      return symbols[action]
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
        <GlassButton
          variant={getButtonVariant('minimize')}
          size={size}
          onClick={handleMinimize}
          aria-label={getAriaLabel('minimize')}
          title={getAriaLabel('minimize')}
          className="flex h-6 w-6 items-center justify-center p-0"
          liquidGlassProps={{
            blurAmount: 0.04,
            displacementScale: 30,
            elasticity: 0.1,
            aberrationIntensity: 1,
            saturation: 110,
            cornerRadius: 50
          }}
        >
          {getButtonContent('minimize')}
        </GlassButton>
      )}

      {/* Maximize button */}
      {showMaximize && windowState.windowType === 'main' && (
        <GlassButton
          variant={getButtonVariant('maximize')}
          size={size}
          onClick={handleMaximize}
          aria-label={getAriaLabel('maximize')}
          title={getAriaLabel('maximize')}
          className="flex h-6 w-6 items-center justify-center p-0"
          liquidGlassProps={{
            blurAmount: 0.04,
            displacementScale: 30,
            elasticity: 0.1,
            aberrationIntensity: 1,
            saturation: 110,
            cornerRadius: 50
          }}
        >
          {getButtonContent('maximize')}
        </GlassButton>
      )}

      {/* Close button */}
      {showClose && (
        <GlassButton
          variant={getButtonVariant('close')}
          size={size}
          onClick={handleClose}
          aria-label={getAriaLabel('close')}
          title={getAriaLabel('close')}
          className="flex h-6 w-6 items-center justify-center p-0"
          liquidGlassProps={{
            blurAmount: 0.05,
            displacementScale: 35,
            elasticity: 0.12,
            aberrationIntensity: 1.2,
            saturation: 120,
            cornerRadius: 50
          }}
        >
          {getButtonContent('close')}
        </GlassButton>
      )}
    </div>
  )
}
