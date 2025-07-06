/**
 * OpenTelemetry Custom Spans for WebSocket Operations
 * 
 * Provides helper functions for creating custom spans for WebSocket and transcription operations
 */

import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { logger } from '../logging'

// Get tracer instance
const tracer = trace.getTracer('dao-copilot-websocket', '1.0.0')

/**
 * Span context interface for additional metadata
 */
export interface SpanContext {
  connectionId?: string
  sessionId?: string
  messageId?: string
  operation?: string
  metadata?: Record<string, unknown>
}

/**
 * Custom attributes for WebSocket operations
 */
export const WebSocketAttributes = {
  CONNECTION_ID: 'websocket.connection_id',
  SESSION_ID: 'websocket.session_id',
  MESSAGE_ID: 'websocket.message_id',
  MESSAGE_TYPE: 'websocket.message_type',
  MESSAGE_SIZE: 'websocket.message_size',
  CONNECTION_STATE: 'websocket.connection_state',
  RECONNECTION_ATTEMPT: 'websocket.reconnection_attempt',
  TRANSCRIPTION_MODE: 'transcription.mode',
  TRANSCRIPTION_DURATION: 'transcription.duration_ms',
  AUDIO_FORMAT: 'audio.format',
  AUDIO_SAMPLE_RATE: 'audio.sample_rate',
  AUDIO_CHANNELS: 'audio.channels'
} as const

/**
 * Create a span for WebSocket connection operations
 */
export function createConnectionSpan(
  operation: string,
  spanContext: SpanContext = {}
) {
  const span = tracer.startSpan(`websocket.connection.${operation}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      [SemanticAttributes.NET_TRANSPORT]: 'websocket',
      [WebSocketAttributes.CONNECTION_ID]: spanContext.connectionId,
      [WebSocketAttributes.SESSION_ID]: spanContext.sessionId,
      ...(spanContext.metadata && Object.fromEntries(
        Object.entries(spanContext.metadata).map(([key, value]) => [
          `websocket.${key}`,
          String(value)
        ])
      ))
    }
  })

  return span
}

/**
 * Create a span for message operations
 */
export function createMessageSpan(
  operation: string,
  messageType: string,
  spanContext: SpanContext = {}
) {
  const span = tracer.startSpan(`websocket.message.${operation}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      [WebSocketAttributes.CONNECTION_ID]: spanContext.connectionId,
      [WebSocketAttributes.SESSION_ID]: spanContext.sessionId,
      [WebSocketAttributes.MESSAGE_ID]: spanContext.messageId,
      [WebSocketAttributes.MESSAGE_TYPE]: messageType,
      ...(spanContext.metadata?.messageSize ? {
        [WebSocketAttributes.MESSAGE_SIZE]: Number(spanContext.metadata.messageSize)
      } : {}),
      ...(spanContext.metadata ? Object.fromEntries(
        Object.entries(spanContext.metadata).map(([key, value]) => [
          `message.${key}`,
          String(value)
        ])
      ) : {})
    }
  })

  return span
}

/**
 * Create a span for transcription operations
 */
export function createTranscriptionSpan(
  operation: string,
  mode: string,
  spanContext: SpanContext = {}
) {
  const span = tracer.startSpan(`transcription.${operation}`, {
    kind: SpanKind.SERVER,
    attributes: {
      [WebSocketAttributes.TRANSCRIPTION_MODE]: mode,
      [WebSocketAttributes.CONNECTION_ID]: spanContext.connectionId,
      [WebSocketAttributes.SESSION_ID]: spanContext.sessionId,
      ...(spanContext.metadata && Object.fromEntries(
        Object.entries(spanContext.metadata).map(([key, value]) => [
          `transcription.${key}`,
          String(value)
        ])
      ))
    }
  })

  return span
}

/**
 * Create a span for audio processing operations
 */
export function createAudioSpan(
  operation: string,
  spanContext: SpanContext = {}
) {
  const span = tracer.startSpan(`audio.${operation}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      [WebSocketAttributes.CONNECTION_ID]: spanContext.connectionId,
      ...(spanContext.metadata?.format ? {
        [WebSocketAttributes.AUDIO_FORMAT]: String(spanContext.metadata.format)
      } : {}),
      ...(spanContext.metadata?.sampleRate ? {
        [WebSocketAttributes.AUDIO_SAMPLE_RATE]: Number(spanContext.metadata.sampleRate)
      } : {}),
      ...(spanContext.metadata?.channels ? {
        [WebSocketAttributes.AUDIO_CHANNELS]: Number(spanContext.metadata.channels)
      } : {}),
      ...(spanContext.metadata ? Object.fromEntries(
        Object.entries(spanContext.metadata).map(([key, value]) => [
          `audio.${key}`,
          String(value)
        ])
      ) : {})
    }
  })

  return span
}

/**
 * Execute a function within a span context
 */
export async function withSpan<T>(
  span: ReturnType<typeof tracer.startSpan>,
  fn: () => Promise<T> | T,
  onError?: (error: Error) => void
): Promise<T> {
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn()
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage
      })

      span.setAttribute('error.message', errorMessage)
      span.setAttribute('error.name', error instanceof Error ? error.name : 'Unknown')

      // Log error with span context
      logger.error('Span execution error', error as Error, {
        metadata: {
          spanId: span.spanContext().spanId,
          traceId: span.spanContext().traceId,
          operation: 'unknown'
        }
      })

      if (onError) {
        onError(error as Error)
      }

      throw error
    } finally {
      span.end()
    }
  })
}

/**
 * Add attributes to the current active span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>) {
  const span = trace.getActiveSpan()
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value)
    })
  }
}

/**
 * Add an event to the current active span
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>) {
  const span = trace.getActiveSpan()
  if (span) {
    span.addEvent(name, attributes)
  }
}

/**
 * Get the current trace and span IDs for correlation
 */
export function getTraceContext(): { traceId: string; spanId: string } | null {
  const span = trace.getActiveSpan()
  if (span) {
    const spanContext = span.spanContext()
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId
    }
  }
  return null
}

/**
 * Create a child span from the current active span
 */
export function createChildSpan(
  name: string,
  attributes?: Record<string, string | number | boolean>
) {
  return tracer.startSpan(name, {
    attributes
  })
}

/**
 * Performance measurement with tracing
 */
export async function measureOperation<T>(
  operationName: string,
  operation: () => Promise<T> | T,
  spanContext?: SpanContext
): Promise<T> {
  const span = tracer.startSpan(operationName, {
    kind: SpanKind.INTERNAL,
    attributes: {
      ...(spanContext?.connectionId && {
        [WebSocketAttributes.CONNECTION_ID]: spanContext.connectionId
      }),
      ...(spanContext?.metadata && Object.fromEntries(
        Object.entries(spanContext.metadata).map(([key, value]) => [
          `operation.${key}`,
          String(value)
        ])
      ))
    }
  })

  const startTime = Date.now()

  return withSpan(span, async () => {
    const result = await operation()
    const duration = Date.now() - startTime
    
    span.setAttribute('operation.duration_ms', duration)
    addSpanEvent('operation.completed', { duration_ms: duration })
    
    return result
  })
}

/**
 * Utility to safely get span attributes as strings for logging
 */
export function getSpanAttributesForLogging(): Record<string, string> {
  const span = trace.getActiveSpan()
  if (span) {
    // Since we can't directly get attributes, return span context info
    const spanContext = span.spanContext()
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags.toString()
    }
  }
  return {}
}
