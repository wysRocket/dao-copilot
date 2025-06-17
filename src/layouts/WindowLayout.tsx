import React from 'react'
import {useWindowState} from '../contexts/WindowStateProvider'
import {useGlassEffects} from '../contexts/GlassEffectsProvider'

import CustomTitleBar from '../components/CustomTitleBar'
import {FocusManager} from '../components/FocusManager'
import {BackgroundEffect} from '../components/ui/BackgroundEffect'

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
  const {config: glassConfig} = useGlassEffects()

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
          containerClass: 'h-screen'
        }

      case 'assistant':
        return {
          showTitleBar: true,
          showDragRegion: true,
          padding: 'p-0',
          containerClass: 'h-screen flex flex-col'
        }

      case 'settings':
        return {
          showTitleBar: true,
          showDragRegion: true,
          padding: 'p-0',
          containerClass: 'h-screen flex flex-col'
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
          containerClass: 'h-screen'
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
      <div className={`relative ${layoutConfig.containerClass} ${className}`}>
        {/* Background Effects */}
        {glassConfig.enabled && glassConfig.backgroundEffects && (
          <BackgroundEffect
            type="mesh"
            intensity={
              glassConfig.intensity === 'light'
                ? 'subtle'
                : glassConfig.intensity === 'medium'
                  ? 'medium'
                  : 'vibrant'
            }
            animated={glassConfig.animations}
            className="absolute inset-0"
          />
        )}

        {finalShowTitleBar && <CustomTitleBar />}

        <main className={`relative z-10 ${finalPadding}`}>{children}</main>

        {/* Global shortcuts help overlay */}
        <ShortcutsHelp />
      </div>
    </FocusManager>
  )
}
