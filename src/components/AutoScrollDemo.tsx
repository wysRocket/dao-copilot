import React, {useState, useEffect} from 'react'
import {useAutoScroll} from '../hooks/useAutoScroll'
import {NewContentIndicator, ScrollControls} from './AutoScrollComponents'
import '../styles/auto-scroll-components.css'

/**
 * Demo component showcasing auto-scroll functionality
 */
export const AutoScrollDemo: React.FC = () => {
  const [messages, setMessages] = useState<Array<{id: number; text: string; timestamp: Date}>>([])
  const [isAutoGenerating, setIsAutoGenerating] = useState(false)
  const [generationSpeed, setGenerationSpeed] = useState(1000)
  const [messageCount, setMessageCount] = useState(0)

  const {state, controls, containerRef, onNewContent} = useAutoScroll({
    enabled: true,
    bottomThreshold: 50,
    smooth: true,
    showNewContentIndicator: true
  })

  // Auto-generate messages for demo
  useEffect(() => {
    if (!isAutoGenerating) return

    const interval = setInterval(() => {
      const newMessage = {
        id: Date.now(),
        text: generateDemoMessage(messageCount),
        timestamp: new Date()
      }

      setMessages(prev => [...prev, newMessage])
      setMessageCount(prev => prev + 1)

      // Trigger new content callback
      setTimeout(() => {
        onNewContent()
      }, 10)
    }, generationSpeed)

    return () => clearInterval(interval)
  }, [isAutoGenerating, generationSpeed, messageCount, onNewContent])

  const generateDemoMessage = (count: number): string => {
    const demoMessages = [
      'Hello! This is a demo of the auto-scroll functionality.',
      'As new messages are added, the container will automatically scroll to the bottom.',
      'If you scroll up manually, auto-scroll will be paused.',
      "You'll see a new content indicator when messages arrive while you're scrolled up.",
      'The scroll controls in the bottom-right let you manage scrolling behavior.',
      'Try scrolling up and watch how the system behaves!',
      'Auto-scroll re-enables when you scroll back near the bottom.',
      'This is perfect for chat interfaces and live transcription displays.',
      'Performance is optimized for smooth scrolling even with many messages.',
      'The system is fully accessible with keyboard navigation and screen reader support.',
      'Dark mode and high contrast themes are fully supported.',
      'Reduced motion preferences are respected for accessibility.',
      'Mobile responsive design ensures great touch interaction.',
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco.',
      'Duis aute irure dolor in reprehenderit in voluptate velit esse.',
      'Excepteur sint occaecat cupidatat non proident, sunt in culpa.',
      'Qui officia deserunt mollit anim id est laborum.',
      'Nulla pariatur. Excepteur sint occaecat cupidatat non proident.'
    ]

    const randomMessage = demoMessages[count % demoMessages.length]
    return `Message #${count + 1}: ${randomMessage}`
  }

  const addManualMessage = () => {
    const newMessage = {
      id: Date.now(),
      text: `Manual message added at ${new Date().toLocaleTimeString()}`,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, newMessage])
    setMessageCount(prev => prev + 1)

    setTimeout(() => {
      onNewContent()
    }, 10)
  }

  const clearMessages = () => {
    setMessages([])
    setMessageCount(0)
    setIsAutoGenerating(false)
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})
  }

  return (
    <div
      className="auto-scroll-demo"
      style={{height: '100vh', display: 'flex', flexDirection: 'column'}}
    >
      {/* Header with controls */}
      <div
        style={{
          padding: '1rem',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          flexShrink: 0
        }}
      >
        <h2 style={{margin: '0 0 1rem 0', color: '#1f2937'}}>Auto-Scroll Demo</h2>

        <div style={{display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap'}}>
          <button
            onClick={() => setIsAutoGenerating(!isAutoGenerating)}
            style={{
              padding: '0.5rem 1rem',
              background: isAutoGenerating ? '#ef4444' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            {isAutoGenerating ? 'Stop Auto-Generation' : 'Start Auto-Generation'}
          </button>

          <button
            onClick={addManualMessage}
            style={{
              padding: '0.5rem 1rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            Add Manual Message
          </button>

          <button
            onClick={clearMessages}
            style={{
              padding: '0.5rem 1rem',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            Clear All
          </button>

          <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <label style={{fontSize: '0.875rem', color: '#374151'}}>Speed:</label>
            <select
              value={generationSpeed}
              onChange={e => setGenerationSpeed(Number(e.target.value))}
              style={{
                padding: '0.25rem 0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            >
              <option value={3000}>Slow (3s)</option>
              <option value={1000}>Medium (1s)</option>
              <option value={500}>Fast (0.5s)</option>
              <option value={100}>Very Fast (0.1s)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Status indicator */}
      <div
        style={{
          padding: '0.75rem 1rem',
          background: '#f0f9ff',
          borderBottom: '1px solid #e0f2fe',
          fontSize: '0.875rem',
          color: '#075985',
          flexShrink: 0
        }}
      >
        <div style={{display: 'flex', gap: '2rem', alignItems: 'center'}}>
          <span>
            <strong>Messages:</strong> {messages.length}
          </span>
          <span>
            <strong>Auto-Scroll:</strong> {state.isAutoScrolling ? '✅ Enabled' : '❌ Disabled'}
          </span>
          <span>
            <strong>User Scrolled:</strong> {state.hasUserScrolled ? '✅ Yes' : '❌ No'}
          </span>
          <span>
            <strong>New Content:</strong> {state.hasNewContent ? '🔴 Available' : '✅ Seen'}
          </span>
          <span>
            <strong>Scroll:</strong> {state.scrollPercentage}%
          </span>
          <span>
            <strong>Distance from Bottom:</strong> {state.distanceFromBottom}px
          </span>
        </div>
      </div>

      {/* Messages container with auto-scroll */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          background: 'white',
          overflow: 'hidden'
        }}
      >
        {/* Scrollable content */}
        <div
          ref={containerRef}
          style={{
            height: '100%',
            overflowY: 'auto',
            padding: '1rem'
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#6b7280',
                fontStyle: 'italic'
              }}
            >
              No messages yet. Click &quot;Add Manual Message&quot; or start auto-generation to see
              the demo.
            </div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  style={{
                    padding: '0.75rem 1rem',
                    background: index % 2 === 0 ? '#f8fafc' : '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    lineHeight: '1.5'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '1rem'
                    }}
                  >
                    <div style={{flex: 1}}>{message.text}</div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        flexShrink: 0
                      }}
                    >
                      {formatTime(message.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New content indicator */}
        <NewContentIndicator
          visible={state.hasNewContent}
          newContentCount={state.hasNewContent ? 1 : 0}
          onClick={controls.scrollToBottom}
          variant="floating"
          animation="bounce"
        />

        {/* Scroll controls */}
        <ScrollControls
          isAutoScrolling={state.isAutoScrolling}
          hasNewContent={state.hasNewContent}
          scrollPercentage={state.scrollPercentage}
          isScrollable={state.isScrollable}
          onToggleAutoScroll={controls.toggleAutoScroll}
          onScrollToTop={controls.scrollToTop}
          onScrollToBottom={controls.scrollToBottom}
          position="floating"
        />
      </div>

      {/* Footer with instructions */}
      <div
        style={{
          padding: '1rem',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          fontSize: '0.875rem',
          color: '#374151',
          flexShrink: 0
        }}
      >
        <h4 style={{margin: '0 0 0.5rem 0', color: '#1f2937'}}>How to test:</h4>
        <ul style={{margin: 0, paddingLeft: '1.5rem', lineHeight: '1.6'}}>
          <li>Start auto-generation and watch messages appear with automatic scrolling</li>
          <li>
            Scroll up manually - notice auto-scroll disables and new content indicator appears
          </li>
          <li>Scroll back to bottom - auto-scroll re-enables automatically</li>
          <li>Use the floating controls to manage scroll behavior</li>
          <li>Try different generation speeds to test performance</li>
          <li>Test with keyboard navigation (Tab, Enter, Space)</li>
        </ul>
      </div>
    </div>
  )
}

export default AutoScrollDemo
