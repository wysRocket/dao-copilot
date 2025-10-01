/**
 * Tool Call Status Component
 *
 * Displays tool call execution status and results in the chat interface
 */

import React from 'react'
import {ToolCallRequest, ToolCallResponse} from '../services/gemini-tool-call-bridge'
import {cn} from '../utils/tailwind'
import GlassCard from './GlassCard'

export interface ToolCallStatusProps {
  activeCalls: ToolCallRequest[]
  completedCalls: ToolCallResponse[]
  className?: string
  compact?: boolean
}

export function ToolCallStatus({
  activeCalls,
  completedCalls,
  className,
  compact = false
}: ToolCallStatusProps) {
  // Don't render if no tool calls
  if (activeCalls.length === 0 && completedCalls.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Active Tool Calls */}
      {activeCalls.map(call => (
        <GlassCard key={call.id} className="border-l-2 border-blue-400 p-3">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              Searching {call.name.replace(/_/g, ' ')}...
            </span>
          </div>

          {!compact && (
            <div className="mt-1 text-xs text-gray-500">
              Query: {String(call.parameters.query || call.parameters.q || 'N/A')}
            </div>
          )}
        </GlassCard>
      ))}

      {/* Completed Tool Calls */}
      {completedCalls.slice(-3).map(response => (
        <GlassCard
          key={response.id}
          className={cn('border-l-2 p-3', response.success ? 'border-green-400' : 'border-red-400')}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {response.success ? (
                <div className="h-3 w-3 flex-shrink-0 rounded-full bg-green-500" />
              ) : (
                <div className="h-3 w-3 flex-shrink-0 rounded-full bg-red-500" />
              )}
              <span className="text-sm font-medium">{response.name.replace(/_/g, ' ')} search</span>
            </div>
            <span className="text-xs text-gray-500">{Math.round(response.executionTime)}ms</span>
          </div>

          {/* Display search results */}
          {response.success && response.result && !compact && (
            <ToolCallResultPreview result={response.result} />
          )}

          {/* Display errors */}
          {!response.success && response.error && (
            <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
              Error: {response.error}
            </div>
          )}
        </GlassCard>
      ))}

      {/* Show count if more than 3 completed calls */}
      {completedCalls.length > 3 && (
        <div className="pt-1 text-center text-xs text-gray-500">
          ... and {completedCalls.length - 3} more search
          {completedCalls.length - 3 !== 1 ? 'es' : ''}
        </div>
      )}
    </div>
  )
}

interface ToolCallResultPreviewProps {
  result: unknown
}

function ToolCallResultPreview({result}: ToolCallResultPreviewProps) {
  // Handle different result types from search tools
  if (result && typeof result === 'object') {
    const resultObj = result as Record<string, unknown>

    // Handle search results with results array (from ToolCallResult interface)
    if ('results' in resultObj && Array.isArray(resultObj.results)) {
      const results = resultObj.results.slice(0, 2) // Show first 2 results

      return (
        <div className="mt-2 space-y-1">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Found {resultObj.results.length} result{resultObj.results.length !== 1 ? 's' : ''}:
          </div>
          {results.map((item: unknown, index: number) => {
            const itemObj = item as Record<string, unknown>
            return (
              <div
                key={index}
                className="rounded bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              >
                <div className="truncate font-medium">{String(itemObj.title || 'Untitled')}</div>
                {typeof itemObj.snippet === 'string' && (
                  <div className="mt-1 truncate">
                    {itemObj.snippet.length > 80
                      ? `${itemObj.snippet.slice(0, 80)}...`
                      : itemObj.snippet}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )
    }

    // Handle search results with items array (legacy support)
    if ('items' in resultObj && Array.isArray(resultObj.items)) {
      const items = resultObj.items.slice(0, 2) // Show first 2 results

      return (
        <div className="mt-2 space-y-1">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Found {resultObj.items.length} result{resultObj.items.length !== 1 ? 's' : ''}:
          </div>
          {items.map((item: unknown, index: number) => {
            const itemObj = item as Record<string, unknown>
            return (
              <div
                key={index}
                className="rounded bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              >
                <div className="truncate font-medium">{String(itemObj.title || 'Untitled')}</div>
                {typeof itemObj.snippet === 'string' && (
                  <div className="mt-1 truncate">
                    {itemObj.snippet.length > 80
                      ? `${itemObj.snippet.slice(0, 80)}...`
                      : itemObj.snippet}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )
    }

    // Handle direct content results
    if ('content' in resultObj || 'answer' in resultObj) {
      const content = resultObj.content || resultObj.answer
      if (typeof content === 'string') {
        return (
          <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            {content.length > 100 ? `${content.slice(0, 100)}...` : content}
          </div>
        )
      }
    }

    // Handle summary results
    if ('summary' in resultObj && typeof resultObj.summary === 'string') {
      return (
        <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {resultObj.summary.length > 100
            ? `${resultObj.summary.slice(0, 100)}...`
            : resultObj.summary}
        </div>
      )
    }
  }

  // Fallback for other result types
  return (
    <div className="mt-2 text-xs text-green-600 dark:text-green-400">
      ✓ Search completed successfully
    </div>
  )
}

export default ToolCallStatus
