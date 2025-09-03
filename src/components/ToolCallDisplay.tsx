/**
 * Tool Call Results Display Component
 *
 * Displays tool call execution status and results in the chat interface
 */

import React from 'react'
import {ToolCallResult, ToolCall} from '../services/tool-call-integration'
import {cn} from '../utils/tailwind'
import GlassCard from './GlassCard'

export interface ToolCallDisplayProps {
  executingCalls: ToolCall[]
  completedCalls: ToolCallResult[]
  className?: string
  showTimings?: boolean
  showParameters?: boolean
  onRetry?: (toolCallId: string) => void
  compact?: boolean
}

export function ToolCallDisplay({
  executingCalls,
  completedCalls,
  className,
  showTimings = true,
  showParameters = false,
  onRetry,
  compact = false
}: ToolCallDisplayProps) {
  if (executingCalls.length === 0 && completedCalls.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Executing Tool Calls */}
      {executingCalls.map(call => (
        <GlassCard key={call.id} className="p-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="text-sm font-medium">Executing {call.name}</span>
          </div>

          {!compact && showParameters && Object.keys(call.parameters).length > 0 && (
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              <details>
                <summary className="cursor-pointer">Parameters</summary>
                <pre className="mt-1 overflow-x-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">
                  {JSON.stringify(call.parameters, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </GlassCard>
      ))}

      {/* Completed Tool Calls */}
      {completedCalls.map(result => (
        <GlassCard key={result.id} className="p-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {result.success ? (
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
                  <span className="text-xs text-white">✓</span>
                </div>
              ) : (
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500">
                  <span className="text-xs text-white">✕</span>
                </div>
              )}
              <span className="text-sm font-medium">{result.name}</span>
            </div>

            {showTimings && (
              <span className="ml-2 text-xs text-gray-500">
                {Math.round(result.executionTime)}ms
              </span>
            )}
          </div>

          {/* Error Display */}
          {!result.success && result.error && (
            <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {String(result.error)}
              {onRetry && (
                <button
                  onClick={() => onRetry(result.id)}
                  className="ml-2 inline-flex items-center gap-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  <span className="text-xs">↻</span>
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Success Result Display */}
          {result.success && result.result && !compact && (
            <div className="mt-2">
              <ToolCallResultRenderer result={result.result} toolName={result.name} />
            </div>
          )}

          {/* Parameters Display (if enabled) */}
          {!compact && showParameters && Object.keys(result.parameters).length > 0 && (
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              <details>
                <summary className="cursor-pointer">Parameters</summary>
                <pre className="mt-1 overflow-x-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">
                  {JSON.stringify(result.parameters, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </GlassCard>
      ))}
    </div>
  )
}

interface ToolCallResultRendererProps {
  result: unknown
  toolName: string
}

function ToolCallResultRenderer({result, toolName}: ToolCallResultRendererProps) {
  // Handle different types of search results
  if (typeof result === 'object' && result !== null) {
    const resultObj = result as Record<string, unknown>

    // Handle search results with items/articles
    if ('items' in resultObj || 'articles' in resultObj) {
      const items = (resultObj.items as unknown[]) || (resultObj.articles as unknown[]) || []

      if (items.length > 0) {
        return (
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Found {items.length} result{items.length !== 1 ? 's' : ''}:
            </div>
            {items.slice(0, 3).map((item, index) => (
              <SearchResultItem key={index} item={item} />
            ))}
            {items.length > 3 && (
              <div className="text-xs text-gray-500">... and {items.length - 3} more results</div>
            )}
          </div>
        )
      }
    }

    // Handle YouTube search results
    if (toolName === 'search_youtube' && 'videos' in resultObj) {
      const videos = resultObj.videos as unknown[]
      return (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Found {videos.length} video{videos.length !== 1 ? 's' : ''}:
          </div>
          {videos.slice(0, 2).map((video, index) => (
            <VideoResultItem key={index} video={video} />
          ))}
        </div>
      )
    }

    // Handle general object results
    if ('summary' in resultObj || 'answer' in resultObj || 'content' in resultObj) {
      const content = resultObj.summary || resultObj.answer || resultObj.content
      if (typeof content === 'string') {
        return (
          <div className="rounded bg-gray-50 p-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {content.length > 200 ? `${content.slice(0, 200)}...` : content}
          </div>
        )
      }
    }
  }

  // Handle string results
  if (typeof result === 'string') {
    return (
      <div className="rounded bg-gray-50 p-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        {result.length > 200 ? `${result.slice(0, 200)}...` : result}
      </div>
    )
  }

  // Fallback: show JSON
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-gray-600 dark:text-gray-400">
        View result data
      </summary>
      <pre className="mt-1 overflow-x-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">
        {JSON.stringify(result, null, 2)}
      </pre>
    </details>
  )
}

interface SearchResultItemProps {
  item: unknown
}

function SearchResultItem({item}: SearchResultItemProps) {
  if (typeof item !== 'object' || item === null) {
    return null
  }

  const resultItem = item as Record<string, unknown>
  const title = resultItem.title as string
  const link = resultItem.link as string
  const snippet = resultItem.snippet as string

  return (
    <div className="border-l-2 border-blue-200 pl-2 text-xs">
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          {title || 'Untitled'}
        </a>
      ) : (
        <div className="font-medium">{title || 'Untitled'}</div>
      )}
      {snippet && (
        <div className="mt-1 text-gray-600 dark:text-gray-400">
          {snippet.length > 150 ? `${snippet.slice(0, 150)}...` : snippet}
        </div>
      )}
    </div>
  )
}

interface VideoResultItemProps {
  video: unknown
}

function VideoResultItem({video}: VideoResultItemProps) {
  if (typeof video !== 'object' || video === null) {
    return null
  }

  const videoItem = video as Record<string, unknown>
  const title = videoItem.title as string
  const url = videoItem.url as string
  const duration = videoItem.duration as string

  return (
    <div className="border-l-2 border-red-200 pl-2 text-xs">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-red-600 hover:underline dark:text-red-400"
        >
          {title || 'Untitled Video'}
        </a>
      ) : (
        <div className="font-medium">{title || 'Untitled Video'}</div>
      )}
      {duration && <div className="mt-1 text-xs text-gray-500">Duration: {duration}</div>}
    </div>
  )
}

export default ToolCallDisplay
