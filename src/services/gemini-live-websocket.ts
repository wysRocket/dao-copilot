/**
 * Gemini Live API WebSocket Client
 * Handles real-time bidirectional communication with Google's Gemini Live API
 */

import {EventEmitter} from 'events'
import {GeminiMessageHandler, MessageType, MessagePriority} from './gemini-message-handler'
import {GeminiErrorHandler, ErrorType, type GeminiError} from './gemini-error-handler'
import {logger} from './gemini-logger'
import {sanitizeLogMessage, safeLogger} from './log-sanitizer'
import {markPerformance, PERFORMANCE_MARKERS} from '../utils/performance-profiler'
import {FallbackManager, TranscriptionResult} from '../fallback/FallbackManager'
import ReconnectionManager, {
  ReconnectionStrategy,
  type ReconnectionConfig
} from './gemini-reconnection-manager'
import {WebSocketHeartbeatMonitor, HeartbeatStatus} from './websocket-heartbeat-monitor'
import GeminiSessionManager, {type SessionData} from './gemini-session-manager'
import {TranscriptFSM} from '../transcription/fsm'
// Default API version for Gemini Live API (use config.apiVersion to override)
export const GEMINI_LIVE_API_VERSION = 'v1beta'
// Default Gemini Live model (can be overridden via config.model or env GEMINI_MODEL)
// Safe env accessor (renderer may not expose process)
function safeEnv(key: string): string | undefined {
  try {
    const g = globalThis as unknown as {
      process?: {env?: Record<string, string | undefined>}
      window?: {__ENV__?: Record<string, string | undefined>}
    }
    // Prefer injected import.meta.env (Vite) then process.env then window.__ENV__
    try {
      const metaEnv = (import.meta as unknown as {env?: Record<string, string>})?.env
      if (metaEnv && key in metaEnv) return metaEnv[key]
    } catch {
      // ignore - import.meta not available
    }
    if (g?.process?.env && key in g.process.env) return g.process.env[key]
    if (g?.window?.__ENV__ && key in g.window.__ENV__) return g.window.__ENV__[key]
  } catch {
    // ignore access issues
  }
  return undefined
}
// Safe env access for renderer/browser (Electron with nodeIntegration off)
function safeGetEnv(name: string): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof process !== 'undefined' && (process as any).env) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (process as any).env[name]
    }
  } catch {
    /* swallow */
  }
  const g = globalThis as unknown as {__ENV__?: Record<string, string>}
  return g.__ENV__?.[name]
}
export const GEMINI_LIVE_MODEL = safeGetEnv('GEMINI_MODEL') || 'gemini-live-2.5-flash-preview'

// Global (cross-instance) schema negotiation state so new client instances continue exploration
interface GlobalGeminiSchemaState {
  lastVariantTried: number
  lastSuccessVariant: number | null
  lastCloseCode?: number
  consecutive1007?: number
}
const __GLOBAL_GEMINI_SCHEMA_STATE: GlobalGeminiSchemaState = (() => {
  const g = globalThis as unknown as {__GEMINI_WS_SCHEMA_STATE?: GlobalGeminiSchemaState}
  if (!g.__GEMINI_WS_SCHEMA_STATE) {
    g.__GEMINI_WS_SCHEMA_STATE = {
      lastVariantTried: 17, // Start with official v1beta variant
      lastSuccessVariant: 17, // Official v1beta variant is known to work
      lastCloseCode: undefined,
      consecutive1007: 0
    }
  }
  return g.__GEMINI_WS_SCHEMA_STATE
})()

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

export enum ResponseModality {
  TEXT = 'TEXT',
  AUDIO = 'AUDIO'
}

// Server error interface for proper typing
interface ServerErrorData {
  code?: string | number
  message?: string
  details?: unknown
  type?: string
}

// Enhanced data models for gemini-live-2.5-flash-preview responses
export interface ParsedGeminiResponse {
  type:
    | 'text'
    | 'audio'
    | 'tool_call'
    | 'error'
    | 'setup_complete'
    | 'turn_complete'
    | 'tool_call_cancellation'
    | 'go_away'
    | 'session_resumption_update'
  content: string | ArrayBuffer | null
  metadata: {
    messageId?: string
    timestamp: number
    confidence?: number
    isPartial?: boolean
    modelTurn?: boolean
    inputTranscription?: boolean
    turnId?: string
    // v1beta specific metadata
    toolCallIds?: string[]
    timeLeft?: {
      seconds: number
      nanos: number
    }
    sessionHandle?: string
    resumable?: boolean
  }
  toolCall?: {
    name: string
    parameters: Record<string, unknown>
    id: string
  }
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  // v1beta specific response types
  toolCallCancellation?: {
    ids: string[]
  }
  goAway?: {
    timeLeft?: {
      seconds: number
      nanos: number
    }
  }
  sessionResumptionUpdate?: {
    newHandle: string
    resumable: boolean
  }
}

export interface AudioResponseData {
  data: string // Base64 encoded audio
  format: string
  sampleRate?: number
  channels?: number
}

export interface ToolCallResponseData {
  functionCall: {
    name: string
    args: Record<string, unknown>
  }
  id: string
}

export interface TurnCompleteData {
  turnId?: string
  modelTurn?: boolean
  inputTokens?: number
  outputTokens?: number
}

export interface GeminiLiveConfig {
  apiKey: string
  model?: string
  responseModalities?: ResponseModality[]
  systemInstruction?: string
  reconnectAttempts?: number
  heartbeatInterval?: number
  connectionTimeout?: number
  reconnectionStrategy?: ReconnectionStrategy
  reconnectionConfig?: Partial<ReconnectionConfig>
  websocketBaseUrl?: string
  maxQueueSize?: number
  apiVersion?: string // API version to use (defaults to 'v1beta')
  // Generation configuration options for fine-tuning responses
  generationConfig?: {
    candidateCount?: number
    maxOutputTokens?: number
    temperature?: number
    topP?: number
    topK?: number
    presencePenalty?: number
    frequencyPenalty?: number
  }
}

export interface AudioData {
  data: string // Base64 encoded audio
  mimeType: string
}

export interface RealtimeInput {
  audio?: AudioData
  text?: string
  audioStreamEnd?: boolean
}

// Enhanced message queue system for reliability
export interface QueuedMessage {
  id: string
  input: RealtimeInput
  timestamp: number
  retryCount: number
  maxRetries: number
  priority: QueuePriority
  timeout: number
  resolve?: (value?: void) => void
  reject?: (error: Error) => void
}

export interface MessageSendOptions {
  priority?: QueuePriority
  maxRetries?: number
  timeout?: number
  expectResponse?: boolean
}

// Message priorities for queue management
export enum QueuePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

export interface GeminiMessage {
  serverContent?: {
    turnComplete?: boolean
    modelTurn?: {
      parts?: Array<{
        text?: string
        inlineData?: {
          mimeType: string
          data: string
        }
      }>
    }
  }
  data?: string
}

export interface SetupMessage {
  setup: {
    model: string
    generationConfig?: {
      candidateCount?: number
      maxOutputTokens?: number
      temperature?: number
      topP?: number
      topK?: number
      presencePenalty?: number
      frequencyPenalty?: number
      responseModalities?: ResponseModality[]
      speechConfig?: {
        voiceConfig?: {
          prebuiltVoiceConfig?: {
            voiceName?: string
          }
        }
      }
      mediaResolution?: object
    }
    systemInstruction?: {
      parts: Array<{
        text: string
      }>
    }
    tools?: Array<object>
  }
}

export interface GeminiLiveApiResponse {
  text?: string
  // Other potential fields based on Gemini Live API documentation
}

/**
 * Enhanced message parser for gemini-live-2.5-flash-preview model
 * Handles various response formats including text, audio, and tool calls
 */
export class Gemini2FlashMessageParser {
  /**
   * Parse a raw message from the Gemini Live API
   */
  static parseResponse(rawMessage: unknown): ParsedGeminiResponse {
    const timestamp = Date.now()

    // Handle string messages (likely JSON)
    if (typeof rawMessage === 'string') {
      try {
        return this.parseResponse(JSON.parse(rawMessage))
      } catch {
        return {
          type: 'error',
          content: null,
          metadata: {timestamp},
          error: {
            code: 'PARSE_ERROR',
            message: 'Failed to parse JSON message',
            details: {originalMessage: rawMessage}
          }
        }
      }
    }

    // Handle non-object messages
    if (!rawMessage || typeof rawMessage !== 'object') {
      return {
        type: 'error',
        content: null,
        metadata: {timestamp},
        error: {
          code: 'INVALID_MESSAGE',
          message: 'Message must be a valid object',
          details: {receivedType: typeof rawMessage}
        }
      }
    }

    const message = rawMessage as Record<string, unknown>

    // Handle server content (text responses)
    if (message.serverContent && typeof message.serverContent === 'object') {
      return this.parseServerContent(message.serverContent as Record<string, unknown>, timestamp)
    }

    // Handle model turn responses
    if (message.modelTurn && typeof message.modelTurn === 'object') {
      return this.parseModelTurn(message.modelTurn as Record<string, unknown>, timestamp)
    }

    // Handle audio data responses
    if (message.realtimeInput && typeof message.realtimeInput === 'object') {
      return this.parseRealtimeInput(message.realtimeInput as Record<string, unknown>, timestamp)
    }

    // Handle turn complete responses
    if (message.turnComplete !== undefined) {
      return this.parseTurnComplete(message.turnComplete, timestamp)
    }

    // Handle setup complete responses
    if (message.setupComplete && typeof message.setupComplete === 'object') {
      return this.parseSetupComplete(message.setupComplete as Record<string, unknown>, timestamp)
    }

    // Handle tool call responses
    if (message.toolCall && typeof message.toolCall === 'object') {
      return this.parseToolCall(message.toolCall as Record<string, unknown>, timestamp)
    }

    // Handle tool call cancellation responses (v1beta)
    if (message.toolCallCancellation && typeof message.toolCallCancellation === 'object') {
      return this.parseToolCallCancellation(
        message.toolCallCancellation as Record<string, unknown>,
        timestamp
      )
    }

    // Handle go away responses (v1beta)
    if (message.goAway && typeof message.goAway === 'object') {
      return this.parseGoAway(message.goAway as Record<string, unknown>, timestamp)
    }

    // Handle session resumption updates (v1beta)
    if (message.sessionResumptionUpdate && typeof message.sessionResumptionUpdate === 'object') {
      return this.parseSessionResumptionUpdate(
        message.sessionResumptionUpdate as Record<string, unknown>,
        timestamp
      )
    }

    // Handle error responses
    if (message.error && typeof message.error === 'object') {
      return this.parseError(message.error as Record<string, unknown>, timestamp)
    }

    // Default fallback for unknown message types
    return {
      type: 'text',
      content: JSON.stringify(message),
      metadata: {
        timestamp,
        messageId: (message.id as string) || undefined
      }
    }
  }

  /**
   * Parse server content messages (text responses)
   */
  private static parseServerContent(
    serverContent: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    // ===== DEBUGGING: WEBSOCKET MESSAGE CLASSIFICATION =====
    console.group('🔍 WebSocket parseServerContent')
    console.log('📦 Raw serverContent:', serverContent)

    const modelTurn = serverContent.modelTurn as Record<string, unknown> | undefined
    const turnComplete = serverContent.turnComplete as boolean | undefined
    // Some Gemini messages include a generationComplete flag without additional parts. We treat these
    // as progress/control signals rather than textual content. They should not emit empty transcript events.
    const generationComplete =
      (serverContent as Record<string, unknown>).generationComplete === true
    const inputTranscription = serverContent.inputTranscription as
      | Record<string, unknown>
      | undefined

    console.log('🏷️ Message classification:')
    console.log('  • inputTranscription:', !!inputTranscription)
    console.log('  • modelTurn:', !!modelTurn)
    console.log('  • turnComplete:', turnComplete)
    console.log('  • generationComplete:', generationComplete)

    // Check for input transcription first (for speech-to-text)
    if (inputTranscription && typeof inputTranscription.text === 'string') {
      console.log('✅ DETECTED: inputTranscription (USER SPEECH)')
      console.log('📝 Text content:', inputTranscription.text?.substring(0, 100) + '...')
      console.groupEnd()

      return {
        type: 'text',
        content: inputTranscription.text,
        metadata: {
          timestamp,
          inputTranscription: true,
          isPartial: !turnComplete,
          confidence:
            typeof inputTranscription.confidence === 'number'
              ? inputTranscription.confidence
              : undefined
        }
      }
    }

    if (modelTurn && Array.isArray(modelTurn.parts)) {
      // Extract text from parts
      const textParts = modelTurn.parts
        .map((part: Record<string, unknown>) => part.text)
        .filter((text: unknown): text is string => typeof text === 'string')

      const content = textParts.join(' ')

      console.log('🤖 DETECTED: modelTurn (AI RESPONSE/SEARCH)')
      console.log('📝 Text content:', content?.substring(0, 100) + '...')
      console.log('🔍 Contains "Charlie Kirk":', content?.includes('Charlie Kirk'))
      console.log('🔍 Contains "news":', content?.toLowerCase().includes('news'))
      console.groupEnd()

      return {
        type: 'text',
        content,
        metadata: {
          timestamp,
          modelTurn: true,
          isPartial: !turnComplete,
          turnId: (modelTurn.turnId as string) || undefined
        }
      }
    }
    // If we have a generationComplete control message with no textual parts, return a benign
    // placeholder that downstream logic can ignore instead of emitting an empty "final" event.
    if (generationComplete && !modelTurn) {
      return {
        type: 'text',
        content: '',
        metadata: {timestamp, modelTurn: false, isPartial: true}
      }
    }

    // If turnComplete was signaled with no modelTurn parts, surface an explicit turn_complete event
    if (turnComplete && !modelTurn) {
      return {
        type: 'turn_complete',
        content: null,
        metadata: {timestamp, modelTurn: false, isPartial: false}
      }
    }

    // Fallback: unknown serverContent format without parts; mark as partial & non-modelTurn so it will be ignored.
    return {
      type: 'text',
      content: '',
      metadata: {timestamp, modelTurn: false, isPartial: true}
    }
  }

  /**
   * Parse model turn messages
   */
  private static parseModelTurn(
    modelTurn: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    if (Array.isArray(modelTurn.parts)) {
      const textContent = modelTurn.parts
        .map((part: Record<string, unknown>) => part.text)
        .filter((text: unknown): text is string => typeof text === 'string')
        .join(' ')

      return {
        type: 'text',
        content: textContent,
        metadata: {
          timestamp,
          modelTurn: true,
          turnId: (modelTurn.turnId as string) || undefined
        }
      }
    }

    return {
      type: 'text',
      content: '',
      metadata: {timestamp, modelTurn: true}
    }
  }

  /**
   * Parse realtime input messages (audio)
   */
  private static parseRealtimeInput(
    realtimeInput: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    if (Array.isArray(realtimeInput.mediaChunks)) {
      for (const chunk of realtimeInput.mediaChunks) {
        if (chunk.mimeType && chunk.mimeType.startsWith('audio/')) {
          return {
            type: 'audio',
            content: (chunk.data as string) || null,
            metadata: {
              timestamp,
              messageId: (realtimeInput.id as string) || undefined
            }
          }
        }
      }
    }

    return {
      type: 'audio',
      content: null,
      metadata: {timestamp}
    }
  }

  /**
   * Parse turn complete messages
   */
  private static parseTurnComplete(turnComplete: unknown, timestamp: number): ParsedGeminiResponse {
    return {
      type: 'turn_complete',
      content: null,
      metadata: {
        timestamp,
        turnId:
          typeof turnComplete === 'object' && turnComplete
            ? ((turnComplete as Record<string, unknown>).turnId as string) || undefined
            : undefined
      }
    }
  }

  /**
   * Parse setup complete messages
   */
  private static parseSetupComplete(
    setupComplete: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    return {
      type: 'setup_complete',
      content: null,
      metadata: {
        timestamp,
        messageId: (setupComplete.id as string) || undefined
      }
    }
  }

  /**
   * Parse tool call messages
   */
  private static parseToolCall(
    toolCall: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    const functionCall = toolCall.functionCall as Record<string, unknown> | undefined

    if (functionCall) {
      return {
        type: 'tool_call',
        content: null,
        metadata: {timestamp},
        toolCall: {
          name: (functionCall.name as string) || '',
          parameters: (functionCall.args as Record<string, unknown>) || {},
          id: (toolCall.id as string) || ''
        }
      }
    }

    return {
      type: 'tool_call',
      content: null,
      metadata: {timestamp},
      toolCall: {
        name: '',
        parameters: {},
        id: ''
      }
    }
  }

  /**
   * Parse error messages
   */
  private static parseError(
    error: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    return {
      type: 'error',
      content: null,
      metadata: {timestamp},
      error: {
        code: (error.code as string) || 'UNKNOWN_ERROR',
        message: (error.message as string) || 'An unknown error occurred',
        details: (error.details as Record<string, unknown>) || {}
      }
    }
  }

  /**
   * Parse tool call cancellation messages (v1beta)
   */
  private static parseToolCallCancellation(
    toolCallCancellation: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    const ids = (toolCallCancellation.ids as string[]) || []

    return {
      type: 'tool_call_cancellation',
      content: null,
      metadata: {
        timestamp,
        messageId: `cancellation_${timestamp}`,
        toolCallIds: ids
      },
      toolCallCancellation: {
        ids
      }
    }
  }

  /**
   * Parse go away messages (v1beta)
   */
  private static parseGoAway(
    goAway: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    const timeLeft = goAway.timeLeft as Record<string, unknown> | undefined

    return {
      type: 'go_away',
      content: null,
      metadata: {
        timestamp,
        messageId: `goaway_${timestamp}`,
        timeLeft: timeLeft
          ? {
              seconds: (timeLeft.seconds as number) || 0,
              nanos: (timeLeft.nanos as number) || 0
            }
          : undefined
      },
      goAway: {
        timeLeft: timeLeft
          ? {
              seconds: (timeLeft.seconds as number) || 0,
              nanos: (timeLeft.nanos as number) || 0
            }
          : undefined
      }
    }
  }

