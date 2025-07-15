/**
 * WebSocket Transcription Detection Utilities
 * 
 * Provides utility functions to identify WebSocket transcriptions and determine
 * whether they should be routed to streaming renderer vs static display.
 */

export interface TranscriptionSourceInfo {
  isWebSocket: boolean
  isStreaming: boolean
  isBatch: boolean
  shouldUseStreamingRenderer: boolean
  priority: 'high' | 'medium' | 'low'
  routingTarget: 'streaming' | 'static' | 'both'
}

/**
 * WebSocket source patterns for detection
 */
const WEBSOCKET_SOURCE_PATTERNS = [
  'websocket',
  'websocket-gemini',
  'websocket-proxy',
  'websocket-partial',
  'websocket-text',
  'websocket-turn-complete',
  'gemini-live',
  'real-time-websocket'
] as const

/**
 * Streaming source patterns
 */
const STREAMING_SOURCE_PATTERNS = [
  'streaming',
  'real-time',
  'live-stream',
  'continuous'
] as const

/**
 * Batch source patterns
 */
const BATCH_SOURCE_PATTERNS = [
  'batch',
  'batch-proxy',
  'file-upload',
  'offline',
  'bulk-process'
] as const

/**
 * Check if a source string indicates a WebSocket transcription
 */
export function isWebSocketTranscription(source?: string): boolean {
  if (!source) return false
  
  const normalizedSource = source.toLowerCase().replace(/[-_]/g, '')
  
  return WEBSOCKET_SOURCE_PATTERNS.some(pattern => {
    const normalizedPattern = pattern.replace(/[-_]/g, '')
    return normalizedSource.includes(normalizedPattern)
  })
}

/**
 * Check if a source string indicates a streaming transcription
 */
export function isStreamingTranscription(source?: string): boolean {
  if (!source) return false
  
  const normalizedSource = source.toLowerCase().replace(/[-_]/g, '')
  
  return STREAMING_SOURCE_PATTERNS.some(pattern => {
    const normalizedPattern = pattern.replace(/[-_]/g, '')
    return normalizedSource.includes(normalizedPattern)
  })
}

/**
 * Check if a source string indicates a batch transcription
 */
export function isBatchTranscription(source?: string): boolean {
  if (!source) return true // Default to batch if no source
  
  const normalizedSource = source.toLowerCase().replace(/[-_]/g, '')
  
  return BATCH_SOURCE_PATTERNS.some(pattern => {
    const normalizedPattern = pattern.replace(/[-_]/g, '')
    return normalizedSource.includes(normalizedPattern)
  })
}

/**
 * Determine if a transcription should use the streaming renderer
 */
export function shouldUseStreamingRenderer(source?: string): boolean {
  return isWebSocketTranscription(source) || isStreamingTranscription(source)
}

/**
 * Get comprehensive source information for a transcription
 */
export function getTranscriptionSourceInfo(source?: string): TranscriptionSourceInfo {
  const isWebSocket = isWebSocketTranscription(source)
  const isStreaming = isStreamingTranscription(source)
  const isBatch = isBatchTranscription(source) && !isWebSocket && !isStreaming
  
  let priority: 'high' | 'medium' | 'low' = 'low'
  let routingTarget: 'streaming' | 'static' | 'both' = 'static'
  
  if (isWebSocket) {
    priority = 'high'
    routingTarget = 'streaming'
  } else if (isStreaming) {
    priority = 'medium'
    routingTarget = 'streaming'
  } else if (isBatch) {
    priority = 'low'
    routingTarget = 'static'
  }
  
  return {
    isWebSocket,
    isStreaming,
    isBatch,
    shouldUseStreamingRenderer: shouldUseStreamingRenderer(source),
    priority,
    routingTarget
  }
}

/**
 * Validate if a transcription source is from a WebSocket connection
 * More strict validation for critical routing decisions
 */
