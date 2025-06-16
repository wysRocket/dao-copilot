import React from 'react'
import LiquidGlass from 'liquid-glass-react'
import {cn} from '../../utils/tailwind'

interface GlassSidebarProps {
  children: React.ReactNode
  className?: string
  width?: 'sm' | 'md' | 'lg'
}

export const GlassSidebar: React.FC<GlassSidebarProps> = ({children, className, width = 'md'}) => {
  const widths = {
    sm: 'w-48',
    md: 'w-64',
    lg: 'w-80'
  }

  return (
    <LiquidGlass
      className={cn(
        'h-full border-r border-white/10 bg-white/5 backdrop-blur-xl',
        'shadow-xl',
        widths[width],
        className
      )}
      blurAmount={0.08}
      displacementScale={70}
      elasticity={0.2}
      aberrationIntensity={2.2}
      saturation={135}
      cornerRadius={0}
    >
      <div className="h-full overflow-y-auto p-4">{children}</div>
    </LiquidGlass>
  )
}