  /**
   * Parse session resumption update messages (v1beta)
   */
  private static parseSessionResumptionUpdate(
    sessionResumptionUpdate: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    const newHandle = (sessionResumptionUpdate.newHandle as string) || ''
    const resumable = (sessionResumptionUpdate.resumable as boolean) || false

    return {
      type: 'session_resumption_update',
      content: null,
      metadata: {
        timestamp,
        messageId: `session_update_${timestamp}`,
        sessionHandle: newHandle,
        resumable
      },
      sessionResumptionUpdate: {
        newHandle,
        resumable
      }
    }
  }

  /**
   * Validate that a parsed response is well-formed
   */
  static validateResponse(response: ParsedGeminiResponse): {isValid: boolean; errors: string[]} {
    const errors: string[] = []

    // Check required fields
    if (!response.type) {
      errors.push('Response must have a type')
    }

    if (!response.metadata || !response.metadata.timestamp) {
      errors.push('Response must have metadata with timestamp')
    }

    // Type-specific validation
    switch (response.type) {
      case 'text':
        if (typeof response.content !== 'string') {
          errors.push('Text response must have string content')
        }
        break

      case 'audio':
        if (response.content !== null && typeof response.content !== 'string') {
          errors.push('Audio response content must be string (base64) or null')
        }
        break

      case 'tool_call':
        if (!response.toolCall || !response.toolCall.name) {
          errors.push('Tool call response must have toolCall with name')
        }
        break

      case 'error':
        if (!response.error || !response.error.code || !response.error.message) {
          errors.push('Error response must have error object with code and message')
        }
        break

      case 'tool_call_cancellation':
        if (!response.toolCallCancellation || !Array.isArray(response.toolCallCancellation.ids)) {
          errors.push(
            'Tool call cancellation response must have toolCallCancellation with ids array'
          )
        }
        break

      case 'go_away':
        if (!response.goAway) {
          errors.push('Go away response must have goAway object')
        }
        break

      case 'session_resumption_update':
        if (
          !response.sessionResumptionUpdate ||
          typeof response.sessionResumptionUpdate.newHandle !== 'string' ||
          typeof response.sessionResumptionUpdate.resumable !== 'boolean'
        ) {
          errors.push(
            'Session resumption update response must have sessionResumptionUpdate with newHandle and resumable'
          )
        }
        break
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }
}

/**
 * WebSocket Connection Management for Gemini Live API
 */
export class GeminiLiveWebSocketClient extends EventEmitter {
  // Keep in sync with highest variant index (0-based). We currently define indices 0..22 inclusive.
  private static readonly MAX_SCHEMA_VARIANT = 27
  private ws: WebSocket | null = null
  private config: GeminiLiveConfig
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED
  private reconnectAttempts = 0
  private maxReconnectAttempts: number
  private heartbeatInterval: number
  private connectionTimeout: number
  private reconnectTimer: NodeJS.Timeout | null = null
  private messageQueue: Map<QueuePriority, QueuedMessage[]> = new Map()
  private pendingMessages: Map<string, QueuedMessage> = new Map()
  // Adaptive schema negotiation state for Gemini Live websocket payload format experimentation
  // Adaptive schema variant index selection strategy:
  // Order of precedence:
  // 1. Forced index via GEMINI_SCHEMA_FORCE_INDEX (authoritative)
  // 2. Last successful working variant (exact reuse)
  // 3. Progressive advancement: if we have tried a variant and have not succeeded yet, start at lastTried+1
  //    (even if the most recent close code wasn't 1007 – avoids regression after intentional 1000 closes)
  // 4. Explicit default override via GEMINI_SCHEMA_DEFAULT_INDEX
  // 5. Heuristic fallback (official v1beta realtimeInput.mediaChunks = variant 17)
  // Additionally: skip deprecated variants (currently 0) and clamp to MAX.
  private _schemaVariantIndex: number = (() => {
    const DEPRECATED = new Set([0])
    let reason = 'heuristicDefault'
    let idx: number | null = null
    try {
      const forced = safeEnv('GEMINI_SCHEMA_FORCE_INDEX')
      if (forced && /^\d+$/.test(forced)) {
        idx = Math.min(parseInt(forced, 10), GeminiLiveWebSocketClient.MAX_SCHEMA_VARIANT)
        reason = 'forced'
      } else if (__GLOBAL_GEMINI_SCHEMA_STATE.lastSuccessVariant !== null) {
        idx = __GLOBAL_GEMINI_SCHEMA_STATE.lastSuccessVariant
        reason = 'lastSuccessVariant'
      } else if (
        __GLOBAL_GEMINI_SCHEMA_STATE.lastVariantTried !== null &&
        __GLOBAL_GEMINI_SCHEMA_STATE.lastVariantTried >= 0
      ) {
        // Progressive advancement: always move forward if no success yet
        const candidate = __GLOBAL_GEMINI_SCHEMA_STATE.lastVariantTried + 1
        if (candidate <= GeminiLiveWebSocketClient.MAX_SCHEMA_VARIANT) {
          idx = candidate
          reason = 'advanceAfterFailure'
        }
      }
      if (idx === null) {
        const defIdx = safeEnv('GEMINI_SCHEMA_DEFAULT_INDEX')
        if (defIdx && /^\d+$/.test(defIdx)) {
          idx = Math.min(parseInt(defIdx, 10), GeminiLiveWebSocketClient.MAX_SCHEMA_VARIANT)
          reason = 'envDefault'
        }
      }
    } catch {
      /* ignore and fall through */
    }
    if (idx === null) idx = 17 // Default to official v1beta realtimeInput.mediaChunks format
    // Skip deprecated indexes
    while (DEPRECATED.has(idx) && idx < GeminiLiveWebSocketClient.MAX_SCHEMA_VARIANT) {
      idx++
      reason += '+skipDeprecated'
    }
    // Persist chosen starting point (unless forced – we still persist tried so progression works if force removed later)
    try {
      __GLOBAL_GEMINI_SCHEMA_STATE.lastVariantTried = idx
    } catch {
      /* swallow */
    }
    // Stash init reason for constructor logging (cannot use logger here before super())
    ;(globalThis as unknown as {__GEMINI_SCHEMA_INIT_REASON?: string}).__GEMINI_SCHEMA_INIT_REASON =
      reason
    return idx
  })()
  // Track last used variant label for adaptive turnComplete formatting / diagnostics
  private _lastVariantLabel: string | null = null
  private _recordedSuccessForSession = false
  // Session-level guard to avoid repeatedly jumping to parts schema on each 1007 series
  private _triedPartsSchemaJump = false
  // Aggregated current turn transcript (last partial) for synthesizing a final if server omits an explicit final text
  private _currentTurnText: string = ''
  private _finalEmittedForTurn: boolean = false
  // FSM integration for transcript lifecycle management
  private _currentUtteranceId: string | null = null
  private _sessionId: string = 'default'

  /**
   * Persist the latest tried / successful schema variant to the global state so that
   * hot-reloads or new client instances can start from a working schema more quickly.
   */
  private _persistSchemaState(kind: 'tried' | 'success', index: number) {
    try {
      if (kind === 'tried') {
        __GLOBAL_GEMINI_SCHEMA_STATE.lastVariantTried = index
      } else if (kind === 'success') {
        __GLOBAL_GEMINI_SCHEMA_STATE.lastSuccessVariant = index
        __GLOBAL_GEMINI_SCHEMA_STATE.lastVariantTried = index
      }
      // Optionally expose for renderer inspection / debugging
      ;(
        globalThis as unknown as {__GEMINI_WS_SCHEMA_STATE?: GlobalGeminiSchemaState}
      ).__GEMINI_WS_SCHEMA_STATE = __GLOBAL_GEMINI_SCHEMA_STATE
    } catch (e) {
      logger.warn('Failed to persist schema state', {kind, index, error: (e as Error)?.message})
    }
  }
  private _advanceSchemaVariant: boolean = false
  private maxQueueSize: number
  private messageIdCounter = 0
  private retryTimers: Map<string, NodeJS.Timeout> = new Map()
  private isClosingIntentionally = false
  private messageHandler: GeminiMessageHandler
  private errorHandler: GeminiErrorHandler
  private reconnectionManager: ReconnectionManager
  private heartbeatMonitor: WebSocketHeartbeatMonitor
  private sessionManager: GeminiSessionManager
  private fallbackManager: FallbackManager
  private currentSession: SessionData | null = null
  private isSetupComplete = false // Track setup completion to prevent audio before acknowledgment
  // Validation / instrumentation mode for signaling verification (Task 31.1)
  private validationMode: boolean = safeEnv('GEMINI_SIGNAL_VALIDATE') === '1'
  private validationMetrics = {
    currentTurnId: '' as string | undefined,
    sessionStart: 0,
    firstPartialTs: 0,
    finalTs: 0,
    partialCount: 0,
    finalChars: 0
  }

  /** Return shallow copy of current validation metrics */
  getValidationMetrics() {
    return {...this.validationMetrics}
  }

  /** Internal helper to emit structured validation logs when GEMINI_SIGNAL_VALIDATE=1 */
  private logValidation(kind: string, data: Record<string, unknown> = {}): void {
    if (!this.validationMode) return
    try {
      const payload = {
        v: 'signal-validate',
        kind,
        ts: Date.now(),
        turnId: this.validationMetrics.currentTurnId || undefined,
        ...data
      }
      logger.info('GEMINI_SIGNAL_VALIDATE', payload)
    } catch {
      /* swallow */
    }
  }

  /**
   * Validate configuration for v1beta compatibility
   */
  private validateConfig(config: GeminiLiveConfig): void {
    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw new Error('Valid API key is required for Gemini Live API')
    }

    // Validate API key format (basic validation)
    if (!config.apiKey.startsWith('AIza') || config.apiKey.length < 35) {
      throw new Error(
        'Invalid API key format. Google AI API keys should start with "AIza" and be at least 35 characters long'
      )
    }

    // Validate model if provided
    if (config.model && !config.model.includes('gemini')) {
      logger.warn(
        'Model name does not contain "gemini", please verify it is a valid Gemini Live model',
        {
          providedModel: config.model
        }
      )
    }

