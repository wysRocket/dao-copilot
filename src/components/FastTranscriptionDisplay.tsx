/**
 * Fast Transcription Display
 * Simple, high-performance component for live transcription without complex optimizations
 * 
 * This replaces the over-engineered OptimizedStreamingRenderer that was causing
 * 990ms render times and 1fps performance issues.
 */

import React, { useState, useEffect, useRef } from 'react'
import { cn } from '../utils/tailwind'

interface FastTranscriptionDisplayProps {
  text?: string;
  confidence?: number;
  isActive?: boolean;
  className?: string;
}

/**
 * Simple status indicator without complex animations
 */
const SimpleStatusIndicator: React.FC<{
  state: 'listening' | 'receiving' | 'error' | 'idle'
  size?: 'small' | 'medium'
}> = ({ state, size = 'medium' }) => {
  const sizeClasses = size === 'small' ? 'w-2 h-2' : 'w-3 h-3'
  
  const stateConfig = {
    listening: { color: 'bg-blue-400', animation: 'animate-pulse' },
    receiving: { color: 'bg-green-400', animation: 'animate-pulse' },
    error: { color: 'bg-red-400', animation: '' },
    idle: { color: 'bg-gray-400', animation: '' }
  }
  
  const config = stateConfig[state]
  
  return (
    <div
      className={cn(
        'rounded-full',
        sizeClasses,
        config.color,
        config.animation
      )}
      title={`Status: ${state}`}
    />
  )
}

/**
 * Fast transcription display component
 * 
 * This component prioritizes performance over fancy features:
 * - No complex animations that can cause render delays
 * - No excessive memoization that adds overhead
 * - No text chunking or virtual scrolling complexity
 * - Simple, direct text rendering
 */
export const FastTranscriptionDisplay: React.FC<FastTranscriptionDisplayProps> = ({
  text,
  isPartial = false,
  connectionState = 'disconnected',
  isListening = false,
  onTextClick,
  className,
  showStatus = true
}) => {
  const [displayText, setDisplayText] = useState('')
  const lastTextRef = useRef('')
  
  // Simple text update without complex animations
  useEffect(() => {
    if (text !== lastTextRef.current) {
      lastTextRef.current = text
      setDisplayText(text)
    }
  }, [text])
  
  // Determine simple status
  const getStatus = () => {
    if (connectionState === 'error') return 'error'
    if (text && text.length > 0) return 'receiving'
    if (isListening && connectionState === 'connected') return 'listening'
    return 'idle'
  }
  
  const status = getStatus()
  
  return (
    <div className={cn('fast-transcription-display', className)}>
      {/* Simple header with status */}
      {showStatus && (
        <div className="flex items-center space-x-2 mb-2 text-sm text-white/70">
          <SimpleStatusIndicator state={status} size="small" />
          <span>Live Transcription</span>
          <span className="text-xs">
            {connectionState} {isPartial && '(updating...)'}
          </span>
        </div>
      )}
      
      {/* Simple text display */}
      <div
        className={cn(
          'transcription-text',
          'p-4 rounded-lg',
          'bg-black/20 backdrop-blur-sm',
          'border border-white/10',
          'min-h-[100px]',
          'text-white leading-relaxed',
          {
            'text-white/70 italic': isPartial,
            'text-white/90': !isPartial,
            'cursor-pointer hover:bg-white/5': onTextClick,
            'border-green-400/30': status === 'receiving',
            'border-blue-400/30': status === 'listening',
            'border-red-400/30': status === 'error'
          }
        )}
        onClick={onTextClick}
        style={{
          wordWrap: 'break-word',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.6'
        }}
      >
        {displayText || (
          <div className="text-white/50 text-center py-8">
            {status === 'listening' ? 'Listening for speech...' : 
             status === 'error' ? 'Connection error' :
             'Click start to begin transcription'}
          </div>
        )}
        
        {/* Simple cursor for partial text */}
        {isPartial && displayText && (
          <span className="animate-pulse text-blue-400 ml-1">|</span>
        )}
      </div>
      
      {/* Simple footer with text length */}
      {displayText && (
        <div className="text-xs text-white/50 mt-1 text-right">
          {displayText.length} characters
        </div>
      )}
    </div>
  )
}

/**
 * Hook for managing transcription state simply
 */
export const useFastTranscriptionState = () => {
  const [text, setText] = useState('')
  const [isPartial, setIsPartial] = useState(false)
  const [connectionState, setConnectionState] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected')
  const [isListening, setIsListening] = useState(false)
  
  const updateText = (newText: string, partial: boolean = false) => {
    setText(newText)
    setIsPartial(partial)
  }
  
  const clearText = () => {
    setText('')
    setIsPartial(false)
  }
  
  return {
    text,
    isPartial,
    connectionState,
    isListening,
    updateText,
    clearText,
    setConnectionState,
    setIsListening
  }
}

export default FastTranscriptionDisplay
