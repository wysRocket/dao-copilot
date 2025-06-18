import React from 'react'
import {cn} from '../utils/tailwind'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  variant?: 'light' | 'medium' | 'heavy'
}

const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className,
  style,
  variant = 'medium'
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'light':
        return {
          background: 'var(--glass-light)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 2px 8px var(--glass-shadow)'
        }
      case 'medium':
        return {
          background: 'var(--glass-medium)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 4px 16px var(--glass-shadow)'
        }
      case 'heavy':
        return {
          background: 'var(--glass-heavy)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 8px 32px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }
      default:
        return {}
    }
  }

  return (
    <div
      className={cn('rounded-xl p-4', className)}
      style={{
        ...getVariantStyles(),
        ...style
      }}
    >
      {children}
    </div>
  )
}

export default GlassCard
