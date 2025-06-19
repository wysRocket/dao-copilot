import React from 'react'
import {cn} from '../../utils/tailwind'

export interface BackgroundEffectProps {
  type?: 'aurora' | 'particles' | 'gradient' | 'mesh'
  intensity?: 'subtle' | 'medium' | 'vibrant'
  animated?: boolean
  className?: string
}

export const BackgroundEffect: React.FC<BackgroundEffectProps> = ({
  type = 'aurora',
  intensity = 'subtle',
  animated = true,
  className
}) => {
  const getIntensityOpacity = () => {
    switch (intensity) {
      case 'subtle':
        return 0.15
      case 'medium':
        return 0.25
      case 'vibrant':
        return 0.4
      default:
        return 0.15
    }
  }

  const renderAuroraEffect = () => (
    <div
      className={cn('absolute inset-0 overflow-hidden', animated && 'animate-pulse', className)}
      style={{
        background: `
          radial-gradient(ellipse at top left, rgba(59, 130, 246, ${getIntensityOpacity()}) 0%, transparent 50%),
          radial-gradient(ellipse at top right, rgba(168, 85, 247, ${getIntensityOpacity()}) 0%, transparent 50%),
          radial-gradient(ellipse at bottom left, rgba(34, 197, 94, ${getIntensityOpacity()}) 0%, transparent 50%),
          radial-gradient(ellipse at bottom right, rgba(239, 68, 68, ${getIntensityOpacity()}) 0%, transparent 50%)
        `,
        pointerEvents: 'none',
        zIndex: -1
      }}
    />
  )

  const renderGradientEffect = () => (
    <div
      className={cn('absolute inset-0 overflow-hidden', animated && 'animate-gradient', className)}
      style={{
        background: `
          linear-gradient(
            45deg,
            rgba(59, 130, 246, ${getIntensityOpacity()}) 0%,
            rgba(168, 85, 247, ${getIntensityOpacity()}) 25%,
            rgba(34, 197, 94, ${getIntensityOpacity()}) 50%,
            rgba(239, 68, 68, ${getIntensityOpacity()}) 75%,
            rgba(59, 130, 246, ${getIntensityOpacity()}) 100%
          )
        `,
        backgroundSize: '400% 400%',
        pointerEvents: 'none',
        zIndex: -1
      }}
    />
  )

  const renderMeshEffect = () => (
    <div
      className={cn('absolute inset-0 overflow-hidden', className)}
      style={{
        background: `
          radial-gradient(circle at 20% 30%, rgba(59, 130, 246, ${getIntensityOpacity()}) 0%, transparent 40%),
          radial-gradient(circle at 80% 20%, rgba(168, 85, 247, ${getIntensityOpacity()}) 0%, transparent 40%),
          radial-gradient(circle at 60% 70%, rgba(34, 197, 94, ${getIntensityOpacity()}) 0%, transparent 40%),
          radial-gradient(circle at 30% 80%, rgba(239, 68, 68, ${getIntensityOpacity()}) 0%, transparent 40%),
          radial-gradient(circle at 90% 90%, rgba(245, 158, 11, ${getIntensityOpacity()}) 0%, transparent 40%)
        `,
        pointerEvents: 'none',
        zIndex: -1
      }}
    />
  )

  const renderParticlesEffect = () => (
    <div
      className={cn('absolute inset-0 overflow-hidden', className)}
      style={{
        background: `
          radial-gradient(2px 2px at 20px 30px, rgba(59, 130, 246, ${getIntensityOpacity()}), transparent),
          radial-gradient(2px 2px at 40px 70px, rgba(168, 85, 247, ${getIntensityOpacity()}), transparent),
          radial-gradient(1px 1px at 90px 40px, rgba(34, 197, 94, ${getIntensityOpacity()}), transparent),
          radial-gradient(1px 1px at 130px 80px, rgba(239, 68, 68, ${getIntensityOpacity()}), transparent),
          radial-gradient(2px 2px at 160px 30px, rgba(245, 158, 11, ${getIntensityOpacity()}), transparent)
        `,
        backgroundRepeat: 'repeat',
        backgroundSize: '200px 100px',
        pointerEvents: 'none',
        zIndex: -1
      }}
    />
  )

  switch (type) {
    case 'aurora':
      return renderAuroraEffect()
    case 'gradient':
      return renderGradientEffect()
    case 'mesh':
      return renderMeshEffect()
    case 'particles':
      return renderParticlesEffect()
    default:
      return renderAuroraEffect()
  }
}

export default BackgroundEffect
