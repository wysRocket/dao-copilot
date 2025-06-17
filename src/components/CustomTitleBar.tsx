import React, {useEffect, useRef} from 'react'
import {useWindowPortal} from '../hooks/useWindowPortal'
import {useWindowCommunication, useTranscriptionState} from '../hooks/useSharedState'
import {useWindowState} from '../contexts/WindowStateProvider'
import {getAudioRecordingService, TranscriptionResult} from '../services/audio-recording'
import RecordingControls from './RecordingControls'
import ToggleTheme from '../components/ToggleTheme'
import {PerformanceDashboard} from './PerformanceDashboard'

// Note: You may need to add the following to your global CSS:
// .app-region-drag { -webkit-app-region: drag; }
// .app-region-no-drag { -webkit-app-region: no-drag; }

const CustomTitleBar: React.FC = () => {
  const titleBarRef = useRef<HTMLDivElement>(null)
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

  return (
    <div
      ref={titleBarRef}
      className="app-region-drag flex h-10 items-center gap-3 rounded-t-lg px-4 shadow-sm select-none transition-colors duration-300"
      style={{
        WebkitAppRegion: 'drag',
        backgroundColor: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-primary)',
      } as React.CSSProperties}
    >
      <RecordingControls onTranscription={handleTranscription} />

      <ToggleTheme />
      <PerformanceDashboard compact />
      <div className="flex-1"></div>
      <button
        onClick={handleToggleAssistant}
        className="app-region-no-drag flex items-center rounded border-none bg-none px-2 py-1 transition-colors duration-200"
        style={{
          WebkitAppRegion: 'no-drag',
          color: 'var(--text-primary)',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        } as React.CSSProperties}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
          e.currentTarget.style.borderColor = 'var(--border-focus)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
          e.currentTarget.style.borderColor = 'var(--border-primary)';
        }}
        title="Toggle Assistant Visibility (focus stays on main)"
      >
        {assistantWindow.isWindowVisible ? 'Hide AI' : 'Ask AI'}
      </button>
      <span
        className="shortcut app-region-no-drag mx-1 text-xs"
        style={{ 
          color: 'var(--text-muted)',
          WebkitAppRegion: 'no-drag' 
        } as React.CSSProperties}
      >
        {navigator.platform.toUpperCase().includes('MAC') ? '⌘↵' : 'Ctrl+↵'}
      </span>
      <button
        onClick={handleToggleBothWindows}
        className="app-region-no-drag flex items-center rounded border-none bg-none px-2 py-1 transition-colors duration-200"
        style={{
          WebkitAppRegion: 'no-drag',
          color: 'var(--text-primary)',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        } as React.CSSProperties}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
          e.currentTarget.style.borderColor = 'var(--border-focus)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
          e.currentTarget.style.borderColor = 'var(--border-primary)';
        }}
        title="Toggle Both Windows Together"
      >
        {windowState.isVisible ? 'Hide' : 'Show'}
      </button>
      <span
        className="shortcut app-region-no-drag mx-1 text-xs"
        style={{
          color: 'var(--text-muted)',
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties}
      >
        {navigator.platform.toUpperCase().includes('MAC') ? '⌘\\' : 'Ctrl+\\'}
      </span>
      <button
        onClick={handleSettings}
        className="settings-btn app-region-no-drag ml-2 rounded border-none bg-none p-1 transition-colors duration-200"
        style={{
          WebkitAppRegion: 'no-drag',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        } as React.CSSProperties}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
          e.currentTarget.style.borderColor = 'var(--border-focus)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
          e.currentTarget.style.borderColor = 'var(--border-primary)';
        }}
        title="Settings"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="9" cy="9" r="8" stroke="var(--text-tertiary)" strokeWidth="2" />
          <circle cx="9" cy="9" r="2" fill="var(--text-tertiary)" />
        </svg>
      </button>
    </div>
  )
}

export default CustomTitleBar
