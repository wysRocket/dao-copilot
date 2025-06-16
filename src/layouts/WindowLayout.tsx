import React from 'react'
import {useWindowState} from '../contexts/WindowStateProvider'

import LiquidGlassTitleBar from '../components/LiquidGlassTitleBar'
import {FocusManager} from '../components/FocusManager'

import {ShortcutsHelp} from '../components/ShortcutsHelp'
import {useKeyboardShortcuts, useWindowShortcuts} from '../hooks/useKeyboardShortcuts'

interface WindowLayoutProps {
  children: React.ReactNode
  showTitleBar?: boolean
  showDragRegion?: boolean
  padding?: string
  className?: string
}

export default function WindowLayout({
  children,
  showTitleBar = true,

  padding = 'p-2 pb-20',
  className = ''
}: WindowLayoutProps) {
  const {windowState} = useWindowState()

  // Setup keyboard shortcuts for this window
  useWindowShortcuts(windowState.windowType)
  useKeyboardShortcuts()

  // Determine layout based on window type
  const getLayoutConfig = () => {
    switch (windowState.windowType) {
      case 'main':
        return {
          showTitleBar: true,
          showDragRegion: true,
          padding: 'p-2 pb-20',
          containerClass: 'h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900'
        }

      case 'assistant':
        return {
          showTitleBar: true,
          showDragRegion: true,
          padding: 'p-0',
          containerClass:
            'h-screen flex flex-col bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900'
        }

      case 'settings':
        return {
          showTitleBar: true,
          showDragRegion: true,
          padding: 'p-0',
          containerClass:
            'h-screen flex flex-col bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900'
        }

      case 'overlay':
        return {
          showTitleBar: false,
          showDragRegion: false,
          padding: 'p-0',
          containerClass: 'h-full w-full'
        }

      default:
        return {
          showTitleBar: true,
          showDragRegion: true,
          padding: 'p-2 pb-20',
          containerClass: 'h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900'
        }
    }
  }

  const layoutConfig = getLayoutConfig()

  // Override with props
  const finalShowTitleBar = showTitleBar && layoutConfig.showTitleBar

  const finalPadding = padding || layoutConfig.padding

  return (
    <FocusManager
      autoFocus={windowState.windowType !== 'main'}
      trapFocus={windowState.windowType === 'overlay'}
      focusBoth={false} // Disable aggressive dual focus - only use manual triggers
    >
      <div className={`${layoutConfig.containerClass} ${className}`}>
        {finalShowTitleBar && (
          <div className="flex items-center justify-between">
            <LiquidGlassTitleBar />
          </div>
        )}

        <main className={finalPadding}>{children}</main>

        {/* Global shortcuts help overlay */}
        <ShortcutsHelp />
      </div>
    </FocusManager>
  )
}
