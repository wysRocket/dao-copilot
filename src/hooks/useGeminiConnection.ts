/**
 * Hook for managing Gemini Live WebSocket connection state
 * Provides easy access to connection status, quality, and control functions
 */

import {useEffect, useState, useCallback, useRef} from 'react'
import {ConnectionState} from '../services/gemini-live-websocket'
import {
  TranscriptionMode,
  type IntegrationConfig,
  type IntegrationState
} from '../types/gemini-types'
import {ConnectionQuality, type ConnectionMetrics} from '../services/gemini-reconnection-manager'
import {logger} from '../services/gemini-logger'

export interface UseGeminiConnectionOptions {
  apiKey?: string
  mode?: TranscriptionMode
  autoConnect?: boolean
  fallbackToBatch?: boolean
  enableLogging?: boolean
}

export interface GeminiConnectionState {
  // Connection state
  connectionState: ConnectionState
  integrationState: IntegrationState | null

  // Quality and metrics
  quality: ConnectionQuality | null
  metrics: ConnectionMetrics | null

  // Reconnection info
  isReconnecting: boolean
  reconnectionAttempts: number
  nextReconnectDelay: number

  // Streaming info
  isStreaming: boolean
  isProcessing: boolean
  bytesStreamed: number
  messagesReceived: number
  errors: number
}

export interface GeminiConnectionControls {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  startStreaming: () => Promise<void>
  stopStreaming: () => Promise<void>
  setMode: (mode: TranscriptionMode) => void
  getClient: () => GeminiLiveWebSocketClient | null
  getIntegrationService: () => GeminiLiveIntegrationService | null
}

export function useGeminiConnection(
  options: UseGeminiConnectionOptions = {}
): [GeminiConnectionState, GeminiConnectionControls] {
  const {
    apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '',
    mode = TranscriptionMode.HYBRID,
    autoConnect = false,
    fallbackToBatch = true,
    enableLogging = true
  } = options

  const integrationServiceRef = useRef<GeminiLiveIntegrationService | null>(null)
  const clientRef = useRef<GeminiLiveWebSocketClient | null>(null)

  const [state, setState] = useState<GeminiConnectionState>({
    connectionState: ConnectionState.DISCONNECTED,
    integrationState: null,
    quality: null,
    metrics: null,
    isReconnecting: false,
    reconnectionAttempts: 0,
    nextReconnectDelay: 0,
    isStreaming: false,
    isProcessing: false,
    bytesStreamed: 0,
    messagesReceived: 0,
    errors: 0
  })

  // Initialize integration service
  useEffect(() => {
    if (!apiKey) {
      if (enableLogging) {
        logger.warn('No API key provided for Gemini connection')
      }
      return
    }

    const config: Partial<IntegrationConfig> = {
      apiKey,
      mode,
      fallbackToBatch,
      enableAudioStreaming: true,
      realTimeThreshold: 1000,
      batchFallbackDelay: 5000
    }

    try {
      const integrationService = new GeminiLiveIntegrationService(config)
      integrationServiceRef.current = integrationService

      // Set up event listeners
      setupEventListeners(integrationService)

      // Initialize state
      setState(prev => ({
        ...prev,
        integrationState: integrationService.getState(),
        connectionState: ConnectionState.DISCONNECTED // Start disconnected
      }))

      // Auto-connect if requested
      if (autoConnect) {
        integrationService.startTranscription().catch((error: Error) => {
          if (enableLogging) {
            logger.error('Auto-connect failed:', {error: error?.message || 'Unknown error'})
          }
        })
      }
    } catch (error) {
      if (enableLogging) {
        logger.error('Failed to initialize Gemini integration service:', {
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return () => {
      if (integrationServiceRef.current) {
        integrationServiceRef.current.destroy()
        integrationServiceRef.current = null
        clientRef.current = null
      }
    }
  }, [apiKey, mode, fallbackToBatch, autoConnect, enableLogging])

  const setupEventListeners = useCallback((integrationService: GeminiLiveIntegrationService) => {
    // Integration service events
    integrationService.on('stateUpdate', (integrationState: IntegrationState) => {
      setState(prev => ({
        ...prev,
        integrationState,
        connectionState: integrationState.connectionState,
        isStreaming: integrationState.isStreaming,
        isProcessing: integrationState.isProcessing,
        bytesStreamed: integrationState.bytesStreamed,
        messagesReceived: integrationState.messagesReceived,
        errors: integrationState.errors
      }))
    })

    // WebSocket connection events through integration service
    integrationService.on('websocketConnected', () => {
      setState(prev => ({...prev, connectionState: ConnectionState.CONNECTED}))
    })

    integrationService.on('websocketDisconnected', () => {
      setState(prev => ({...prev, connectionState: ConnectionState.DISCONNECTED}))
    })

    integrationService.on('transcription', () => {
      setState(prev => ({...prev, isProcessing: false}))
    })
  }, [])

  // Control functions
  const connect = useCallback(async () => {
    if (integrationServiceRef.current) {
      await integrationServiceRef.current.startTranscription()
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (integrationServiceRef.current) {
      await integrationServiceRef.current.stopTranscription()
    }
  }, [])

  const startStreaming = useCallback(async () => {
    // Streaming is handled automatically by the integration service
    if (integrationServiceRef.current) {
      await integrationServiceRef.current.startTranscription()
    }
  }, [])

  const stopStreaming = useCallback(async () => {
    if (integrationServiceRef.current) {
      await integrationServiceRef.current.stopTranscription()
    }
  }, [])

  const setMode = useCallback(async (newMode: TranscriptionMode) => {
    if (integrationServiceRef.current) {
      await integrationServiceRef.current.switchMode(newMode)
    }
  }, [])

  const getClient = useCallback(() => clientRef.current, [])

  const getIntegrationService = useCallback(() => integrationServiceRef.current, [])

  const controls: GeminiConnectionControls = {
    connect,
    disconnect,
    startStreaming,
    stopStreaming,
    setMode,
    getClient,
    getIntegrationService
  }

  return [state, controls]
}

export default useGeminiConnection
