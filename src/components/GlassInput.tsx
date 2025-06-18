import React from 'react'
import GlassBox from './GlassBox'
import {cn} from '../utils/tailwind'

export interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'light' | 'medium' | 'heavy'
  blurAmount?: number
  cornerRadius?: number
  label?: string
  error?: string
  icon?: React.ReactNode
}

export const GlassInput = React.memo(React.forwardRef<HTMLInputElement, GlassInputProps>(
  (
    {
      className,
      variant = 'light',
      blurAmount = 12,
      cornerRadius = 8,
      label,
      error,
      icon,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        {label && (
          <label className="text-sm font-medium" style={{color: 'var(--text-primary)'}}>
            {label}
          </label>
        )}

        <div className="relative">
          <GlassBox
            variant={variant}
            blurAmount={blurAmount}
            cornerRadius={cornerRadius}
            className="overflow-hidden"
          >
            <div className="relative flex items-center">
              {icon && (
                <div
                  className="absolute left-3 flex items-center justify-center"
                  style={{color: 'var(--text-muted)'}}
                >
                  {icon}
                </div>
              )}

              <input
                ref={ref}
                className={cn(
                  'w-full border-0 bg-transparent transition-all duration-200 outline-none',
                  'focus:border-0 focus:ring-0',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  icon ? 'h-10 py-2 pr-3 pl-10' : 'h-10 px-3 py-2'
                )}
                style={{
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontFamily: 'inherit'
                }}
                placeholder={props.placeholder}
                disabled={disabled}
                {...props}
              />
            </div>
          </GlassBox>

          {/* Focus ring effect */}
          <div
            className={cn(
              'pointer-events-none absolute inset-0 rounded-lg',
              'ring-2 ring-transparent transition-all duration-200',
              'focus-within:ring-blue-500/20'
            )}
            style={{
              borderRadius: cornerRadius,
              zIndex: -1
            }}
          />
        </div>

        {error && (
          <span className="text-xs" style={{color: 'var(--interactive-danger)'}}>
            {error}
          </span>
        )}
      </div>
    )
  }
))

GlassInput.displayName = 'GlassInput'

export default GlassInput
