import React from 'react'
import LiquidGlass from 'liquid-glass-react'
import {cn} from '../../utils/tailwind'

interface GlassNavigationProps {
  children: React.ReactNode
  className?: string
  orientation?: 'horizontal' | 'vertical'
}

export const GlassNavigation: React.FC<GlassNavigationProps> = ({
  children,
  className,
  orientation = 'horizontal'
}) => {
  return (
    <LiquidGlass
      className={cn(
        'border border-white/10 bg-white/5 backdrop-blur-md',
        'rounded-lg shadow-lg',
        orientation === 'horizontal'
          ? 'flex items-center space-x-1 p-2'
          : 'flex flex-col space-y-1 p-2',
        className
      )}
      blurAmount={0.06}
      displacementScale={65}
      elasticity={0.18}
      aberrationIntensity={2}
      saturation={130}
      cornerRadius={12}
    >
      {children}
    </LiquidGlass>
  )
}

interface GlassNavItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  children: React.ReactNode
}

export const GlassNavItem: React.FC<GlassNavItemProps> = ({
  active = false,
  children,
  className,
  ...props
}) => {
  return (
    <button
      className={cn(
        'rounded-md px-3 py-2 text-sm font-medium transition-all duration-200',
        'hover:bg-white/10 focus:ring-2 focus:ring-white/20 focus:outline-none',
        active ? 'bg-white/20 text-white shadow-md' : 'text-white/70 hover:text-white',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
