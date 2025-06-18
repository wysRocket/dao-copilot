import React from 'react'
import {GlassCard} from 'liquid-glass-react'
import {cn} from '../../utils/tailwind'

export interface GlassOverlayProps {
  children?: React.ReactNode
  className?: string
  blur?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  opacity?: number
  borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  gradient?: string
  pattern?: 'none' | 'dots' | 'lines' | 'noise'
  animated?: boolean
  intensity?: 'light' | 'medium' | 'strong'
  style?: React.CSSProperties
}

const blurMap = {
  none: 'backdrop-blur-none',
  sm: 'backdrop-blur-sm',
  md: 'backdrop-blur-md',
  lg: 'backdrop-blur-lg',
  xl: 'backdrop-blur-xl'
}

const radiusMap = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full'
}

const patternStyles = {
  none: '',
  dots: `
    radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    radial-gradient(circle at 75% 75%, rgba(255, 255, 255, 0.05) 1px, transparent 1px)
  `,
  lines: `
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
  `,
  noise: `
    repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.01) 0px,
      rgba(255, 255, 255, 0.01) 1px,
      transparent 1px,
      transparent 2px
    )
  `
}

const intensityMap = {
  light: {
    opacity: 0.4,
    blur: 'sm' as const
  },
  medium: {
    opacity: 0.6,
    blur: 'md' as const
  },
  strong: {
    opacity: 0.8,
    blur: 'lg' as const
  }
}

export const GlassOverlay: React.FC<GlassOverlayProps> = React.memo(
  ({
    children,
    className,
    blur = 'md',
    opacity = 0.6,
    borderRadius = 'lg',
    gradient,
    pattern = 'none',
    animated = false,
    intensity,
    style,
    ...props
  }) => {
    // If intensity is provided, use its preset values
    const effectiveBlur = intensity ? intensityMap[intensity].blur : blur
    const effectiveOpacity = intensity ? intensityMap[intensity].opacity : opacity

    // Create gradient background
    const backgroundGradient =
      gradient ||
      'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)'

    // Combine pattern with gradient
    const backgroundImage =
      pattern !== 'none' ? `${patternStyles[pattern]}, ${backgroundGradient}` : backgroundGradient

    const overlayStyle: React.CSSProperties = {
      ...style,
      '--glass-opacity': effectiveOpacity,
      background: backgroundImage,
      backgroundSize: pattern === 'dots' ? '20px 20px' : pattern === 'lines' ? '20px 20px' : 'auto',
      // Performance optimizations
      willChange: animated ? 'transform, opacity' : 'auto',
      backfaceVisibility: 'hidden',
      transform: 'translateZ(0)', // Force hardware acceleration
      contain: 'layout style paint',
      ...style
    }

    return (
      <GlassCard
        className={cn(
          'relative overflow-hidden',
          'border border-white/10',
          blurMap[effectiveBlur],
          radiusMap[borderRadius],
          animated && 'transition-all duration-300 ease-in-out',
          'hover:border-white/20',
          className
        )}
        style={overlayStyle}
        {...props}
      >
        {children}
      </GlassCard>
    )
  }
)

GlassOverlay.displayName = 'GlassOverlay'

export default GlassOverlay
