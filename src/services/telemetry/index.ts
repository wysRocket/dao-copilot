/**
 * OpenTelemetry Telemetry Module
 * 
 * Exports tracing configuration and custom spans for the dao-copilot application
 */

// Export tracing configuration
export {
  type TracingConfig,
  defaultTracingConfig,
  initializeTracing,
  shutdownTracing,
  getTracingSDK
} from './tracing-config'

// Export custom spans utilities
export {
  type SpanContext,
  WebSocketAttributes,
  createConnectionSpan,
  createMessageSpan,
  createTranscriptionSpan,
  createAudioSpan,
  withSpan,
  addSpanAttributes,
  addSpanEvent,
  getTraceContext,
  createChildSpan,
  measureOperation,
  getSpanAttributesForLogging
} from './custom-spans'

// Re-export OpenTelemetry API for convenience
export { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api'
