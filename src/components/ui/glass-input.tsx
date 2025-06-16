import React from 'react'
import LiquidGlass from 'liquid-glass-react'
import {cn} from '../../utils/tailwind'

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  variant?: 'default' | 'subtle' | 'prominent'
  liquidGlassProps?: Partial<React.ComponentProps<typeof LiquidGlass>>
}

export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({className, label, error, variant = 'default', liquidGlassProps, ...props}, ref) => {
    const getGlassProps = () => {
      switch (variant) {
        case 'subtle':
          return {
            blurAmount: 0.04,
            displacementScale: 40,
            elasticity: 0.12,
            aberrationIntensity: 1.2,
            saturation: 115,
            cornerRadius: 8,
            ...liquidGlassProps
          }
        case 'prominent':
          return {
            blurAmount: 0.1,
            displacementScale: 80,
            elasticity: 0.25,
            aberrationIntensity: 2.5,
            saturation: 140,
            cornerRadius: 12,
            ...liquidGlassProps
          }
        default:
          return {
            blurAmount: 0.06,
            displacementScale: 60,
            elasticity: 0.18,
            aberrationIntensity: 2,
            saturation: 125,
            cornerRadius: 8,
            ...liquidGlassProps
          }
      }
    }

    return (
      <div className="space-y-2">
        {label && <label className="block text-sm font-medium text-white/80">{label}</label>}
        <LiquidGlass
          {...getGlassProps()}
          className={cn(
            'relative overflow-hidden rounded-md',
            'border border-white/20 bg-white/5 backdrop-blur-md',
            'focus-within:border-white/40 focus-within:bg-white/10',
            'transition-all duration-200 hover:border-white/30',
            error && 'border-red-400/50 focus-within:border-red-400/70'
          )}
        >
          <input
            ref={ref}
            className={cn(
              'w-full bg-transparent px-3 py-2 text-white placeholder-white/50',
              'focus:ring-0 focus:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-50',
              className
            )}
            {...props}
          />
        </LiquidGlass>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    )
  }
)

GlassInput.displayName = 'GlassInput'
