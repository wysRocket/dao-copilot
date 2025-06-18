import * as React from 'react'
import {cn} from '@/utils/tailwind'
import {useWindowState} from '../../contexts/WindowStateProvider'
import {useSharedState} from '../../hooks/useSharedState'
import GlassBox from '../GlassBox'

export interface WindowInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  syncKey?: string // Key to sync with shared state
  localKey?: string // Key to sync with window local state
  persistOnBlur?: boolean
  windowType?: string
}

const WindowInput = React.forwardRef<HTMLInputElement, WindowInputProps>(
  (
    {
      className,
      type,
      syncKey,
      localKey,
      persistOnBlur = true,
      windowType,
      value,
      onChange,
      onBlur,
      ...props
    },
    ref
  ) => {
    const {windowState, updateLocalState} = useWindowState()
    const sharedStateHook = useSharedState()

    // Auto-detect window type if not provided
    const effectiveWindowType = windowType || windowState.windowType

    // Get the appropriate value source using useCallback to avoid recreating on every render
    const getValue = React.useCallback(() => {
      if (value !== undefined) return value
      if (syncKey && sharedStateHook) {
        const sharedState = sharedStateHook as unknown as Record<string, unknown>
        return (sharedState[syncKey] as string) || ''
      }
      if (localKey) {
        const localState = windowState.localState as Record<string, unknown>
        return (localState[localKey] as string) || ''
      }
      return ''
    }, [value, syncKey, localKey, sharedStateHook, windowState.localState])

    const [internalValue, setInternalValue] = React.useState(getValue())

    // Update internal value when external sources change
    React.useEffect(() => {
      setInternalValue(getValue())
    }, [getValue])

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value
      setInternalValue(newValue)

      // Update appropriate state immediately
      if (syncKey) {
        // For now, we'll disable this complex sync functionality
        // (sharedStateHook as any).updateSharedState?.(syncKey, newValue)
      } else if (localKey) {
        // Use type assertion to handle dynamic key access
        ;(updateLocalState as unknown as (key: string, value: unknown) => void)(localKey, newValue)
      }

      // Call original onChange handler
      onChange?.(event)
    }

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      if (persistOnBlur) {
        if (syncKey) {
          // For now, we'll disable this complex sync functionality
          // (sharedStateHook as any).updateSharedState?.(syncKey, internalValue)
        } else if (localKey) {
          // Use type assertion to handle dynamic key access
          ;(updateLocalState as unknown as (key: string, value: unknown) => void)(
            localKey,
            internalValue
          )
        }
      }

      // Call original onBlur handler
      onBlur?.(event)
    }

    // Window-specific styling
    const getWindowStyles = () => {
      switch (effectiveWindowType) {
        case 'overlay':
          return 'h-7 px-3 py-2'
        case 'assistant':
        case 'settings':
          return 'h-9 px-3 py-2'
        default:
          return 'h-10 px-3 py-2'
      }
    }

    return (
      <GlassBox variant="light" className={cn('overflow-hidden', className)} cornerRadius={8}>
        <input
          type={type}
          className={cn(
            'w-full border-0 bg-transparent transition-all duration-200 outline-none',
            'placeholder:text-muted-foreground',
            'focus:border-0 focus:ring-0',
            'disabled:cursor-not-allowed disabled:opacity-50',
            getWindowStyles()
          )}
          style={{
            color: 'var(--text-primary)',
            fontSize: effectiveWindowType === 'overlay' ? '12px' : '14px',
            fontFamily: 'inherit'
          }}
          ref={ref}
          value={internalValue}
          onChange={handleChange}
          onBlur={handleBlur}
          {...props}
        />
      </GlassBox>
    )
  }
)
WindowInput.displayName = 'WindowInput'

export {WindowInput}
