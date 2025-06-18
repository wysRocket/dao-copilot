import {Moon, Sun} from 'lucide-react'
import React from 'react'
import {useTheme} from '../contexts/ThemeProvider'
import {useWindowCommunication} from '../hooks/useSharedState'

export default function ToggleTheme() {
  const {mode, toggleTheme} = useTheme()
  const {broadcast} = useWindowCommunication()

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Calculate new mode before toggling
    const newMode = mode === 'dark' ? 'light' : 'dark'

    // Broadcast theme change to all windows FIRST
    try {
      broadcast('theme-changed', newMode)
    } catch (error) {
      // Handle broadcast failure silently or with user notification
      console.warn('Failed to broadcast theme change:', error)
    }

    // Then toggle theme locally
    toggleTheme()
  }

  return (
    <button
      onClick={handleToggle}
      title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} theme`}
      className="app-region-no-drag flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
      style={
        {
          WebkitAppRegion: 'no-drag',
          background: 'var(--glass-light)',
          border: '1px solid var(--glass-border)',
          color: 'var(--text-primary)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 10,
          cursor: 'pointer',
          pointerEvents: 'auto'
        } as React.CSSProperties
      }
    >
      {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
