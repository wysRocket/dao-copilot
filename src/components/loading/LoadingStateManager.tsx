/**
 * LoadingStateManager Component
 *
 * Centralized loading state management for tracking multiple simultaneous
 * operations, coordinating loading indicators, and preventing UI conflicts.
 */

import React, {createContext, useContext, useReducer, useCallback} from 'react'
import {StatusMessageProps} from './StatusMessage'

// Types
export type LoadingOperationType =
  | 'search'
  | 'analysis'
  | 'generation'
  | 'processing'
  | 'network'
  | 'file'
  | 'custom'

export interface LoadingOperation {
  id: string
  type: LoadingOperationType
  message: string
  details?: string
  progress?: number
  estimatedTime?: string
  startTime: number
  priority: 'low' | 'medium' | 'high'
  metadata?: Record<string, unknown>
}

export interface LoadingState {
  operations: LoadingOperation[]
  globalLoading: boolean
  priorityOperation?: LoadingOperation
}

// Actions
type LoadingAction =
  | {type: 'START_OPERATION'; payload: Omit<LoadingOperation, 'id' | 'startTime'>}
  | {type: 'UPDATE_OPERATION'; payload: {id: string; updates: Partial<LoadingOperation>}}
  | {type: 'COMPLETE_OPERATION'; payload: {id: string}}
  | {type: 'CLEAR_ALL_OPERATIONS'}
  | {type: 'SET_PRIORITY_OPERATION'; payload: {id: string}}

// Reducer
function loadingReducer(state: LoadingState, action: LoadingAction): LoadingState {
  switch (action.type) {
    case 'START_OPERATION': {
      const id = Math.random().toString(36).substr(2, 9)
      const operation: LoadingOperation = {
        ...action.payload,
        id,
        startTime: Date.now()
      }

      const newOperations = [...state.operations, operation]

      // Auto-set priority operation if this is high priority or first operation
      let priorityOperation = state.priorityOperation
      if (!priorityOperation || operation.priority === 'high') {
        priorityOperation = operation
      }

      return {
        operations: newOperations,
        globalLoading: newOperations.length > 0,
        priorityOperation
      }
    }

    case 'UPDATE_OPERATION': {
      const operations = state.operations.map(op =>
        op.id === action.payload.id ? {...op, ...action.payload.updates} : op
      )

      // Update priority operation if it was the one being updated
      let priorityOperation = state.priorityOperation
      if (priorityOperation?.id === action.payload.id) {
        priorityOperation = {...priorityOperation, ...action.payload.updates}
      }

      return {
        ...state,
        operations,
        priorityOperation
      }
    }

    case 'COMPLETE_OPERATION': {
      const operations = state.operations.filter(op => op.id !== action.payload.id)

      // Update priority operation
      let priorityOperation = state.priorityOperation
      if (priorityOperation?.id === action.payload.id) {
        // Find next highest priority operation
        priorityOperation =
          operations.sort((a, b) => {
            const priorityWeight = {high: 3, medium: 2, low: 1}
            return priorityWeight[b.priority] - priorityWeight[a.priority]
          })[0] || undefined
      }

      return {
        operations,
        globalLoading: operations.length > 0,
        priorityOperation
      }
    }

    case 'CLEAR_ALL_OPERATIONS':
      return {
        operations: [],
        globalLoading: false,
        priorityOperation: undefined
      }

    case 'SET_PRIORITY_OPERATION': {
      const priorityOperation = state.operations.find(op => op.id === action.payload.id)
      return {
        ...state,
        priorityOperation
      }
    }

    default:
      return state
  }
}

// Context
interface LoadingContextValue {
  state: LoadingState
  startOperation: (operation: Omit<LoadingOperation, 'id' | 'startTime'>) => string
  updateOperation: (id: string, updates: Partial<LoadingOperation>) => void
  completeOperation: (id: string) => void
  clearAllOperations: () => void
  setPriorityOperation: (id: string) => void
  getOperationsOfType: (type: LoadingOperationType) => LoadingOperation[]
  getDuration: (id: string) => number | null
  isOperationActive: (id: string) => boolean
}

const LoadingContext = createContext<LoadingContextValue | null>(null)

// Provider
export interface LoadingStateProviderProps {
  children: React.ReactNode
  /** Maximum number of concurrent operations to track */
  maxOperations?: number
  /** Auto-complete operations after timeout (ms) */
  autoCompleteTimeout?: number
}

