import React from 'react'
import {useTheme} from '../contexts/ThemeProvider'

export interface ThemeStatusProps {
  className?: string
  showIcon?: boolean
  showText?: boolean
  compact?: boolean
}

export const ThemeStatus: React.FC<ThemeStatusProps> = ({
  className = '',
  showIcon = true,
  showText = true,
  compact = false
}) => {
  const {mode, isDark, isLight} = useTheme()

  const getThemeIcon = () => {
    if (mode === 'system') return '🌓'
    if (isDark) return '🌙'
    if (isLight) return '☀️'
    return '❓'
  }

  const getThemeText = () => {
    if (mode === 'system') return 'Auto'
    return mode === 'dark' ? 'Dark' : 'Light'
  }

  if (compact) {
    return (
      <div className={`flex items-center space-x-1 text-xs ${className}`}>
        {showIcon && <span>{getThemeIcon()}</span>}
        {showText && <span className="text-muted-foreground">{getThemeText()}</span>}
      </div>
    )
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {showIcon && (
        <div className="bg-muted/50 flex h-6 w-6 items-center justify-center rounded">
          <span className="text-sm">{getThemeIcon()}</span>
        </div>
      )}
      {showText && (
        <div className="flex flex-col">
          <span className="text-foreground text-xs font-medium">Theme</span>
          <span className="text-muted-foreground text-xs">{getThemeText()}</span>
        </div>
      )}
    </div>
  )
}

export default ThemeStatus
