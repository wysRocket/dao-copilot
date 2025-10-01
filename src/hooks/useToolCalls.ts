/**
 * React Hook for Tool Call Integration
 *
 * Provides React components with tool call handling capabilities
 * and manages the integration between Gemini Live WebSocket and search tools
 */

import {useState, useEffect, useCallback, useRef} from 'react'
import {GeminiLiveWebSocketClient} from '../services/gemini-live-websocket'
import {
  ToolCallIntegration,
  ToolCall,
  ToolCallResult,
  createToolCallIntegration,
  ToolCallIntegrationConfig
} from '../services/tool-call-integration'
import {logger} from '../services/gemini-logger'

export interface ToolCallState {
  executingCalls: Record<string, ToolCall>
  completedCalls: Record<string, ToolCallResult>
  cancelledCalls: string[]
  isLoading: boolean
}

export interface UseToolCallsOptions {
  websocketClient?: GeminiLiveWebSocketClient
  config?: Partial<ToolCallIntegrationConfig>
  onToolCallStart?: (toolCall: ToolCall) => void
  onToolCallResult?: (result: ToolCallResult) => void
  onToolCallCancellation?: (toolCallIds: string[]) => void
  enableAutoDisplay?: boolean
}

export interface UseToolCallsReturn {
  // State
  toolCallState: ToolCallState

  // Actions
  clearHistory: () => void
  retryToolCall: (toolCallId: string) => Promise<void>

  // Integration
  integration: ToolCallIntegration | null

  // Getters
  getToolCallResult: (toolCallId: string) => ToolCallResult | null
  isToolCallExecuting: (toolCallId: string) => boolean
  getAllExecutingCalls: () => ToolCall[]
  getAllCompletedCalls: () => ToolCallResult[]
}