export function validateWebSocketSource(
  source?: string,
  additionalContext?: {
    timestamp?: number
    isPartial?: boolean
    confidence?: number
    metadata?: Record<string, unknown>
  }
): {
  isValid: boolean
  confidence: number
  reasons: string[]
} {
  const reasons: string[] = []
  let confidence = 0
  
  if (!source) {
    reasons.push('No source provided')
    return { isValid: false, confidence: 0, reasons }
  }
  
  // Check source pattern
  if (isWebSocketTranscription(source)) {
    confidence += 0.6
    reasons.push('Source matches WebSocket pattern')
  } else {
    reasons.push('Source does not match WebSocket pattern')
    return { isValid: false, confidence, reasons }
  }
  
  // Check timing patterns (WebSocket transcriptions are typically real-time)
  if (additionalContext?.timestamp) {
    const timeDiff = Date.now() - additionalContext.timestamp
    if (timeDiff < 5000) { // Within 5 seconds is very likely real-time
      confidence += 0.2
      reasons.push('Recent timestamp indicates real-time processing')
    } else if (timeDiff < 30000) { // Within 30 seconds is somewhat likely
      confidence += 0.1
      reasons.push('Moderately recent timestamp')
    }
  }
  
  // Check if it's partial (typical for WebSocket streams)
  if (additionalContext?.isPartial === true) {
    confidence += 0.1
    reasons.push('Partial transcription indicates streaming')
  }
  
  // Check confidence patterns (WebSocket often has varying confidence)
  if (additionalContext?.confidence !== undefined) {
    if (additionalContext.confidence > 0 && additionalContext.confidence < 1) {
      confidence += 0.05
      reasons.push('Has confidence score in expected range')
    }
  }
  
  // Check for WebSocket-specific metadata
  if (additionalContext?.metadata) {
    const metadata = additionalContext.metadata
    if (metadata.connectionId || metadata.sessionId || metadata.websocketId) {
      confidence += 0.05
      reasons.push('Contains WebSocket-specific metadata')
    }
  }
  
  const isValid = confidence >= 0.6 // Require 60% confidence
  
  return {
    isValid,
    confidence,
    reasons
  }
}

/**
 * Extract source from various transcription object formats
 */
export function extractTranscriptionSource(
  transcription: unknown
): string | undefined {
  if (!transcription || typeof transcription !== 'object') {
    return undefined
  }
  
  const obj = transcription as Record<string, unknown>
  
  // Check common source property names
  const sourceKeys = ['source', 'sourceType', 'type', 'origin', 'provider']
  
  for (const key of sourceKeys) {
    if (obj[key] && typeof obj[key] === 'string') {
      return obj[key] as string
    }
  }
  
  // Check nested metadata
  if (obj.metadata && typeof obj.metadata === 'object') {
    const metadata = obj.metadata as Record<string, unknown>
    for (const key of sourceKeys) {
      if (metadata[key] && typeof metadata[key] === 'string') {
        return metadata[key] as string
      }
    }
  }
  
  return undefined
}

/**
 * Create a routing decision for a transcription based on its source
 */
export function createRoutingDecision(
  source?: string,
  context?: {
    currentStreamingActive?: boolean
    hasActiveWebSocket?: boolean
    transcriptionCount?: number
  }
): {
  route: 'streaming' | 'static' | 'queue'
  priority: number
  shouldInterrupt: boolean
  reason: string
} {
  const sourceInfo = getTranscriptionSourceInfo(source)
  
  if (sourceInfo.isWebSocket) {
    return {
      route: 'streaming',
      priority: 1,
      shouldInterrupt: true,
      reason: 'WebSocket transcription gets highest priority and streaming route'
    }
  }
  
  if (sourceInfo.isStreaming) {
    // If there's already a WebSocket active, queue the streaming transcription
    if (context?.hasActiveWebSocket) {
      return {
        route: 'queue',
        priority: 2,
        shouldInterrupt: false,
        reason: 'Streaming transcription queued due to active WebSocket'
      }
    }
    
    return {
      route: 'streaming',
      priority: 2,
      shouldInterrupt: false,
      reason: 'Streaming transcription routes to streaming renderer'
    }
  }
  
  return {
    route: 'static',
    priority: 3,
    shouldInterrupt: false,
    reason: 'Batch transcription routes to static display'
  }
}

/**
 * Check if a transcription object has WebSocket characteristics
 */
export function hasWebSocketCharacteristics(transcription: {
  text?: string
  timestamp?: number
  confidence?: number
  source?: string
  isPartial?: boolean
  [key: string]: unknown
}): boolean {
  // Quick source check
  if (isWebSocketTranscription(transcription.source)) {
    return true
  }
  
  // Check temporal characteristics
  const isRecent = transcription.timestamp ? 
    (Date.now() - transcription.timestamp) < 10000 : false
  
  // Check text characteristics (WebSocket often has shorter, incremental text)
  const hasShortText = transcription.text ? transcription.text.length < 200 : false
  
  // Check if partial (common for WebSocket streams)
  const isPartial = transcription.isPartial === true
  
  // Combine heuristics
  const score = (isRecent ? 1 : 0) + (hasShortText ? 1 : 0) + (isPartial ? 1 : 0)
  
  return score >= 2 // Require at least 2 out of 3 characteristics
}
