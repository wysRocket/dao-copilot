import React from 'react'
import GlassBox from './GlassBox'
import {cn} from '../utils/tailwind'

export interface GlassButtonProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  title?: string
  variant?: 'light' | 'medium' | 'heavy'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  children,
  onClick,
  className = '',
  title,
  variant = 'light',
  size = 'md',
  disabled = false
}) => {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  }

  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={cn(
        'app-region-no-drag rounded-lg transition-all duration-200',
        'hover:scale-105 active:scale-95',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
      style={
        {
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties
      }
      title={title}
      disabled={disabled}
    >
      <GlassBox
        variant={variant}
        cornerRadius={8}
        className={cn(
          'flex items-center justify-center border-0',
          sizeClasses[size],
          'hover:bg-glass-medium active:bg-glass-heavy',
          'transition-all duration-200'
        )}
        style={{
          color: 'var(--text-primary)',
          border: '1px solid var(--glass-border)'
        }}
      >
        {children}
      </GlassBox>
    </button>
  )
}

export default GlassButton
