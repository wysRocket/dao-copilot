/**
 * Mock Tool Call Integration for Demo
 *
 * This creates a simple demonstration of how tool calls would be integrated
 * with the chat system. In production, this would connect to the actual
 * GeminiLiveWebSocketClient instance.
 */

import React, {useState, useEffect} from 'react'
import {ToolCallStatus} from './ToolCallStatus'
import {ToolCallRequest, ToolCallResponse} from '../services/gemini-tool-call-bridge'

export interface MockToolCallIntegrationProps {
  onToolCallResult?: (result: ToolCallResponse) => void
  className?: string
}

export function MockToolCallIntegration({
  onToolCallResult,
  className
}: MockToolCallIntegrationProps) {
  const [activeCalls, setActiveCalls] = useState<ToolCallRequest[]>([])
  const [completedCalls, setCompletedCalls] = useState<ToolCallResponse[]>([])

  // Simulate tool call execution for demo purposes
  const simulateToolCall = async (query: string) => {
    const callId = `call-${Date.now()}`
    const toolCall: ToolCallRequest = {
      id: callId,
      name: 'google_search',
      parameters: {query},
      timestamp: Date.now()
    }

    // Add to active calls
    setActiveCalls(prev => [...prev, toolCall])

    // Simulate execution delay
    setTimeout(
      () => {
        const response: ToolCallResponse = {
          id: callId,
          name: 'google_search',
          result: {
            success: true,
            results: [
              {
                title: `Search result for "${query}"`,
                snippet:
                  'This is a mock search result demonstrating how tool call results would appear in the chat interface.',
                link: 'https://example.com',
                displayLink: 'example.com'
              },
              {
                title: 'Related result',
                snippet: 'Another mock result showing the display format.',
                link: 'https://example2.com',
                displayLink: 'example2.com'
              }
            ],
            metadata: {
              query,
              timestamp: Date.now(),
              responseTime: Math.random() * 1000 + 500,
              cacheHit: false,
              quotaUsed: 1,
              source: 'api'
            }
          },
          success: true,
          timestamp: Date.now(),
          executionTime: Math.random() * 2000 + 1000
        }

        // Remove from active, add to completed
        setActiveCalls(prev => prev.filter(call => call.id !== callId))
        setCompletedCalls(prev => [...prev, response])

        // Trigger callback
        if (onToolCallResult) {
          onToolCallResult(response)
        }
      },
      Math.random() * 3000 + 2000
    ) // 2-5 second delay
  }

  // Auto-trigger demo calls (remove in production)
  useEffect(() => {
    const demoQueries = [
      'What is artificial intelligence?',
      'Latest news about React',
      'How does machine learning work?'
    ]

    const interval = setInterval(() => {
      if (Math.random() > 0.7 && activeCalls.length < 2) {
        // 30% chance every interval
        const randomQuery = demoQueries[Math.floor(Math.random() * demoQueries.length)]
        simulateToolCall(randomQuery)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [activeCalls.length])

  return (
    <div className={className}>
      <ToolCallStatus activeCalls={activeCalls} completedCalls={completedCalls} compact={false} />

      {/* Demo controls */}
      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
        <div className="mb-2 text-sm text-blue-800 dark:text-blue-200">
          🔧 Demo Tool Call Integration
        </div>
        <div className="space-y-1 text-xs text-blue-600 dark:text-blue-300">
          <div>• Tool calls are being simulated automatically</div>
          <div>• In production, these would be triggered by Gemini Live API</div>
          <div>• Results show how search integration would work</div>
          {activeCalls.length > 0 && (
            <div className="font-medium text-blue-700 dark:text-blue-300">
              Currently executing {activeCalls.length} search{activeCalls.length !== 1 ? 'es' : ''}
              ...
            </div>
          )}
        </div>
        <button
          onClick={() => simulateToolCall('Manual test search')}
          className="mt-2 rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          disabled={activeCalls.length >= 3}
        >
          Trigger Test Search
        </button>
      </div>
    </div>
  )
}

export default MockToolCallIntegration
