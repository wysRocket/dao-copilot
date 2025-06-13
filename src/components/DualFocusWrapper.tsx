import React from 'react'
import {FocusManager} from './FocusManager'

interface DualFocusWrapperProps {
  children: React.ReactNode
  autoFocus?: boolean
  className?: string
}

/**
 * A wrapper that enables focusing both main and assistant windows
 * when windows are restored or focused.
 */
export const DualFocusWrapper: React.FC<DualFocusWrapperProps> = ({
  children,
  autoFocus = false,
  className = ''
}) => {
  return (
    <div className={className}>
      <FocusManager focusBoth={true} autoFocus={autoFocus} restoreFocus={true}>
        {children}
      </FocusManager>
    </div>
  )
}

export default DualFocusWrapper
