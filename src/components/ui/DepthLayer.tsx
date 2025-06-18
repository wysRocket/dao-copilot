import React, {useMemo} from 'react'
import {cn} from '../../utils/tailwind'

export interface DepthLayerProps {
  level?: 'base' | 'elevated' | 'overlay' | 'modal'
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  blur?: boolean
}

export const DepthLayer: React.FC<DepthLayerProps> = ({
  level = 'base',
  children,
  className,
  style,
  blur = true
}) => {
  const getDepthStyles = useMemo(() => {
    const baseStyle: React.CSSProperties = {
      position: 'relative',
      isolation: 'isolate'
    }

    switch (level) {
      case 'base':
        return {
          ...baseStyle,
          zIndex: 1,
          background: 'var(--glass-light)',
          backdropFilter: blur ? 'blur(8px)' : 'none',
          WebkitBackdropFilter: blur ? 'blur(8px)' : 'none'
        }
      case 'elevated':
        return {
          ...baseStyle,
          zIndex: 10,
          background: 'var(--glass-medium)',
          backdropFilter: blur ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: blur ? 'blur(12px)' : 'none',
          boxShadow: '0 4px 16px var(--glass-shadow)'
        }
      case 'overlay':
        return {
          ...baseStyle,
          zIndex: 50,
          background: 'var(--glass-heavy)',
          backdropFilter: blur ? 'blur(16px)' : 'none',
          WebkitBackdropFilter: blur ? 'blur(16px)' : 'none',
          boxShadow: '0 8px 32px var(--glass-shadow)'
        }
      case 'modal':
        return {
          ...baseStyle,
          zIndex: 100,
          background: 'var(--glass-heavy)',
          backdropFilter: blur ? 'blur(20px)' : 'none',
          WebkitBackdropFilter: blur ? 'blur(20px)' : 'none',
          boxShadow: '0 16px 64px var(--glass-shadow)',
          border: '1px solid var(--glass-border)'
        }
      default:
        return baseStyle
    }
  }, [level, blur])

  return (
    <div
      className={cn('depth-layer', className)}
      style={{
        ...getDepthStyles,
        ...style
      }}
    >
      {children}
    </div>
  )
}

export default DepthLayer
