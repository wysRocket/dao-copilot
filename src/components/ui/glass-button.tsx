import React from 'react'
import LiquidGlass from 'liquid-glass-react'
import {cn} from '../../utils/tailwind'

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  liquidGlassProps?: Partial<React.ComponentProps<typeof LiquidGlass>>
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({className, variant = 'default', size = 'md', children, liquidGlassProps, ...props}, ref) => {
    const variants = {
      default: 'bg-white/10 hover:bg-white/20 border border-white/20 text-white',
      primary: 'bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-100',
      secondary: 'bg-gray-500/20 hover:bg-gray-500/30 border border-gray-400/30 text-gray-100',
      ghost:
        'bg-transparent hover:bg-white/10 border border-transparent text-white/80 hover:text-white',
      destructive: 'bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-100'
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg'
    }

    const getGlassProps = () => {
      switch (variant) {
        case 'primary':
          return {
            blurAmount: 0.08,
            displacementScale: 70,
            elasticity: 0.2,
            aberrationIntensity: 2.5,
            saturation: 140,
            cornerRadius: 8,
            ...liquidGlassProps
          }
        case 'secondary':
          return {
            blurAmount: 0.06,
            displacementScale: 60,
            elasticity: 0.15,
            aberrationIntensity: 1.8,
            saturation: 120,
            cornerRadius: 8,
            ...liquidGlassProps
          }
        case 'ghost':
          return {
            blurAmount: 0.04,
            displacementScale: 40,
            elasticity: 0.1,
            aberrationIntensity: 1,
            saturation: 110,
            cornerRadius: 8,
            ...liquidGlassProps
          }
        case 'destructive':
          return {
            blurAmount: 0.08,
            displacementScale: 75,
            elasticity: 0.25,
            aberrationIntensity: 3,
            saturation: 150,
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
            cornerRadius: 8,
            ...liquidGlassProps
          }
      }
    }

    return (
      <LiquidGlass
        {...getGlassProps()}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-all duration-200',
          'shadow-lg backdrop-blur-md hover:shadow-xl',
          'focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'cursor-pointer',
          variants[variant],
          sizes[size],
          className
        )}
      >
        <button
          ref={ref}
          className="cursor-inherit h-full w-full border-none bg-transparent outline-none"
          {...props}
        >
          {children}
        </button>
      </LiquidGlass>
    )
  }
)

GlassButton.displayName = 'GlassButton'
