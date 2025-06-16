import React, {useRef} from 'react'
import LiquidGlass from 'liquid-glass-react'
import {cn} from '../../utils/tailwind'
import {X} from 'lucide-react'

interface GlassModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'default' | 'prominent' | 'subtle'
  liquidGlassProps?: Partial<React.ComponentProps<typeof LiquidGlass>>
}

export const GlassModal: React.FC<GlassModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  variant = 'default',
  liquidGlassProps
}) => {
  const modalRef = useRef<HTMLDivElement>(null)

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  }

  const getGlassProps = () => {
    switch (variant) {
      case 'subtle':
        return {
          blurAmount: 0.08,
          displacementScale: 60,
          elasticity: 0.15,
          aberrationIntensity: 1.5,
          saturation: 120,
          cornerRadius: 16,
          ...liquidGlassProps
        }
      case 'prominent':
        return {
          blurAmount: 0.15,
          displacementScale: 100,
          elasticity: 0.3,
          aberrationIntensity: 3,
          saturation: 150,
          cornerRadius: 24,
          ...liquidGlassProps
        }
      default:
        return {
          blurAmount: 0.12,
          displacementScale: 80,
          elasticity: 0.22,
          aberrationIntensity: 2.5,
          saturation: 135,
          cornerRadius: 20,
          ...liquidGlassProps
        }
    }
  }

  if (!isOpen) return null

  return (
    <div ref={modalRef} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Enhanced Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal */}
      <LiquidGlass
        mouseContainer={modalRef}
        {...getGlassProps()}
        className={cn(
          'relative w-full shadow-2xl',
          'border border-white/20 bg-white/10 backdrop-blur-xl',
          'hover:shadow-3xl transform transition-all duration-300',
          sizes[size]
        )}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <LiquidGlass
              blurAmount={0.05}
              displacementScale={30}
              elasticity={0.1}
              cornerRadius={8}
              className="rounded-md p-1"
            >
              <button
                onClick={onClose}
                className="p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={20} />
              </button>
            </LiquidGlass>
          </div>
        )}

        {/* Content */}
        <div className="p-6">{children}</div>
      </LiquidGlass>
    </div>
  )
}
