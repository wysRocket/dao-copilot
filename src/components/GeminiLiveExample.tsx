/**
 * Example usage of Gemini Live WebSocket UI components
 * This component demonstrates how to integrate connection status indicators
 */

import React from 'react'
import {WindowStatus} from '../components/ui/window-status'
import WebSocketConnectionStatus from '../components/WebSocketConnectionStatus'
import GeminiConnectionIndicator from '../components/GeminiConnectionIndicator'
import useGeminiConnection from '../hooks/useGeminiConnection'
import {TranscriptionMode} from '../services/gemini-live-integration'
import {cn} from '@/utils/tailwind'

export interface GeminiLiveExampleProps {
  className?: string
  apiKey?: string
}

export const GeminiLiveExample: React.FC<GeminiLiveExampleProps> = ({
  className,
  apiKey
}) => {
  // Use the Gemini connection hook
  const [connectionState, controls] = useGeminiConnection({
    apiKey,
    mode: TranscriptionMode.HYBRID,
    autoConnect: false,
    fallbackToBatch: true,
    enableLogging: true
  })

  return (
    <div className={cn('space-y-6 p-4', className)}>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Gemini Live WebSocket Integration</h2>
        
        {/* Simple indicator */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Simple Connection Indicator</h3>
          <GeminiConnectionIndicator
            state={connectionState.connectionState}
            quality={connectionState.quality}
            isReconnecting={connectionState.isReconnecting}
            reconnectionAttempts={connectionState.reconnectionAttempts}
            showLabel={true}
          />
        </div>

        {/* Detailed status */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Detailed Connection Status</h3>
          <WebSocketConnectionStatus
            client={controls.getClient() || undefined}
            showQuality={true}
            showMetrics={true}
            showControls={true}
            compact={false}
          />
        </div>

        {/* Integrated with WindowStatus */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Integrated Window Status</h3>
          <WindowStatus
            showWindowInfo={true}
            showRecordingStatus={true}
            showGeminiConnection={true}
            geminiConnectionState={connectionState.connectionState}
            geminiConnectionQuality={connectionState.quality}
            geminiReconnecting={connectionState.isReconnecting}
            geminiReconnectionAttempts={connectionState.reconnectionAttempts}
            compact={false}
          />
        </div>

        {/* Compact version */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Compact Version</h3>
          <WindowStatus
            showWindowInfo={true}
            showRecordingStatus={true}
            showGeminiConnection={true}
            geminiConnectionState={connectionState.connectionState}
            geminiConnectionQuality={connectionState.quality}
            geminiReconnecting={connectionState.isReconnecting}
            geminiReconnectionAttempts={connectionState.reconnectionAttempts}
            compact={true}
          />
        </div>

        {/* Control buttons */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Connection Controls</h3>
          <div className="flex space-x-2">
            <button
              onClick={controls.connect}
              disabled={connectionState.connectionState !== 'disconnected'}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700"
            >
              Connect
            </button>
            <button
              onClick={controls.disconnect}
              disabled={connectionState.connectionState === 'disconnected'}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700"
            >
              Disconnect
            </button>
            <button
              onClick={() => controls.setMode(TranscriptionMode.WEBSOCKET)}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              WebSocket Only
            </button>
            <button
              onClick={() => controls.setMode(TranscriptionMode.HYBRID)}
              className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Hybrid Mode
            </button>
          </div>
        </div>

        {/* Integration state info */}
        {connectionState.integrationState && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Integration State</h3>
            <div className="text-xs space-y-1 font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">
              <div>Mode: {connectionState.integrationState.mode}</div>
              <div>Streaming: {connectionState.integrationState.isStreaming ? 'Yes' : 'No'}</div>
              <div>Processing: {connectionState.integrationState.isProcessing ? 'Yes' : 'No'}</div>
              <div>Bytes Streamed: {connectionState.integrationState.bytesStreamed}</div>
              <div>Messages: {connectionState.integrationState.messagesReceived}</div>
              <div>Errors: {connectionState.integrationState.errors}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GeminiLiveExample
