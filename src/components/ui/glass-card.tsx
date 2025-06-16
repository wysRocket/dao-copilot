import React from 'react'
import LiquidGlass from 'liquid-glass-react'
import {cn} from '../../utils/tailwind'

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  variant?: 'default' | 'subtle' | 'strong' | 'prominent' | 'minimal'
  padding?: string
  liquidGlassProps?: Partial<React.ComponentProps<typeof LiquidGlass>>
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {className, children, variant = 'default', padding = 'p-6', liquidGlassProps, ...props},
    ref
  ) => {
    const variants = {
      default: 'backdrop-blur-md bg-white/10 border border-white/20',
      subtle: 'backdrop-blur-sm bg-white/5 border border-white/10',
      strong: 'backdrop-blur-lg bg-white/20 border border-white/30',
      prominent: 'backdrop-blur-xl bg-white/25 border border-white/40 shadow-2xl',
      minimal: 'backdrop-blur-sm bg-white/3 border border-white/5'
    }

    const getGlassProps = () => {
      switch (variant) {
        case 'subtle':
          return {
            blurAmount: 0.04,
            displacementScale: 45,
            elasticity: 0.12,
            aberrationIntensity: 1.2,
            saturation: 115,
            cornerRadius: 12,
            ...liquidGlassProps
          }
        case 'strong':
          return {
            blurAmount: 0.1,
            displacementScale: 85,
            elasticity: 0.25,
            aberrationIntensity: 2.8,
            saturation: 145,
            cornerRadius: 16,
            ...liquidGlassProps
          }
        case 'prominent':
          return {
            blurAmount: 0.12,
            displacementScale: 95,
            elasticity: 0.3,
            aberrationIntensity: 3,
            saturation: 155,
            cornerRadius: 20,
            ...liquidGlassProps
          }
        case 'minimal':
          return {
            blurAmount: 0.025,
            displacementScale: 30,
            elasticity: 0.08,
            aberrationIntensity: 0.8,
            saturation: 105,
            cornerRadius: 8,
            ...liquidGlassProps
          }
        default:
          return {
            blurAmount: 0.06,
            displacementScale: 65,
            elasticity: 0.18,
            aberrationIntensity: 2,
            saturation: 130,
            cornerRadius: 12,
            ...liquidGlassProps
          }
      }
    }

    return (
      <div
        ref={ref}
        {...props}
        className={cn(
          'rounded-lg shadow-lg transition-all duration-300 hover:shadow-xl',
          variants[variant],
          className
        )}
      >
        <LiquidGlass {...getGlassProps()} className="h-full w-full">
          <div className={cn(padding)}>{children}</div>
        </LiquidGlass>
      </div>
    )
  }
)

GlassCard.displayName = 'GlassCard'
