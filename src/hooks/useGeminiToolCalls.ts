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

export interface UseGeminiToolCallsState {
  activeCalls: ToolCallRequest[]
  completedCalls: ToolCallResponse[]
  isConnected: boolean
  isLoading: boolean
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
    isLoading: false
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
        // Create search tools instance
        searchToolsRef.current = new GeminiSearchTools({
          googleApiKey: process.env.VITE_GOOGLE_API_KEY || '',
          googleSearchEngineId: process.env.VITE_GOOGLE_SEARCH_ENGINE_ID || '',
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

        setState(prev => ({...prev, isConnected: true}))
      } catch (error) {
        console.error('Failed to initialize tool call bridge:', error)
        setState(prev => ({...prev, isConnected: false}))
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
        isLoading: false
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
