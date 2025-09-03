import React, {useState, useEffect, useCallback} from 'react'
// Remove the problematic transcription-connected components
// import PersistentRealTimeAnswerDisplay from '../../components/PersistentRealTimeAnswerDisplay'
// import {AnswerDisplay} from '../../services/AnswerDisplayManager'
import LoadingSpinner from '../../components/LoadingSpinner'
import {FadeTransition, SlideUpTransition} from '../../components/SmoothTransition'
import {SearchResultsGrid} from '../../components/SearchResultCard'
import {formatToolCallForChat} from '../../utils/toolCallParser'
import {useChatScroll} from '../../hooks/useChatScroll'
import {
  ScrollNavigationControls,
  NewMessageToast,
  ScrollPositionIndicator
} from '../../components/ChatScrollControls'

// Import enhanced loading system
import {
  LoadingStateProvider,
  useChatLoading,
  SearchResultsLoading,
  ErrorState,
  useErrorHandler
} from '../../components/loading'

// Import real search functionality
import GeminiSearchTools, {GeminiSearchConfig} from '../../services/gemini-search-tools'

// Import enhanced styles
import '../../styles/enhanced-transitions.css'

interface ChatMessage {
  id: string
  type: 'user' | 'assistant' | 'tool_result'
  content: string
  timestamp: number
  // Additional fields for AI responses
  isAIResponse?: boolean
  question?: string
  // Tool call specific fields
  toolCallId?: string
  functionName?: string
  toolResult?: unknown
}

// Real Search Integration Component
interface RealSearchIntegrationProps {
  onToolCallResult: (result: SearchToolResult) => void
  className?: string
}

interface SearchToolResult {
  id: string
  name: string
  result: unknown
  success: boolean
  timestamp: number
  error?: string
}

