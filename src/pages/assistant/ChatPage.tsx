import React, {useState} from 'react'

export default function ChatPage() {
  const [message, setMessage] = useState('')
  const [chatHistory, setChatHistory] = useState<
    Array<{
      id: string
      type: 'user' | 'assistant'
      content: string
      timestamp: number
    }>
  >([])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    const userMessage = {
      id: `msg-${Date.now()}`,
      type: 'user' as const,
      content: message,
      timestamp: Date.now()
    }

    setChatHistory(prev => [...prev, userMessage])
    const userMessageContent = message // Store the message before clearing
    setMessage('')

    // Integrate with AI service with proper error handling
    try {
      // TODO: Replace with actual AI service call
      // const response = await aiService.sendMessage(userMessageContent)

      // Simulate AI service call with proper error handling
      const response = await new Promise<string>((resolve, reject) => {
        setTimeout(() => {
          // Simulate occasional failures for testing
          if (Math.random() > 0.9) {
            reject(new Error('AI service temporarily unavailable'))
          } else {
            resolve(
              `I received your message: "${userMessageContent}". This is a placeholder response.`
            )
          }
        }, 1000)
      })

      const assistantMessage = {
        id: `msg-${Date.now()}-assistant`,
        type: 'assistant' as const,
        content: response,
        timestamp: Date.now()
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
        <h2 className="mb-1 text-lg font-bold" style={{color: 'var(--text-primary)'}}>
          AI Chat Assistant
        </h2>
        <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
          Ask questions about your transcripts or get general assistance
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {chatHistory.length === 0 ? (
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
        ) : (
          <div className="space-y-4 pb-4">
            {chatHistory.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
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
                    <p
                      className="mb-2 text-sm leading-relaxed"
                      style={{color: 'var(--text-primary)'}}
                    >
                      {msg.content}
                    </p>
                    <p className="text-xs" style={{color: 'var(--text-muted)'}}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
              disabled={!message.trim()}
              className="app-region-no-drag flex h-11 items-center justify-center rounded-xl px-5 transition-all duration-200 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={
                {
                  WebkitAppRegion: 'no-drag',
                  background: message.trim()
                    ? 'linear-gradient(135deg, var(--interactive-primary) 0%, var(--interactive-primary-hover) 100%)'
                    : 'var(--glass-medium)',
                  border: '1px solid var(--glass-border)',
                  color: message.trim() ? 'white' : 'var(--text-primary)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  fontSize: '14px',
                  fontWeight: 500,
                  minWidth: '80px',
                  boxShadow: message.trim()
                    ? '0 4px 16px rgba(96, 165, 250, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                    : '0 2px 8px var(--glass-shadow)'
                } as React.CSSProperties
              }
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
