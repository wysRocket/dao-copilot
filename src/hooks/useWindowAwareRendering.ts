/**
 * Hook for Window-Aware Component Rendering
 *
 * Provides utilities to determine if components should render in the current window
 * based on the window routing configuration from WindowManager
 */

import {useWindowState} from '../contexts/WindowStateProvider'

export type ComponentType =
  | 'transcription-display'
  | 'websocket-diagnostics'
  | 'transcription-events'
  | 'streaming-text'
  | 'transcript-list'

export function useWindowAwareRendering() {
  const {windowState} = useWindowState()

  /**
   * Check if a component should render in the current window
   */
  const shouldRenderComponent = (componentType: ComponentType): boolean => {
    const windowType = windowState.windowType
    const isDevelopment = process.env.NODE_ENV === 'development'

    // Define routing rules (must match WindowManager rules)
    const routingRules: Record<
      ComponentType,
      {
        targetWindow: 'main' | 'assistant'
        fallbackWindow?: 'main' | 'assistant'
        developmentOnly?: boolean
      }
    > = {
      'transcription-display': {
        targetWindow: 'assistant',
        fallbackWindow: 'main'
      },
      'websocket-diagnostics': {
        targetWindow: 'assistant',
        developmentOnly: true
      },
      'transcription-events': {
        targetWindow: 'assistant',
        fallbackWindow: 'main'
      },
      'streaming-text': {
        targetWindow: 'assistant',
        fallbackWindow: 'main'
      },
      'transcript-list': {
        targetWindow: 'assistant',
        fallbackWindow: 'main'
      }
    }

    const rule = routingRules[componentType]

    if (!rule) {
      // No specific rule, allow rendering in any window
      return true
    }

    // Check development-only restriction
    if (rule.developmentOnly && !isDevelopment) {
      return false
    }

    // Check if this is the target window
    if (rule.targetWindow === windowType) {
      return true
    }

    // For fallback, we assume main window is always available
    // In a real implementation, you might want to check window availability
    if (rule.fallbackWindow === windowType) {
      // Only use fallback if we're not in the target window type
      return windowType !== rule.targetWindow
    }

    return false
  }

  /**
   * Get the current window type
   */
  const getCurrentWindowType = () => windowState.windowType

  /**
   * Check if current window is the main window
   */
  const isMainWindow = () => windowState.windowType === 'main'

  /**
   * Check if current window is the assistant window
   */
  const isAssistantWindow = () => windowState.windowType === 'assistant'

  /**
   * Check if we're in development mode
   */
  const isDevelopment = () => process.env.NODE_ENV === 'development'

  return {
    shouldRenderComponent,
    getCurrentWindowType,
    isMainWindow,
    isAssistantWindow,
    isDevelopment
  }
}

export default useWindowAwareRendering