const RealSearchIntegration: React.FC<RealSearchIntegrationProps> = ({
  onToolCallResult,
  className
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchTools, setSearchTools] = useState<GeminiSearchTools | null>(null)
  const {error, handleError, clearError} = useErrorHandler()
  const chatLoading = useChatLoading()

  // Initialize search tools
  useEffect(() => {
    try {
      // Safe environment variable access for browser
      const getEnvVar = (key: string): string => {
        // For development with Vite/Create React App
        if (typeof window !== 'undefined') {
          const env = (window as {__ENV__?: Record<string, string>}).__ENV__
          if (env && env[key]) {
            return env[key]
          }
        }
        // Fallback - use placeholder values for now
        return ''
      }

      const config: GeminiSearchConfig = {
        apiKey: getEnvVar('REACT_APP_GOOGLE_SEARCH_API_KEY'),
        searchEngineId: getEnvVar('REACT_APP_SEARCH_ENGINE_ID'),
        geminiApiKey: getEnvVar('REACT_APP_GEMINI_API_KEY'),
        enableCaching: true,
        cacheTtlSeconds: 3600,
        maxRetries: 2,
        timeout: 10000
      }

      const tools = new GeminiSearchTools(config)
      setSearchTools(tools)

      // Set up event listeners
      tools.on('searchStart', data => {
        console.log('Search started:', data)
      })

      tools.on('searchComplete', data => {
        console.log('Search completed:', data)
      })

      tools.on('searchError', data => {
        console.error('Search error:', data)
        handleError(data.error || 'Search failed', 'network')
      })

      return () => {
        tools.destroy()
      }
    } catch (error) {
      console.error('Failed to initialize search tools:', error)
      handleError(error instanceof Error ? error : 'Failed to initialize search', 'unknown')
    }
  }, [handleError])

  const handleSearch = useCallback(
    async (query: string) => {
      if (!searchTools || !query.trim()) return

      setIsSearching(true)
      clearError()

      // Start loading operation
      const loadingId = chatLoading.startSearch(query)

      try {
        // Execute search
        const result = await searchTools.google_search({
          query: query.trim(),
          max_results: 5,
          country: 'US',
          language: 'en'
        })

        if (result.success && result.results) {
          // Create successful tool result
          const toolResult: SearchToolResult = {
            id: loadingId,
            name: 'google_search',
            result: {
              results: result.results,
              title: `Search results for "${query}"`,
              compact: false
            },
            success: true,
            timestamp: Date.now()
          }

          onToolCallResult(toolResult)
          chatLoading.completeOperation(loadingId)
        } else {
          throw new Error(result.error || 'Search returned no results')
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Search failed'
        handleError(errorMessage, 'network')

        // Create failed tool result
        const toolResult: SearchToolResult = {
          id: loadingId,
          name: 'google_search',
          result: null,
          success: false,
          timestamp: Date.now(),
          error: errorMessage
        }

        onToolCallResult(toolResult)
        chatLoading.completeOperation(loadingId)
      } finally {
        setIsSearching(false)
      }
    },
    [searchTools, onToolCallResult, handleError, clearError, chatLoading]
  )

  const handleQuickSearch = (predefinedQuery: string) => {
    setSearchQuery(predefinedQuery)
    handleSearch(predefinedQuery)
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {/* Search input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !isSearching && handleSearch(searchQuery)}
            placeholder="Enter search query..."
            className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm"
            style={{
              background: 'var(--glass-light)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)'
            }}
            disabled={!searchTools || isSearching}
          />
          <button
            onClick={() => handleSearch(searchQuery)}
            disabled={!searchTools || !searchQuery.trim() || isSearching}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Error display */}
        {error && (
          <ErrorState
            type={error.type}
            message={error.message}
            details={error.details}
            code={error.code}
            onRetry={() => {
              clearError()
              if (searchQuery.trim()) {
                handleSearch(searchQuery)
              }
            }}
            onDismiss={clearError}
            showRetry={true}
            showDismiss={true}
            compact={true}
          />
        )}

        {/* Quick search buttons */}
        <div className="flex flex-wrap gap-2">
          {[
            'Latest news about React',
            'What is artificial intelligence?',
            'How to use TypeScript',
            'Best practices for web development'
          ].map(query => (
            <button
              key={query}
              onClick={() => handleQuickSearch(query)}
              disabled={!searchTools || isSearching}
              className="rounded-lg px-3 py-1 text-xs transition-colors hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
              style={{
                background: 'var(--glass-light)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-secondary)'
              }}
            >
              {query}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {isSearching && (
          <SearchResultsLoading count={3} showStatus={true} query={searchQuery} className="mt-3" />
        )}

        {/* Search tools status */}
        {searchTools && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            🔍 Real Google Search enabled • Status: {searchTools ? 'Connected' : 'Disconnected'}
          </div>
        )}
      </div>
    </div>
  )
}

function ChatPageContent() {
  const [message, setMessage] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [isProcessingMessage, setIsProcessingMessage] = useState<boolean>(false)
  const [showToolCalls, setShowToolCalls] = useState<boolean>(true) // Enable real functionality by default
  const [showNewMessageToast, setShowNewMessageToast] = useState<boolean>(false)
  const [toastUnreadCount, setToastUnreadCount] = useState<number>(0)

  // Initialize chat scroll management
  const scrollControls = useChatScroll(chatHistory.length, {
    autoScrollThreshold: 50,
    scrollDetectionDelay: 200,
    showControlsThreshold: 150,
    enableKeyboardNavigation: true
  })

  // Handle tool call results from the integration
  const handleToolCallResult = (result: SearchToolResult) => {
    if (result.success && result.result) {
      // Parse the tool call result into a structured format
      const formattedResult = formatToolCallForChat(result.name || 'unknown', result.result)

      // Add tool call result as a structured message in chat
      const toolMessage = {
        id: `tool-${result.id}`,
        type: 'tool_result' as const,
        content: formattedResult.fallbackText,
        timestamp: result.timestamp,
        isAIResponse: true,
        toolCallId: result.id,
        functionName: result.name,
        toolResult: result.result
      }

      setChatHistory(prev => {
        const newHistory = [...prev, toolMessage]

        // Handle new message for scroll controls
        if (!scrollControls.isAutoScrollEnabled && !scrollControls.scrollPosition.isAtBottom) {
          setShowNewMessageToast(true)
          setToastUnreadCount(count => count + 1)
        }

        return newHistory
      })
    } else {
      // Handle failed tool call
      const errorMessage = {
        id: `error-${result.id}`,
        type: 'assistant' as const,
        content: `Search failed: ${result.error || 'Unknown error occurred'}`,
        timestamp: result.timestamp,
        isAIResponse: true
      }

      setChatHistory(prev => [...prev, errorMessage])
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || isProcessingMessage) return

    const userMessage = {
      id: `msg-${Date.now()}`,
      type: 'user' as const,
      content: message,
      timestamp: Date.now()
    }

    setChatHistory(prev => [...prev, userMessage])
    const userMessageContent = message // Store the message before clearing
    setMessage('')
    setIsProcessingMessage(true)

    // Handle new message for scroll controls
    if (!scrollControls.isAutoScrollEnabled && !scrollControls.scrollPosition.isAtBottom) {
      setShowNewMessageToast(true)
      setToastUnreadCount(count => count + 1)
    }

    // For now, handle all messages as regular chat to avoid transcription system interference
    try {
      // Simulate AI service call for all messages
      const response = await new Promise<string>((resolve, reject) => {
        setTimeout(() => {
          // Simulate occasional failures for testing
          if (Math.random() > 0.9) {
            reject(new Error('AI service temporarily unavailable'))
          } else {
            // Check if it's a question to provide a more appropriate response
            const isQuestion =
              userMessageContent.includes('?') ||
              userMessageContent
                .toLowerCase()
                .match(/^(what|who|when|where|why|how|can|could|will|would|should|is|are|do|does)/i)

            if (isQuestion) {
              resolve(
                `Here's what I found about: "${userMessageContent}". This response will be improved once we integrate real AI processing without transcription system conflicts.`
              )
            } else {
              resolve(
                `I received your message: "${userMessageContent}". This is a placeholder response that will be enhanced.`
              )
            }
          }
        }, 1000)
      })

      const assistantMessage = {
        id: `msg-${Date.now()}-assistant`,
        type: 'assistant' as const,
        content: response,
        timestamp: Date.now(),
        isAIResponse: true
      }
      setChatHistory(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error sending message to AI:', error)
      // Show error message to user
      const errorMessage = {
        id: `msg-${Date.now()}-error`,
        type: 'assistant' as const,
        content: 'Sorry, I encountered an error while processing your message. Please try again.',
        timestamp: Date.now()
      }
      setChatHistory(prev => [...prev, errorMessage])
    } finally {
      setIsProcessingMessage(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex-none p-4"
        style={{
          background: 'var(--glass-heavy)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid var(--glass-border)',
          boxShadow: '0 2px 12px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="mb-1 text-lg font-bold" style={{color: 'var(--text-primary)'}}>
              AI Chat Assistant
            </h2>
            <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
              Ask questions about your transcripts or get general assistance
            </p>
          </div>
          <button
            onClick={() => setShowToolCalls(!showToolCalls)}
            className={`rounded-lg px-3 py-1 text-xs transition-all duration-200 ${
              showToolCalls
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {showToolCalls ? '🔍 Tool Calls ON' : '🔍 Tool Calls OFF'}
          </button>
        </div>
      </div>

      <div
        ref={scrollControls.scrollContainerRef}
        className="flex-1 overflow-auto p-4"
        style={{
          scrollBehavior: 'smooth'
        }}
      >
        {/* Processing indicator */}
        <FadeTransition show={isProcessingMessage}>
          <div className="mb-4 flex justify-center">
            <div
              className="flex items-center space-x-2 rounded-lg px-4 py-2"
              style={{
                background: 'var(--glass-medium)',
                border: '1px solid var(--glass-border)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)'
              }}
            >
              <LoadingSpinner size="sm" variant="dots" color="primary" />
              <span className="text-sm" style={{color: 'var(--text-secondary)'}}>
                Processing your message...
              </span>
            </div>
          </div>
        </FadeTransition>

        {chatHistory.length === 0 ? (
          <FadeTransition show={!isProcessingMessage}>
            <div className="py-12 text-center">
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                style={{
                  background: 'var(--glass-medium)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid var(--glass-border)'
                }}
              >
                <svg
                  className="h-8 w-8"
                  style={{color: 'var(--text-accent)'}}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <p className="mb-2 text-lg font-medium" style={{color: 'var(--text-primary)'}}>
                Start your conversation
              </p>
              <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
                Ask about your transcripts or get assistance with any topic
              </p>
            </div>
          </FadeTransition>
        ) : (
          <div className="space-y-4 pb-4">
            {chatHistory.map((msg, index) => (
              <SlideUpTransition
                key={msg.id}
                show={true}
                delay={index * 50} // Stagger animation for multiple messages
                duration={300}
              >
                <div
                  id={`message-${msg.id}`}
                  className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'} ${
                    // Add subtle highlight animation for recent messages
                    Date.now() - msg.timestamp < 2000 ? 'animate-pulse-subtle' : ''
                  }`}
                >
                  <div className="max-w-[75%]">
                    <div
                      className="rounded-xl p-4 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg"
                      style={{
                        background:
                          msg.type === 'user'
                            ? 'linear-gradient(135deg, var(--glass-heavy) 0%, var(--glass-medium) 100%)'
                            : 'var(--glass-medium)',
                        border: '1px solid var(--glass-border)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        boxShadow:
                          msg.type === 'user'
                            ? '0 8px 32px var(--glass-shadow), 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.2)'
                            : '0 4px 20px var(--glass-shadow), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.1)'
                      }}
                    >
                      {/* Add visual indicator for AI responses or tool calls */}
                      {(msg.isAIResponse || msg.type === 'tool_result') && (
                        <div
                          className="border-opacity-20 mb-2 flex items-center space-x-2 border-b pb-2"
                          style={{borderColor: 'var(--glass-border)'}}
                        >
                          <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                          <span
                            className="text-xs font-medium"
                            style={{color: 'var(--text-accent)'}}
                          >
                            {msg.type === 'tool_result'
                              ? `🔍 ${msg.functionName || 'Tool'} Result`
                              : 'AI Response'}
                          </span>
                          {msg.question && (
                            <span className="text-xs" style={{color: 'var(--text-muted)'}}>
                              • Re: {msg.question.slice(0, 30)}...
                            </span>
                          )}
                        </div>
                      )}

                      {/* Render tool call results with SearchResultsGrid or fallback */}
                      {msg.type === 'tool_result' && msg.toolResult && msg.functionName ? (
                        <div className="mb-2">
                          {(() => {
                            const formattedResult = formatToolCallForChat(
                              msg.functionName,
                              msg.toolResult
                            )

                            if (formattedResult.component === 'SearchResultsGrid') {
                              // Extract props safely with required fields
                              const {
                                results = [],
                                title = 'Search Results',
                                compact = false
                              } = formattedResult.props
                              // Type assertion is safe here as the parser ensures correct structure
                              return (
                                <SearchResultsGrid
                                  results={
                                    results as Array<{
                                      title: string
                                      snippet: string
                                      link: string
                                      displayLink?: string
                                      formattedUrl?: string
                                    }>
                                  }
                                  title={title as string}
                                  compact={compact as boolean}
                                  className="space-y-2"
                                />
                              )
                            } else {
                              // Fallback for other types (WebpageCard, SummaryCard, RawJson)
                              return (
                                <div
                                  className="rounded-lg p-3 text-sm"
                                  style={{
                                    background: 'var(--glass-light)',
                                    border: '1px solid var(--glass-border)'
                                  }}
                                >
                                  <pre className="text-xs whitespace-pre-wrap">
                                    {JSON.stringify(msg.toolResult, null, 2)}
                                  </pre>
                                </div>
                              )
                            }
                          })()}
                        </div>
                      ) : (
                        <p
                          className="mb-2 text-sm leading-relaxed"
                          style={{color: 'var(--text-primary)'}}
                        >
                          {msg.content}
                        </p>
                      )}

                      <p className="text-xs" style={{color: 'var(--text-muted)'}}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              </SlideUpTransition>
            ))}
          </div>
        )}
      </div>

      {/* Real Search Integration */}
      {showToolCalls && (
        <div className="flex-none border-t border-gray-200 p-4 dark:border-gray-700">
          <RealSearchIntegration
            onToolCallResult={handleToolCallResult}
            className="max-h-64 overflow-y-auto"
          />
        </div>
      )}

      <div
        className="flex-none border-t p-4"
        style={{
          background: 'var(--glass-heavy)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid var(--glass-border)',
          boxShadow: '0 -2px 12px var(--glass-shadow), inset 0 -1px 0 rgba(255, 255, 255, 0.1)'
        }}
      >
        <form onSubmit={handleSendMessage}>
          <div className="flex items-center space-x-3">
            <div
              className="flex-1"
              style={{
                background: 'var(--glass-medium)',
                border: '1px solid var(--glass-border)',
                borderRadius: '12px',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: '0 2px 8px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
              }}
            >
              <input
                type="text"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Type your message..."
                className="h-11 w-full border-0 bg-transparent px-4 outline-none placeholder:opacity-70"
                style={{
                  color: 'var(--text-primary)',
                  fontSize: '14px'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={!message.trim() || isProcessingMessage}
              className="app-region-no-drag flex h-11 items-center justify-center rounded-xl px-5 transition-all duration-200 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={
                {
                  WebkitAppRegion: 'no-drag',
                  background:
                    message.trim() && !isProcessingMessage
                      ? 'linear-gradient(135deg, var(--interactive-primary) 0%, var(--interactive-primary-hover) 100%)'
                      : 'var(--glass-medium)',
                  border: '1px solid var(--glass-border)',
                  color: message.trim() && !isProcessingMessage ? 'white' : 'var(--text-primary)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  fontSize: '14px',
                  fontWeight: 500,
                  minWidth: '80px',
                  boxShadow:
                    message.trim() && !isProcessingMessage
                      ? '0 4px 16px rgba(96, 165, 250, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                      : '0 2px 8px var(--glass-shadow)'
                } as React.CSSProperties
              }
            >
              {isProcessingMessage ? (
                <LoadingSpinner size="xs" variant="spin" color="secondary" />
              ) : (
                'Send'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Scroll Navigation Controls */}
      <ScrollNavigationControls
        showScrollToTop={scrollControls.showScrollToTop}
        showScrollToBottom={scrollControls.showScrollToBottom}
        hasNewMessagesBelow={scrollControls.hasNewMessagesBelow}
        onScrollToTop={() => scrollControls.scrollToTop(true)}
        onScrollToBottom={() => scrollControls.scrollToBottom(true)}
        unreadCount={toastUnreadCount}
      />

      {/* New Message Toast */}
      <NewMessageToast
        show={showNewMessageToast}
        messageCount={toastUnreadCount}
        onScrollToNew={() => {
          scrollControls.scrollToBottom(true)
          setShowNewMessageToast(false)
          setToastUnreadCount(0)
          scrollControls.markAllMessagesRead()
        }}
        onDismiss={() => {
          setShowNewMessageToast(false)
          setToastUnreadCount(0)
        }}
      />

      {/* Scroll Position Indicator */}
      <ScrollPositionIndicator
        show={!scrollControls.scrollPosition.isAtBottom && !scrollControls.scrollPosition.isAtTop}
        scrollPercentage={
          scrollControls.scrollPosition.scrollHeight > scrollControls.scrollPosition.clientHeight
            ? (scrollControls.scrollPosition.scrollTop /
                (scrollControls.scrollPosition.scrollHeight -
                  scrollControls.scrollPosition.clientHeight)) *
              100
            : 0
        }
      />
    </div>
  )
}

// Main ChatPage component wrapped with providers
export default function ChatPage() {
  return (
    <LoadingStateProvider>
      <ChatPageContent />
    </LoadingStateProvider>
  )
}
