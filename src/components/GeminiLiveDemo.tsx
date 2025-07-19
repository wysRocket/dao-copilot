/**
 * GeminiLiveDemo - Comprehensive demo component for Gemini Live WebSocket integration
 */

import React, {useState, useEffect} from 'react'
import GlassCard from './GlassCard'
import GlassButton from './GlassButton'
import GlassInput from './GlassInput'
import {useGeminiConnection} from '../hooks/useGeminiConnection'
import {GeminiConnectionIndicator} from './GeminiConnectionIndicator'
import {useTranscriptionState} from '../hooks/useTranscriptionState'
import {getGeminiTranscriptionBridge} from '../services/gemini-transcription-bridge'

interface BridgeStatus {
  isConnected: boolean
  hasClient: boolean
  config: {
    enableEventForwarding: boolean
  }
}

export const GeminiLiveDemo: React.FC = () => {
  const [connectionState, connectionControls] = useGeminiConnection({
    autoConnect: false,
    enableLogging: true
  })

  const {currentStreamingText, isStreamingActive, transcripts} = useTranscriptionState()

  const [testMessage, setTestMessage] = useState(
    'Hello, this is a test message from the Gemini Live API'
  )
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null)
  const [apiKey, setApiKey] = useState(process.env.GEMINI_API_KEY || '')

  // Update bridge status periodically
  useEffect(() => {
    const updateBridgeStatus = () => {
      const bridge = getGeminiTranscriptionBridge()
      setBridgeStatus(bridge.getStatus())
    }

    updateBridgeStatus()
    const interval = setInterval(updateBridgeStatus, 2000)
    return () => clearInterval(interval)
  }, [])

  const handleConnect = async () => {
    try {
      await connectionControls.connect()
    } catch (error) {
      console.error('Failed to connect:', error)
    }
  }

  const handleDisconnect = async () => {
    try {
      await connectionControls.disconnect()
    } catch (error) {
      console.error('Failed to disconnect:', error)
    }
  }

  const handleSendText = async () => {
    const client = connectionControls.getClient()
    if (client && testMessage.trim()) {
      try {
        await client.sendRealtimeInput({
          text: testMessage
        })
        setTestMessage('')
      } catch (error) {
        console.error('Failed to send text:', error)
      }
    }
  }

  const getConnectionStateText = () => {
    switch (connectionState.connectionState) {
      case 'connected':
        return '🟢 Connected'
      case 'connecting':
        return '🟡 Connecting'
      case 'reconnecting':
        return '🟠 Reconnecting'
      default:
        return '🔴 Disconnected'
    }
  }

  return (
    <div className="space-y-6 p-6">
      <GlassCard className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xl font-semibold">Gemini Live WebSocket Demo</h2>
          <GeminiConnectionIndicator
            state={connectionState.connectionState}
            quality={connectionState.quality}
            isReconnecting={connectionState.isReconnecting}
            reconnectionAttempts={connectionState.reconnectionAttempts}
          />
        </div>

        <p className="text-muted-foreground mb-6">
          Test and monitor Gemini Live API WebSocket connection with real-time transcription
        </p>

        {/* API Key Input */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">API Key</label>
          <GlassInput
            type="password"
            value={apiKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
            placeholder="Enter your Gemini API key..."
            className="w-full"
          />
        </div>

        {/* Connection Controls */}
        <div className="mb-6 flex gap-2">
          <GlassButton
            onClick={handleConnect}
            disabled={connectionState.connectionState === 'connected' || !apiKey}
          >
            Connect
          </GlassButton>
          <GlassButton
            onClick={handleDisconnect}
            disabled={connectionState.connectionState === 'disconnected'}
            variant="medium"
          >
            Disconnect
          </GlassButton>
        </div>

        {/* Status Display */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="bg-opacity-20 rounded-lg bg-white p-3 dark:bg-gray-800">
            <p className="text-muted-foreground mb-1 text-xs">Status</p>
            <p className="text-sm font-medium">{getConnectionStateText()}</p>
          </div>
          <div className="bg-opacity-20 rounded-lg bg-white p-3 dark:bg-gray-800">
            <p className="text-muted-foreground mb-1 text-xs">Quality</p>
            <p className="text-sm font-medium">{connectionState.quality || 'Unknown'}</p>
          </div>
          <div className="bg-opacity-20 rounded-lg bg-white p-3 dark:bg-gray-800">
            <p className="text-muted-foreground mb-1 text-xs">Streaming</p>
            <p className="text-sm font-medium">{isStreamingActive ? '🟢 Active' : '⚪ Inactive'}</p>
          </div>
          <div className="bg-opacity-20 rounded-lg bg-white p-3 dark:bg-gray-800">
            <p className="text-muted-foreground mb-1 text-xs">Messages</p>
            <p className="text-sm font-medium">{connectionState.messagesReceived || 0}</p>
          </div>
        </div>
      </GlassCard>

      {/* Bridge Status */}
      <GlassCard className="p-6">
        <h3 className="mb-4 text-lg font-semibold">Transcription Bridge Status</h3>
        {bridgeStatus && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-opacity-20 rounded-lg bg-white p-3 dark:bg-gray-800">
              <p className="text-muted-foreground mb-1 text-xs">Bridge Connected</p>
              <p className="text-sm font-medium">{bridgeStatus.isConnected ? '🟢 Yes' : '🔴 No'}</p>
            </div>
            <div className="bg-opacity-20 rounded-lg bg-white p-3 dark:bg-gray-800">
              <p className="text-muted-foreground mb-1 text-xs">Has Client</p>
              <p className="text-sm font-medium">{bridgeStatus.hasClient ? '🟢 Yes' : '🔴 No'}</p>
            </div>
            <div className="bg-opacity-20 rounded-lg bg-white p-3 dark:bg-gray-800">
              <p className="text-muted-foreground mb-1 text-xs">Event Forwarding</p>
              <p className="text-sm font-medium">
                {bridgeStatus.config?.enableEventForwarding ? '🟢 Enabled' : '🔴 Disabled'}
              </p>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Text Input */}
      <GlassCard className="p-6">
        <h3 className="mb-4 text-lg font-semibold">Send Text Message</h3>
        <div className="space-y-4">
          <textarea
            value={testMessage}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTestMessage(e.target.value)}
            placeholder="Enter a message to send to Gemini Live..."
            className="bg-opacity-20 border-opacity-30 min-h-[100px] w-full rounded-lg border border-gray-300 bg-white p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800"
          />
          <GlassButton
            onClick={handleSendText}
            disabled={connectionState.connectionState !== 'connected' || !testMessage.trim()}
          >
            Send Message
          </GlassButton>
        </div>
      </GlassCard>

      {/* Current Streaming */}
      {isStreamingActive && currentStreamingText && (
        <GlassCard className="border-l-4 border-l-blue-500 p-6">
          <h3 className="mb-4 text-lg font-semibold text-blue-600 dark:text-blue-400">
            Live Streaming Transcription
          </h3>
          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/20">
            <p className="font-mono text-sm leading-relaxed">
              {currentStreamingText}
              <span className="ml-1 animate-pulse">|</span>
            </p>
          </div>
        </GlassCard>
      )}

      {/* Recent Transcripts */}
      {transcripts.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="mb-4 text-lg font-semibold">Recent Transcripts ({transcripts.length})</h3>
          <div className="space-y-3">
            {transcripts.slice(0, 5).map(transcript => (
              <div
                key={transcript.id}
                className="bg-opacity-20 rounded-lg border-l-4 border-l-green-500 bg-white p-4 dark:bg-gray-800"
              >
                <div className="mb-2 flex items-start justify-between">
                  <span className="bg-opacity-50 rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-700">
                    {transcript.source || 'unknown'}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(transcript.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="mb-2 font-mono text-sm leading-relaxed">{transcript.text}</p>
                {transcript.confidence !== undefined && (
                  <span className="bg-opacity-50 rounded bg-green-200 px-2 py-1 text-xs dark:bg-green-800">
                    Confidence: {(transcript.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  )
}

export default GeminiLiveDemo
