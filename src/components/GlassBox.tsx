import React from 'react'
import LiquidGlass from 'liquid-glass-react'
import { useTheme } from '../contexts/ThemeProvider'
import { cn } from '../utils/tailwind'

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

export const GlassBox: React.FC<GlassBoxProps> = ({
  children,
  className = '',
  blurAmount,
  saturation = 1.1,
  cornerRadius = 12,
  mode = 'standard',
  style = {},
  variant = 'medium'
}) => {
  const { isDark } = useTheme()

  // Set default blur amount based on variant
  const defaultBlurAmount = {
    light: 10,
    medium: 20,
    heavy: 30
  }[variant]

  const effectiveBlurAmount = blurAmount ?? defaultBlurAmount

  return (
    <LiquidGlass
      className={cn('transition-all duration-300', className)}
      blurAmount={effectiveBlurAmount}
      saturation={saturation}
      cornerRadius={cornerRadius}
      mode={mode}
      overLight={!isDark}
      style={style}
    >
      <div 
        className="rounded-lg"
        style={{
          backgroundColor: `var(--glass-${variant})`,
          border: '1px solid var(--glass-border)',
          boxShadow: `0 8px 32px var(--glass-shadow)`,
          ...style
        }}
      >
        {children}
      </div>
    </LiquidGlass>
  )
}

export default GlassBox
