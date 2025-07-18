import * as React from 'react'
import {cn} from '@/utils/tailwind'
import {useWindowState} from '../../contexts/WindowStateProvider'
import {useSharedState} from '../../hooks/useSharedState'
import GeminiConnectionIndicator from '../GeminiConnectionIndicator'
import {ConnectionState} from '../../services/gemini-live-websocket'
import {ConnectionQuality} from '../../services/gemini-reconnection-manager'

export interface WindowStatusProps {
  className?: string
  showWindowInfo?: boolean
  showConnectionStatus?: boolean
  showRecordingStatus?: boolean
  showTranscriptCount?: boolean
  showGeminiConnection?: boolean
  geminiConnectionState?: ConnectionState
  geminiConnectionQuality?: ConnectionQuality | null
  geminiReconnecting?: boolean
  geminiReconnectionAttempts?: number
  compact?: boolean
}

export const WindowStatus: React.FC<WindowStatusProps> = ({
  className,
  showWindowInfo = true,
  showConnectionStatus = false,
  showRecordingStatus = true,
  showTranscriptCount = false,
  showGeminiConnection = false,
  geminiConnectionState = ConnectionState.DISCONNECTED,
  geminiConnectionQuality = null,
  geminiReconnecting = false,
  geminiReconnectionAttempts = 0,
  compact = false
}) => {
  const {windowState} = useWindowState()
  const {isRecording, transcripts, isProcessing} = useSharedState()

  const getRecordingStatusColor = () => {
    if (isRecording) return 'bg-destructive'
    if (isProcessing) return 'bg-yellow-600 dark:bg-yellow-400'
    return 'bg-muted-foreground/50'
  }

  const getRecordingStatusText = () => {
    if (isRecording) return 'Recording'
    if (isProcessing) return 'Processing'
    return 'Ready'
  }

  const getWindowTypeIcon = () => {
    switch (windowState.windowType) {
      case 'main':
        return '🏠'
      case 'assistant':
        return '🤖'
      case 'settings':
        return '⚙️'
      case 'overlay':
        return '📌'
      default:
        return '🪟'
    }
  }

  if (compact) {
    return (
      <div className={cn('text-muted-foreground flex items-center space-x-2 text-xs', className)}>
        {showRecordingStatus && (
          <div className="flex items-center space-x-1">
            <div
              className={cn('h-1.5 w-1.5 rounded-full', getRecordingStatusColor(), {
                'animate-pulse': isRecording
              })}
            ></div>
            <span className="sr-only">{getRecordingStatusText()}</span>
          </div>
        )}

        {showTranscriptCount && <span>{transcripts.length}</span>}

        {showGeminiConnection && (
          <GeminiConnectionIndicator
            state={geminiConnectionState}
            quality={geminiConnectionQuality}
            isReconnecting={geminiReconnecting}
            reconnectionAttempts={geminiReconnectionAttempts}
            showLabel={false}
          />
        )}

        {showWindowInfo && <span>{getWindowTypeIcon()}</span>}
      </div>
    )
  }

  return (
    <div className={cn('text-muted-foreground flex items-center space-x-4 text-xs', className)}>
      {showWindowInfo && (
        <div className="flex items-center space-x-2">
          <span>{getWindowTypeIcon()}</span>
          <span className="capitalize">{windowState.windowType}</span>
          {windowState.windowId && (
            <span className="font-mono">#{windowState.windowId.slice(-4)}</span>
          )}
        </div>
      )}

      {showRecordingStatus && (
        <div className="flex items-center space-x-2">
          <div
            className={cn('h-2 w-2 rounded-full', getRecordingStatusColor(), {
              'animate-pulse': isRecording
            })}
          ></div>
          <span>{getRecordingStatusText()}</span>
        </div>
      )}

      {showTranscriptCount && (
        <div className="flex items-center space-x-1">
          <span>📝</span>
          <span>{transcripts.length} transcripts</span>
        </div>
      )}

      {showConnectionStatus && (
        <div className="flex items-center space-x-2">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              windowState.isFocused ? 'bg-green-600 dark:bg-green-400' : 'bg-muted-foreground/50'
            )}
          ></div>
          <span>{windowState.isFocused ? 'Focused' : 'Background'}</span>
        </div>
      )}

      {showGeminiConnection && (
        <GeminiConnectionIndicator
          state={geminiConnectionState}
          quality={geminiConnectionQuality}
          isReconnecting={geminiReconnecting}
          reconnectionAttempts={geminiReconnectionAttempts}
          showLabel={true}
        />
      )}
    </div>
  )
}
