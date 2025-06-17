import React from 'react'
import {useTheme} from '../contexts/ThemeProvider'
import {cn} from '../utils/tailwind'

export interface GlassBoxProps {
  children: React.ReactNode
  className?: string
  blurAmount?: number
  saturation?: number
  cornerRadius?: number
  mode?: 'standard' | 'light' | 'dark'
  style?: React.CSSProperties
  variant?: 'light' | 'medium' | 'heavy'
}

export const GlassBox: React.FC<GlassBoxProps> = React.memo(
  ({
    children,
    className = '',
    blurAmount,
    saturation = 1.1,
    cornerRadius = 12,
    mode = 'standard',
    style = {},
    variant = 'medium'
  }) => {
    const {isDark} = useTheme()

    // Set default blur amount based on variant
    const defaultBlurAmount = {
      light: 10,
      medium: 20,
      heavy: 30
    }[variant]

    const effectiveBlurAmount = blurAmount ?? defaultBlurAmount

    return (
      <div
        className={cn('glass-container transition-all duration-300', className)}
        style={{
          backgroundColor: `var(--glass-${variant})`,
          border: '1px solid var(--glass-border)',
          borderRadius: `${cornerRadius}px`,
          backdropFilter: `blur(${effectiveBlurAmount}px) saturate(${saturation})`,
          WebkitBackdropFilter: `blur(${effectiveBlurAmount}px) saturate(${saturation})`,
          boxShadow: `0 8px 32px var(--glass-shadow)`,
          contain: 'layout style paint',
          willChange: 'transform',
          transform: 'translateZ(0)',
          ...style
        }}
      >
        {children}
      </div>
    )
  }
)

GlassBox.displayName = 'GlassBox'

export default GlassBox