export function useToolCalls(options: UseToolCallsOptions = {}): UseToolCallsReturn {
  const {websocketClient, config, onToolCallStart, onToolCallResult, onToolCallCancellation} =
    options

  const [toolCallState, setToolCallState] = useState<ToolCallState>({
    executingCalls: {},
    completedCalls: {},
    cancelledCalls: [],
    isLoading: false
  })

  const integrationRef = useRef<ToolCallIntegration | null>(null)
  const mountedRef = useRef(true)

  // Initialize tool call integration
  useEffect(() => {
    if (!websocketClient) {
      return
    }

    try {
      // Create integration instance
      const integration = createToolCallIntegration(websocketClient, config)
      integrationRef.current = integration

      // Set up event listeners
      integration.on('toolCallResult', (result: ToolCallResult) => {
        if (!mountedRef.current) return

        setToolCallState(prev => {
          const newState = {
            ...prev,
            completedCalls: {
              ...prev.completedCalls,
              [result.id]: result
            },
            executingCalls: {...prev.executingCalls}
          }

          // Remove from executing calls
          delete newState.executingCalls[result.id]

          // Update loading state
          newState.isLoading = Object.keys(newState.executingCalls).length > 0

          return newState
        })

        // Trigger callback
        if (onToolCallResult) {
          onToolCallResult(result)
        }

        // Log result for debugging
        if (result.success) {
          logger.info('Tool call completed successfully:', {
            id: result.id,
            name: result.name,
            executionTime: result.executionTime
          })
        } else {
          logger.error('Tool call failed:', {
            id: result.id,
            name: result.name,
            error: result.error
          })
        }
      })

      integration.on('toolCallCancellation', ({toolCallIds}: {toolCallIds: string[]}) => {
        if (!mountedRef.current) return

        setToolCallState(prev => {
          const newState = {
            ...prev,
            cancelledCalls: [...prev.cancelledCalls, ...toolCallIds],
            executingCalls: {...prev.executingCalls}
          }

          // Remove cancelled calls from executing
          for (const id of toolCallIds) {
            delete newState.executingCalls[id]
          }

          newState.isLoading = Object.keys(newState.executingCalls).length > 0

          return newState
        })

        if (onToolCallCancellation) {
          onToolCallCancellation(toolCallIds)
        }
      })

      // Listen to websocket for new tool calls to update executing state
      websocketClient.on('toolCall', (toolCall: ToolCall) => {
        if (!mountedRef.current) return

        setToolCallState(prev => ({
          ...prev,
          executingCalls: {
            ...prev.executingCalls,
            [toolCall.id]: toolCall
          },
          isLoading: true
        }))

        if (onToolCallStart) {
          onToolCallStart(toolCall)
        }

        logger.info('Tool call started:', {
          id: toolCall.id,
          name: toolCall.name
        })
      })

      logger.info('Tool call integration initialized')
    } catch (error) {
      logger.error('Failed to initialize tool call integration:', error)
    }

    // Cleanup on unmount
    return () => {
      mountedRef.current = false
      if (integrationRef.current) {
        integrationRef.current.destroy()
        integrationRef.current = null
      }
    }
  }, [websocketClient, config, onToolCallStart, onToolCallResult, onToolCallCancellation])

  // Clear history function
  const clearHistory = useCallback(() => {
    setToolCallState({
      executingCalls: {},
      completedCalls: {},
      cancelledCalls: [],
      isLoading: false
    })
  }, [])

  // Retry tool call (not directly possible, but we can emit the request)
  const retryToolCall = useCallback(
    async (toolCallId: string): Promise<void> => {
      const result = toolCallState.completedCalls[toolCallId]
      if (result && !result.success) {
        // Create a new tool call with same parameters
        const newToolCall: ToolCall = {
          id: `${result.id}-retry-${Date.now()}`,
          name: result.name,
          parameters: result.parameters
        }

        // This would need to be handled differently in a real implementation
        // For now, we just log the retry request
        logger.info('Tool call retry requested:', {originalId: toolCallId, newId: newToolCall.id})

        // In practice, you'd need to trigger the tool call through the websocket client
        // or have a way to manually execute tools
      }
    },
    [toolCallState.completedCalls]
  )

  // Getter functions
  const getToolCallResult = useCallback(
    (toolCallId: string): ToolCallResult | null => {
      return toolCallState.completedCalls[toolCallId] || null
    },
    [toolCallState.completedCalls]
  )

  const isToolCallExecuting = useCallback(
    (toolCallId: string): boolean => {
      return toolCallId in toolCallState.executingCalls
    },
    [toolCallState.executingCalls]
  )

  const getAllExecutingCalls = useCallback((): ToolCall[] => {
    return Object.values(toolCallState.executingCalls)
  }, [toolCallState.executingCalls])

  const getAllCompletedCalls = useCallback((): ToolCallResult[] => {
    return Object.values(toolCallState.completedCalls)
  }, [toolCallState.completedCalls])

  return {
    toolCallState,
    clearHistory,
    retryToolCall,
    integration: integrationRef.current,
    getToolCallResult,
    isToolCallExecuting,
    getAllExecutingCalls,
    getAllCompletedCalls
  }
}

// Helper hook for displaying tool call results in components
export function useToolCallDisplay(options: UseToolCallsOptions = {}) {
  const toolCallHook = useToolCalls(options)

  // Additional display-specific state
  const [displaySettings, setDisplaySettings] = useState({
    showExecutingCalls: true,
    showCompletedCalls: true,
    showCancelledCalls: false,
    groupByTool: false,
    sortByTime: true
  })

  // Formatted tool call data for display
  const displayData = {
    ...toolCallHook,
    displaySettings,
    setDisplaySettings,

    // Pre-formatted display arrays
    executingCallsList: Object.values(toolCallHook.toolCallState.executingCalls),
    completedCallsList: Object.values(toolCallHook.toolCallState.completedCalls).sort((a, b) =>
      displaySettings.sortByTime ? b.executionTime - a.executionTime : a.name.localeCompare(b.name)
    ),
    successfulCalls: Object.values(toolCallHook.toolCallState.completedCalls).filter(
      call => call.success
    ),
    failedCalls: Object.values(toolCallHook.toolCallState.completedCalls).filter(
      call => !call.success
    )
  }

  return displayData
}