    // Validate WebSocket URL if provided
    if (config.websocketBaseUrl) {
      try {
        const url = new URL(config.websocketBaseUrl)
        if (!url.protocol.startsWith('wss')) {
          throw new Error('WebSocket URL must use secure protocol (wss://)')
        }
        if (!url.hostname.includes('googleapis.com')) {
          logger.warn('Custom WebSocket URL does not use googleapis.com domain', {
            hostname: url.hostname
          })
        }
      } catch (error) {
        throw new Error(
          `Invalid WebSocket URL: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    // Validate numeric configurations
    if (
      config.reconnectAttempts !== undefined &&
      (config.reconnectAttempts < 0 || config.reconnectAttempts > 20)
    ) {
      throw new Error('Reconnect attempts must be between 0 and 20')
    }

    if (
      config.heartbeatInterval !== undefined &&
      (config.heartbeatInterval < 5000 || config.heartbeatInterval > 300000)
    ) {
      throw new Error('Heartbeat interval must be between 5 seconds and 5 minutes')
    }

    if (
      config.connectionTimeout !== undefined &&
      (config.connectionTimeout < 1000 || config.connectionTimeout > 60000)
    ) {
      throw new Error('Connection timeout must be between 1 second and 1 minute')
    }

    if (
      config.maxQueueSize !== undefined &&
      (config.maxQueueSize < 10 || config.maxQueueSize > 1000)
    ) {
      throw new Error('Max queue size must be between 10 and 1000')
    }

    logger.debug('Configuration validation passed', {
      model: config.model || GEMINI_LIVE_MODEL,
      hasApiKey: !!config.apiKey,
      reconnectAttempts: config.reconnectAttempts,
      heartbeatInterval: config.heartbeatInterval,
      connectionTimeout: config.connectionTimeout
    })
  }

  constructor(config: GeminiLiveConfig) {
    super()

    // Validate configuration before proceeding
    this.validateConfig(config)

    this.config = {
      model: GEMINI_LIVE_MODEL,
      responseModalities: [ResponseModality.TEXT],
      systemInstruction: 'You are a helpful assistant and answer in a friendly tone.',
      reconnectAttempts: 5,
      heartbeatInterval: 30000, // 30 seconds
      connectionTimeout: 5000, // Reduced to 5 seconds for faster startup
      maxQueueSize: 100, // Limit message queue size to prevent memory issues
      apiVersion: 'v1beta', // Default to v1beta as per Google documentation
      ...config
    }
    this.maxReconnectAttempts = this.config.reconnectAttempts!
    this.heartbeatInterval = this.config.heartbeatInterval!
    this.connectionTimeout = this.config.connectionTimeout!
    this.maxQueueSize = this.config.maxQueueSize!

    // Initialize priority-based message queues
    Object.values(QueuePriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.messageQueue.set(priority, [])
      }
    })

    // Initialize message handler
    this.messageHandler = new GeminiMessageHandler()
    this.setupMessageHandler()

    // Initialize error handler
    this.errorHandler = new GeminiErrorHandler({
      maxErrorHistory: 100,
      logLevel: process.env.NODE_ENV === 'development' ? 4 : 2 // DEBUG in dev, INFO in prod
    })
    this.setupErrorHandlerEvents()
    this.setupEnhancedEventHandling()

    // Initialize reconnection manager
    this.reconnectionManager = new ReconnectionManager(
      {
        maxAttempts: this.maxReconnectAttempts,
        strategy: this.config.reconnectionStrategy || ReconnectionStrategy.EXPONENTIAL,
        baseDelay: 1000,
        maxDelay: 30000,
        jitterEnabled: true,
        jitterRange: 0.1,
        qualityThreshold: 0.8,
        unstableConnectionThreshold: 3,
        backoffMultiplier: 2,
        ...this.config.reconnectionConfig
      },
      this.errorHandler
    )
    this.setupReconnectionManagerEvents()

    // Initialize heartbeat monitor
    this.heartbeatMonitor = new WebSocketHeartbeatMonitor({
      interval: this.heartbeatInterval,
      timeout: 5000, // 5 second pong timeout
      maxMissedBeats: 3,
      useNativePing: false, // Gemini Live uses application-level heartbeat
      enableMetrics: true,
      customPingMessage: {ping: true}
    })
    this.setupHeartbeatMonitorEvents()

    // Initialize session manager
    this.sessionManager = new GeminiSessionManager({
      sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      maxInactiveDuration: 30 * 60 * 1000, // 30 minutes
      persistenceEnabled: true,
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      maxSessionHistory: 10
    })
    this.setupSessionManagerEvents()

    // Initialize fallback manager for handling transport failures
    this.fallbackManager = new FallbackManager({
      websocket: {
        timeout: 5000,
        maxRetries: 3,
        bufferSize: 1024 * 64 // 64KB
      },
      httpStream: {
        timeout: 10000,
        maxRetries: 2,
        bufferSize: 1024 * 128 // 128KB
      },
      batch: {
        timeout: 30000,
        maxRetries: 1,
        bufferSize: 1024 * 256 // 256KB
      },
      maxConsecutive1007Errors: 3,
      maxSchemaVariantFailures: 5,
      connectionQualityThreshold: 0.7,
      fallbackDelayMs: 2000,
      transportTimeoutMs: 15000,
      enableAggressiveFallback: true,
      enableAudioBuffering: true
    })
    this.setupFallbackManagerEvents()

    logger.info('GeminiLiveWebSocketClient initialized', {
      model: this.config.model,
      heartbeatInterval: this.heartbeatInterval,
      maxReconnectAttempts: this.maxReconnectAttempts,
      reconnectionStrategy: this.config.reconnectionStrategy || ReconnectionStrategy.EXPONENTIAL,
      schemaInitVariant: this._schemaVariantIndex,
      schemaInitReason:
        ((globalThis as unknown as Record<string, unknown>)
          .__GEMINI_SCHEMA_INIT_REASON as string) || 'unknown',
      globalSchemaState: {
        lastVariantTried: __GLOBAL_GEMINI_SCHEMA_STATE.lastVariantTried,
        lastSuccessVariant: __GLOBAL_GEMINI_SCHEMA_STATE.lastSuccessVariant,
        lastCloseCode: __GLOBAL_GEMINI_SCHEMA_STATE.lastCloseCode,
        consecutive1007: __GLOBAL_GEMINI_SCHEMA_STATE.consecutive1007
      }
    })

    // Explicitly announce validation mode so users can confirm env flag worked
    if (this.validationMode) {
      logger.info('GeminiLiveWebSocketClient validation mode ENABLED (GEMINI_SIGNAL_VALIDATE=1)')
    }
  }

  /**
   * Establish WebSocket connection to Gemini Live API
   */
  async connect(): Promise<void> {
    if (
      this.connectionState === ConnectionState.CONNECTED ||
      this.connectionState === ConnectionState.CONNECTING
    ) {
      safeLogger.log('Already connected or connecting')
      return
    }

    // Mark WebSocket initialization start
    markPerformance(PERFORMANCE_MARKERS.WEBSOCKET_INIT_START)

    this.setConnectionState(ConnectionState.CONNECTING)
    this.isClosingIntentionally = false

    try {
      // Construct WebSocket URL for Gemini Live API
      const wsUrl = this.buildWebSocketUrl()

      safeLogger.log('Connecting to Gemini Live API')

      this.ws = new WebSocket(wsUrl)

      // Set up connection timeout
      const timeoutId = setTimeout(() => {
        if (this.connectionState === ConnectionState.CONNECTING) {
          const timeoutError = this.errorHandler.handleError(
            new Error('Connection timeout'),
            {timeout: this.connectionTimeout},
            {type: ErrorType.TIMEOUT, retryable: true}
          )
          this.handleConnectionError(timeoutError)
        }
      }, this.connectionTimeout)

      if (this.ws) {
        this.ws.onopen = () => {
          clearTimeout(timeoutId)

          // Mark WebSocket connection complete
          markPerformance(PERFORMANCE_MARKERS.WEBSOCKET_CONNECTED)

          logger.info('WebSocket connected to Gemini Live API', {
            connectionState: this.connectionState,
            attempts: this.reconnectAttempts
          })
          this.setConnectionState(ConnectionState.CONNECTED)
          this.reconnectAttempts = 0

          // Reset setup completion flag for new connection
          this.isSetupComplete = false

          // Don't start heartbeat for Gemini Live API (it doesn't support custom ping messages)
          // this.startHeartbeat()

          // Don't process message queue until setup is complete
          // this.processMessageQueue()

          // Create or resume session
          this.handleSessionConnection()

          // Send initial setup message
          this.sendSetupMessage()

          // Notify reconnection manager of successful connection
          this.reconnectionManager.onConnectionEstablished()

          this.emit('connected')
        }

        this.ws.onmessage = event => {
          this.handleMessage(event)
        }

        this.ws.onerror = () => {
          clearTimeout(timeoutId)
          // Use generic error message to prevent log injection
          safeLogger.error('WebSocket error occurred')
          this.handleConnectionError(new Error('WebSocket connection error'))
        }

        this.ws.onclose = event => {
          clearTimeout(timeoutId)
          logger.info('WebSocket connection closed', {
            code: event.code,
            reason: sanitizeLogMessage(event.reason),
            wasClean: event.wasClean,
            intentional: this.isClosingIntentionally
          })
          this.handleConnectionClose(event)
        }
      }
    } catch (error) {
      logger.error('Failed to establish WebSocket connection', {
        error: error instanceof Error ? sanitizeLogMessage(error.message) : 'Unknown error',
        config: {
          model: this.config.model,
          reconnectAttempts: this.reconnectAttempts
        }
      })
      this.handleConnectionError(error as Error)
    }
  }

  /**
   * Build WebSocket URL for Gemini Live API with configurable version
   */
  private buildWebSocketUrl(): string {
    try {
      // Ensure API key is still valid (in case it was modified after construction)
      if (!this.config.apiKey || typeof this.config.apiKey !== 'string') {
        throw new Error('API key is required to build WebSocket URL')
      }

      // Use configured API version or default to v1beta (as per Google documentation)
      const apiVersion = this.config.apiVersion || 'v1beta'

      // Build the base URL with configurable API version
      const baseUrl =
        this.config.websocketBaseUrl ||
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent`

      // Validate the base URL format
      const urlObj = new URL(baseUrl)
      if (!urlObj.protocol.startsWith('wss')) {
        throw new Error('WebSocket URL must use secure protocol (wss://)')
      }

      // Create query parameters for authentication
      const params = new URLSearchParams({
        key: this.config.apiKey
      })

      const finalUrl = `${baseUrl}?${params.toString()}`

      logger.debug('Built WebSocket URL for Gemini Live API', {
        baseUrl: baseUrl.substring(0, 50) + '...',
        hasApiKey: !!this.config.apiKey,
        apiVersion: apiVersion
      })

      return finalUrl
    } catch (error) {
      logger.error('Failed to build WebSocket URL', {
        error: error instanceof Error ? error.message : 'Unknown error',
        hasApiKey: !!this.config.apiKey,
        apiVersion: this.config.apiVersion || 'v1beta'
      })
      throw new Error(
        `Failed to build WebSocket URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Send realtime input (audio or text) to the API with enhanced queueing and retry
   */
  async sendRealtimeInput(input: RealtimeInput, options: MessageSendOptions = {}): Promise<void> {
    // Check circuit breaker before attempting to send
    if (!this.errorHandler.canProceed()) {
      const circuitBreakerState = this.errorHandler.getCircuitBreakerStatus()
      logger.warn('Circuit breaker is open, blocking message send', {
        state: circuitBreakerState.state,
        failureCount: circuitBreakerState.failureCount
      })

      const error = this.errorHandler.handleError(
        new Error('Circuit breaker is open - too many recent failures'),
        {
          connectionState: this.connectionState,
          circuitBreakerState: circuitBreakerState.state
        },
        {
          type: ErrorType.CIRCUIT_BREAKER,
          retryable: false
        }
      )
      throw error
    }

    // If not connected, queue the message with priority
    if (this.connectionState !== ConnectionState.CONNECTED) {
      return this.queueMessage(input, options)
    }

    return this.sendMessageDirectly(input, options)
  }

  /**
   * Send client content with turn completion signal to trigger model response
   * Updated format for v1beta API compatibility
   */
  async sendTurnCompletion(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    // For v1beta API, use clientContent structure with turnComplete
    // Updated format for v1beta API compatibility
    const turnCompletionMessage = JSON.stringify({
      clientContent: {
        turnComplete: true
      }
    })

    logger.debug('Sending turn completion signal to trigger model response', {
      messageLength: turnCompletionMessage.length
    })

    this.ws.send(turnCompletionMessage)
  }

  /**
   * Queue a message with priority-based system
   */
  private queueMessage(input: RealtimeInput, options: MessageSendOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const priority = options.priority || QueuePriority.NORMAL
      const messageId = this.generateMessageId()

      const queuedMessage: QueuedMessage = {
        id: messageId,
        input,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: options.maxRetries || 3,
        priority,
        timeout: options.timeout || 30000,
        resolve: options.expectResponse ? resolve : undefined,
        reject
      }

      // Check total queue size across all priorities
      const totalQueueSize = this.getTotalQueueSize()

      logger.debug('Queueing message due to connection state', {
        connectionState: this.connectionState,
        totalQueueSize,
        priority,
        messageId
      })

      // Implement queue size limit to prevent memory issues
      if (totalQueueSize >= this.maxQueueSize) {
        logger.warn('Message queue full, dropping oldest low-priority message', {
          totalQueueSize,
          maxQueueSize: this.maxQueueSize
        })
        this.dropOldestMessage()
      }

      // Add to appropriate priority queue
      const queue = this.messageQueue.get(priority)
      if (queue) {
        queue.push(queuedMessage)

        // Store for tracking if expecting response
        if (options.expectResponse) {
          this.pendingMessages.set(messageId, queuedMessage)
        }

        this.emit('messageQueued', {
          messageId,
          priority,
          totalQueueSize: this.getTotalQueueSize(),
          inputType: input.audio ? 'audio' : 'text'
        })

        if (!options.expectResponse) {
          resolve()
        }
      } else {
        reject(new Error(`Invalid priority: ${priority}`))
      }
    })
  }

  /**
   * Send message directly over WebSocket
   */
  private async sendMessageDirectly(
    input: RealtimeInput,
    options: MessageSendOptions = {}
  ): Promise<void> {
    if (!this.ws) {
      const error = this.errorHandler.handleError(
        new Error('WebSocket not initialized'),
        {connectionState: this.connectionState},
        {type: ErrorType.WEBSOCKET, retryable: false}
      )
      throw error
    }

    // CRITICAL: Prevent audio messages from being sent before setup is complete
    if (input.audio && !this.isSetupComplete) {
      const error = this.errorHandler.handleError(
        new Error('Cannot send audio data before setup response is received from Gemini Live API'),
        {setupComplete: this.isSetupComplete, hasAudio: !!input.audio},
        {type: ErrorType.API, retryable: false}
      )
      throw error
    }

    try {
      // Build the correct Gemini Live API message format.
      // NOTE: Previous implementation used {realtimeInput:{mediaChunks:[]}} which the API
      // rejects with code 1007 (invalid argument). The v1beta BidiGenerateContent endpoint
      // expects messages shaped as {"clientContent": { parts: [{ inlineData: { mimeType, data }}] }}
      // for audio and {"clientContent": { parts: [{ text: "..." }] }} for text, and
      // {"clientContent": { turnComplete: true }} to finish the turn.
      const useSpecFormat = true // hard enable spec-compliant format
      let payload: unknown

      // Probe mode: accelerate schema discovery with minimal payloads.
      // Auto-probe can be enabled internally (heuristic) by setting global flag __GEMINI_AUTO_PROBE=1
      const autoProbe =
        (globalThis as unknown as {__GEMINI_AUTO_PROBE?: number}).__GEMINI_AUTO_PROBE === 1
      const probeMode = safeEnv('GEMINI_SCHEMA_PROBE') === '1' || autoProbe
      let probeTruncated = false
      if (probeMode && input.audio && !input.audioStreamEnd) {
        // Keep only first ~640 bytes (~20ms @16kHz PCM16) to reduce payload size drastically
        try {
          const raw = atob(input.audio.data)
          const slice = raw.slice(0, 640)
          input.audio.data = btoa(slice)
          probeTruncated = true
        } catch {
          /* ignore base64 issues */
        }
      }
      if (useSpecFormat) {
        // Adaptive variant index retained across invocations to progressively try schemas.
        // Reset to 0 after a successful transcription cycle (handled elsewhere once we get text).
        // IMPORTANT FIX: advance the variant *before* building the payload if the previous send
        // triggered a 1007 unknown field error. Previously we advanced only *after* constructing
        // (and sending) the current payload, which caused every reconnection's first audio chunk
        // to keep using the same (failing) variant 0 and never truly test higher variants.
        // Ensure variant index initialized (defensive) - Start with official v1beta format (variant 17)
        if (this._schemaVariantIndex === undefined || this._schemaVariantIndex === null)
          this._schemaVariantIndex = 17
        if (this._advanceSchemaVariant) {
          const prev = this._schemaVariantIndex
          this._schemaVariantIndex = Math.min(
            this._schemaVariantIndex + 1,
            GeminiLiveWebSocketClient.MAX_SCHEMA_VARIANT
          )
          this._advanceSchemaVariant = false
          if (this._schemaVariantIndex !== prev) {
            logger.info(
              'Advanced Gemini WS schema variant prior to building payload after prior 1007',
              {
                previousVariant: prev,
                newVariantIndex: this._schemaVariantIndex
              }
            )
            this._persistSchemaState('tried', this._schemaVariantIndex)
          }
        }

        // Optional ENV override to force a specific schema variant index for experiment.
        // Set GEMINI_SCHEMA_FORCE_INDEX=N to pin variant (bypasses auto-advance) while debugging.
        let forcedVariantIndex: number | null = null
        const forcedVariantEnv = safeEnv('GEMINI_SCHEMA_FORCE_INDEX')
        if (forcedVariantEnv && /^\d+$/.test(forcedVariantEnv)) {
          forcedVariantIndex = Math.min(
            parseInt(forcedVariantEnv, 10),
            GeminiLiveWebSocketClient.MAX_SCHEMA_VARIANT
          )
        }

        type VariantBuilder = () => unknown
        interface VariantMeta {
          label: string
          deprecated?: boolean
        }
        const variantBuilders: Array<VariantBuilder & {__meta: VariantMeta}> = [
          // 0 (deprecated): Original snake_case contents structure (always failing Unknown name "contents")
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {client_content: {turn_complete: true}}
              return {client_content: {}}
            },
            {__meta: {label: 'snake_case.contents', deprecated: true}}
          ),
          // 1: snake_case flattened inline_data
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {client_content: {turn_complete: true}}
              if (input.text) return {client_content: {text: input.text}}
              if (input.audio)
                return {
                  client_content: {
                    inline_data: {mime_type: input.audio.mimeType, data: input.audio.data}
                  }
                }
              return {client_content: {}}
            },
            {__meta: {label: 'snake_case.inline_data'}}
          ),
          // 2: snake_case input_audio simple
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {client_content: {turn_complete: true}}
              if (input.text) return {client_content: {text: input.text}}
              if (input.audio)
                return {
                  client_content: {
                    input_audio: {mime_type: input.audio.mimeType, data: input.audio.data}
                  }
                }
              return {client_content: {}}
            },
            {__meta: {label: 'snake_case.input_audio'}}
          ),
          // 3: snake_case input_audio.audio wrapper
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {client_content: {turn_complete: true}}
              if (input.text) return {client_content: {text: input.text}}
              if (input.audio)
                return {
                  client_content: {
                    input_audio: {audio: {mime_type: input.audio.mimeType, data: input.audio.data}}
                  }
                }
              return {client_content: {}}
            },
            {__meta: {label: 'snake_case.input_audio.audio'}}
          ),
          // 4: snake_case media_chunks array
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {client_content: {turn_complete: true}}
              if (input.text) return {client_content: {text: input.text}}
              if (input.audio)
                return {
                  client_content: {
                    media_chunks: [
                      {inline_data: {mime_type: input.audio.mimeType, data: input.audio.data}}
                    ]
                  }
                }
              return {client_content: {}}
            },
            {__meta: {label: 'snake_case.media_chunks[]'}}
          ),
          // 5: camelCase flattened inlineData
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text) return {clientContent: {text: input.text}}
              if (input.audio)
                return {
                  clientContent: {
                    inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}
                  }
                }
              return {clientContent: {}}
            },
            {__meta: {label: 'camelCase.inlineData'}}
          ),
          // 6: camelCase content.parts (primary hypothesis)
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text) return {clientContent: {content: {parts: [{text: input.text}]}}}
              if (input.audio)
                return {
                  clientContent: {
                    content: {
                      parts: [
                        {inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}
                      ]
                    }
                  }
                }
              return {clientContent: {}}
            },
            {__meta: {label: 'camelCase.content.parts'}}
          ),
          // 7: snake_case content.parts
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {client_content: {turn_complete: true}}
              if (input.text) return {client_content: {content: {parts: [{text: input.text}]}}}
              if (input.audio)
                return {
                  client_content: {
                    content: {
                      parts: [
                        {inline_data: {mime_type: input.audio.mimeType, data: input.audio.data}}
                      ]
                    }
                  }
                }
              return {client_content: {}}
            },
            {__meta: {label: 'snake_case.content.parts'}}
          ),
          // 8: legacy realtimeInput mediaChunks
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {realtimeInput: {audioStreamEnd: true}}
              if (input.text) return {realtimeInput: {text: input.text}}
              if (input.audio) return {realtimeInput: {mediaChunks: this.buildMediaChunks(input)}}
              return {realtimeInput: {}}
            },
            {__meta: {label: 'legacy.realtimeInput.mediaChunks'}}
          ),
          // 9: snake_case raw audio object
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {client_content: {turn_complete: true}}
              if (input.text) return {client_content: {text: input.text}}
              if (input.audio)
                return {
                  client_content: {audio: {mime_type: input.audio.mimeType, data: input.audio.data}}
                }
              return {client_content: {}}
            },
            {__meta: {label: 'snake_case.audio'}}
          ),
          // 10: NEW camelCase.parts (no content wrapper) -> { clientContent:{ parts:[ { inlineData:{...}} ] } }
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text) return {clientContent: {parts: [{text: input.text}]}}
              if (input.audio)
                return {
                  clientContent: {
                    parts: [{inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}]
                  }
                }
              return {clientContent: {}}
            },
            {__meta: {label: 'camelCase.parts.inlineData'}}
          ),
          // 11: NEW snake_case.parts (no content wrapper) -> { client_content:{ parts:[ { inline_data:{...}} ] } }
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {client_content: {turn_complete: true}}
              if (input.text) return {client_content: {parts: [{text: input.text}]}}
              if (input.audio)
                return {
                  client_content: {
                    parts: [
                      {inline_data: {mime_type: input.audio.mimeType, data: input.audio.data}}
                    ]
                  }
                }
              return {client_content: {}}
            },
            {__meta: {label: 'snake_case.parts.inline_data'}}
          ),
          // 12: camelCase.parts with role=user -> { clientContent:{ role:'user', parts:[{ inlineData:{...}}] } }
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text) return {clientContent: {role: 'user', parts: [{text: input.text}]}}
              if (input.audio)
                return {
                  clientContent: {
                    role: 'user',
                    parts: [{inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}]
                  }
                }
              return {clientContent: {role: 'user'}}
            },
            {__meta: {label: 'camelCase.parts.roleUser'}}
          ),
          // 13: camelCase clientContent as array of content objects -> { clientContent:[ { parts:[{ inlineData:{...}}] } ] }
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: [{turnComplete: true}]}
              if (input.text) return {clientContent: [{parts: [{text: input.text}]}]}
              if (input.audio)
                return {
                  clientContent: [
                    {
                      parts: [
                        {inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}
                      ]
                    }
                  ]
                }
              return {clientContent: [{}]}
            },
            {__meta: {label: 'camelCase.array.parts'}}
          ),
          // 14: camelCase clientContent array with role=user objects -> { clientContent:[ { role:'user', parts:[ ... ] } ] }
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: [{turnComplete: true}]}
              if (input.text) return {clientContent: [{role: 'user', parts: [{text: input.text}]}]}
              if (input.audio)
                return {
                  clientContent: [
                    {
                      role: 'user',
                      parts: [
                        {inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}
                      ]
                    }
                  ]
                }
              return {clientContent: [{role: 'user'}]}
            },
            {__meta: {label: 'camelCase.array.roleUser.parts'}}
          ),
          // 15: snake_case plural contents array (REST analogue) -> { client_content:{ contents:[ { role:'user', parts:[ { inline_data:{...}} ] } ] } }
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {client_content: {turn_complete: true}}
              if (input.text)
                return {client_content: {contents: [{role: 'user', parts: [{text: input.text}]}]}}
              if (input.audio)
                return {
                  client_content: {
                    contents: [
                      {
                        role: 'user',
                        parts: [
                          {inline_data: {mime_type: input.audio.mimeType, data: input.audio.data}}
                        ]
                      }
                    ]
                  }
                }
              return {client_content: {contents: []}}
            },
            {__meta: {label: 'snake_case.contents.array.roleUser'}}
          ),
          // 16: camelCase contents array role USER (uppercase) inlineData
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text)
                return {clientContent: {contents: [{role: 'USER', parts: [{text: input.text}]}]}}
              if (input.audio)
                return {
                  clientContent: {
                    contents: [
                      {
                        role: 'USER',
                        parts: [
                          {inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}
                        ]
                      }
                    ]
                  }
                }
              return {clientContent: {contents: []}}
            },
            {__meta: {label: 'camelCase.contents.array.roleUSER'}}
          ),
          // 17: OFFICIAL v1beta realtimeInput.mediaChunks (per official docs)
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {realtimeInput: {audioStreamEnd: true}}
              if (input.text)
                return {realtimeInput: {mediaChunks: [{mimeType: 'text/plain', data: input.text}]}}
              if (input.audio)
                return {
                  realtimeInput: {
                    mediaChunks: [{mimeType: input.audio.mimeType, data: input.audio.data}]
                  }
                }
              return {realtimeInput: {}}
            },
            {__meta: {label: 'official.v1beta.realtimeInput.mediaChunks'}}
          ),
          // 18: camelCase contents array role user (lowercase) inlineData
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text)
                return {clientContent: {contents: [{role: 'user', parts: [{text: input.text}]}]}}
              if (input.audio)
                return {
                  clientContent: {
                    contents: [
                      {
                        role: 'user',
                        parts: [
                          {inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}
                        ]
                      }
                    ]
                  }
                }
              return {clientContent: {contents: []}}
            },
            {__meta: {label: 'camelCase.contents.array.roleUser'}}
          ),
          // 18: camelCase contents array (no role) inlineData
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text) return {clientContent: {contents: [{parts: [{text: input.text}]}]}}
              if (input.audio)
                return {
                  clientContent: {
                    contents: [
                      {
                        parts: [
                          {inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}
                        ]
                      }
                    ]
                  }
                }
              return {clientContent: {contents: []}}
            },
            {__meta: {label: 'camelCase.contents.array.noRole'}}
          ),
          // 19: camelCase contents array with audio object instead of inlineData
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text)
                return {clientContent: {contents: [{role: 'user', parts: [{text: input.text}]}]}}
              if (input.audio)
                return {
                  clientContent: {
                    contents: [
                      {
                        role: 'user',
                        parts: [{audio: {mimeType: input.audio.mimeType, data: input.audio.data}}]
                      }
                    ]
                  }
                }
              return {clientContent: {contents: []}}
            },
            {__meta: {label: 'camelCase.contents.array.audio'}}
          ),
          // 20: camelCase contents array using audioData field hypothesis
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text)
                return {clientContent: {contents: [{role: 'user', parts: [{text: input.text}]}]}}
              if (input.audio)
                return {
                  clientContent: {
                    contents: [
                      {
                        role: 'user',
                        parts: [
                          {audioData: {mimeType: input.audio.mimeType, data: input.audio.data}}
                        ]
                      }
                    ]
                  }
                }
              return {clientContent: {contents: []}}
            },
            {__meta: {label: 'camelCase.contents.array.audioData'}}
          ),
          // 21: camelCase messages array (alternative naming) role USER inlineData
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text)
                return {clientContent: {messages: [{role: 'USER', parts: [{text: input.text}]}]}}
              if (input.audio)
                return {
                  clientContent: {
                    messages: [
                      {
                        role: 'USER',
                        parts: [
                          {inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}
                        ]
                      }
                    ]
                  }
                }
              return {clientContent: {messages: []}}
            },
            {__meta: {label: 'camelCase.messages.array.roleUSER'}}
          ),
          // 22: camelCase messages array role user inlineData
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text)
                return {clientContent: {messages: [{role: 'user', parts: [{text: input.text}]}]}}
              if (input.audio)
                return {
                  clientContent: {
                    messages: [
                      {
                        role: 'user',
                        parts: [
                          {inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}
                        ]
                      }
                    ]
                  }
                }
              return {clientContent: {messages: []}}
            },
            {__meta: {label: 'camelCase.messages.array.roleUser'}}
          ),
          // 23: TOP-LEVEL contents array (no clientContent wrapper) - REST-analogue hypothesis
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text) return {contents: [{role: 'user', parts: [{text: input.text}]}]}
              if (input.audio)
                return {
                  contents: [
                    {
                      role: 'user',
                      parts: [
                        {inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}
                      ]
                    }
                  ]
                }
              return {contents: []}
            },
            {__meta: {label: 'topLevel.contents.array.roleUser'}}
          ),
          // 24: TOP-LEVEL messages array (alternative naming) - hypothesis
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text) return {messages: [{role: 'user', parts: [{text: input.text}]}]}
              if (input.audio)
                return {
                  messages: [
                    {
                      role: 'user',
                      parts: [
                        {inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}
                      ]
                    }
                  ]
                }
              return {messages: []}
            },
            {__meta: {label: 'topLevel.messages.array.roleUser'}}
          ),
          // 25: camelCase clientContent.content (singular) with parts[] but without nested array/object wrappers beyond content
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text) return {clientContent: {content: {parts: [{text: input.text}]}}}
              if (input.audio)
                return {
                  clientContent: {
                    content: {
                      parts: [
                        {inlineData: {mimeType: input.audio.mimeType, data: input.audio.data}}
                      ]
                    }
                  }
                }
              return {clientContent: {}}
            },
            {__meta: {label: 'camelCase.content.singular.parts'}}
          ),
          // 26: camelCase clientContent.parts using audio object (explicit audio field variant without contents/messages)
          Object.assign(
            () => {
              if (input.audioStreamEnd) return {clientContent: {turnComplete: true}}
              if (input.text) return {clientContent: {parts: [{text: input.text}]}}
              if (input.audio)
                return {
                  clientContent: {
                    parts: [{audio: {mimeType: input.audio.mimeType, data: input.audio.data}}]
                  }
                }
              return {clientContent: {}}
            },
            {__meta: {label: 'camelCase.parts.audioObject'}}
          )
        ]

        // Allow skipping certain variants via env GEMINI_SCHEMA_SKIP="0,1" etc
        const skipEnv = safeEnv('GEMINI_SCHEMA_SKIP')
        const skipSet = new Set<number>()
        if (skipEnv) {
          skipEnv
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .forEach(v => {
              if (/^\d+$/.test(v)) skipSet.add(parseInt(v, 10))
            })
        }
        // Optional preference: fast prefer camelCase variants
        // Default to true unless explicitly disabled with GEMINI_SCHEMA_PREFER_CAMEL=0
        const preferCamelEnv = safeEnv('GEMINI_SCHEMA_PREFER_CAMEL')
        const preferCamel = preferCamelEnv ? preferCamelEnv === '1' : true
        if (preferCamel && forcedVariantIndex === null) {
          // Snake_case variant indices: 0,1,2,3,4,7,9
          ;[0, 1, 2, 3, 4, 7, 9].forEach(i => skipSet.add(i))
        }

        // Auto-skip deprecated variants unless explicitly forced
        variantBuilders.forEach((vb, idx) => {
          if (vb.__meta.deprecated && forcedVariantIndex === null) skipSet.add(idx)
        })

        // Choose the next non-skipped variant at or after current index
        let chosenIndex =
          forcedVariantIndex !== null ? forcedVariantIndex : this._schemaVariantIndex
        if (forcedVariantIndex === null) {
          while (
            skipSet.has(chosenIndex) &&
            chosenIndex < GeminiLiveWebSocketClient.MAX_SCHEMA_VARIANT
          ) {
            chosenIndex++
          }
          // Persist new index if we skipped forward
          if (chosenIndex !== this._schemaVariantIndex) {
            logger.info('Auto-skipped deprecated/failing schema variants', {
              from: this._schemaVariantIndex,
              to: chosenIndex,
              skipped: [...skipSet].sort()
            })
            this._schemaVariantIndex = chosenIndex
          }
        }
        const chosenBuilder = variantBuilders[chosenIndex]
        this._lastVariantLabel = chosenBuilder?.__meta?.label || null

        // Build payload via chosen builder
        payload = chosenBuilder()
        // In probe mode, auto-send a turn completion immediately after first audio chunk
        if (probeMode && input.audio && !input.audioStreamEnd) {
          // Mark that we will queue a follow-up turnComplete message
          setTimeout(() => {
            try {
              this.sendRealtimeInput({audioStreamEnd: true})
            } catch (e) {
              logger.warn('Probe mode auto turnComplete failed', {error: (e as Error)?.message})
            }
          }, 10)
        }
        // Persist that we attempted this variant (only if not forced) so future instances can resume intelligently
        if (forcedVariantIndex === null) this._persistSchemaState('tried', chosenIndex)

        // Instrument the shape being sent (only shallow to avoid large logs)
        try {
          const sample = JSON.stringify(payload)
          const topLevelKeys = Object.keys(payload as Record<string, unknown>)
          logger.debug('Prepared Gemini WS payload', {
            variantIndex: chosenIndex,
            variantLabel: chosenBuilder.__meta.label,
            deprecated: !!chosenBuilder.__meta.deprecated,
            skippedVariants: [...skipSet].sort(),
            preferCamel,
            forced: forcedVariantIndex !== null,
            length: sample.length,
            topLevelKeys,
            startsWith: sample.substring(0, 80),
            probeMode,
            probeTruncated
          })
        } catch (e) {
          logger.warn('Failed to serialize payload preview', {
            variantIndex: chosenIndex,
            error: (e as Error)?.message
          })
        }

        // (Advancement now occurs BEFORE building; block intentionally left for clarity / future hooks.)

        // NOTE: If all variants exhausted and still failing, next step will be to consult official docs or switch to REST fallback.
        // Adaptive format strategy for Gemini Live WS payloads.
        // Prior attempts:
        //  A) { clientContent: { parts:[{ inlineData:{..}}] }}  -> 1007 unknown name "parts"
        //  B) { clientContent: { inlineData:{..} }}             -> 1007 unknown name "inlineData"
        // Current hypothesis: WS schema mirrors REST-like Content container: clientContent.content.parts[]
        // So we try:
        //  Audio -> { clientContent:{ content:{ parts:[ { inlineData:{ mimeType, data } } ] } } }
        //  Text  -> { clientContent:{ content:{ parts:[ { text:"..." } ] } } }
        //  Turn  -> { clientContent:{ turnComplete:true } }
        // If this still fails with 1007 referencing "parts" or "content", next refinement will introduce
        // snake_case variants (inline_data, mime_type, client_content) or an alternative "dataChunk" schema.
        // Actual payload already built above according to chosen variant.
      } else {
        // Legacy path retained (not used) for quick rollback via flag if needed
        let message: string
        if (input.audioStreamEnd) {
          message = JSON.stringify({realtimeInput: {audioStreamEnd: true}})
        } else if (input.text) {
          message = JSON.stringify({realtimeInput: {text: input.text}})
        } else {
          message = JSON.stringify({realtimeInput: {mediaChunks: this.buildMediaChunks(input)}})
        }
        payload = JSON.parse(message)
      }

      const message = JSON.stringify(payload)

      logger.debug('Sending message to Gemini Live API', {
        messageLength: message.length,
        inputType: input.audioStreamEnd ? 'turnComplete' : input.audio ? 'audio' : 'text',
        circuitBreakerState: this.errorHandler.getCircuitBreakerStatus().state,
        specFormat: useSpecFormat
      })

      this.ws.send(message)
      this.emit('messageSent', input)

      // Record successful operation for circuit breaker
      this.errorHandler.recordSuccess()

      // Track message in session
      if (this.currentSession) {
        this.sessionManager.recordMessage('sent', this.currentSession.sessionId)
        this.sessionManager.updateActivity(this.currentSession.sessionId)
      }

      // Also queue through message handler for future integration
      this.messageHandler.queueMessage(input, MessageType.CLIENT_CONTENT, MessagePriority.HIGH)
    } catch (error) {
      // Record failure for circuit breaker
      this.errorHandler.recordFailure()

      const geminiError = this.errorHandler.handleError(
        error,
        {
          input: {
            hasAudio: !!input.audio,
            hasText: !!input.text,
            textLength: input.text?.length
          },
          connectionState: this.connectionState,
          timestamp: new Date(),
          sessionId: this.currentSession?.sessionId
        },
        {
          type: ErrorType.API,
          retryable: true
        }
      )

      logger.error('Failed to send realtime input', {
        errorId: geminiError.id,
        message: geminiError.message,
        errorType: geminiError.type,
        circuitBreakerState: this.errorHandler.getCircuitBreakerStatus().state
      })

      // Attempt automatic recovery for retryable errors
      if (geminiError.retryable && this.errorHandler.canProceed()) {
        try {
          logger.info('Attempting automatic retry for failed message send', {
            errorType: geminiError.type,
            retryAttempt: 1
          })

          // Simple retry after short delay
          await new Promise(resolve => setTimeout(resolve, 1000))
          await this.sendMessageDirectly(input, options)

          logger.info('Automatic retry successful')
          return
        } catch (retryError) {
          logger.error('Automatic retry failed', {
            originalError: geminiError.type,
            retryError: retryError instanceof Error ? retryError.message : String(retryError)
          })

          // If we have options for queued message retry, use that mechanism
          if (options.maxRetries && options.maxRetries > 1) {
            const messageId = this.generateMessageId()
            const queuedMessage: QueuedMessage = {
              id: messageId,
              input,
              timestamp: Date.now(),
              retryCount: 1, // Already attempted once
              maxRetries: options.maxRetries,
              priority: options.priority || QueuePriority.NORMAL,
              timeout: options.timeout || 30000,
              resolve: undefined,
              reject: error => {
                throw error
              }
            }

            logger.info('Initiating enhanced retry mechanism', {
              messageId,
              maxRetries: options.maxRetries,
              currentAttempt: 1
            })

            await this.retryMessage(queuedMessage)
            return
          }
        }
      }

      throw geminiError
    }
  }

  /**
   * Build media chunks from realtime input for Gemini Live API (using snake_case field names)
   */
  private buildMediaChunks(input: RealtimeInput): Array<Record<string, unknown>> {
    const chunks: Array<Record<string, unknown>> = []

    if (input.text) {
      chunks.push({
        data: input.text,
        mimeType: 'text/plain' // Use camelCase for v1beta API
      })
    }

    if (input.audio) {
      chunks.push({
        data: input.audio.data,
        mimeType: input.audio.mimeType // Use camelCase for v1beta API
      })
    }

    return chunks
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      // Record successful message receipt for circuit breaker
      this.errorHandler.recordSuccess()

      // Handle both string and binary data
      if (typeof event.data === 'string') {
        this.processMessageData(event.data)
      } else if (event.data instanceof ArrayBuffer) {
        // Convert ArrayBuffer to string
        const messageData = new TextDecoder().decode(event.data)
        this.processMessageData(messageData)
      } else if (event.data instanceof Blob) {
        // For Blob data, convert to text asynchronously
        event.data
          .text()
          .then(text => {
            this.processMessageData(text)
          })
          .catch(error => {
            logger.error('Failed to convert Blob message to text', {
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          })
        return
      } else {
        logger.error('Received unsupported message data type', {
          dataType: typeof event.data,
          constructor: event.data.constructor.name
        })
        throw new Error(`Unsupported message data type: ${typeof event.data}`)
      }
    } catch (error) {
      const parseError = this.errorHandler.handleError(
        error instanceof Error ? error : new Error('Unknown message parsing error'),
        {error: error instanceof Error ? error.message : 'Unknown error'},
        {type: ErrorType.PARSE_ERROR, retryable: false}
      )

      logger.error('Failed to handle WebSocket message', {
        errorId: parseError.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Consolidated message processing logic
   */
  private processMessageData(messageData: string): void {
    try {
      // Parse the raw message first with additional safety
      const rawMessage = JSON.parse(messageData)

      // DEBUG: Log all raw messages to diagnose transcription response issues
      logger.debug('Raw WebSocket message received', {
        messageData: messageData.substring(0, 500), // Truncate for logging
        hasSetupComplete: !!rawMessage.setupComplete,
        hasServerContent: !!rawMessage.serverContent,
        hasModelTurn: !!rawMessage.serverContent?.modelTurn,
        hasTurnComplete: !!(rawMessage.serverContent?.turnComplete || rawMessage.turnComplete),
        messageKeys: Object.keys(rawMessage || {}),
        currentSetupState: this.isSetupComplete
      })

      // ENHANCED DEBUG: Log raw message content for no-transcription debugging
      console.log('🔍 WEBSOCKET MESSAGE DEBUG:', {
        fullMessage: rawMessage,
        messageType: typeof rawMessage,
        hasContent: !!rawMessage.serverContent,
        contentKeys: rawMessage.serverContent ? Object.keys(rawMessage.serverContent) : [],
        modelTurnPresent: !!rawMessage.serverContent?.modelTurn,
        modelTurnContent: rawMessage.serverContent?.modelTurn,
        setupComplete: rawMessage.setupComplete
      })

      // Check if heartbeat monitor can handle this message
      if (this.heartbeatMonitor.handleMessage(rawMessage)) {
        // Message was handled by heartbeat monitor (pong response)
        logger.debug('Message handled by heartbeat monitor')
        return
      }

      // Use enhanced message parser for gemini-live-2.5-flash-preview
      const geminiResponse = Gemini2FlashMessageParser.parseResponse(rawMessage)
      const validation = Gemini2FlashMessageParser.validateResponse(geminiResponse)

      logger.debug('Received and parsed WebSocket message', {
        messageType: geminiResponse.type,
        isValid: validation.isValid,
        messageId: geminiResponse.metadata.messageId,
        errors: validation.errors,
        isPartial: geminiResponse.metadata.isPartial,
        modelTurn: geminiResponse.metadata.modelTurn,
        circuitBreakerState: this.errorHandler.getCircuitBreakerStatus().state
      })

      // Handle validation errors
      if (!validation.isValid) {
        const parseError = this.errorHandler.handleError(
          new Error(`Message validation failed: ${validation.errors.join(', ')}`),
          {
            messageType: geminiResponse.type,
            validationErrors: validation.errors,
            rawMessage: JSON.stringify(rawMessage).substring(0, 500) // Truncate for logging
          },
          {
            type: ErrorType.PARSE_ERROR,
            retryable: false
          }
        )

        logger.warn('Invalid message received from Gemini Live API', {
          errorId: parseError.id,
          errors: validation.errors,
          messageType: geminiResponse.type
        })

        return
      }

      // Process the valid response
      this.handleValidResponse(geminiResponse)
    } catch (error) {
      const parseError = this.errorHandler.handleError(
        error instanceof Error ? error : new Error('Unknown message processing error'),
        {error: error instanceof Error ? error.message : 'Unknown error'},
        {type: ErrorType.PARSE_ERROR, retryable: false}
      )

      logger.error('Failed to process message data', {
        errorId: parseError.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Handle valid parsed response
   */
  private handleValidResponse(geminiResponse: ParsedGeminiResponse): void {
    // Check for server-side errors in the message
    if (geminiResponse.type === 'error' && geminiResponse.error) {
      const serverError = this.errorHandler.handleError(
        new Error(`Server error: ${geminiResponse.error.message || 'Unknown server error'}`),
        {
          serverErrorCode: geminiResponse.error.code,
          serverErrorDetails: geminiResponse.error.details,
          sessionId: this.currentSession?.sessionId
        },
        {
          type: this.classifyServerError(geminiResponse.error),
          retryable: this.isServerErrorRetryable(geminiResponse.error)
        }
      )

      logger.error('Received server error from Gemini Live API', {
        errorId: serverError.id,
        serverError: geminiResponse.error,
        sessionId: this.currentSession?.sessionId
      })

      this.emit('geminiError', {
        ...geminiResponse.error,
        handledError: serverError
      })

      if (this.shouldReconnectOnServerError(geminiResponse.error)) {
        this.handleServerErrorRecovery(serverError)
      }
      return
    }

    // Process the message with the original handler for backwards compatibility
    const messageText = JSON.stringify(geminiResponse)
    const processed = this.messageHandler.processIncomingMessage(messageText)

    // Emit both formats for different consumers
    this.emit('message', processed)
    this.emit('geminiResponse', geminiResponse)

    // Track message received in session
    if (this.currentSession) {
      this.sessionManager.recordMessage('received', this.currentSession.sessionId)
      this.sessionManager.updateActivity(this.currentSession.sessionId)

      if (geminiResponse.type === 'turn_complete') {
        this.sessionManager.recordTurn(this.currentSession.sessionId)
      }
    }

    // Emit specific events based on enhanced message type
    switch (geminiResponse.type) {
      case 'text':
        // ENHANCED DEBUG: Log text processing details
        console.log('📝 TEXT RESPONSE DEBUG:', {
          content: geminiResponse.content,
          contentType: typeof geminiResponse.content,
          contentLength:
            typeof geminiResponse.content === 'string' ? geminiResponse.content.length : 0,
          isEmpty: geminiResponse.content === '' || geminiResponse.content === null,
          hasModelTurn: !!geminiResponse.metadata.modelTurn,
          isPartial: !!geminiResponse.metadata.isPartial,
          willSkip:
            (geminiResponse.content === '' || geminiResponse.content === null) &&
            !geminiResponse.metadata.modelTurn
        })

        // --- Validation instrumentation (Task 31.1) ---
        if (this.validationMode) {
          const isPartial = !!geminiResponse.metadata.isPartial
          if (!this.validationMetrics.sessionStart) {
            this.validationMetrics.sessionStart = Date.now()
            this.validationMetrics.currentTurnId = geminiResponse.metadata.turnId
          }
          if (isPartial) {
            this.validationMetrics.partialCount += 1
            if (!this.validationMetrics.firstPartialTs)
              this.validationMetrics.firstPartialTs = Date.now()
            this.logValidation('text-partial', {
              partialCount: this.validationMetrics.partialCount,
              len: typeof geminiResponse.content === 'string' ? geminiResponse.content.length : 0,
              modelTurn: !!geminiResponse.metadata.modelTurn,
              inputTranscription: !!geminiResponse.metadata.inputTranscription
            })
          } else {
            if (!this.validationMetrics.finalTs) {
              this.validationMetrics.finalTs = Date.now()
              this.validationMetrics.finalChars =
                typeof geminiResponse.content === 'string' ? geminiResponse.content.length : 0
            }
            this.logValidation('text-final', {
              totalPartials: this.validationMetrics.partialCount,
              finalChars: this.validationMetrics.finalChars,
              modelTurn: !!geminiResponse.metadata.modelTurn,
              inputTranscription: !!geminiResponse.metadata.inputTranscription,
              latency_first_partial_ms: this.validationMetrics.firstPartialTs
                ? this.validationMetrics.firstPartialTs - this.validationMetrics.sessionStart
                : undefined,
              latency_final_ms: this.validationMetrics.finalTs
                ? this.validationMetrics.finalTs - this.validationMetrics.sessionStart
                : undefined
            })
          }
        }
        // Guard: skip emitting transcript updates for empty content that would previously produce a spurious final event
        if (
          (geminiResponse.content === '' || geminiResponse.content === null) &&
          !geminiResponse.metadata.modelTurn
        ) {
          logger.debug('Skipping empty Gemini text message with no modelTurn parts')
          return
        }
        // Update aggregation state with latest non-empty content
        if (
          typeof geminiResponse.content === 'string' &&
          geminiResponse.content.trim().length > 0
        ) {
          // Accumulate text chunks for the current turn instead of replacing
          this._currentTurnText += geminiResponse.content
          this._finalEmittedForTurn = !geminiResponse.metadata.isPartial

          // FSM integration: Create utterance if needed and apply partial
          if (!this._currentUtteranceId) {
            this._currentUtteranceId = TranscriptFSM.createUtterance({
              sessionId: this._sessionId,
              firstPartial: {
                text: geminiResponse.content,
                confidence: geminiResponse.metadata.confidence,
                timestamp: Date.now()
              }
            })
          } else {
            // Apply partial to existing utterance
            TranscriptFSM.applyPartial(
              this._currentUtteranceId,
              this._currentTurnText, // Use accumulated text
              geminiResponse.metadata.confidence
            )
          }
        }
        this.emit('textResponse', {
          content: geminiResponse.content,
          metadata: geminiResponse.metadata,
          isPartial: geminiResponse.metadata.isPartial
        })

        // Mark schema success the first time we receive any non-empty text (partial or final)
        if (!this._recordedSuccessForSession) {
          const hasContent =
            typeof geminiResponse.content === 'string' && geminiResponse.content.trim().length > 0
          if (hasContent) {
            this._persistSchemaState('success', this._schemaVariantIndex)
            this._recordedSuccessForSession = true
            logger.info('Recorded successful Gemini WS schema variant', {
              variantIndex: this._schemaVariantIndex
            })
          }
        }

        // Route messages based on type:
        // - inputTranscription: true → transcriptionUpdate (for Transcripts tab)
        // - modelTurn: true → chatResponse (for Chat tab)

        // DEBUG: Enhanced logging to understand message routing
        console.log('🔍 WebSocket routing decision:', {
          inputTranscription: geminiResponse.metadata.inputTranscription,
          modelTurn: geminiResponse.metadata.modelTurn,
          content: geminiResponse.content?.slice(0, 200) + '...',
          contentLength:
            typeof geminiResponse.content === 'string' ? geminiResponse.content.length : 0,
          isPartial: geminiResponse.metadata.isPartial,
          turnId: geminiResponse.metadata.turnId,
          messageType: geminiResponse.type
        })

        // CRITICAL FIX: Proper message type separation
        console.group('🚦 MESSAGE ROUTING DECISION')
        console.log('📊 Message metadata:', geminiResponse.metadata)
        console.log(
          '📝 Content preview:',
          typeof geminiResponse.content === 'string'
            ? geminiResponse.content.substring(0, 100) + '...'
            : '[Non-string content]'
        )

        if (geminiResponse.metadata.inputTranscription === true) {
          // This is ALWAYS user speech transcription → Transcripts tab
          console.log('✅ ROUTING DECISION: User transcription → Transcripts tab')
          console.log('🎯 Emitting: transcriptionUpdate event')
          console.groupEnd()

          this.emit('transcriptionUpdate', {
            text: geminiResponse.content,
            confidence: geminiResponse.metadata.confidence,
            isFinal: !geminiResponse.metadata.isPartial
          })

          // FSM integration: Handle final text if this is a final response
          if (!geminiResponse.metadata.isPartial && this._currentUtteranceId) {
            TranscriptFSM.applyFinal(
              this._currentUtteranceId,
              this._currentTurnText,
              geminiResponse.metadata.confidence
            )
            // Reset for next utterance
            this._currentUtteranceId = null
          }

          logger.debug('Emitted transcription events', {
            textLength:
              typeof geminiResponse.content === 'string' ? geminiResponse.content.length : 0,
            isPartial: geminiResponse.metadata.isPartial,
            confidence: geminiResponse.metadata.confidence,
            isFinal: !geminiResponse.metadata.isPartial
          })
        } else if (geminiResponse.metadata.modelTurn === true) {
          // This is ALWAYS Gemini model response (including Google Search results) → Chat tab
          console.log('✅ ROUTING DECISION: AI model response (including search) → Chat tab')
          console.log('🎯 Emitting: chatResponse event')
          console.log(
            '🔍 Content is search result:',
            typeof geminiResponse.content === 'string' &&
              geminiResponse.content.toLowerCase().includes('news')
          )
          console.groupEnd()

          this.emit('chatResponse', {
            text: geminiResponse.content,
            metadata: geminiResponse.metadata,
            isFinal: !geminiResponse.metadata.isPartial
          })

          logger.debug('Emitted chat response events', {
            textLength:
              typeof geminiResponse.content === 'string' ? geminiResponse.content.length : 0,
            isPartial: geminiResponse.metadata.isPartial,
            isFinal: !geminiResponse.metadata.isPartial,
            turnId: geminiResponse.metadata.turnId
          })
        } else {
          // Safety net: Log unhandled message types
          console.warn('⚠️ ROUTING: Unhandled message type', {
            inputTranscription: geminiResponse.metadata.inputTranscription,
            modelTurn: geminiResponse.metadata.modelTurn,
            content: geminiResponse.content?.slice(0, 100),
            metadata: geminiResponse.metadata
          })
        }
        break
      case 'audio':
        this.emit('audioResponse', {
          content: geminiResponse.content,
          metadata: geminiResponse.metadata
        })
        break
      case 'tool_call':
        this.emit('toolCall', geminiResponse.toolCall)
        break
      case 'turn_complete':
        if (this.validationMode) {
          this.logValidation('turn-complete', {
            turnId: geminiResponse.metadata.turnId,
            totalPartials: this.validationMetrics.partialCount,
            finalChars: this.validationMetrics.finalChars,
            latency_final_ms: this.validationMetrics.finalTs
              ? this.validationMetrics.finalTs - this.validationMetrics.sessionStart
              : undefined
          })
        }
        this.emit('turnComplete', {
          turnId: geminiResponse.metadata.turnId,
          metadata: geminiResponse.metadata
        })
        // If we received a turn_complete without an explicit final text event, synthesize one from last partial.
        if (this._currentTurnText && !this._finalEmittedForTurn) {
          // FSM integration: Apply final text to utterance
          if (this._currentUtteranceId) {
            TranscriptFSM.applyFinal(
              this._currentUtteranceId,
              this._currentTurnText,
              geminiResponse.metadata.confidence
            )
          }

          // In validation mode, record a synthetic final so the metrics parser can count it
          if (this.validationMode) {
            // Initialize sessionStart if not set (in case no partials arrived)
            if (!this.validationMetrics.sessionStart) {
              this.validationMetrics.sessionStart = Date.now()
            }
            if (!this.validationMetrics.finalTs) {
              this.validationMetrics.finalTs = Date.now()
            }
            this.validationMetrics.finalChars = this._currentTurnText.length
            this.logValidation('text-final', {
              totalPartials: this.validationMetrics.partialCount,
              finalChars: this.validationMetrics.finalChars,
              modelTurn: false,
              inputTranscription: true,
              latency_first_partial_ms: this.validationMetrics.firstPartialTs
                ? this.validationMetrics.firstPartialTs - this.validationMetrics.sessionStart
                : undefined,
              latency_final_ms: this.validationMetrics.finalTs
                ? this.validationMetrics.finalTs - this.validationMetrics.sessionStart
                : undefined
            })
          }
          this.emit('transcriptionUpdate', {
            text: this._currentTurnText,
            confidence: geminiResponse.metadata.confidence,
            isFinal: true
          })
          logger.debug('Emitted synthesized final transcription on turn_complete', {
            textLength: this._currentTurnText.length
          })
          this._finalEmittedForTurn = true
          this._currentTurnText = ''
          // Reset utterance for next turn
          this._currentUtteranceId = null
        }
        // Now that we've logged any synthetic final, reset validation metrics for the next turn
        if (this.validationMode) {
          this.validationMetrics = {
            currentTurnId: '',
            sessionStart: 0,
            firstPartialTs: 0,
            finalTs: 0,
            partialCount: 0,
            finalChars: 0
          }
        }
        break
      case 'setup_complete':
        if (this.validationMode) this.logValidation('setup-complete')
        // CRITICAL: Set setup complete flag immediately upon receiving the message
        this.isSetupComplete = true
        // Reset turn text accumulation for new session
        this._currentTurnText = ''
        this._finalEmittedForTurn = false
        // FSM integration: Reset session state
        this._currentUtteranceId = null
        this._sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        logger.info('Setup complete message received - marking as complete')

        this.emit('setupComplete', {
          metadata: geminiResponse.metadata
        })
        break
      case 'tool_call_cancellation':
        this.emit('toolCallCancellation', {
          ids: geminiResponse.toolCallCancellation?.ids || [],
          metadata: geminiResponse.metadata
        })
        break
      case 'go_away':
        this.emit('goAway', {
          timeLeft: geminiResponse.goAway?.timeLeft,
          metadata: geminiResponse.metadata
        })
        // Handle graceful disconnect when server requests go away
        this.handleGoAwayMessage(geminiResponse.goAway?.timeLeft)
        break
      case 'session_resumption_update':
        this.emit('sessionResumptionUpdate', {
          newHandle: geminiResponse.sessionResumptionUpdate?.newHandle || '',
          resumable: geminiResponse.sessionResumptionUpdate?.resumable || false,
          metadata: geminiResponse.metadata
        })
        // Update session manager with new resumption data
        this.handleSessionResumptionUpdate(geminiResponse.sessionResumptionUpdate)
        break
      default:
        logger.debug('Unhandled enhanced message type', {
          type: geminiResponse.type,
          messageId: geminiResponse.metadata.messageId
        })
    }
  }

  // Helper methods for enhanced message queue management
  private generateMessageId(): string {
    return `msg_${++this.messageIdCounter}_${Date.now()}`
  }

  private getTotalQueueSize(): number {
    let total = 0
    for (const queue of this.messageQueue.values()) {
      total += queue.length
    }
    return total
  }

  private dropOldestMessage(): void {
    // Find the oldest message across all priority queues
    let oldestMessage: QueuedMessage | null = null
    let oldestPriority: QueuePriority = QueuePriority.LOW
    let oldestIndex = -1

    for (const [priority, queue] of this.messageQueue.entries()) {
      if (queue.length > 0) {
        const message = queue[0]
        if (!oldestMessage || message.timestamp < oldestMessage.timestamp) {
          oldestMessage = message
          oldestPriority = priority
          oldestIndex = 0
        }
      }
    }

    if (oldestMessage) {
      const queue = this.messageQueue.get(oldestPriority)
      if (queue) {
        queue.splice(oldestIndex, 1)
        logger.debug('Dropped oldest message from queue', {
          messageId: oldestMessage.id,
          priority: oldestPriority,
          messageAge: Date.now() - oldestMessage.timestamp
        })
      }
    }
  }

  /**
   * Retry failed message with exponential backoff
   */
  private async retryMessage(queuedMessage: QueuedMessage): Promise<void> {
    if (queuedMessage.retryCount >= queuedMessage.maxRetries) {
      logger.warn('Message retry limit exceeded', {
        messageId: queuedMessage.id,
        retryCount: queuedMessage.retryCount,
        maxRetries: queuedMessage.maxRetries
      })

      if (queuedMessage.reject) {
        queuedMessage.reject(
          new Error(`Message retry limit exceeded after ${queuedMessage.retryCount} attempts`)
        )
      }
      return
    }

    queuedMessage.retryCount++

    // Exponential backoff: 1s, 2s, 4s, 8s, etc.
    const delay = Math.min(1000 * Math.pow(2, queuedMessage.retryCount - 1), 30000) // Max 30s

    logger.debug('Scheduling message retry', {
      messageId: queuedMessage.id,
      retryCount: queuedMessage.retryCount,
      delayMs: delay
    })

    const retryTimer = setTimeout(async () => {
      // Safely convert and validate the message ID before using it as a Map key
      const safeMessageId = this.sanitizeMapKey(queuedMessage.id)
      this.retryTimers.delete(safeMessageId)

      try {
        await this.sendMessageDirectly(queuedMessage.input, {
          priority: queuedMessage.priority,
          maxRetries: queuedMessage.maxRetries,
          timeout: queuedMessage.timeout,
          expectResponse: !!queuedMessage.resolve
        })

        // Success - resolve original promise
        if (queuedMessage.resolve) {
          queuedMessage.resolve()
        }

        // Remove from pending messages with safe key
        this.pendingMessages.delete(safeMessageId)

        logger.debug('Message retry successful', {
          messageId: queuedMessage.id,
          retryCount: queuedMessage.retryCount
        })
      } catch (error) {
        logger.warn('Message retry failed', {
          messageId: queuedMessage.id,
          retryCount: queuedMessage.retryCount,
          error: error instanceof Error ? error.message : String(error)
        })

        // Try again if we haven't hit the limit
        await this.retryMessage(queuedMessage)
      }
    }, delay)

    // Use safe key for storing the timer
    const safeTimerKey = this.sanitizeMapKey(queuedMessage.id)
    this.retryTimers.set(safeTimerKey, retryTimer)
  }

  /**
   * Enhanced WebSocket lifecycle event handling
   */
  private setupEnhancedEventHandling(): void {
    // Connection opened event
    this.on('connected', () => {
      logger.info(
        'WebSocket connection established, waiting for setup before processing queued messages',
        {
          totalQueueSize: this.getTotalQueueSize(),
          circuitBreakerState: this.errorHandler.getCircuitBreakerStatus().state
        }
      )

      // Don't process messages here - wait for setup complete
      // this.processMessageQueue()

      // Reset circuit breaker on successful connection
      this.errorHandler.recordSuccess()
    })

    // Connection closed event
    this.on('disconnected', (reason: string) => {
      logger.warn('WebSocket connection closed', {
        reason,
        totalQueueSize: this.getTotalQueueSize(),
        pendingMessages: this.pendingMessages.size
      })

      // Cancel all pending retry timers
      for (const [messageId, timer] of this.retryTimers.entries()) {
        clearTimeout(timer)
        logger.debug('Cancelled retry timer for message', {messageId})
      }
      this.retryTimers.clear()
    })

    // Error event
    this.on('error', (error: GeminiError) => {
      logger.error('WebSocket error occurred', {
        errorId: error.id,
        type: error.type,
        message: error.message,
        retryable: error.retryable
      })
    })

    // Message sent event
    this.on('messageSent', (input: RealtimeInput) => {
      this.emit('queueUpdate', {
        action: 'sent',
        totalQueueSize: this.getTotalQueueSize(),
        pendingMessages: this.pendingMessages.size,
        inputType: input.audio ? 'audio' : 'text'
      })
    })

    // Message queued event
    this.on(
      'messageQueued',
      (data: {
        messageId: string
        priority: QueuePriority
        totalQueueSize: number
        inputType: string
      }) => {
        this.emit('queueUpdate', {
          action: 'queued',
          ...data
        })
      }
    )

    // Circuit breaker state change event
    this.errorHandler.on('circuitBreakerStateChange', (state: string) => {
      logger.info('Circuit breaker state changed', {
        newState: state,
        statistics: this.errorHandler.getStatistics()
      })

      this.emit('circuitBreakerStateChange', state)
    })
  }

  /**
   * Process queued messages when connection is established with priority-based handling
   */
  private processMessageQueue(): void {
    const priorities = [
      QueuePriority.CRITICAL,
      QueuePriority.HIGH,
      QueuePriority.NORMAL,
      QueuePriority.LOW
    ]

    for (const priority of priorities) {
      const queue = this.messageQueue.get(priority)
      if (!queue) continue

      while (queue.length > 0) {
        const queuedMessage = queue.shift()
        if (queuedMessage) {
          logger.debug('Processing queued message', {
            messageId: queuedMessage.id,
            priority,
            retryCount: queuedMessage.retryCount,
            queueAge: Date.now() - queuedMessage.timestamp
          })

          // Send the message directly, bypassing queue logic since we're already processing
          this.sendMessageDirectly(queuedMessage.input, {
            priority: queuedMessage.priority,
            maxRetries: queuedMessage.maxRetries,
            timeout: queuedMessage.timeout,
            expectResponse: !!queuedMessage.resolve
          })
            .then(() => {
              // Resolve the original promise if it was expecting a response
              if (queuedMessage.resolve) {
                queuedMessage.resolve(undefined)
              }
            })
            .catch(error => {
              // Reject the original promise
              if (queuedMessage.reject) {
                queuedMessage.reject(error)
              }
            })
        }
      }
    }
  }

  /**
   * Set up heartbeat monitor event listeners
   */
  private setupHeartbeatMonitorEvents(): void {
    this.heartbeatMonitor.on('unhealthy', event => {
      logger.warn('Heartbeat monitor detected unhealthy connection', {
        consecutiveMissed: event.consecutiveMissed,
        reason: event.reason
      })

      // Trigger reconnection through reconnection manager
      const error = this.errorHandler.handleError(
        new Error('Heartbeat monitoring detected unhealthy connection'),
        {consecutiveMissed: event.consecutiveMissed},
        {type: ErrorType.NETWORK, retryable: true}
      )
      this.handleConnectionError(error)
    })

    this.heartbeatMonitor.on('failed', event => {
      logger.error('Heartbeat monitor failed', {
        reason: event.reason,
        error: event.error
      })

      // Treat as connection failure
      const error = this.errorHandler.handleError(
        new Error(`Heartbeat monitor failed: ${event.reason}`),
        {originalError: event.error},
        {type: ErrorType.NETWORK, retryable: true}
      )
      this.handleConnectionError(error)
    })

    this.heartbeatMonitor.on('health_changed', event => {
      logger.debug('Connection health changed', {
        healthScore: event.healthScore,
        consecutiveMissed: event.consecutiveMissed
      })

      // Emit health status for UI updates
      this.emit('health_changed', {
        healthScore: event.healthScore,
        isHealthy: this.heartbeatMonitor.isHealthy(),
        metrics: this.heartbeatMonitor.getMetrics()
      })
    })

    this.heartbeatMonitor.on('pong_received', () => {
      // Update reconnection manager - heartbeat successful indicates healthy connection
      // (ReconnectionManager doesn't have onConnectionHealthy, so we just log)
      logger.debug('Heartbeat pong received - connection healthy')
    })
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    if (this.ws) {
      this.heartbeatMonitor.start(this.ws)
      logger.debug('Heartbeat monitoring started')
    }
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    this.heartbeatMonitor.stop()
    logger.debug('Heartbeat monitoring stopped')
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: Error | GeminiError): void {
    let geminiError: GeminiError

    if ('id' in error && 'type' in error) {
      // Already a GeminiError
      geminiError = error as GeminiError
    } else {
      // Convert Error to GeminiError with enhanced classification
      geminiError = this.errorHandler.handleError(
        error,
        {
          connectionState: this.connectionState,
          reconnectAttempts: this.reconnectAttempts,
          timestamp: new Date(),
          sessionId: this.currentSession?.sessionId
        },
        {
          type: ErrorType.NETWORK,
          retryable: true
        }
      )
    }

    logger.error('Connection error occurred', {
      errorId: geminiError.id,
      type: geminiError.type,
      message: geminiError.message,
      retryable: geminiError.retryable,
      connectionState: this.connectionState,
      circuitBreakerState: this.errorHandler.getCircuitBreakerStatus().state,
      canProceed: this.errorHandler.canProceed()
    })

    // Track error in session if we have one
    if (this.currentSession) {
      this.sessionManager.markSessionError(
        `${geminiError.type}: ${geminiError.message}`,
        this.currentSession.sessionId
      )
    }

    this.setConnectionState(ConnectionState.ERROR)
    this.stopHeartbeat()
    this.emit('error', geminiError)

    // Check circuit breaker before attempting recovery
    if (!this.isClosingIntentionally && this.errorHandler.canProceed()) {
      this.handleErrorRecovery(geminiError)
    } else if (!this.errorHandler.canProceed()) {
      logger.warn('Circuit breaker is open, blocking recovery attempts', {
        circuitBreakerState: this.errorHandler.getCircuitBreakerStatus().state,
        errorType: geminiError.type
      })
      this.emit('circuitBreakerOpen', {
        state: this.errorHandler.getCircuitBreakerStatus().state,
        lastError: geminiError
      })
    }
  }

  /**
   * Handle error recovery with enhanced strategies
   */
  private async handleErrorRecovery(error: GeminiError): Promise<void> {
    try {
      // Record the failure in circuit breaker
      this.errorHandler.recordFailure()

      // Attempt recovery based on error type and configured strategy
      if (error.retryable) {
        const recoveryResult = await this.errorHandler.handleErrorWithRecovery(
          error,
          {
            connectionState: this.connectionState,
            reconnectAttempts: this.reconnectAttempts,
            timestamp: new Date(),
            sessionId: this.currentSession?.sessionId
          },
          {
            type: error.type,
            retryable: true,
            attemptRecovery: true,
            maxRetries: 3
          }
        )

        if (recoveryResult.recovered) {
          logger.info('Error recovery successful', {
            errorType: error.type,
            recoveryStats: this.errorHandler.getStatistics()
          })
          this.errorHandler.recordSuccess()

          // Attempt to reconnect after successful recovery
          try {
            await this.connect()
            logger.info('Reconnection successful after recovery')
          } catch (connectError) {
            logger.error('Reconnection failed after recovery', {
              error: connectError instanceof Error ? connectError.message : String(connectError)
            })
            throw connectError
          }
        } else {
          // Recovery failed, let reconnection manager handle it
          const shouldReconnect = this.reconnectionManager.onConnectionLost(
            `Error: ${error.message}`
          )

          if (shouldReconnect) {
            this.setConnectionState(ConnectionState.RECONNECTING)
            this.reconnectionManager.startReconnection(() => this.connect())
          }
        }
      } else {
        logger.error('Error is not retryable, no recovery attempted', {
          errorType: error.type,
          message: error.message
        })
      }
    } catch (recoveryError) {
      logger.error('Error during recovery process', {
        originalError: error.type,
        recoveryError:
          recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
      })

      // Fall back to basic reconnection logic
      const shouldReconnect = this.reconnectionManager.onConnectionLost(
        `Recovery failed: ${error.message}`
      )

      if (shouldReconnect) {
        this.setConnectionState(ConnectionState.RECONNECTING)
        this.reconnectionManager.startReconnection(() => this.connect())
      }
    }
  }

  /**
   * Handle session connection - create new session or resume existing one
   */
  private handleSessionConnection(): void {
    try {
      // Try to resume most recent session first if this is a reconnection
      const resumableSessions = this.sessionManager.getResumableSessions()

      if (resumableSessions.length > 0 && this.reconnectAttempts > 0) {
        // This is a reconnection, try to resume the most recent session
        const latestSession = resumableSessions[0]

        // Validate session before resumption
        if (this.validateSessionForResumption(latestSession)) {
          const resumedSession = this.sessionManager.resumeSession(latestSession.sessionId)

          if (resumedSession) {
            this.currentSession = resumedSession
            this.sessionManager.recordConnectionEvent('resumed', 'websocket_reconnected')

            logger.info('Resumed previous session successfully', {
              sessionId: resumedSession.sessionId,
              messageCount: resumedSession.messageCount,
              turnCount: resumedSession.turnCount,
              lastActivity: resumedSession.lastActivity,
              connectionAttempt: this.reconnectAttempts
            })

            // Emit session resumed event
            this.emit('sessionResumed', resumedSession)
            return
          }
        } else {
          logger.warn('Latest session failed validation for resumption', {
            sessionId: latestSession.sessionId,
            status: latestSession.status,
            lastActivity: latestSession.lastActivity
          })
        }
      }

      // Create new session if no resumable session or resumption failed
      const sessionConfig = {
        model: this.config.model || GEMINI_LIVE_MODEL,
        responseModalities: this.config.responseModalities || [ResponseModality.TEXT],
        systemInstruction: this.config.systemInstruction
      }

      this.currentSession = this.sessionManager.createSession(
        this.config.model || GEMINI_LIVE_MODEL,
        sessionConfig
      )

      logger.info('Created new session', {
        sessionId: this.currentSession.sessionId,
        modelId: this.currentSession.modelId
      })
    } catch (error) {
      logger.error('Failed to handle session connection', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      // Continue without session management - don't fail the connection
    }
  }

  /**
   * Validate session for resumption
   */
  private validateSessionForResumption(session: SessionData): boolean {
    try {
      // Check if session is in a resumable state
      if (session.status !== 'suspended') {
        logger.debug('Session not in suspended state', {
          sessionId: session.sessionId,
          status: session.status
        })
        return false
      }

      // Check if session model matches current config
      if (session.modelId !== this.config.model) {
        logger.debug('Session model mismatch', {
          sessionId: session.sessionId,
          sessionModel: session.modelId,
          currentModel: this.config.model
        })
        return false
      }

      // Check if session is not too old (within last 24 hours)
      const now = Date.now()
      const sessionAge = now - session.createdAt.getTime()
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours

      if (sessionAge > maxAge) {
        logger.debug('Session too old for resumption', {
          sessionId: session.sessionId,
          sessionAge: sessionAge,
          maxAge: maxAge
        })
        return false
      }

      // Check if session was not inactive for too long (within last 30 minutes)
      const inactivityTime = now - session.lastActivity.getTime()
      const maxInactivity = 30 * 60 * 1000 // 30 minutes

      if (inactivityTime > maxInactivity) {
        logger.debug('Session inactive too long for resumption', {
          sessionId: session.sessionId,
          inactivityTime: inactivityTime,
          maxInactivity: maxInactivity
        })
        return false
      }

      logger.debug('Session validation passed for resumption', {
        sessionId: session.sessionId,
        sessionAge: sessionAge,
        inactivityTime: inactivityTime
      })

      return true
    } catch (error) {
      logger.error('Error validating session for resumption', {
        sessionId: session.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  /**
   * Handle session disconnection - suspend current session
   */
  private handleSessionDisconnection(reason: string): void {
    if (this.currentSession) {
      try {
        this.sessionManager.suspendSession(reason, this.currentSession.sessionId)
        this.sessionManager.recordConnectionEvent('disconnected', reason)

        logger.info('Session suspended due to disconnection', {
          sessionId: this.currentSession.sessionId,
          reason
        })
      } catch (error) {
        logger.error('Failed to handle session disconnection', {
          error: error instanceof Error ? error.message : 'Unknown error',
          sessionId: this.currentSession?.sessionId
        })
      }
    }
  }

  /**
   * Handle connection close events
   */
  private handleConnectionClose(event: CloseEvent): void {
    this.setConnectionState(ConnectionState.DISCONNECTED)
    this.stopHeartbeat()

    // Handle session disconnection
    const reason = `WebSocket closed: ${event.code} - ${event.reason}`
    this.handleSessionDisconnection(reason)

    // Adaptive schema negotiation trigger: broadened - any 1007 now advances variant.
    if (event.code === 1007) {
      // Update global close state for future client instances
      __GLOBAL_GEMINI_SCHEMA_STATE.lastCloseCode = event.code
      __GLOBAL_GEMINI_SCHEMA_STATE.consecutive1007 =
        (__GLOBAL_GEMINI_SCHEMA_STATE.consecutive1007 || 0) + 1
      // Enhanced parsing: capture multiple unknown field mentions & path
      const unknownMatches = [...event.reason.matchAll(/Unknown name "([^"]+)"/g)].map(m => m[1])
      const field = unknownMatches[0]
      const pathMatch = event.reason.match(/at '([^']+)'/)
      const path = pathMatch?.[1]
      const maxVariantIndex = GeminiLiveWebSocketClient.MAX_SCHEMA_VARIANT
      // If no specific field was reported (generic invalid argument) treat as structural mismatch and advance immediately
      const genericInvalid = unknownMatches.length === 0
      // If the same field repeats >1 times also accelerate (likely wrapper wrong rather than field itself)
      const repeatedSameField = unknownMatches.length > 1 && new Set(unknownMatches).size === 1
      if (this._schemaVariantIndex < maxVariantIndex) {
        this._advanceSchemaVariant = true
        logger.warn('Scheduling Gemini WS schema variant advance due to 1007 close', {
          field,
          allUnknownFields: unknownMatches,
          path,
          previousVariant: this._schemaVariantIndex,
          nextVariant: this._schemaVariantIndex + 1,
          lastVariantLabel: this._lastVariantLabel,
          reason: event.reason || '(no reason provided)',
          consecutive1007: __GLOBAL_GEMINI_SCHEMA_STATE.consecutive1007,
          genericInvalid,
          repeatedSameField
        })
      } else {
        logger.error(
          'All schema variants exhausted after 1007; triggering fallback to HTTP/Batch transport',
          {
            lastField: field,
            allUnknownFields: unknownMatches,
            path,
            variantIndex: this._schemaVariantIndex,
            attemptedVariants: maxVariantIndex + 1,
            reason: event.reason || '(no reason provided)',
            consecutive1007: __GLOBAL_GEMINI_SCHEMA_STATE.consecutive1007
          }
        )

        // Trigger fallback system for schema exhaustion
        this.triggerFallbackForSchemaFailure(
          field ?? 'unknown',
          path ?? 'unknown',
          __GLOBAL_GEMINI_SCHEMA_STATE.consecutive1007 ?? 0
        )
      }
      // Heuristic: if we keep hitting snake_case unknown fields under client_content, jump directly to official v1beta variant (index 17)
      try {
        const consecutive = __GLOBAL_GEMINI_SCHEMA_STATE.consecutive1007 || 0
        const isSnakeCaseField = !!field && field.includes('_')
        const currentlySnake = this._lastVariantLabel?.includes('snake_case')
        // If we've had >=2 consecutive 1007s on snake_case fields and haven't yet tried the official v1beta variant
        if (
          consecutive >= 2 &&
          isSnakeCaseField &&
          currentlySnake &&
          this._schemaVariantIndex < 17
        ) {
          const target = 17
          logger.info(
            'Heuristic jump to official v1beta realtimeInput.mediaChunks after repeated snake_case failures',
            {
              from: this._schemaVariantIndex,
              target,
              lastVariantLabel: this._lastVariantLabel,
              field
            }
          )
          this._schemaVariantIndex = target - 1 // -1 so pre-send advance moves to 17
          this._advanceSchemaVariant = true
        }
        // Heuristic 1: Server rejects REST-style clientContent.contents under client_content.
        // Prefer trying clientContent.parts (variant 12) which is commonly accepted by v1beta before falling back.
        if (field === 'contents' && path === 'client_content' && !this._triedPartsSchemaJump) {
          const previous = this._schemaVariantIndex
          this._schemaVariantIndex = 11 // pre-send advance => 12 (camelCase.parts.roleUser)
          this._advanceSchemaVariant = true
          this._triedPartsSchemaJump = true
          try {
            __GLOBAL_GEMINI_SCHEMA_STATE.lastVariantTried = 12
          } catch {
            /* swallow */
          }
          logger.info(
            'Heuristic jump to clientContent.parts (variant 12) due to contents being unknown',
            {
              from: previous,
              jumpTarget: 12,
              lastVariantLabel: this._lastVariantLabel
            }
          )
        }
        // Heuristic 2: if we specifically see Unknown name "contents" at 'client_content',
        // the WS seems to reject the REST-style contents envelope. Jump to official v1beta realtimeInput.mediaChunks (index 17).
        // We set the index to 16 so that the pre-send advancement moves to 17 before building payload.
        if (field === 'contents' && path === 'client_content' && this._schemaVariantIndex !== 17) {
          const previous = this._schemaVariantIndex
          this._schemaVariantIndex = 16
          this._advanceSchemaVariant = true
          try {
            __GLOBAL_GEMINI_SCHEMA_STATE.lastVariantTried = 17
          } catch {
            /* swallow */
          }
          logger.info(
            'Heuristic jump to official v1beta realtimeInput.mediaChunks due to contents under client_content being unknown',
            {
              from: previous,
              jumpTarget: 17,
              lastVariantLabel: this._lastVariantLabel
            }
          )
        }
        // If generic invalid (no field) OR repeated same field, accelerate by skipping one extra variant (structural mismatch)
        if (
          (genericInvalid || repeatedSameField) &&
          this._schemaVariantIndex + 2 <= maxVariantIndex
        ) {
          logger.info('Accelerated skip due to generic/repeated 1007 pattern', {
            from: this._schemaVariantIndex,
            skipTo: this._schemaVariantIndex + 2,
            genericInvalid,
            repeatedSameField
          })
          this._schemaVariantIndex = this._schemaVariantIndex + 1 // +1 now, +1 again on pre-send advance
          this._advanceSchemaVariant = true
        }
        // Auto-enable probe mode after 3 consecutive failures if not explicitly disabled
        if (
          consecutive >= 3 &&
          safeEnv('GEMINI_SCHEMA_PROBE') !== '1' &&
          safeEnv('GEMINI_SCHEMA_PROBE_AUTO_DISABLED') !== '1'
        ) {
          if ((globalThis as unknown as {__GEMINI_AUTO_PROBE?: number}).__GEMINI_AUTO_PROBE !== 1) {
            ;(globalThis as unknown as {__GEMINI_AUTO_PROBE?: number}).__GEMINI_AUTO_PROBE = 1
            logger.info('Auto probe mode enabled after repeated 1007 errors', {consecutive})
          }
        }
      } catch (e) {
        logger.warn('Heuristic jump / auto-probe logic failed', {error: (e as Error)?.message})
      }
    } else {
      // Reset consecutive counter on non-1007 closes
      __GLOBAL_GEMINI_SCHEMA_STATE.lastCloseCode = event.code
      __GLOBAL_GEMINI_SCHEMA_STATE.consecutive1007 = 0
    }

    this.emit('disconnected', event)

    if (!this.isClosingIntentionally) {
      // Let reconnection manager decide if we should reconnect
      const shouldReconnect = this.reconnectionManager.onConnectionLost(
        `WebSocket closed: ${event.code} - ${event.reason}`
      )

      if (shouldReconnect) {
        this.setConnectionState(ConnectionState.RECONNECTING)
        this.reconnectionManager.startReconnection(() => this.connect())
      }
    }
  }

  /**
   * Set up reconnection manager event listeners
   */
  private setupReconnectionManagerEvents(): void {
    this.reconnectionManager.on('connectionEstablished', data => {
      logger.info('Reconnection manager: connection established', data)
      this.emit('connectionQualityUpdate', data.metrics.connectionQuality)
    })

    this.reconnectionManager.on('connectionLost', data => {
      logger.warn('Reconnection manager: connection lost', {
        reason: data.reason,
        shouldReconnect: data.shouldReconnect
      })
      this.emit('connectionQualityUpdate', data.metrics.connectionQuality)
    })

    this.reconnectionManager.on('reconnectionStarted', data => {
      logger.info('Reconnection manager: reconnection started', {
        attempt: data.attempt,
        delay: data.delay
      })
      this.emit('reconnectionStarted', data)
    })

    this.reconnectionManager.on('reconnectionAttempt', data => {
      logger.info('Reconnection manager: attempting reconnection', {
        attempt: data.attempt
      })
      this.emit('reconnectionAttempt', data)
    })

    this.reconnectionManager.on('reconnectionFailed', data => {
      logger.warn('Reconnection manager: reconnection failed', {
        attempt: data.attempt,
        error: data.error.message
      })
      this.emit('reconnectionFailed', data)
    })

    this.reconnectionManager.on('maxAttemptsReached', data => {
      logger.error('Reconnection manager: maximum attempts reached', {
        attempts: data.attempts,
        totalTime: data.totalTime
      })
      this.emit('maxReconnectAttemptsReached', data)
    })

    this.reconnectionManager.on('countdownUpdate', data => {
      this.emit('reconnectionCountdown', data)
    })

    this.reconnectionManager.on('reconnectionStopped', () => {
      logger.info('Reconnection manager: reconnection stopped')
      this.emit('reconnectionStopped')
    })
  }

  /**
   * Set connection state and emit state change event
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      const previousState = this.connectionState
      this.connectionState = state
      safeLogger.log(
        'Connection state changed',
        `${sanitizeLogMessage(previousState)} -> ${sanitizeLogMessage(state)}`
      )
      this.emit('stateChange', state, previousState)
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  /**
   * Check if connection is active
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED
  }

  /**
   * Check if WebSocket setup is complete and ready to send audio data
   */
  isSetupCompleted(): boolean {
    return this.isSetupComplete
  }

  /**
   * Gracefully close the WebSocket connection
   */
  async disconnect(): Promise<void> {
    logger.info('Closing WebSocket connection', {
      currentState: this.connectionState,
      intentional: true
    })

    this.isClosingIntentionally = true

    // Stop reconnection manager
    this.reconnectionManager.stopReconnection()

    // Clear timers
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'Client disconnect')
    }

    this.setConnectionState(ConnectionState.DISCONNECTED)
    this.emit('closed')
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    return this.errorHandler.getStats()
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit?: number) {
    return this.errorHandler.getRecentErrors(limit)
  }

  /**
   * Get connection metrics from reconnection manager
   */
  getConnectionMetrics() {
    return this.reconnectionManager.getMetrics()
  }

  /**
   * Get reconnection state
   */
  getReconnectionState() {
    return this.reconnectionManager.getState()
  }

  /**
   * Get connection history
   */
  getConnectionHistory() {
    return this.reconnectionManager.getConnectionHistory()
  }

  /**
   * Update reconnection configuration
   */
  updateReconnectionConfig(config: Partial<ReconnectionConfig>) {
    this.reconnectionManager.updateConfig(config)
  }

  /**
   * Reset connection metrics and history
   */
  resetConnectionMetrics() {
    this.reconnectionManager.reset()
  }

  /**
   * Get heartbeat monitor status
   */
  getHeartbeatStatus(): HeartbeatStatus {
    return this.heartbeatMonitor.getStatus()
  }

  /**
   * Get heartbeat metrics
   */
  getHeartbeatMetrics() {
    return this.heartbeatMonitor.getMetrics()
  }

  /**
   * Check if connection is healthy according to heartbeat monitor
   */
  isConnectionHealthy(): boolean {
    return this.heartbeatMonitor.isHealthy()
  }

  /**
   * Update heartbeat monitor configuration
   */
  updateHeartbeatConfig(config: Parameters<typeof this.heartbeatMonitor.updateConfig>[0]) {
    this.heartbeatMonitor.updateConfig(config)
  }

  /**
   * Get current session information
   */
  getCurrentSession(): SessionData | null {
    return this.currentSession
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    return this.sessionManager.getSessionStats()
  }

  /**
   * Get resumable sessions
   */
  getResumableSessions(): SessionData[] {
    return this.sessionManager.getResumableSessions()
  }

  /**
   * Manually suspend current session
   */
  suspendCurrentSession(reason: string = 'manual'): void {
    if (this.currentSession) {
      this.sessionManager.suspendSession(reason, this.currentSession.sessionId)
    }
  }

  /**
   * Manually resume a specific session
   */
  resumeSpecificSession(sessionId: string): boolean {
    const resumedSession = this.sessionManager.resumeSession(sessionId)
    if (resumedSession) {
      this.currentSession = resumedSession
      logger.info('Manually resumed session', {
        sessionId: resumedSession.sessionId,
        messageCount: resumedSession.messageCount,
        turnCount: resumedSession.turnCount
      })
      return true
    }
    return false
  }

  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    this.sessionManager.clearAllSessions()
    this.currentSession = null
  }

  /**
   * Cleanup and destroy all resources
  
   */
  async destroy(): Promise<void> {
    logger.info('Destroying GeminiLiveWebSocketClient')

    // Disconnect if connected
    if (this.isConnected()) {
      await this.disconnect()
    }

    // Cleanup handlers
    this.messageHandler.destroy()
    this.errorHandler.destroy()
    this.reconnectionManager.destroy()
    this.heartbeatMonitor.stop()
    this.sessionManager.destroy()

    // Clear message queues
    for (const queue of this.messageQueue.values()) {
      queue.length = 0
    }

    // Clear pending messages and retry timers
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer)
    }
    this.retryTimers.clear()
    this.pendingMessages.clear()

    // Clear current session reference
    this.currentSession = null

    // Remove all listeners
    this.removeAllListeners()
  }

  /**
   * Get comprehensive queue and connection statistics
   */
  getQueueStatistics() {
    const queueStats: Record<string, number> = {}
    for (const [priority, queue] of this.messageQueue.entries()) {
      queueStats[priority] = queue.length
    }

    return {
      connectionState: this.connectionState,
      totalQueuedMessages: this.getTotalQueueSize(),
      messagesByPriority: queueStats,
      pendingMessages: this.pendingMessages.size,
      activeRetryTimers: this.retryTimers.size,
      circuitBreakerState: this.errorHandler.getCircuitBreakerStatus(),
      errorStatistics: this.errorHandler.getStatistics(),
      sessionInfo: this.currentSession
        ? {
            sessionId: this.currentSession.sessionId,
            createdAt: this.currentSession.createdAt,
            lastActivity: this.currentSession.lastActivity
          }
        : null
    }
  }

  /**
   * Set up message handler event listeners
   */
  private setupMessageHandler(): void {
    this.messageHandler.on('message:received', (message: GeminiLiveApiResponse) => {
      this.emit('serverContent', message)
    })

    this.messageHandler.on('message:error', (error: Error) => {
      this.emit('error', error)
    })

    this.messageHandler.on('message:sent', (messageId: string) => {
      this.emit('messageSent', messageId)
    })
  }

  /**
   * Set up error handler event listeners
   */
  private setupErrorHandlerEvents(): void {
    this.errorHandler.on('error', (error: GeminiError) => {
      logger.error('WebSocket error occurred', {
        errorId: error.id,
        type: error.type,
        message: error.message,
        retryable: error.retryable
      })
      this.emit('error', error)
    })

    this.errorHandler.on('error:network', (error: GeminiError) => {
      logger.warn('Network error detected, may trigger reconnection', {
        errorId: error.id,
        message: error.message
      })
      this.emit('networkError', error)
    })

    this.errorHandler.on('error:websocket', (error: GeminiError) => {
      logger.error('WebSocket-specific error', {
        errorId: error.id,
        message: error.message
      })
      this.emit('websocketError', error)
    })
  }

  /**
   * Set up session manager event listeners
   */
  private setupSessionManagerEvents(): void {
    this.sessionManager.on('sessionCreated', (session: SessionData) => {
      logger.info('Session created', {
        sessionId: session.sessionId,
        modelId: session.modelId
      })
      this.emit('sessionCreated', session)
    })

    this.sessionManager.on('sessionResumed', (session: SessionData) => {
      logger.info('Session resumed', {
        sessionId: session.sessionId,
        messageCount: session.messageCount,
        turnCount: session.turnCount
      })
      this.emit('sessionResumed', session)
    })

    this.sessionManager.on('sessionSuspended', (session: SessionData) => {
      logger.info('Session suspended', {
        sessionId: session.sessionId
      })
      this.emit('sessionSuspended', session)
    })

    this.sessionManager.on('sessionError', (data: {session: SessionData; error: string}) => {
      logger.error('Session error occurred', {
        sessionId: data.session.sessionId,
        error: data.error
      })
      this.emit('sessionError', data)
    })
  }

  /**
   * Set up fallback manager event handlers for transport switching
   */
  private setupFallbackManagerEvents(): void {
    this.fallbackManager.on('transport-changed', (from: string, to: string) => {
      logger.warn('Transport fallback triggered', {
        from,
        to,
        timestamp: Date.now()
      })
      this.emit('transport-changed', {from, to})
    })

    this.fallbackManager.on('transport-failed', (transport: string, error: Error) => {
      logger.error('Transport failed', {
        transport,
        error: error.message || error,
        timestamp: Date.now()
      })
      this.emit('transport-failed', {transport, error})
    })

    this.fallbackManager.on('fallback-complete', (result: TranscriptionResult) => {
      logger.info('Fallback transcription completed', {
        source: result.source,
        hasText: result.text && result.text.length > 0,
        duration: result.duration
      })
      this.emit('fallback-complete', result)
    })

    this.fallbackManager.on('all-transports-failed', () => {
      logger.error('All transport strategies have failed - transcription unavailable')
      this.emit('all-transports-failed')
    })
  }

  /**
   * Trigger fallback transport when WebSocket schema failures are exhausted
   */
  private async triggerFallbackForSchemaFailure(
    field: string,
    path: string,
    consecutive1007: number
  ): Promise<void> {
    try {
      logger.warn('Triggering fallback transport due to schema failure', {
        field,
        path,
        consecutive1007,
        currentTransport: 'websocket'
      })

      // Check if we have any pending audio data to process
      const hasPendingAudio = this.messageQueue.get(QueuePriority.HIGH)?.length ?? 0 > 0

      if (hasPendingAudio) {
        logger.info('Processing pending audio through fallback transport', {
          queuedMessages: this.messageQueue.get(QueuePriority.HIGH)?.length ?? 0
        })

        // Attempt to process the queued audio through fallback
        await this.processPendingAudioThroughFallback()
      }

      // Start fallback manager if not already active
      await this.fallbackManager.start(this.currentSession?.sessionId)

      // Force fallback due to schema exhaustion
      await this.fallbackManager.forceFallback(`schema_exhaustion_${field}_${consecutive1007}`)
    } catch (error) {
      logger.error('Failed to trigger fallback transport', {
        error: error instanceof Error ? error.message : error,
        field,
        path
      })
    }
  }

  /**
   * Process pending audio messages through fallback transport
   */
  private async processPendingAudioThroughFallback(): Promise<void> {
    const highPriorityQueue = this.messageQueue.get(QueuePriority.HIGH) ?? []

    if (highPriorityQueue.length === 0) {
      return
    }

    try {
      for (const queuedMessage of highPriorityQueue) {
        // Extract audio data from queued message input
        const audioBuffer = this.extractAudioFromQueuedMessage(queuedMessage)

        if (audioBuffer) {
          logger.info('Sending queued audio through fallback transport', {
            messageId: queuedMessage.id,
            bufferSize: audioBuffer.length
          })

          // Send through fallback manager
          const result = await this.fallbackManager.sendAudio(audioBuffer, {
            sessionId: this.currentSession?.sessionId,
            isLast: false
          })

          if (result && result.text) {
            // Emit the transcription result
            this.emit('transcription', {
              text: result.text,
              confidence: result.confidence ?? 1.0,
              duration: result.duration ?? 0,
              source: result.source ?? 'fallback'
            })
          }
        }
      }

      // Clear processed messages from queue
      this.messageQueue.set(QueuePriority.HIGH, [])

      // Send turn completion through fallback
      await this.fallbackManager.sendTurnComplete()
    } catch (error) {
      logger.error('Failed to process pending audio through fallback', {
        error: error instanceof Error ? error.message : error,
        queueSize: highPriorityQueue.length
      })
    }
  }

  /**
   * Extract audio buffer from a queued message
   */
  private extractAudioFromQueuedMessage(message: QueuedMessage): Buffer | null {
    try {
      const input = message.input

      if (input && typeof input === 'object') {
        // Try to extract audio data from RealtimeInput structure
        if ('realtimeInput' in input && input.realtimeInput) {
          const realtimeData = input.realtimeInput as {mediaChunks?: Array<{data?: string}>}
          if (realtimeData.mediaChunks && Array.isArray(realtimeData.mediaChunks)) {
            // Extract base64 data from media chunks
            const base64Data = realtimeData.mediaChunks[0]?.data
            if (base64Data && typeof base64Data === 'string') {
              return Buffer.from(base64Data, 'base64')
            }
          }
        }

        if ('clientContent' in input && input.clientContent) {
          const content = input.clientContent as {
            content?: {parts?: Array<{inlineData?: {data?: string}}>}
          }
          if (content.content?.parts?.[0]?.inlineData?.data) {
            const base64Data = content.content.parts[0].inlineData.data
            return Buffer.from(base64Data, 'base64')
          }
        }
      }

      return null
    } catch (error) {
      logger.error('Failed to extract audio from queued message', {
        error: error instanceof Error ? error.message : error,
        messageId: message.id
      })
      return null
    }
  }

  /**
   * Create a properly formatted setup message for Gemini Live API v1beta
   * Following the official BidiGenerateContentSetup structure
   */
  private createSetupMessage(): SetupMessage {
    const setupMessage: SetupMessage = {
      setup: {
        model: `models/${this.config.model}`,
        generationConfig: {
          responseModalities: this.config.responseModalities || [ResponseModality.TEXT],
          // Use configured values or defaults optimized for speech transcription
          candidateCount: this.config.generationConfig?.candidateCount ?? 1, // Single response for transcription
          maxOutputTokens: this.config.generationConfig?.maxOutputTokens ?? 8192, // Sufficient for transcription responses
          temperature: this.config.generationConfig?.temperature ?? 0.1, // Low temperature for consistent transcription
          topP: this.config.generationConfig?.topP ?? 0.95, // Focused but not overly restrictive
          ...(this.config.generationConfig?.topK && {topK: this.config.generationConfig.topK}),
          ...(this.config.generationConfig?.presencePenalty && {
            presencePenalty: this.config.generationConfig.presencePenalty
          }),
          ...(this.config.generationConfig?.frequencyPenalty && {
            frequencyPenalty: this.config.generationConfig.frequencyPenalty
          })
          // Note: speechConfig removed as it's not needed for speech-to-text transcription
          // The speechConfig with voiceName is only needed for text-to-speech generation
        }
        // Note: inputAudioTranscription removed - not part of v1beta setup message format
      }
    }

    // Add system instruction if provided
    if (this.config.systemInstruction) {
      setupMessage.setup.systemInstruction = {
        parts: [{text: this.config.systemInstruction}]
      }
    }

    // Add Google Search grounding tool
    setupMessage.setup.tools = [
      {
        google_search: {}
      }
    ]

    return setupMessage
  }

  /**
   * Send initial setup message to Gemini Live API v1beta
   */
  private async sendSetupMessage(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const setupMessage = this.createSetupMessage()

    // Include session ID if we have a current session (for resumption)
    if (this.currentSession) {
      // Add session context to the setup message
      logger.info('Including session context in setup message', {
        sessionId: this.currentSession.sessionId,
        messageCount: this.currentSession.messageCount,
        turnCount: this.currentSession.turnCount
      })

      // Note: The Gemini Live API doesn't have a direct session ID field in setup,
      // but we track this internally for session continuity
      this.sessionManager.recordConnectionEvent('connected', 'setup_message_sent')
    }

    // Validate setup message structure and content
    this.validateSetupMessage(setupMessage)

    try {
      const message = JSON.stringify(setupMessage)

      logger.info('Sending setup message to Gemini Live API', {
        model: this.config.model,
        responseModalities: this.config.responseModalities,
        hasSystemInstruction: !!this.config.systemInstruction,
        hasActiveSession: !!this.currentSession,
        sessionId: this.currentSession?.sessionId
      })

      this.ws.send(message)
      this.emit('setupMessageSent', setupMessage)

      // CRITICAL: Wait for setup response before allowing audio messages
      await this.waitForSetupResponse()

      // Update session with setup message sent
      if (this.currentSession) {
        this.sessionManager.updateActivity(this.currentSession.sessionId)
      }
    } catch (error) {
      const geminiError = this.errorHandler.handleError(
        error,
        {setupMessage},
        {type: ErrorType.API, retryable: false}
      )
      logger.error('Failed to send setup message', {
        errorId: geminiError.id,
        message: geminiError.message,
        sessionId: this.currentSession?.sessionId
      })

      // Mark session as having an error if setup fails
      if (this.currentSession) {
        this.sessionManager.markSessionError(`Setup message failed: ${geminiError.message}`)
      }

      throw geminiError
    }
  }

  /**
   * Validate setup message configuration
   */
  /**
   * Validate setup message for v1beta API compatibility
   * Enhanced validation following official Google documentation
   */
  private validateSetupMessage(setupMessage: SetupMessage): void {
    if (!setupMessage.setup.model) {
      throw new Error('Setup message must include a model specification')
    }

    if (!setupMessage.setup.model.startsWith('models/')) {
      throw new Error('Model specification must start with "models/" for v1beta API')
    }

    // Validate the model name contains expected patterns for Gemini Live
    const modelName = setupMessage.setup.model.replace('models/', '')
    if (!modelName.includes('gemini')) {
      logger.warn(
        'Model name does not contain "gemini", this may not be a valid Gemini Live model',
        {
          model: modelName
        }
      )
    }

    if (!setupMessage.setup.generationConfig?.responseModalities?.length) {
      throw new Error('Setup message must specify at least one response modality')
    }

    const validModalities = Object.values(ResponseModality)
    const invalidModalities = setupMessage.setup.generationConfig.responseModalities.filter(
      (modality: string) => !validModalities.includes(modality as ResponseModality)
    )

    if (invalidModalities.length > 0) {
      throw new Error(
        `Invalid response modalities: ${invalidModalities.join(', ')}. Valid options: ${validModalities.join(', ')}`
      )
    }

    // Validate generation config parameters
    const genConfig = setupMessage.setup.generationConfig
    if (
      genConfig.candidateCount !== undefined &&
      (genConfig.candidateCount < 1 || genConfig.candidateCount > 8)
    ) {
      throw new Error('candidateCount must be between 1 and 8')
    }

    if (
      genConfig.maxOutputTokens !== undefined &&
      (genConfig.maxOutputTokens < 1 || genConfig.maxOutputTokens > 32768)
    ) {
      throw new Error('maxOutputTokens must be between 1 and 32768')
    }

    if (
      genConfig.temperature !== undefined &&
      (genConfig.temperature < 0 || genConfig.temperature > 2)
    ) {
      throw new Error('temperature must be between 0.0 and 2.0')
    }

    if (genConfig.topP !== undefined && (genConfig.topP < 0 || genConfig.topP > 1)) {
      throw new Error('topP must be between 0.0 and 1.0')
    }

    if (genConfig.topK !== undefined && (genConfig.topK < 1 || genConfig.topK > 2048)) {
      throw new Error('topK must be between 1 and 2048')
    }

    // Validate system instruction format if provided
    if (setupMessage.setup.systemInstruction) {
      if (
        !setupMessage.setup.systemInstruction.parts ||
        !Array.isArray(setupMessage.setup.systemInstruction.parts)
      ) {
        throw new Error('System instruction must have a "parts" array')
      }

      if (setupMessage.setup.systemInstruction.parts.length === 0) {
        throw new Error('System instruction parts array cannot be empty')
      }

      for (const part of setupMessage.setup.systemInstruction.parts) {
        if (!part.text || typeof part.text !== 'string') {
          throw new Error(
            'Each system instruction part must have a "text" field with string content'
          )
        }
      }
    }

    logger.debug('Setup message validation passed for v1beta API', {
      model: setupMessage.setup.model,
      responseModalities: setupMessage.setup.generationConfig.responseModalities,
      hasSystemInstruction: !!setupMessage.setup.systemInstruction,
      generationConfig: {
        candidateCount: genConfig.candidateCount,
        maxOutputTokens: genConfig.maxOutputTokens,
        temperature: genConfig.temperature,
        topP: genConfig.topP
      }
    })
  }

  /**
   * Wait for setup response from Gemini Live API before sending audio
   * This is critical for proper protocol flow - must wait for server acknowledgment
   */
  private async waitForSetupResponse(): Promise<void> {
    // If setup is already complete, resolve immediately
    if (this.isSetupComplete) {
      logger.info('Setup already complete - audio can be sent immediately')
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off('setupComplete', onSetupComplete)
        this.off('error', onError)
        this.off('close', onClose)
        reject(new Error('Timeout waiting for setup response from Gemini Live API'))
      }, 15000) // Increased timeout to 15 seconds for better reliability

      // Listen for the setupComplete event from the main message handler
      const onSetupComplete = () => {
        logger.info('Setup complete event received - audio can now be sent')
        this.isSetupComplete = true

        // Now that setup is complete, process any queued messages
        this.processMessageQueue()

        clearTimeout(timeout)
        this.off('setupComplete', onSetupComplete)
        this.off('error', onError)
        this.off('close', onClose)
        resolve()
      }

      const onError = () => {
        clearTimeout(timeout)
        this.off('setupComplete', onSetupComplete)
        this.off('error', onError)
        this.off('close', onClose)
        reject(new Error('WebSocket error while waiting for setup response'))
      }

      const onClose = () => {
        clearTimeout(timeout)
        this.off('setupComplete', onSetupComplete)
        this.off('error', onError)
        this.off('close', onClose)
        reject(new Error('WebSocket closed while waiting for setup response'))
      }

      // Check if setup is complete before adding listeners (race condition protection)
      if (this.isSetupComplete) {
        clearTimeout(timeout)
        logger.info('Setup completed during listener setup - resolving immediately')
        resolve()
        return
      }

      // Listen for events instead of parsing messages directly
      this.on('setupComplete', onSetupComplete)
      this.on('error', onError)
      this.on('close', onClose)
    })
  }

  // ===== Response Modality Configuration Methods =====

  /**
   * Configure response modalities for the WebSocket connection
   */
  configureResponseModalities(modalities: ResponseModality[]): void {
    if (!modalities || modalities.length === 0) {
      throw new Error('At least one response modality must be specified')
    }

    // Validate modalities
    const validModalities = Object.values(ResponseModality)
    const invalidModalities = modalities.filter(modality => !validModalities.includes(modality))

    if (invalidModalities.length > 0) {
      throw new Error(
        `Invalid response modalities: ${invalidModalities.join(', ')}. Valid options: ${validModalities.join(', ')}`
      )
    }

    this.config.responseModalities = modalities

    logger.info('Response modalities configured', {
      modalities: modalities,
      previousModalities: this.config.responseModalities
    })
  }

  /**
   * Get currently configured response modalities
   */
  getResponseModalities(): ResponseModality[] {
    return this.config.responseModalities || [ResponseModality.TEXT]
  }

  /**
   * Check if a specific response modality is enabled
   */
  isModalityEnabled(modality: ResponseModality): boolean {
    const currentModalities = this.getResponseModalities()
    return currentModalities.includes(modality)
  }

  /**
   * Enable audio response modality (adds AUDIO to existing modalities)
   */
  enableAudioModality(): void {
    const currentModalities = this.getResponseModalities()
    if (!currentModalities.includes(ResponseModality.AUDIO)) {
      this.configureResponseModalities([...currentModalities, ResponseModality.AUDIO])
    }
  }

  /**
   * Disable audio response modality (removes AUDIO from modalities)
   */
  disableAudioModality(): void {
    const currentModalities = this.getResponseModalities()
    const filteredModalities = currentModalities.filter(
      modality => modality !== ResponseModality.AUDIO
    )

    // Ensure at least TEXT remains
    if (filteredModalities.length === 0) {
      this.configureResponseModalities([ResponseModality.TEXT])
    } else {
      this.configureResponseModalities(filteredModalities)
    }
  }

  /**
   * Reset to text-only modality
   */
  resetToTextOnly(): void {
    this.configureResponseModalities([ResponseModality.TEXT])
  }

  /**
   * Enable multimodal responses (both TEXT and AUDIO)
   */
  enableMultimodalResponses(): void {
    this.configureResponseModalities([ResponseModality.TEXT, ResponseModality.AUDIO])
  }

  /**
   * Get response modality configuration summary
   */
  getModalityConfiguration(): {
    enabled: ResponseModality[]
    textEnabled: boolean
    audioEnabled: boolean
    isMultimodal: boolean
  } {
    const enabled = this.getResponseModalities()
    return {
      enabled,
      textEnabled: enabled.includes(ResponseModality.TEXT),
      audioEnabled: enabled.includes(ResponseModality.AUDIO),
      isMultimodal: enabled.length > 1
    }
  }

  // ===== Enhanced Message Parsing Methods =====

  /**
   * Parse a response using the enhanced gemini-live-2.5-flash-preview parser
   */
  parseGeminiResponse(rawMessage: unknown): ParsedGeminiResponse {
    return Gemini2FlashMessageParser.parseResponse(rawMessage)
  }

  /**
   * Validate a parsed Gemini response
   */
  validateGeminiResponse(response: ParsedGeminiResponse): {isValid: boolean; errors: string[]} {
    return Gemini2FlashMessageParser.validateResponse(response)
  }

  /**
   * Get parsing statistics and metrics
   */
  getParsingMetrics(): {
    totalMessagesParsed: number
    validMessages: number
    invalidMessages: number
    messageTypeDistribution: Record<string, number>
    errorDistribution: Record<string, number>
  } {
    // This would need to be tracked over time - for now return basic structure
    return {
      totalMessagesParsed: 0,
      validMessages: 0,
      invalidMessages: 0,
      messageTypeDistribution: {},
      errorDistribution: {}
    }
  }

  // ===== Server Error Classification and Recovery Methods =====

  /**
   * Classify server errors to appropriate ErrorType for v1beta API
   */
  private classifyServerError(serverError: ServerErrorData): ErrorType {
    if (!serverError || !serverError.code) {
      return ErrorType.API
    }

    const errorCode = String(serverError.code).toLowerCase()
    const errorMessage = String(serverError.message || '').toLowerCase()

    // Authentication errors (enhanced for v1beta)
    if (
      errorCode.includes('auth') ||
      errorCode.includes('unauthenticated') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('invalid api key') ||
      errorMessage.includes('authentication failed') ||
      errorCode === '401' ||
      errorCode === '16' // gRPC UNAUTHENTICATED
    ) {
      return ErrorType.AUTHENTICATION
    }

    // Permission denied (v1beta specific)
    if (
      errorCode.includes('permission') ||
      errorMessage.includes('permission denied') ||
      errorMessage.includes('access denied') ||
      errorCode === '403' ||
      errorCode === '7' // gRPC PERMISSION_DENIED
    ) {
      return ErrorType.AUTHENTICATION
    }

    // Rate limiting (enhanced for v1beta)
    if (
      errorCode.includes('rate') ||
      errorCode.includes('throttle') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorCode === '429' ||
      errorCode === '8' // gRPC RESOURCE_EXHAUSTED
    ) {
      return ErrorType.RATE_LIMIT
    }

    // Quota exceeded (enhanced for v1beta)
    if (
      errorCode.includes('quota') ||
      errorCode.includes('limit') ||
      errorMessage.includes('quota exceeded') ||
      errorMessage.includes('limit exceeded') ||
      errorMessage.includes('billing') ||
      errorCode === '403'
    ) {
      return ErrorType.QUOTA_EXCEEDED
    }

    // Service unavailable (enhanced for v1beta)
    if (
      errorCode.includes('unavailable') ||
      errorCode.includes('internal') ||
      errorMessage.includes('unavailable') ||
      errorMessage.includes('internal error') ||
      errorMessage.includes('server error') ||
      errorCode === '503' ||
      errorCode === '500' ||
      errorCode === '14' || // gRPC UNAVAILABLE
      errorCode === '13' // gRPC INTERNAL
    ) {
      return ErrorType.SERVICE_UNAVAILABLE
    }

    // Model-specific errors
    if (
      errorCode.includes('model') ||
      errorMessage.includes('model') ||
      errorMessage.includes('invalid model')
    ) {
      return ErrorType.MODEL_ERROR
    }

    // Session errors
    if (errorCode.includes('session') || errorMessage.includes('session')) {
      return ErrorType.SESSION_ERROR
    }

    // Validation errors
    if (
      errorCode.includes('validation') ||
      errorMessage.includes('invalid') ||
      errorCode === '400'
    ) {
      return ErrorType.VALIDATION
    }

    // Default to API error
    return ErrorType.API
  }

  /**
   * Determine if a server error is retryable
   */
  private isServerErrorRetryable(serverError: ServerErrorData): boolean {
    if (!serverError) {
      return false
    }

    const errorType = this.classifyServerError(serverError)

    // Non-retryable error types
    const nonRetryableTypes = [
      ErrorType.AUTHENTICATION,
      ErrorType.VALIDATION,
      ErrorType.MODEL_ERROR,
      ErrorType.QUOTA_EXCEEDED // Usually permanent until quota resets
    ]

    return !nonRetryableTypes.includes(errorType)
  }

  /**
   * Determine if we should attempt reconnection for a server error
   */
  private shouldReconnectOnServerError(serverError: ServerErrorData): boolean {
    if (!serverError) {
      return false
    }

    const errorType = this.classifyServerError(serverError)

    // Reconnect for network-related and temporary service errors
    const reconnectableTypes = [
      ErrorType.NETWORK,
      ErrorType.SERVICE_UNAVAILABLE,
      ErrorType.SESSION_ERROR,
      ErrorType.WEBSOCKET
    ]

    return reconnectableTypes.includes(errorType)
  }

  /**
   * Handle server error recovery without async in handleMessage
   */
  private handleServerErrorRecovery(serverError: GeminiError): void {
    // Use setTimeout to avoid async issues in handleMessage
    setTimeout(async () => {
      try {
        await this.handleErrorRecovery(serverError)
      } catch (recoveryError) {
        logger.error('Server error recovery failed', {
          originalError: serverError.type,
          recoveryError:
            recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
        })
      }
    }, 0)
  }

  /**
   * Safely sanitize input for use as Map keys to prevent NoSQL injection
   */
  private sanitizeMapKey(input: unknown): string {
    if (input === null || input === undefined) {
      return 'null'
    }

    // Convert to string and sanitize
    const str = String(input)

    // Remove potentially harmful characters and limit length
    return str
      .replace(/[^\w\-_.:]/g, '_') // Keep only alphanumeric, hyphens, underscores, dots, and colons
      .substring(0, 100) // Limit length to prevent excessive memory usage
      .trim()
  }

  /**
   * Handle go away message from server (v1beta)
   */
  private handleGoAwayMessage(timeLeft?: {seconds: number; nanos: number}): void {
    logger.info('Server sent go away message', {
      timeLeft,
      sessionId: this.currentSession?.sessionId
    })

    if (timeLeft) {
      const totalMs = timeLeft.seconds * 1000 + timeLeft.nanos / 1_000_000
      logger.info(`Server will disconnect in ${totalMs}ms`)

      // Schedule graceful disconnect before server forces it
      setTimeout(
        () => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            logger.info('Gracefully closing connection before server timeout')
            this.disconnect()
          }
        },
        Math.max(0, totalMs - 1000)
      ) // Disconnect 1 second before server timeout
    } else {
      // No time specified, disconnect immediately
      logger.info('Immediate disconnect requested by server')
      this.disconnect()
    }
  }

  /**
   * Handle session resumption update (v1beta)
   */
  private handleSessionResumptionUpdate(update?: {newHandle: string; resumable: boolean}): void {
    if (!update || !this.currentSession) {
      logger.debug('No session resumption update or current session to update')
      return
    }

    logger.info('Received session resumption update', {
      sessionId: this.currentSession.sessionId,
      newHandle: update.newHandle ? 'present' : 'empty',
      resumable: update.resumable
    })

    // Update session manager with new resumption capabilities
    if (update.newHandle && update.resumable) {
      // Store the session handle for potential resumption
      // Note: This would need SessionData interface extension for full implementation
      this.sessionManager.recordConnectionEvent('connected', 'resumption_handle_received')

      // Store resumption info in a separate structure for now
      logger.info('Session resumption enabled', {
        sessionId: this.currentSession.sessionId,
        hasHandle: true
      })
    } else if (!update.resumable) {
      // Session is no longer resumable
      this.sessionManager.recordConnectionEvent('disconnected', 'resumption_handle_invalidated')

      logger.info('Session resumption disabled', {
        sessionId: this.currentSession.sessionId
      })
    }
  }
}

// Default export for easy importing
export default GeminiLiveWebSocketClient
