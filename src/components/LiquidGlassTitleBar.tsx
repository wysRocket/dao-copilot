import React, {useEffect, useRef} from 'react'
import LiquidGlass from 'liquid-glass-react'
import {useWindowPortal} from '../hooks/useWindowPortal'
import {useWindowCommunication, useTranscriptionState} from '../hooks/useSharedState'
import {useWindowState} from '../contexts/WindowStateProvider'
import {getAudioRecordingService, TranscriptionResult} from '../services/audio-recording'
import RecordingControls from './RecordingControls'
import ToggleTheme from '../components/ToggleTheme'
import {PerformanceDashboard} from './PerformanceDashboard'
import {GlassButton} from './ui/glass-button'
import {cn} from '../utils/tailwind'

interface LiquidGlassTitleBarProps {
  variant?: 'default' | 'assistant' | 'minimal'
  className?: string
}

const LiquidGlassTitleBar: React.FC<LiquidGlassTitleBarProps> = ({
  variant = 'default',
  className
}) => {
  const titleBarRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const assistantWindow = useWindowPortal({type: 'assistant'})
  const {broadcast} = useWindowCommunication()
  const {setProcessingState} = useTranscriptionState()
  const {windowState} = useWindowState()

  // Use the audio recording service
  const audioService = getAudioRecordingService()

  // Subscribe to recording state changes
  useEffect(() => {
    const unsubscribe = audioService.onStateChange(newState => {
      setProcessingState(newState.isTranscribing)
    })

    // Cleanup on unmount
    return () => {
      unsubscribe()
      audioService.destroy()
    }
  }, [audioService, setProcessingState])

  const handleTranscription = (result: TranscriptionResult) => {
    // Broadcast transcription result to all windows
    broadcast('transcription-result', result)
  }

  const handleToggleAssistant = async () => {
    console.log('Ask AI button clicked - toggling assistant window, keeping focus on main')

    if (assistantWindow.isWindowOpen && assistantWindow.isWindowVisible) {
      console.log('Assistant window is visible, hiding it')
      assistantWindow.hideWindow()
    } else if (assistantWindow.isWindowOpen) {
      console.log('Assistant window exists but hidden, showing it without focus')
      assistantWindow.showWindow()

      // Keep focus on main window after showing assistant
      setTimeout(() => {
        console.log('Refocusing main window after showing assistant')
        if (windowState.windowId && window.electronWindow?.focusWindow) {
          window.electronWindow.focusWindow(windowState.windowId)
        }
      }, 100)
    } else {
      console.log('Assistant window does not exist, creating it without focus')
      await assistantWindow.openWindow()

      // Keep focus on main window after creating assistant
      setTimeout(() => {
        console.log('Refocusing main window after creating assistant')
        if (windowState.windowId && window.electronWindow?.focusWindow) {
          window.electronWindow.focusWindow(windowState.windowId)
        }
      }, 200)
    }
  }

  const handleToggleBothWindows = async () => {
    console.log('Show/Hide button clicked - toggling both windows together')

    // Check if main window is currently visible
    const isMainVisible = windowState.isVisible

    if (isMainVisible) {
      console.log('Main window is visible, hiding both windows')
      // Hide assistant window first
      if (assistantWindow.isWindowOpen && assistantWindow.isWindowVisible) {
        assistantWindow.hideWindow()
      }
      // Then minimize main window
      if (window.electronWindow?.minimize) {
        window.electronWindow.minimize()
      }
    } else {
      console.log('Main window is hidden, showing both windows')
      // Restore main window first
      if (windowState.windowId && window.electronWindow?.showWindow) {
        window.electronWindow.showWindow(windowState.windowId)
      }
      // Then show assistant window if it exists
      if (assistantWindow.isWindowOpen) {
        setTimeout(() => {
          assistantWindow.showWindow()
          // Keep focus on main window
          setTimeout(() => {
            if (windowState.windowId && window.electronWindow?.focusWindow) {
              window.electronWindow.focusWindow(windowState.windowId)
            }
          }, 100)
        }, 100)
      }
    }
  }

  const handleSettings = () => {
    assistantWindow.openWindow()
    // Send message to set AssistantWindow to Settings tab
    setTimeout(() => {
      broadcast('set-assistant-view', 'settings')
    }, 100)
  }

  // Ensure dragging works properly even after focus events
  useEffect(() => {
    const titleBar = titleBarRef.current
    if (!titleBar) return

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Only enable dragging if we're not clicking on interactive elements
      if (!target.closest('.app-region-no-drag')) {
        // Ensure the drag region is active
        ;(titleBar.style as unknown as {webkitAppRegion: string}).webkitAppRegion = 'drag'
      }
    }

    const handleFocus = () => {
      // Re-enable dragging when window gets focus
      ;(titleBar.style as unknown as {webkitAppRegion: string}).webkitAppRegion = 'drag'
    }

    titleBar.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('focus', handleFocus)

    return () => {
      titleBar.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const getVariantStyles = () => {
    switch (variant) {
      case 'assistant':
        return {
          blurAmount: 0.08,
          displacementScale: 80,
          elasticity: 0.25,
          aberrationIntensity: 1.5,
          saturation: 120,
          overLight: false
        }
      case 'minimal':
        return {
          blurAmount: 0.05,
          displacementScale: 50,
          elasticity: 0.1,
          aberrationIntensity: 1,
          saturation: 110,
          overLight: true
        }
      default:
        return {
          blurAmount: 0.06,
          displacementScale: 65,
          elasticity: 0.18,
          aberrationIntensity: 2,
          saturation: 130,
          overLight: false
        }
    }
  }

  const glassProps = getVariantStyles()

  return (
    <div ref={containerRef} className={cn('relative h-12 w-full select-none', className)}>
      <LiquidGlass
        mouseContainer={containerRef}
        cornerRadius={12}
        padding="0"
        {...glassProps}
        className="h-full w-full"
        style={{position: 'relative', zIndex: 1}}
      >
        <div
          ref={titleBarRef}
          className="app-region-drag flex h-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 shadow-lg backdrop-blur-md"
          style={{WebkitAppRegion: 'drag'} as React.CSSProperties}
        >
          <div
            className="app-region-no-drag"
            style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
          >
            <RecordingControls onTranscription={handleTranscription} />
          </div>

          <div
            className="app-region-no-drag"
            style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
          >
            <ToggleTheme />
          </div>

          <div
            className="app-region-no-drag"
            style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
          >
            <PerformanceDashboard compact />
          </div>

          <div className="flex-1"></div>

          <div
            className="app-region-no-drag flex items-center gap-2"
            style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
          >
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleToggleAssistant}
              className="text-white/90 transition-all duration-200 hover:bg-white/10 hover:text-white"
              title="Toggle Assistant Visibility (focus stays on main)"
            >
              {assistantWindow.isWindowVisible ? 'Hide AI' : 'Ask AI'}
            </GlassButton>

            <span className="text-xs text-white/50">
              {navigator.platform.toUpperCase().includes('MAC') ? '⌘↵' : 'Ctrl+↵'}
            </span>

            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleToggleBothWindows}
              className="text-white/90 transition-all duration-200 hover:bg-white/10 hover:text-white"
              title="Toggle Both Windows Together"
            >
              {windowState.isVisible ? 'Hide' : 'Show'}
            </GlassButton>

            <span className="text-xs text-white/50">
              {navigator.platform.toUpperCase().includes('MAC') ? '⌘\\' : 'Ctrl+\\'}
            </span>

            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleSettings}
              className="p-2 text-white/90 transition-all duration-200 hover:bg-white/10 hover:text-white"
              title="Settings"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 18 18"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="9" cy="9" r="2" fill="currentColor" />
              </svg>
            </GlassButton>
          </div>
        </div>
      </LiquidGlass>
    </div>
  )
}

export default LiquidGlassTitleBar
