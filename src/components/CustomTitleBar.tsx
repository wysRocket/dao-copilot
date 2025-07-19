import React, {useEffect, useRef} from 'react'
import {useWindowPortal} from '../hooks/useWindowPortal'
import {useWindowCommunication, useSharedState} from '../hooks/useSharedState'
import {useWindowState} from '../contexts/WindowStateProvider'
import {getAudioRecordingService, TranscriptionResult} from '../services/audio-recording'
import useGeminiConnection from '../hooks/useGeminiConnection'
import {TranscriptionMode} from '../services/gemini-live-integration'
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
  const {setProcessingState, addTranscript} = useSharedState()
  const {windowState} = useWindowState()

  // Use the audio recording service
  const audioService = getAudioRecordingService()

  // Initialize Gemini WebSocket for real-time transcription
  const [geminiState, geminiControls] = useGeminiConnection({
    mode: TranscriptionMode.HYBRID, // Use hybrid mode for fallback
    autoConnect: false, // Don't auto-connect, connect when recording starts
    fallbackToBatch: true,
    enableLogging: true
  })

  // Monitor WebSocket quota issues and adjust behavior
  useEffect(() => {
    console.log('🔌 Gemini WebSocket State:', {
      connectionState: geminiState.connectionState,
      isStreaming: geminiState.isStreaming,
      errors: geminiState.errors,
      reconnectionAttempts: geminiState.reconnectionAttempts
    })

    // If we're getting quota errors, we should avoid WebSocket for a while
    if (geminiState.errors > 3) {
      console.warn(
        '🚫 Multiple WebSocket errors detected, likely quota issues. Using batch-only mode.'
      )
    }
  }, [geminiState])

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
    console.log('🎯 CustomTitleBar: Received transcription result:', result)
    console.log('🎯 Adding to shared state with addTranscript:', {
      text: result.text,
      confidence: result.confidence,
      source: result.source || 'audio-recording'
    })

    // Add transcript to shared state with source information
    addTranscript({
      text: result.text,
      confidence: result.confidence,
      source: result.source || 'audio-recording'
    })

    console.log('🎯 Broadcasting transcription result to other windows')
    // Also broadcast transcription result to other windows (like assistant window)
    broadcast('transcription-result', result)

    console.log('🎯 Transcription handling complete')
  }

  // Handle real-time streaming transcriptions differently than batch
  const handleStreamingTranscription = (text: string, isFinal: boolean) => {
    console.log('🎯 CustomTitleBar: Received streaming transcription:', {
      text: text.substring(0, 50) + '...',
      isFinal
    })

    if (isFinal && text.trim()) {
      // Handle final streaming transcription as a regular transcription result
      const result: TranscriptionResult = {
        text: text.trim(),
        confidence: 0.95,
        source: 'websocket-live'
      }
      handleTranscription(result)
    } else if (text.trim()) {
      // Handle partial streaming transcription for live display
      console.log('🎯 Broadcasting partial streaming transcription for live display')
      broadcast('streaming-transcription', {
        text: text.trim(),
        isFinal: false,
        source: 'websocket-live'
      })
    }
  }

  // Set up WebSocket transcription bridge
  useEffect(() => {
    if (geminiState.connectionState === 'connected' && geminiControls.getClient()) {
      const client = geminiControls.getClient()
      if (client) {
        console.log('🔌 Setting up WebSocket transcription bridge')

        // Listen for real-time transcriptions from WebSocket
        const handleWebSocketTranscription = (text: string, isFinal: boolean) => {
          console.log('🎯 WebSocket transcription received:', {
            text: text.substring(0, 50) + '...',
            isFinal
          })
          handleStreamingTranscription(text, isFinal)
        }

        // Subscribe to transcription events
        // Note: This is a simplified integration - you may need to adjust based on your WebSocket client's actual event system
        client.on?.('transcription', handleWebSocketTranscription)
        client.on?.('partial-transcription', (text: string) =>
          handleWebSocketTranscription(text, false)
        )
        client.on?.('final-transcription', (text: string) =>
          handleWebSocketTranscription(text, true)
        )

        return () => {
          client.off?.('transcription', handleWebSocketTranscription)
          client.off?.('partial-transcription', handleWebSocketTranscription)
          client.off?.('final-transcription', handleWebSocketTranscription)
        }
      }
    }
  }, [geminiState.connectionState, geminiControls, handleStreamingTranscription])

  const handleToggleAssistant = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (assistantWindow.isWindowOpen && assistantWindow.isWindowVisible) {
      assistantWindow.hideWindow()
    } else if (assistantWindow.isWindowOpen) {
      assistantWindow.showWindow()

      // Keep focus on main window after showing assistant
      setTimeout(() => {
        if (windowState.windowId && window.electronWindow?.focusWindow) {
          window.electronWindow.focusWindow(windowState.windowId)
        }
      }, 100)
    } else {
      await assistantWindow.openWindow()

      // Keep focus on main window after creating assistant
      setTimeout(() => {
        if (windowState.windowId && window.electronWindow?.focusWindow) {
          window.electronWindow.focusWindow(windowState.windowId)
        }
      }, 200)
    }
  }

  const handleToggleBothWindows = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
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

  const handleSettings = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
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
      } else {
        // Prevent dragging on interactive elements
        e.stopPropagation()
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
      className="app-region-drag flex w-full items-center overflow-hidden px-4 select-none"
      style={
        {
          WebkitAppRegion: 'drag',
          background: 'var(--glass-medium)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 2px 8px var(--glass-shadow)',
          borderRadius: '8px',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          height: '60px',
          minHeight: '60px',
          maxHeight: '60px',
          position: 'relative',
          zIndex: 1
        } as React.CSSProperties
      }
    >
      {/* Left side - Recording controls */}
      <div
        className="app-region-no-drag flex h-full items-center"
        style={
          {WebkitAppRegion: 'no-drag', zIndex: 20, position: 'relative'} as React.CSSProperties
        }
      >
        <RecordingControls
          onTranscription={handleTranscription}
          geminiConnection={{
            state: geminiState,
            controls: geminiControls
          }}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1"></div>

      {/* Right side - Controls */}
      <div
        className="app-region-no-drag flex h-full items-center gap-2"
        style={
          {WebkitAppRegion: 'no-drag', zIndex: 20, position: 'relative'} as React.CSSProperties
        }
      >
        <ToggleTheme />
        <PerformanceDashboard compact />

        <button
          onClick={handleToggleAssistant}
          title="Ask AI"
          className="app-region-no-drag h-10 rounded-lg px-4 text-sm transition-all duration-200 hover:scale-105 active:scale-95"
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
          Ask AI
        </button>

        <span
          className="mx-1 text-xs opacity-60"
          style={
            {
              color: 'var(--text-muted)',
              WebkitAppRegion: 'no-drag'
            } as React.CSSProperties
          }
        >
          {navigator.platform.toUpperCase().includes('MAC') ? '⌘↵' : 'Ctrl+↵'}
        </span>

        <button
          onClick={handleToggleBothWindows}
          title="Show/Hide"
          className="app-region-no-drag h-10 rounded-lg px-4 text-sm transition-all duration-200 hover:scale-105 active:scale-95"
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
          {windowState.isVisible ? 'Hide' : 'Show'}
        </button>

        <span
          className="mx-1 text-xs opacity-60"
          style={
            {
              color: 'var(--text-muted)',
              WebkitAppRegion: 'no-drag'
            } as React.CSSProperties
          }
        >
          {navigator.platform.toUpperCase().includes('MAC') ? '⌘\\' : 'Ctrl+\\'}
        </span>

        <button
          onClick={handleSettings}
          title="Settings"
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
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="2" />
            <circle cx="9" cy="9" r="2" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default CustomTitleBar