export const LoadingStateProvider: React.FC<LoadingStateProviderProps> = ({
  children,
  maxOperations = 10,
  autoCompleteTimeout = 30000 // 30 seconds
}) => {
  const [state, dispatch] = useReducer(loadingReducer, {
    operations: [],
    globalLoading: false,
    priorityOperation: undefined
  })

  // Auto-cleanup operations that exceed timeout
  React.useEffect(() => {
    if (autoCompleteTimeout <= 0) return

    const interval = setInterval(() => {
      const now = Date.now()
      state.operations.forEach(operation => {
        if (now - operation.startTime > autoCompleteTimeout) {
          dispatch({type: 'COMPLETE_OPERATION', payload: {id: operation.id}})
        }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [state.operations, autoCompleteTimeout])

  const startOperation = useCallback(
    (operation: Omit<LoadingOperation, 'id' | 'startTime'>) => {
      // Remove oldest operation if we exceed max operations
      if (state.operations.length >= maxOperations) {
        const oldestOperation = state.operations.sort((a, b) => a.startTime - b.startTime)[0]
        dispatch({type: 'COMPLETE_OPERATION', payload: {id: oldestOperation.id}})
      }

      dispatch({type: 'START_OPERATION', payload: operation})

      // Return the generated ID (we need to simulate it since reducer generates it)
      return Math.random().toString(36).substr(2, 9)
    },
    [state.operations.length, maxOperations]
  )

  const updateOperation = useCallback((id: string, updates: Partial<LoadingOperation>) => {
    dispatch({type: 'UPDATE_OPERATION', payload: {id, updates}})
  }, [])

  const completeOperation = useCallback((id: string) => {
    dispatch({type: 'COMPLETE_OPERATION', payload: {id}})
  }, [])

  const clearAllOperations = useCallback(() => {
    dispatch({type: 'CLEAR_ALL_OPERATIONS'})
  }, [])

  const setPriorityOperation = useCallback((id: string) => {
    dispatch({type: 'SET_PRIORITY_OPERATION', payload: {id}})
  }, [])

  const getOperationsOfType = useCallback(
    (type: LoadingOperationType) => {
      return state.operations.filter(op => op.type === type)
    },
    [state.operations]
  )

  const getDuration = useCallback(
    (id: string) => {
      const operation = state.operations.find(op => op.id === id)
      return operation ? Date.now() - operation.startTime : null
    },
    [state.operations]
  )

  const isOperationActive = useCallback(
    (id: string) => {
      return state.operations.some(op => op.id === id)
    },
    [state.operations]
  )

  const contextValue: LoadingContextValue = {
    state,
    startOperation,
    updateOperation,
    completeOperation,
    clearAllOperations,
    setPriorityOperation,
    getOperationsOfType,
    getDuration,
    isOperationActive
  }

  return <LoadingContext.Provider value={contextValue}>{children}</LoadingContext.Provider>
}

// Hook
export const useLoadingState = () => {
  const context = useContext(LoadingContext)
  if (!context) {
    throw new Error('useLoadingState must be used within a LoadingStateProvider')
  }
  return context
}

// Utility hooks
export const useLoadingOperation = (
  type: LoadingOperationType,
  initialMessage: string,
  options?: {
    priority?: 'low' | 'medium' | 'high'
    autoStart?: boolean
    details?: string
    estimatedTime?: string
  }
) => {
  const {startOperation, updateOperation, completeOperation, isOperationActive} = useLoadingState()
  const [operationId, setOperationId] = React.useState<string | null>(null)

  const start = useCallback(() => {
    if (operationId && isOperationActive(operationId)) return operationId

    const id = startOperation({
      type,
      message: initialMessage,
      priority: options?.priority || 'medium',
      details: options?.details,
      estimatedTime: options?.estimatedTime
    })
    setOperationId(id)
    return id
  }, [startOperation, type, initialMessage, options, operationId, isOperationActive])

  const update = useCallback(
    (updates: Partial<LoadingOperation>) => {
      if (operationId) {
        updateOperation(operationId, updates)
      }
    },
    [operationId, updateOperation]
  )

  const complete = useCallback(() => {
    if (operationId) {
      completeOperation(operationId)
      setOperationId(null)
    }
  }, [operationId, completeOperation])

  const updateProgress = useCallback(
    (progress: number, message?: string) => {
      update({
        progress: Math.max(0, Math.min(100, progress)),
        ...(message && {message})
      })
    },
    [update]
  )

  // Auto-start if requested
  React.useEffect(() => {
    if (options?.autoStart) {
      start()
    }
  }, [options?.autoStart, start])

  return {
    start,
    update,
    complete,
    updateProgress,
    operationId,
    isActive: operationId ? isOperationActive(operationId) : false
  }
}

// Convert LoadingOperation to StatusMessageProps
export const operationToStatusMessage = (operation: LoadingOperation): StatusMessageProps => {
  const getStatusType = (opType: LoadingOperationType): StatusMessageProps['type'] => {
    switch (opType) {
      case 'file':
        return 'processing'
      case 'custom':
        return 'default'
      default:
        return opType
    }
  }

  return {
    message: operation.message,
    type: getStatusType(operation.type),
    showProgress: operation.progress !== undefined,
    progress: operation.progress,
    details: operation.details,
    estimatedTime: operation.estimatedTime,
    showTyping: operation.progress === undefined // Show typing when progress is unknown
  }
}

export default LoadingStateProvider
