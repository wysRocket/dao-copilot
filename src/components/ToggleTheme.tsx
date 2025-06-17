import {Moon, Sun} from 'lucide-react'
import React from 'react'
import {Button} from './ui/button'
import {useTheme} from '../contexts/ThemeProvider'

export default function ToggleTheme() {
  const {mode, toggleTheme} = useTheme()
  
  return (
    <Button
      onClick={toggleTheme}
      size="icon"
      variant="ghost"
      className="app-region-no-drag"
      style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
      title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} theme`}
    >
      {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  )
}
