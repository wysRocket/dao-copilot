/**
 * Hook for integrating GeminiToolCallBridge with React components
 */

import {useState, useEffect, useRef} from 'react'
import {
  GeminiToolCallBridge,
  ToolCallRequest,
  ToolCallResponse
} from '../services/gemini-tool-call-bridge'
import {GeminiSearchTools} from '../services/gemini-search-tools'
import GeminiLiveWebSocketClient from '../services/gemini-live-websocket'
import {readRuntimeEnv} from '../utils/env'

export interface UseGeminiToolCallsState {
  activeCalls: ToolCallRequest[]
  completedCalls: ToolCallResponse[]
  isConnected: boolean
  isLoading: boolean
  error?: string
}

export interface UseGeminiToolCallsOptions {
  enableFunctionCalling?: boolean
  maxConcurrentCalls?: number
  callTimeout?: number
  enableResultDisplay?: boolean
  onToolCallStarted?: (call: ToolCallRequest) => void
  onToolCallCompleted?: (response: ToolCallResponse) => void
  onToolCallError?: (response: ToolCallResponse) => void
}

export function useGeminiToolCalls(
  websocketClient: GeminiLiveWebSocketClient | null,
  options: UseGeminiToolCallsOptions = {}
) {
  const [state, setState] = useState<UseGeminiToolCallsState>({
    activeCalls: [],
    completedCalls: [],
    isConnected: false,
    isLoading: false,
    error: undefined
  })

  const bridgeRef = useRef<GeminiToolCallBridge | null>(null)
  const searchToolsRef = useRef<GeminiSearchTools | null>(null)

  useEffect(() => {
    if (!websocketClient) {
      setState(prev => ({...prev, isConnected: false}))
      return
    }

    // Initialize search tools and bridge
    const initializeBridge = async () => {
      try {
        const googleApiKey = readRuntimeEnv('VITE_GOOGLE_API_KEY', {
          fallbackKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY']
        })
        const googleSearchEngineId = readRuntimeEnv('VITE_GOOGLE_SEARCH_ENGINE_ID', {
          fallbackKeys: ['GOOGLE_SEARCH_ENGINE_ID']
        })

        if (!googleApiKey) {
          throw new Error(
            'Missing VITE_GOOGLE_API_KEY environment variable. Configure Google API access in your Vite environment.'
          )
        }

        if (!googleSearchEngineId) {
          throw new Error(
            'Missing VITE_GOOGLE_SEARCH_ENGINE_ID environment variable. Provide a Google Custom Search Engine ID.'
          )
        }

        // Create search tools instance
        searchToolsRef.current = new GeminiSearchTools({
          apiKey: googleApiKey,
          searchEngineId: googleSearchEngineId,
          enableCaching: true,
          cacheTtlSeconds: 300
        })

        // Create tool call bridge
        bridgeRef.current = new GeminiToolCallBridge(websocketClient, searchToolsRef.current, {
          enableFunctionCalling: options.enableFunctionCalling ?? true,
          maxConcurrentCalls: options.maxConcurrentCalls ?? 5,
          callTimeout: options.callTimeout ?? 30000,
          enableResultDisplay: options.enableResultDisplay ?? true,
          enableDebugLogging: true
        })

        // Set up event listeners
        bridgeRef.current.on('toolCallStarted', (call: ToolCallRequest) => {
          setState(prev => ({
            ...prev,
            activeCalls: [...prev.activeCalls, call],
            isLoading: true
          }))

          if (options.onToolCallStarted) {
            options.onToolCallStarted(call)
          }
        })

        bridgeRef.current.on('toolCallCompleted', (response: ToolCallResponse) => {
          setState(prev => ({
            ...prev,
            activeCalls: prev.activeCalls.filter(call => call.id !== response.id),
            completedCalls: [...prev.completedCalls, response],
            isLoading: prev.activeCalls.filter(call => call.id !== response.id).length > 0
          }))

          if (options.onToolCallCompleted) {
            options.onToolCallCompleted(response)
          }
        })

        bridgeRef.current.on('toolCallError', (response: ToolCallResponse) => {
          setState(prev => ({
            ...prev,
            activeCalls: prev.activeCalls.filter(call => call.id !== response.id),
            completedCalls: [...prev.completedCalls, response],
            isLoading: prev.activeCalls.filter(call => call.id !== response.id).length > 0
          }))

          if (options.onToolCallError) {
            options.onToolCallError(response)
          }
        })

        setState(prev => ({...prev, isConnected: true, error: undefined}))
      } catch (error) {
        console.error('Failed to initialize tool call bridge:', error)
        setState(prev => ({
          ...prev,
          isConnected: false,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to initialize tool call bridge.'
        }))
      }
    }

    initializeBridge()

    // Cleanup
    return () => {
      if (bridgeRef.current) {
        bridgeRef.current.destroy()
        bridgeRef.current = null
      }
      searchToolsRef.current = null
      setState({
        activeCalls: [],
        completedCalls: [],
        isConnected: false,
        isLoading: false,
        error: undefined
      })
    }
  }, [
    websocketClient,
    options.enableFunctionCalling,
    options.maxConcurrentCalls,
    options.callTimeout
  ])

  // Methods for manual control
  const clearHistory = () => {
    setState(prev => ({
      ...prev,
      completedCalls: []
    }))
  }

  const getActiveCalls = () => {
    return bridgeRef.current?.getActiveCalls() || []
  }

  return {
    state,
    bridge: bridgeRef.current,
    searchTools: searchToolsRef.current,
    clearHistory,
    getActiveCalls
  }
}
