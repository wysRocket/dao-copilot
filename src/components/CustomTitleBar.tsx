import React, {useEffect} from 'react'
import {useWindowPortal} from '../hooks/useWindowPortal'
import {useWindowCommunication, useTranscriptionState} from '../hooks/useSharedState'
import {getAudioRecordingService, TranscriptionResult} from '../services/audio-recording'
import RecordingControls from './RecordingControls'
import ToggleTheme from '../components/ToggleTheme'
import {PerformanceDashboard} from './PerformanceDashboard'

// Note: You may need to add the following to your global CSS:
// .app-region-drag { -webkit-app-region: drag; }
// .app-region-no-drag { -webkit-app-region: no-drag; }

const CustomTitleBar: React.FC = () => {
  const assistantWindow = useWindowPortal({type: 'assistant'})
  const {broadcast} = useWindowCommunication()
  const {setProcessingState} = useTranscriptionState()

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

  const handleShowHide = () => {
    if (window.electronWindow?.hideWindow) {
      // Get current window ID and hide it
      window.electronWindow.getWindowInfo().then(windowInfo => {
        if (windowInfo?.windowId) {
          window.electronWindow.hideWindow(windowInfo.windowId)
        }
      })
    }
  }

  const handleSettings = () => {
    assistantWindow.openWindow()
    // Send message to set AssistantWindow to Settings tab
    setTimeout(() => {
      broadcast('set-assistant-view', 'settings')
    }, 100)
  }

  return (
    <div className="app-region-drag flex h-10 items-center gap-3 rounded-t-lg bg-[#f6faff] px-4 shadow-sm select-none">
      <RecordingControls onTranscription={handleTranscription} />

      <ToggleTheme />
      <PerformanceDashboard compact />
      <div className="flex-1"></div>
      <button
        onClick={assistantWindow.openWindow}
        className="app-region-no-drag flex items-center rounded border-none bg-none px-2 py-1 text-slate-700 hover:bg-slate-100"
      >
        Ask AI
      </button>
      <span className="shortcut app-region-no-drag mx-1 text-xs text-slate-400">⌘↵</span>
      <button
        onClick={handleShowHide}
        className="app-region-no-drag flex items-center rounded border-none bg-none px-2 py-1 text-slate-700 hover:bg-slate-100"
      >
        Show/Hide
      </button>
      <span className="shortcut app-region-no-drag mx-1 text-xs text-slate-400">⌘\</span>
      <button
        onClick={handleSettings}
        className="settings-btn app-region-no-drag ml-2 rounded border-none bg-none p-1 hover:bg-slate-100"
        title="Settings"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="9" cy="9" r="8" stroke="#cbd5e1" strokeWidth="2" />
          <circle cx="9" cy="9" r="2" fill="#cbd5e1" />
        </svg>
      </button>
    </div>
  )
}

export default CustomTitleBar
