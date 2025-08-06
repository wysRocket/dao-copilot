/**
 * GCP Gemini Live API Client
 *
 * A production-ready client for Google Cloud Platform's Gemini Live API
 * Provides WebSocket-based real-time transcription and audio streaming
 * Built on top of the GCP SDK Manager for authentication and configuration
 *
 * Features:
 * - Real-time audio streaming via WebSocket
 * - Support for native audio and half-cascade models
 * - Comprehensive error handling and reconnection logic
 * - TypeScript interfaces for type safety
 * - Event-driven architecture for real-time updates
 * - Audio format conversion and validation
 * - Performance monitoring and metrics
 * - Production-ready logging and debugging
 */

import {EventEmitter} from 'events'
import {
  GCPSDKManager,
  GCPSDKInstance,
  LiveSession,
  LiveSessionMessage,
  gcpSDK
} from './gcp-sdk-manager'
import {logger} from './gemini-logger'
import {
  GeminiErrorHandler,
  ErrorType,
  GeminiError,
  RecoveryStrategy,
  CircuitBreakerState,
  LogLevel
} from './gemini-error-handler'
import {
  AudioFormatConverter,
  createAudioFormatConverter,
  AudioFormat
} from './audio-format-converter'
import {
  createRealTimeAudioStreaming,
  RealTimeAudioStreamingService,
  AudioChunk
} from './real-time-audio-streaming'
import {
  getWebSocketDiagnostics,
  logWebSocketTiming,
  startWebSocketTiming,
  endWebSocketTiming
} from '../utils/websocket-diagnostics'
import {
  getWebSocketConfigurationManager,
  WebSocketConfigurationManager
} from '../utils/websocket-config-manager'
import {createLowLatencyConfig} from '../utils/low-latency-config'

// ========================
// Model Definitions and Constants
// ========================

/** Supported Gemini Live API models */
export enum GeminiLiveModel {
  NATIVE_AUDIO = 'gemini-2.5-flash-preview-native-audio-dialog',
  HALF_CASCADE = 'gemini-2.0-flash-live-001'
}

/** Model capabilities and specifications */
export interface ModelSpec {
  /** Model identifier */
  id: GeminiLiveModel
  /** Human-readable name */
  displayName: string
  /** Model description */
  description: string
  /** Supported audio input formats */
  supportedInputFormats: AudioFormat[]
  /** Supported audio output formats */
  supportedOutputFormats: AudioFormat[]
  /** Input sample rate requirements */
  inputSampleRates: number[]
  /** Output sample rate capabilities */
  outputSampleRates: number[]
  /** Maximum session duration in milliseconds */
  maxSessionDuration: number
  /** Maximum audio chunk size in bytes */
  maxChunkSize: number
  /** Minimum audio chunk size in bytes */
  minChunkSize: number
  /** Supports real-time streaming */
  supportsStreaming: boolean
  /** Supports text-only mode */
  supportsTextMode: boolean
  /** Supports native audio processing */
  supportsNativeAudio: boolean
  /** Model-specific configuration options */
  configOptions: {
    /** Enable low-latency mode */
    lowLatency?: boolean
    /** Voice activity detection */
    voiceActivityDetection?: boolean
    /** Automatic gain control */
    automaticGainControl?: boolean
    /** Noise suppression */
    noiseSuppression?: boolean
    /** Echo cancellation */
    echoCancellation?: boolean
  }
  /** Rate limits and quotas */
  limits: {
    /** Requests per minute */
    requestsPerMinute: number
    /** Maximum concurrent sessions */
    maxConcurrentSessions: number
    /** Audio data limit per session (bytes) */
    audioDataLimitPerSession: number
  }
}

/** Model registry with specifications for each supported model */
export const MODEL_SPECS: Record<GeminiLiveModel, ModelSpec> = {
  [GeminiLiveModel.NATIVE_AUDIO]: {
    id: GeminiLiveModel.NATIVE_AUDIO,
    displayName: 'Gemini 2.5 Flash Native Audio',
    description:
      'Latest Gemini model with native audio processing capabilities for high-quality real-time transcription',
    supportedInputFormats: [AudioFormat.PCM16, AudioFormat.OPUS],
    supportedOutputFormats: [AudioFormat.PCM16],
    inputSampleRates: [16000, 24000, 48000],
    outputSampleRates: [24000, 48000],
    maxSessionDuration: 3600000, // 1 hour
    maxChunkSize: 8192,
    minChunkSize: 1024,
    supportsStreaming: true,
    supportsTextMode: false,
    supportsNativeAudio: true,
    configOptions: {
      lowLatency: true,
      voiceActivityDetection: true,
      automaticGainControl: true,
      noiseSuppression: true,
      echoCancellation: true
    },
    limits: {
      requestsPerMinute: 60,
      maxConcurrentSessions: 5,
      audioDataLimitPerSession: 100 * 1024 * 1024 // 100MB
    }
  },
  [GeminiLiveModel.HALF_CASCADE]: {
    id: GeminiLiveModel.HALF_CASCADE,
    displayName: 'Gemini 2.0 Flash Live',
    description:
      'Half-cascade model for balanced performance and latency in live transcription scenarios',
    supportedInputFormats: [AudioFormat.PCM16],
    supportedOutputFormats: [AudioFormat.PCM16],
    inputSampleRates: [16000],
    outputSampleRates: [16000, 24000],
    maxSessionDuration: 1800000, // 30 minutes
    maxChunkSize: 4096,
    minChunkSize: 512,
    supportsStreaming: true,
    supportsTextMode: true,
    supportsNativeAudio: false,
    configOptions: {
      lowLatency: false,
      voiceActivityDetection: false,
      automaticGainControl: false,
      noiseSuppression: false,
      echoCancellation: false
    },
    limits: {
      requestsPerMinute: 120,
      maxConcurrentSessions: 10,
      audioDataLimitPerSession: 50 * 1024 * 1024 // 50MB
    }
  }
}

/** Model validation result */
export interface ModelValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  recommendations: string[]
  compatibleConfiguration?: Partial<GCPLiveClientConfig>
}

/** Model performance metrics */
export interface ModelPerformanceMetrics {
  model: GeminiLiveModel
  averageLatency: number
  throughput: number
  errorRate: number
  sessionDuration: number
  audioQualityScore: number
  transcriptionAccuracy: number
  lastUpdated: number
}

/** Model switching configuration */
export interface ModelSwitchConfig {
  targetModel: GeminiLiveModel
  preserveSession?: boolean
  migrationStrategy?: 'immediate' | 'graceful' | 'drain'
  fallbackModel?: GeminiLiveModel
  validationTimeout?: number
}

// ========================
// Types and Interfaces
// ========================

export interface GCPLiveClientConfig {
  /** Authentication method and credentials */
  authentication?: {
    apiKey?: string
    serviceAccountPath?: string
    projectId?: string
  }

  /** Model configuration */
  model?: {
    /** Model selection - use GeminiLiveModel enum for type safety */
    name: GeminiLiveModel | string
    /** Enable native audio processing (auto-detected based on model) */
    enableNativeAudio?: boolean
    /** Enable text-only mode for testing */
    enableTextMode?: boolean
    /** Model-specific configuration options */
    config?: {
      /** Enable low-latency mode */
      lowLatency?: boolean
      /** Voice activity detection */
      voiceActivityDetection?: boolean
      /** Automatic gain control */
      automaticGainControl?: boolean
      /** Noise suppression */
      noiseSuppression?: boolean
      /** Echo cancellation */
      echoCancellation?: boolean
    }
    /** Performance tuning options */
    performance?: {
      /** Maximum session duration override (ms) */
      maxSessionDuration?: number
      /** Audio chunk size override (bytes) */
      chunkSize?: number
      /** Enable performance monitoring */
      enableMonitoring?: boolean
    }
    /** Fallback model configuration */
    fallback?: {
      /** Model to use if primary model fails */
      model: GeminiLiveModel
      /** Automatic fallback on errors */
      autoFallback?: boolean
      /** Maximum fallback attempts */
      maxAttempts?: number
    }
  }

  /** Audio configuration */
  audio?: {
    /** Input sample rate (default: 16000Hz) */
    inputSampleRate?: number
    /** Output sample rate (default: 24000Hz) */
    outputSampleRate?: number
    /** Audio format (default: 16-bit PCM) */
    format?: 'pcm16' | 'pcm24' | 'float32'
    /** Audio encoding */
    encoding?: 'linear16' | 'linear24' | 'float'
    /** Channels (default: 1 for mono) */
    channels?: number
    /** Chunk size for streaming (default: 4096 bytes) */
    chunkSize?: number
  }

  /** WebSocket configuration */
  websocket?: {
    /** Connection timeout in milliseconds */
    timeout?: number
    /** Enable automatic reconnection */
    autoReconnect?: boolean
    /** Maximum reconnection attempts */
    maxReconnectAttempts?: number
    /** Reconnection delay in milliseconds */
    reconnectDelay?: number
    /** Enable exponential backoff for reconnections */
    exponentialBackoff?: boolean
    /** Heartbeat interval in milliseconds */
    heartbeatInterval?: number
  }

  /** Performance and monitoring */
  performance?: {
    /** Enable performance monitoring */
    enableMonitoring?: boolean
    /** Buffer size for audio streaming */
    bufferSize?: number
    /** Maximum queue size for pending messages */
    maxQueueSize?: number
    /** Enable detailed logging */
    enableDetailedLogging?: boolean
  }

  /** Error handling configuration */
  errorHandling?: {
    /** Enable automatic error recovery */
    enableAutoRecovery?: boolean
    /** Maximum retry attempts for failed operations */
    maxRetries?: number
    /** Circuit breaker configuration */
    circuitBreaker?: {
      failureThreshold?: number
      timeout?: number
      monitoringPeriod?: number
    }
    /** Recovery strategies for different error types */
    recoveryStrategies?: {
      network?: RecoveryStrategy
      websocket?: RecoveryStrategy
      authentication?: RecoveryStrategy
      timeout?: RecoveryStrategy
    }
  }

  /** Development and debugging */
  debug?: boolean
  logLevel?: 'error' | 'warn' | 'info' | 'debug'
}

export interface ResolvedGCPLiveClientConfig {
  /** Authentication method and credentials */
  authentication: {
    apiKey: string
    serviceAccountPath?: string
    projectId?: string
  }

  /** Model configuration */
  model: {
    /** Model name - resolved to specific model string */
    name: string
    /** Model enum for type-safe operations */
    modelType: GeminiLiveModel
    /** Model specification */
    spec: ModelSpec
    /** Enable native audio processing */
    enableNativeAudio: boolean
    /** Enable text-only mode for testing */
    enableTextMode: boolean
    /** Model-specific configuration options */
    config: {
      /** Enable low-latency mode */
      lowLatency: boolean
      /** Voice activity detection */
      voiceActivityDetection: boolean
      /** Automatic gain control */
      automaticGainControl: boolean
      /** Noise suppression */
      noiseSuppression: boolean
      /** Echo cancellation */
      echoCancellation: boolean
    }
    /** Performance tuning options */
    performance: {
      /** Maximum session duration (ms) */
      maxSessionDuration: number
      /** Audio chunk size (bytes) */
      chunkSize: number
      /** Enable performance monitoring */
      enableMonitoring: boolean
    }
    /** Fallback model configuration */
    fallback?: {
      /** Model to use if primary model fails */
      model: GeminiLiveModel
      /** Model specification for fallback */
      spec: ModelSpec
      /** Automatic fallback on errors */
      autoFallback: boolean
      /** Maximum fallback attempts */
      maxAttempts: number
    }
  }

  /** Audio configuration */
  audio: {
    /** Input sample rate */
    inputSampleRate: number
    /** Output sample rate */
    outputSampleRate: number
    /** Audio format */
    format: 'pcm16' | 'pcm24' | 'float32'
    /** Audio encoding */
    encoding: 'linear16' | 'linear24' | 'float'
    /** Channels */
    channels: number
    /** Chunk size for streaming */
    chunkSize: number
  }

  /** WebSocket configuration */
  websocket: {
    /** Connection timeout in milliseconds */
    timeout: number
    /** Enable automatic reconnection */
    autoReconnect: boolean
    /** Maximum reconnection attempts */
    maxReconnectAttempts: number
    /** Reconnection delay in milliseconds */
    reconnectDelay: number
    /** Enable exponential backoff for reconnections */
    exponentialBackoff: boolean
    /** Heartbeat interval in milliseconds */
    heartbeatInterval: number
  }

  /** Performance and monitoring */
  performance: {
    /** Enable performance monitoring */
    enableMonitoring: boolean
    /** Buffer size for audio streaming */
    bufferSize: number
    /** Maximum queue size for pending messages */
    maxQueueSize: number
    /** Enable detailed logging */
    enableDetailedLogging: boolean
  }

  /** Error handling configuration */
  errorHandling: {
    /** Enable automatic error recovery */
    enableAutoRecovery: boolean
    /** Maximum retry attempts for failed operations */
    maxRetries: number
    /** Circuit breaker configuration */
    circuitBreaker: {
      failureThreshold: number
      successThreshold: number
      timeout: number
      monitoringPeriod: number
    }
    /** Recovery strategies for different error types */
    recoveryStrategies: {
      network: RecoveryStrategy
      websocket: RecoveryStrategy
      authentication: RecoveryStrategy
      timeout: RecoveryStrategy
      rateLimit: RecoveryStrategy
      serviceUnavailable: RecoveryStrategy
    }
  }

  /** Development and debugging */
  debug: boolean
  logLevel: 'error' | 'warn' | 'info' | 'debug'
}

export interface AudioStreamConfig {
  /** MIME type for audio data */
  mimeType: string
  /** Sample rate in Hz */
  sampleRate: number
  /** Number of audio channels */
  channels: number
  /** Bits per sample */
  bitsPerSample: number
  /** Audio encoding format */
  encoding: string
}

interface MessagePart {
  text?: string
  inlineData?: {
    mimeType: string
    data: string
  }
}

interface ModelTurn {
  parts: MessagePart[]
}

export interface TranscriptionResult {
  /** Unique identifier for this result */
  id: string
  /** Transcribed text */
  text: string
  /** Confidence score (0-1) */
  confidence?: number
  /** Timestamp when result was received */
  timestamp: number
  /** Whether this is a final result */
  isFinal: boolean
  /** Whether this is a partial/interim result */
  isPartial?: boolean
  /** Language code detected */
  language?: string
  /** Session ID this result belongs to */
  sessionId?: string
  /** Sequence number for ordering results */
  sequence?: number
  /** Start time of the audio segment (ms) */
  startTime?: number
  /** End time of the audio segment (ms) */
  endTime?: number
  /** Duration of the audio segment (ms) */
  duration?: number
  /** Model that generated this result */
  model?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

export interface AudioResponse {
  /** Audio data (Base64 encoded) */
  audioData: string[]
  /** MIME type of the audio */
  mimeType: string
  /** Timestamp when response was received */
  timestamp: number
  /** Session ID this response belongs to */
  sessionId?: string
  /** Duration of the audio response (ms) */
  duration?: number
}

export interface TranscriptionResultBatch {
  /** Array of results in this batch */
  results: TranscriptionResult[]
  /** Whether this batch contains final results */
  hasFinalResults: boolean
  /** Whether this batch contains partial results */
  hasPartialResults: boolean
  /** Total number of results */
  totalResults: number
  /** Session ID for this batch */
  sessionId?: string
  /** Timestamp of the batch */
  timestamp: number
}

export interface LiveStreamingSession {
  /** Unique session identifier */
  id: string
  /** Current session status */
  status: 'connecting' | 'connected' | 'streaming' | 'disconnected' | 'error'
  /** Model being used for this session */
  model: string
  /** Audio configuration for this session */
  audioConfig: AudioStreamConfig
  /** Session creation timestamp */
  createdAt: number
  /** Last activity timestamp */
  lastActivity: number
  /** Total bytes streamed in this session */
  bytesStreamed: number
  /** Total messages sent in this session */
  messagesSent: number
  /** Total messages received in this session */
  messagesReceived: number
}

export interface ClientMetrics {
  /** Current session information */
  session?: LiveStreamingSession
  /** Connection statistics */
  connection: {
    state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
    uptime: number
    reconnectAttempts: number
    lastError?: string
  }
  /** Audio streaming statistics */
  audio: {
    totalBytesSent: number
    totalBytesReceived: number
    chunksProcessed: number
    averageChunkSize: number
    streamingDuration: number
  }
  /** Performance metrics */
  performance: {
    averageLatency: number
    messagesPerSecond: number
    errorsPerMinute: number
    memoryUsage: number
  }
  /** Error statistics */
  errors: {
    total: number
    connectionErrors: number
    audioErrors: number
    transcriptionErrors: number
    lastErrorTime?: number
  }
}

// ========================
// Main Client Class
// ========================

export class GCPGeminiLiveClient extends EventEmitter {
  private config: ResolvedGCPLiveClientConfig
  private sdkManager: GCPSDKManager
  private sdkInstance: GCPSDKInstance | null = null
  private liveSession: LiveSession | null = null
  private currentSession: LiveStreamingSession | null = null
  private configManager: WebSocketConfigurationManager

  // Error handling and recovery
  private errorHandler: GeminiErrorHandler

  // State management
  private isInitialized = false
  private isConnecting = false
  private isConnected = false
  private isStreaming = false
  private isDestroyed = false

  // Performance and monitoring
  private metrics: ClientMetrics
  private startTime: number
  private lastActivityTime: number
  private connectionAttempts = 0

  // Audio streaming
  private audioBuffer: ArrayBuffer[] = []
  private streamingInterval: NodeJS.Timeout | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null
  private audioFormatConverter: AudioFormatConverter | null = null
  private audioStreamingService: RealTimeAudioStreamingService | null = null

  // Transcription result management
  private transcriptionResults: Map<string, TranscriptionResult> = new Map()
  private partialResults: Map<string, TranscriptionResult> = new Map()
  private resultSequence = 0

  // Reconnection logic
  private reconnectTimer: NodeJS.Timeout | null = null
  private shouldReconnect = true

  constructor(config: GCPLiveClientConfig = {}) {
    super()

    // Merge config with defaults (including low-latency optimizations)
    this.config = this.mergeWithDefaults(config)

    // Initialize WebSocket configuration manager for real-time optimization
    this.configManager = getWebSocketConfigurationManager()

    // Initialize SDK manager
    this.sdkManager = gcpSDK

    // Initialize error handler with circuit breaker configuration
    this.errorHandler = new GeminiErrorHandler({
      maxErrorHistory: 1000,
      maxLogHistory: 5000,
      logLevel: this.getLogLevelFromString(this.config.logLevel),
      circuitBreakerConfig: this.config.errorHandling.circuitBreaker
    })

    // Configure recovery strategies
    this.configureRecoveryStrategies()

    // Initialize metrics
    this.startTime = Date.now()
    this.lastActivityTime = this.startTime
    this.metrics = this.initializeMetrics()

    // Set up error handling
    this.setupErrorHandling()

    logger.info('GCPGeminiLiveClient created', {
      model: this.config.model.name,
      audioEnabled: this.config.model.enableNativeAudio,
      debug: this.config.debug,
      autoRecovery: this.config.errorHandling.enableAutoRecovery,
      circuitBreaker: this.config.errorHandling.circuitBreaker
    })
  }

  // ========================
  // Initialization Methods
  // ========================

  /**
   * Merge user configuration with sensible defaults
   */
  private mergeWithDefaults(config: GCPLiveClientConfig): ResolvedGCPLiveClientConfig {
    // Get low-latency WebSocket configuration for real-time performance
    const lowLatencyConfig = createLowLatencyConfig()

    return {
      authentication: {
        apiKey: config.authentication?.apiKey || process.env.GEMINI_API_KEY || '',
        serviceAccountPath: config.authentication?.serviceAccountPath,
        projectId: config.authentication?.projectId || process.env.GCP_PROJECT_ID
      },
      model: this.resolveModelConfig(config),
      audio: {
        inputSampleRate: config.audio?.inputSampleRate || 16000,
        outputSampleRate: config.audio?.outputSampleRate || 24000,
        format: config.audio?.format || 'pcm16',
        encoding: config.audio?.encoding || 'linear16',
        channels: config.audio?.channels || 1,
        chunkSize: config.audio?.chunkSize || 4096
      },
      websocket: {
        // Apply low-latency configuration with user overrides
        timeout: config.websocket?.timeout || (lowLatencyConfig.timeout as number),
        autoReconnect: config.websocket?.autoReconnect ?? true,
        maxReconnectAttempts: config.websocket?.maxReconnectAttempts || 5,
        reconnectDelay:
          config.websocket?.reconnectDelay || (lowLatencyConfig.reconnectDelay as number),
        exponentialBackoff:
          config.websocket?.exponentialBackoff ?? (lowLatencyConfig.exponentialBackoff as boolean),
        heartbeatInterval:
          config.websocket?.heartbeatInterval || (lowLatencyConfig.heartbeatInterval as number)
      },
      performance: {
        enableMonitoring: config.performance?.enableMonitoring ?? true,
        bufferSize: config.performance?.bufferSize || 8192,
        maxQueueSize: config.performance?.maxQueueSize || 100,
        enableDetailedLogging: config.performance?.enableDetailedLogging ?? false
      },
      errorHandling: {
        enableAutoRecovery: config.errorHandling?.enableAutoRecovery ?? true,
        maxRetries: config.errorHandling?.maxRetries || 3,
        circuitBreaker: {
          failureThreshold: config.errorHandling?.circuitBreaker?.failureThreshold || 5,
          successThreshold: 3,
          timeout: config.errorHandling?.circuitBreaker?.timeout || 60000,
          monitoringPeriod: config.errorHandling?.circuitBreaker?.monitoringPeriod || 300000
        },
        recoveryStrategies: {
          network:
            config.errorHandling?.recoveryStrategies?.network ||
            RecoveryStrategy.EXPONENTIAL_BACKOFF,
          websocket:
            config.errorHandling?.recoveryStrategies?.websocket || RecoveryStrategy.CIRCUIT_BREAKER,
          authentication:
            config.errorHandling?.recoveryStrategies?.authentication || RecoveryStrategy.NONE,
          timeout:
            config.errorHandling?.recoveryStrategies?.timeout || RecoveryStrategy.LINEAR_BACKOFF,
          rateLimit: RecoveryStrategy.EXPONENTIAL_BACKOFF,
          serviceUnavailable: RecoveryStrategy.CIRCUIT_BREAKER
        }
      },
      debug: config.debug ?? process.env.NODE_ENV === 'development',
      logLevel: config.logLevel || 'info'
    }
  }

  /**
   * Convert string log level to LogLevel enum
   */
  private getLogLevelFromString(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error':
        return LogLevel.ERROR
      case 'warn':
        return LogLevel.WARN
      case 'info':
        return LogLevel.INFO
      case 'debug':
        return LogLevel.DEBUG
      default:
        return LogLevel.INFO
    }
  }

  /**
   * Configure recovery strategies based on configuration
   */
  private configureRecoveryStrategies(): void {
    const strategies = this.config.errorHandling.recoveryStrategies

    // Configure recovery strategies for different error types
    this.errorHandler.configureRecoveryStrategy(ErrorType.NETWORK, {
      strategy: strategies.network,
      maxAttempts: this.config.errorHandling.maxRetries,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2
    })

    this.errorHandler.configureRecoveryStrategy(ErrorType.WEBSOCKET, {
      strategy: strategies.websocket,
      maxAttempts: this.config.errorHandling.maxRetries,
      baseDelay: 5000,
      maxDelay: 60000,
      backoffMultiplier: 2
    })

    this.errorHandler.configureRecoveryStrategy(ErrorType.AUTHENTICATION, {
      strategy: strategies.authentication,
      maxAttempts: 0,
      baseDelay: 0,
      maxDelay: 0,
      backoffMultiplier: 1
    })

    this.errorHandler.configureRecoveryStrategy(ErrorType.TIMEOUT, {
      strategy: strategies.timeout,
      maxAttempts: this.config.errorHandling.maxRetries,
      baseDelay: 2000,
      maxDelay: 10000,
      backoffMultiplier: 1.5
    })

    this.errorHandler.configureRecoveryStrategy(ErrorType.RATE_LIMIT, {
      strategy: strategies.rateLimit,
      maxAttempts: this.config.errorHandling.maxRetries,
      baseDelay: 5000,
      maxDelay: 300000,
      backoffMultiplier: 2
    })

    this.errorHandler.configureRecoveryStrategy(ErrorType.SERVICE_UNAVAILABLE, {
      strategy: strategies.serviceUnavailable,
      maxAttempts: this.config.errorHandling.maxRetries,
      baseDelay: 10000,
      maxDelay: 120000,
      backoffMultiplier: 2
    })
  }

  /**
   * Resolve and validate model configuration
   */
  private resolveModelConfig(config: GCPLiveClientConfig): ResolvedGCPLiveClientConfig['model'] {
    const modelName = config.model?.name || GeminiLiveModel.NATIVE_AUDIO
    const modelType = this.parseModelType(modelName)
    const spec = MODEL_SPECS[modelType]

    if (!spec) {
      throw new Error(`Unsupported model: ${modelName}`)
    }

    // Validate model configuration
    const validation = this.validateModelConfigurationInternal(config, spec)
    if (!validation.isValid) {
      throw new Error(`Model configuration invalid: ${validation.errors.join(', ')}`)
    }

    return {
      name: spec.id,
      modelType,
      spec,
      enableNativeAudio: config.model?.enableNativeAudio ?? spec.supportsNativeAudio,
      enableTextMode: config.model?.enableTextMode ?? spec.supportsTextMode,
      config: {
        lowLatency: config.model?.config?.lowLatency ?? spec.configOptions.lowLatency ?? false,
        voiceActivityDetection:
          config.model?.config?.voiceActivityDetection ??
          spec.configOptions.voiceActivityDetection ??
          false,
        automaticGainControl:
          config.model?.config?.automaticGainControl ??
          spec.configOptions.automaticGainControl ??
          false,
        noiseSuppression:
          config.model?.config?.noiseSuppression ?? spec.configOptions.noiseSuppression ?? false,
        echoCancellation:
          config.model?.config?.echoCancellation ?? spec.configOptions.echoCancellation ?? false
      },
      performance: {
        maxSessionDuration:
          config.model?.performance?.maxSessionDuration ?? spec.maxSessionDuration,
        chunkSize: config.model?.performance?.chunkSize ?? Math.min(spec.maxChunkSize, 4096),
        enableMonitoring: config.model?.performance?.enableMonitoring ?? true
      },
      fallback: config.model?.fallback
        ? {
            model: config.model.fallback.model,
            spec: MODEL_SPECS[config.model.fallback.model],
            autoFallback: config.model.fallback.autoFallback ?? true,
            maxAttempts: config.model.fallback.maxAttempts ?? 3
          }
        : undefined
    }
  }

  /**
   * Parse model name to GeminiLiveModel enum
   */
  private parseModelType(modelName: string): GeminiLiveModel {
    // Direct enum match
    if (Object.values(GeminiLiveModel).includes(modelName as GeminiLiveModel)) {
      return modelName as GeminiLiveModel
    }

    // Handle legacy/alternative names
    switch (modelName.toLowerCase()) {
      case 'native-audio':
      case 'native_audio':
      case 'gemini-2.5-flash-preview-native-audio-dialog':
        return GeminiLiveModel.NATIVE_AUDIO
      case 'half-cascade':
      case 'half_cascade':
      case 'live':
      case 'gemini-2.0-flash-live-001':
        return GeminiLiveModel.HALF_CASCADE
      default:
        // Default to native audio for unknown models
        logger.warn(`Unknown model ${modelName}, defaulting to ${GeminiLiveModel.NATIVE_AUDIO}`)
        return GeminiLiveModel.NATIVE_AUDIO
    }
  }

  /**
   * Validate model configuration against model specifications (private)
   */
  private validateModelConfigurationInternal(
    config: GCPLiveClientConfig,
    spec: ModelSpec
  ): ModelValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const recommendations: string[] = []

    // Validate audio configuration compatibility
    if (
      config.audio?.format &&
      !spec.supportedInputFormats.includes(config.audio.format as AudioFormat)
    ) {
      errors.push(`Audio format ${config.audio.format} not supported by model ${spec.id}`)
    }

    if (
      config.audio?.inputSampleRate &&
      !spec.inputSampleRates.includes(config.audio.inputSampleRate)
    ) {
      errors.push(
        `Input sample rate ${config.audio.inputSampleRate} not supported by model ${spec.id}`
      )
    }

    if (config.audio?.chunkSize) {
      if (config.audio.chunkSize > spec.maxChunkSize) {
        errors.push(
          `Chunk size ${config.audio.chunkSize} exceeds maximum ${spec.maxChunkSize} for model ${spec.id}`
        )
      }
      if (config.audio.chunkSize < spec.minChunkSize) {
        errors.push(
          `Chunk size ${config.audio.chunkSize} below minimum ${spec.minChunkSize} for model ${spec.id}`
        )
      }
    }

    // Validate feature compatibility
    if (config.model?.enableNativeAudio && !spec.supportsNativeAudio) {
      errors.push(`Native audio not supported by model ${spec.id}`)
    }

    if (config.model?.enableTextMode && !spec.supportsTextMode) {
      warnings.push(`Text-only mode not supported by model ${spec.id}`)
    }

    // Performance recommendations
    if (spec.configOptions.lowLatency && !config.model?.config?.lowLatency) {
      recommendations.push(`Enable low-latency mode for optimal performance with ${spec.id}`)
    }

    if (
      spec.configOptions.voiceActivityDetection &&
      !config.model?.config?.voiceActivityDetection
    ) {
      recommendations.push(`Enable voice activity detection for better transcription accuracy`)
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recommendations,
      compatibleConfiguration:
        errors.length === 0 ? undefined : this.generateCompatibleConfiguration(config, spec)
    }
  }

  /**
   * Generate a compatible configuration for a model
   */
  private generateCompatibleConfiguration(
    config: GCPLiveClientConfig,
    spec: ModelSpec
  ): Partial<GCPLiveClientConfig> {
    return {
      model: {
        name: spec.id,
        enableNativeAudio: spec.supportsNativeAudio,
        enableTextMode: spec.supportsTextMode,
        config: spec.configOptions
      },
      audio: {
        format: spec.supportedInputFormats[0].toLowerCase() as 'pcm16' | 'pcm24' | 'float32',
        inputSampleRate: spec.inputSampleRates[0],
        outputSampleRate: spec.outputSampleRates[0],
        chunkSize: Math.min(spec.maxChunkSize, 4096)
      }
    }
  }

  /**
   * Initialize performance metrics
   */
  private initializeMetrics(): ClientMetrics {
    return {
      connection: {
        state: 'disconnected',
        uptime: 0,
        reconnectAttempts: 0
      },
      audio: {
        totalBytesSent: 0,
        totalBytesReceived: 0,
        chunksProcessed: 0,
        averageChunkSize: 0,
        streamingDuration: 0
      },
      performance: {
        averageLatency: 0,
        messagesPerSecond: 0,
        errorsPerMinute: 0,
        memoryUsage: 0
      },
      errors: {
        total: 0,
        connectionErrors: 0,
        audioErrors: 0,
        transcriptionErrors: 0
      }
    }
  }

  /**
   * Set up comprehensive error handling and recovery
   */
  private setupErrorHandling(): void {
    // Handle client errors with comprehensive error handler
    this.on('error', async error => {
      this.metrics.errors.total++
      this.metrics.errors.lastErrorTime = Date.now()

      // Process error with error handler and attempt recovery if enabled
      const result = await this.errorHandler.handleErrorWithRecovery(
        error,
        {
          clientState: {
            isInitialized: this.isInitialized,
            isConnecting: this.isConnecting,
            isConnected: this.isConnected,
            isStreaming: this.isStreaming
          },
          metrics: this.metrics.errors
        },
        {
          attemptRecovery: this.config.errorHandling.enableAutoRecovery,
          maxRetries: this.config.errorHandling.maxRetries
        }
      )

      // Update specific error counters
      this.updateErrorCounters(result.error)

      // Emit recovery events
      if (result.recovered) {
        this.emit('recovered', result.error)
        logger.info('Successfully recovered from error', {errorId: result.error.id})
      } else {
        this.emit('error:unrecoverable', result.error)
        logger.error('Failed to recover from error', {errorId: result.error.id})
      }
    })

    // Set up error handler event listeners for detailed monitoring
    this.errorHandler.on('error', (geminiError: GeminiError) => {
      // Emit specific error type events
      this.emit(`error:${geminiError.type}`, geminiError)
    })

    this.errorHandler.on('recovery:attempt', ({recovery, attempt, delay}) => {
      logger.debug('Recovery attempt', {errorId: recovery.errorId, attempt, delay})
      this.emit('recovery:attempt', {recovery, attempt, delay})
    })

    this.errorHandler.on('recovery:success', ({error, recovery}) => {
      logger.info('Recovery successful', {errorId: error.id, strategy: recovery.strategy})
      this.emit('recovery:success', {error, recovery})
    })

    this.errorHandler.on('recovery:failed', ({error, recovery}) => {
      logger.warn('Recovery failed', {errorId: error.id, strategy: recovery.strategy})
      this.emit('recovery:failed', {error, recovery})
    })

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      const context = {
        source: 'unhandledRejection',
        promise: promise.toString(),
        clientState: {
          isInitialized: this.isInitialized,
          isConnected: this.isConnected
        }
      }

      this.errorHandler.handleError(reason, context, {
        type: ErrorType.UNKNOWN,
        retryable: false
      })
    })

    // Set up circuit breaker monitoring
    this.setupCircuitBreakerMonitoring()
  }

  /**
   * Update specific error counters based on error type
   */
  private updateErrorCounters(geminiError: GeminiError): void {
    switch (geminiError.type) {
      case ErrorType.NETWORK:
      case ErrorType.CONNECTION_REFUSED:
      case ErrorType.DNS_ERROR:
      case ErrorType.SSL_ERROR:
      case ErrorType.WEBSOCKET:
        this.metrics.errors.connectionErrors++
        break
      case ErrorType.API:
      case ErrorType.PARSE_ERROR:
        this.metrics.errors.transcriptionErrors++
        break
      case ErrorType.TIMEOUT:
        // No specific timeout counter in metrics, use general error counter
        break
      default:
        // General error counter already updated in main error handler
        break
    }
  }

  /**
   * Set up circuit breaker monitoring and state management
   */
  private setupCircuitBreakerMonitoring(): void {
    // Monitor circuit breaker state changes
    setInterval(() => {
      const status = this.errorHandler.getCircuitBreakerStatus()

      if (status.state !== CircuitBreakerState.CLOSED) {
        logger.warn('Circuit breaker state', {
          state: status.state,
          failureCount: status.failureCount,
          lastFailureTime: status.lastFailureTime
        })

        this.emit('circuit-breaker:state-change', status)

        // Update connection status if circuit is open
        if (status.state === CircuitBreakerState.OPEN) {
          this.metrics.connection.state = 'failed'
          this.metrics.connection.lastError = 'Circuit breaker open - too many failures'
        }
      }
    }, 10000) // Check every 10 seconds
  }

  // ========================
  // Connection Management
  // ========================

  /**
   * Initialize the client with GCP SDK
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('GCPGeminiLiveClient already initialized')
      return
    }

    // Check circuit breaker before attempting initialization
    if (!this.errorHandler.canProceed()) {
      const error = new Error('Cannot initialize: circuit breaker is open')
      this.emit('error', error)
      throw error
    }

    try {
      logger.info('Initializing GCPGeminiLiveClient...')

      // Initialize GCP SDK with timeout
      const initializationPromise = this.initializeSDK()
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Initialization timeout')), 30000)
      })

      await Promise.race([initializationPromise, timeoutPromise])

      this.isInitialized = true

      // Record success for circuit breaker
      this.errorHandler.recordSuccess()

      logger.info('GCPGeminiLiveClient initialized successfully', {
        authMethod: this.sdkInstance?.authResult.method,
        model: this.config.model.name
      })

      this.emit('initialized')
    } catch (error) {
      // Handle error with comprehensive error handler
      const result = await this.errorHandler.handleErrorWithRecovery(
        error,
        {
          operation: 'initialize',
          config: {
            apiKey: !!this.config.authentication.apiKey,
            projectId: this.config.authentication.projectId
          }
        },
        {
          type: ErrorType.AUTHENTICATION,
          attemptRecovery: this.config.errorHandling.enableAutoRecovery,
          maxRetries: this.config.errorHandling.maxRetries
        }
      )

      this.emit('error', result.error)
      throw new Error(`Initialization failed: ${result.error.message}`)
    }
  }

  /**
   * Initialize GCP SDK with proper error handling
   */
  private async initializeSDK(): Promise<void> {
    const sdkConfig = {
      apiKey: this.config.authentication.apiKey,
      project: {
        id: this.config.authentication.projectId
      },
      debug: this.config.debug,
      logLevel: this.config.logLevel
    }

    this.sdkInstance = await this.sdkManager.initialize(sdkConfig)

    if (!this.sdkInstance.status.initialized) {
      throw new Error('GCP SDK initialization failed')
    }
  }

  /**
   * Connect to Gemini Live API
   */
  async connect(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    if (this.isConnected || this.isConnecting) {
      logger.warn('Already connected or connecting')
      return
    }

    // Check circuit breaker before attempting connection
    if (!this.errorHandler.canProceed()) {
      const error = new Error('Cannot connect: circuit breaker is open')
      this.emit('error', error)
      throw error
    }

    // Optimize configuration based on current network conditions
    const optimizedConfig = this.configManager.getGCPOptimizedConfig()
    if (optimizedConfig) {
      // Apply optimized WebSocket settings
      this.config = {
        ...this.config,
        websocket: {
          ...this.config.websocket,
          timeout: (optimizedConfig.timeout as number) || this.config.websocket.timeout,
          reconnectDelay:
            (optimizedConfig.reconnectDelay as number) || this.config.websocket.reconnectDelay,
          heartbeatInterval:
            (optimizedConfig.heartbeatInterval as number) || this.config.websocket.heartbeatInterval
        }
      }
      logger.info('Applied optimized WebSocket configuration for low latency', {
        timeout: this.config.websocket.timeout,
        reconnectDelay: this.config.websocket.reconnectDelay,
        heartbeatInterval: this.config.websocket.heartbeatInterval
      })
    }

    // Start WebSocket connection diagnostics
    const diagnostics = getWebSocketDiagnostics()
    diagnostics.startConnection()
    startWebSocketTiming('total-connection', {
      model: this.config.model.name,
      attempt: this.connectionAttempts + 1
    })

    this.isConnecting = true
    this.connectionAttempts++
    this.metrics.connection.state = 'connecting'

    try {
      logger.info('Connecting to Gemini Live API...', {
        model: this.config.model.name,
        attempt: this.connectionAttempts
      })

      // Create connection with timeout
      startWebSocketTiming('create-connection', {model: this.config.model.name})
      const connectionPromise = this.createLiveConnection()
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), this.config.websocket.timeout)
      })

      await Promise.race([connectionPromise, timeoutPromise])
      endWebSocketTiming('create-connection')

      this.isConnected = true
      this.isConnecting = false
      this.metrics.connection.state = 'connected'
      this.metrics.connection.reconnectAttempts = this.connectionAttempts - 1

      // Record success for circuit breaker
      this.errorHandler.recordSuccess()

      // Complete connection diagnostics
      diagnostics.connectionEstablished()
      const totalConnectionTime = endWebSocketTiming('total-connection')
      logWebSocketTiming('connection-success', totalConnectionTime, {
        model: this.config.model.name,
        sessionId: this.currentSession?.id,
        optimizedConfig: {
          timeout: this.config.websocket.timeout,
          reconnectDelay: this.config.websocket.reconnectDelay,
          heartbeatInterval: this.config.websocket.heartbeatInterval
        }
      })

      // Start heartbeat if enabled
      if (this.config.websocket?.heartbeatInterval && this.config.websocket.heartbeatInterval > 0) {
        this.startHeartbeat()
      }

      logger.info('Successfully connected to Gemini Live API', {
        sessionId: this.currentSession?.id,
        model: this.config.model.name,
        connectionTime: `${totalConnectionTime.toFixed(2)}ms`
      })

      this.emit('connected', this.currentSession)
    } catch (error) {
      this.isConnecting = false
      this.metrics.connection.state = 'failed'

      // Record connection failure in diagnostics
      endWebSocketTiming('total-connection')
      diagnostics.connectionRetry()
      logWebSocketTiming('connection-failed', 0, {
        error: error instanceof Error ? error.message : 'Unknown error',
        attempt: this.connectionAttempts
      })

      // Handle error with comprehensive error handler
      const result = await this.errorHandler.handleErrorWithRecovery(
        error,
        {
          operation: 'connect',
          attempt: this.connectionAttempts,
          model: this.config.model.name,
          websocketConfig: this.config.websocket
        },
        {
          type: this.classifyConnectionError(error),
          attemptRecovery:
            this.config.errorHandling.enableAutoRecovery && this.config.websocket.autoReconnect,
          maxRetries: this.config.errorHandling.maxRetries
        }
      )

      this.emit('error', result.error)

      // Attempt reconnection if recovery succeeded or if configured for auto-reconnect
      if (result.recovered || (this.config.websocket.autoReconnect && this.shouldReconnect)) {
        this.scheduleReconnection()
      }

      throw new Error(`Connection failed: ${result.error.message}`)
    }
  }

  /**
   * Create live connection with proper session tracking
   */
  private async createLiveConnection(): Promise<void> {
    // Create Live API session
    this.liveSession = await this.sdkManager.createLiveSession({
      model: this.config.model.name,
      enableNativeAudio: this.config.model.enableNativeAudio,
      onMessage: this.handleLiveMessage.bind(this),
      onError: this.handleLiveError.bind(this)
    })

    // Create session tracking
    this.currentSession = {
      id: this.liveSession.id,
      status: 'connected',
      model: this.config.model.name,
      audioConfig: this.getAudioStreamConfig(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
      bytesStreamed: 0,
      messagesSent: 0,
      messagesReceived: 0
    }
  }

  /**
   * Classify connection errors for appropriate handling
   */
  private classifyConnectionError(error: unknown): ErrorType {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()

      if (message.includes('timeout')) {
        return ErrorType.TIMEOUT
      } else if (message.includes('websocket') || message.includes('connection')) {
        return ErrorType.WEBSOCKET
      } else if (message.includes('network') || message.includes('dns')) {
        return ErrorType.NETWORK
      } else if (message.includes('auth') || message.includes('unauthorized')) {
        return ErrorType.AUTHENTICATION
      } else if (message.includes('service unavailable') || message.includes('503')) {
        return ErrorType.SERVICE_UNAVAILABLE
      } else if (message.includes('rate limit') || message.includes('429')) {
        return ErrorType.RATE_LIMIT
      }
    }

    return ErrorType.UNKNOWN
  }

  /**
   * Disconnect from Gemini Live API
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      logger.warn('Not connected')
      return
    }

    this.shouldReconnect = false

    try {
      logger.info('Disconnecting from Gemini Live API...')

      // Stop streaming if active
      if (this.isStreaming) {
        await this.stopStreaming()
      }

      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval)
        this.heartbeatInterval = null
      }

      // Close Live API session
      if (this.liveSession) {
        await this.liveSession.close()
        this.liveSession = null
      }

      // Update state
      this.isConnected = false
      this.metrics.connection.state = 'disconnected'

      if (this.currentSession) {
        this.currentSession.status = 'disconnected'
      }

      logger.info('Successfully disconnected from Gemini Live API')
      this.emit('disconnected', this.currentSession)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Error during disconnection', {error: errorMessage})
      this.emit('error', new Error(`Disconnection error: ${errorMessage}`))
    }
  }

  // ========================
  // Streaming Methods - Placeholder
  // ========================

  /**
   * Start audio streaming with real-time capture and processing
   */
  async startStreaming(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to Gemini Live API')
    }

    if (this.isStreaming) {
      logger.warn('Already streaming')
      return
    }

    try {
      // Initialize audio format converter
      if (!this.audioFormatConverter) {
        this.audioFormatConverter = createAudioFormatConverter({
          inputFormat: {
            sampleRate: 48000, // Web Audio API default
            channels: this.config.audio.channels,
            bitDepth: 32 // Float32 from Web Audio API
          },
          outputFormat: {
            format: AudioFormat.PCM16,
            sampleRate: this.config.audio.inputSampleRate, // 16kHz for Gemini
            channels: this.config.audio.channels,
            bitDepth: 16
          },
          enableCompression: false,
          qualityLevel: 8,
          lowLatencyMode: true
        })

        await this.audioFormatConverter.initialize()
      }

      // Initialize audio streaming service
      if (!this.audioStreamingService) {
        this.audioStreamingService = createRealTimeAudioStreaming({
          sampleRate: 48000, // Web Audio API default
          channelCount: this.config.audio.channels,
          bitDepth: 32, // Float32
          bufferSize: this.config.audio.chunkSize,
          enableVAD: false, // Disable VAD for continuous streaming
          vadThreshold: 0.01,
          chunkDurationMs: 100, // 100ms chunks for low latency
          maxBufferSize: 32768,
          throttleDelayMs: 50
        })

        // Set up audio chunk handler
        this.audioStreamingService.on('audioChunk', this.handleAudioChunk.bind(this))
        this.audioStreamingService.on('error', this.handleAudioStreamingError.bind(this))
      }

      // Start audio capture
      await this.audioStreamingService.startStreaming()

      this.isStreaming = true

      if (this.currentSession) {
        this.currentSession.status = 'streaming'
      }

      logger.info('Audio streaming started', {
        sampleRate: this.config.audio.inputSampleRate,
        channels: this.config.audio.channels,
        format: this.config.audio.format
      })

      this.emit('streamingStarted')
    } catch (error) {
      this.isStreaming = false
      this.metrics.errors.audioErrors++

      logger.error('Failed to start audio streaming', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: this.currentSession?.id
      })

      this.emit('error', error)
      throw error
    }
  }

  /**
   * Stop audio streaming with proper cleanup
   */
  async stopStreaming(): Promise<void> {
    if (!this.isStreaming) {
      logger.warn('Not currently streaming')
      return
    }

    try {
      this.isStreaming = false

      // Stop audio streaming service
      if (this.audioStreamingService) {
        await this.audioStreamingService.stopStreaming()
      }

      // Clear audio buffer
      this.audioBuffer = []

      if (this.currentSession) {
        this.currentSession.status = 'connected'
      }

      logger.info('Audio streaming stopped')
      this.emit('streamingStopped')
    } catch (error) {
      this.metrics.errors.audioErrors++

      logger.error('Error stopping audio streaming', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: this.currentSession?.id
      })

      this.emit('error', error)
      throw error
    }
  }

  /**
   * Handle incoming audio chunks from the streaming service
   */
  private async handleAudioChunk(chunk: AudioChunk): Promise<void> {
    if (!this.isStreaming || !this.liveSession || !this.audioFormatConverter) {
      return
    }

    try {
      const startTime = Date.now()

      // Convert audio format to 16-bit PCM, 16kHz
      const convertedAudio = await this.audioFormatConverter.convert(chunk.data, chunk.timestamp)

      // Convert to Base64 for WebSocket transmission
      const base64Data = Buffer.from(convertedAudio.data).toString('base64')

      // Send realtime input to Gemini Live API
      await this.liveSession.sendRealtimeInput({
        audio: {
          data: base64Data,
          mimeType: `audio/pcm;rate=${this.config.audio.inputSampleRate}`
        }
      })

      // Update metrics
      this.metrics.audio.totalBytesSent += convertedAudio.data.byteLength
      this.metrics.audio.chunksProcessed++
      this.metrics.audio.averageChunkSize =
        (this.metrics.audio.averageChunkSize * (this.metrics.audio.chunksProcessed - 1) +
          convertedAudio.data.byteLength) /
        this.metrics.audio.chunksProcessed

      const processingTime = Date.now() - startTime
      this.metrics.performance.averageLatency =
        (this.metrics.performance.averageLatency + processingTime) / 2

      if (this.config.performance.enableDetailedLogging) {
        logger.debug('Audio chunk processed and sent', {
          originalSize: chunk.data.length * 4, // Float32 is 4 bytes per sample
          convertedSize: convertedAudio.data.byteLength,
          processingTime,
          sessionId: this.currentSession?.id
        })
      }

      this.emit('audioChunkSent', {
        size: convertedAudio.data.byteLength,
        timestamp: chunk.timestamp,
        processingTime,
        sessionId: this.currentSession?.id
      })
    } catch (error) {
      this.metrics.errors.audioErrors++

      logger.error('Error processing audio chunk', {
        error: error instanceof Error ? error.message : 'Unknown error',
        chunkSize: chunk.data.length,
        timestamp: chunk.timestamp,
        sessionId: this.currentSession?.id
      })

      this.emit('error', error)
    }
  }

  /**
   * Handle audio streaming errors
   */
  private handleAudioStreamingError(error: Error): void {
    this.metrics.errors.audioErrors++

    logger.error('Audio streaming error', {
      error: error.message,
      sessionId: this.currentSession?.id
    })

    this.emit('audioStreamingError', error)
  }

  // ========================
  // Utility Methods
  // ========================

  /**
   * Get audio stream configuration
   */
  private getAudioStreamConfig(): AudioStreamConfig {
    const {audio} = this.config

    return {
      mimeType: `audio/pcm;rate=${audio.inputSampleRate}`,
      sampleRate: audio.inputSampleRate,
      channels: audio.channels,
      bitsPerSample: audio.format === 'pcm16' ? 16 : audio.format === 'pcm24' ? 24 : 32,
      encoding: audio.encoding
    }
  }

  /**
   * Handle incoming Live API messages with comprehensive result processing
   */
  private handleLiveMessage(message: LiveSessionMessage): void {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const diagnostics = getWebSocketDiagnostics()

    // Start message processing timing
    diagnostics.startMessageProcessing(messageId, 'gemini-live')
    startWebSocketTiming(`message-${messageId}`, {
      hasServerContent: !!message.serverContent,
      hasModelTurn: !!message.serverContent?.modelTurn,
      turnComplete: message.serverContent?.turnComplete
    })

    this.lastActivityTime = Date.now()

    if (this.currentSession) {
      this.currentSession.messagesReceived++
      this.currentSession.lastActivity = this.lastActivityTime
    }

    // Immediate processing for real-time performance
    // Process message content immediately without queuing or batching
    if (message.serverContent?.modelTurn) {
      // Use setImmediate for next-tick processing to avoid blocking
      setImmediate(() => {
        startWebSocketTiming(`process-model-turn-${messageId}`, {
          turnComplete: message.serverContent!.turnComplete,
          partsCount: message.serverContent!.modelTurn!.parts.length
        })

        this.processModelTurn(
          message.serverContent!.modelTurn!,
          message.serverContent!.turnComplete || false,
          messageId
        )

        endWebSocketTiming(`process-model-turn-${messageId}`)
      })
    }

    // Handle server content if present (legacy processing for compatibility)
    if (message.serverContent) {
      if (this.config.performance.enableDetailedLogging) {
        logger.debug('Received Live API server content', {
          hasModelTurn: !!message.serverContent.modelTurn,
          turnComplete: message.serverContent.turnComplete,
          sessionId: this.currentSession?.id,
          messageId
        })
      }

      // Handle turn completion (only process this if not already handled in immediate processing)
      if (message.serverContent.turnComplete && !message.serverContent.modelTurn) {
        startWebSocketTiming(`turn-completion-${messageId}`)
        this.handleTurnCompletion()
        endWebSocketTiming(`turn-completion-${messageId}`)
      }
    }

    // Complete message processing timing
    const messageProcessingTime = endWebSocketTiming(`message-${messageId}`)
    diagnostics.completeMessageProcessing(messageId, Date.now())

    // Update metrics
    this.metrics.performance.messagesPerSecond =
      (this.metrics.performance.messagesPerSecond + 1) / 2

    logWebSocketTiming('message-processed', messageProcessingTime, {
      messageId,
      hasServerContent: !!message.serverContent,
      sessionId: this.currentSession?.id
    })

    this.emit('message', message)
  }

  /**
   * Process model turn with enhanced transcription result handling
   */
  private processModelTurn(
    modelTurn: ModelTurn,
    isTurnComplete: boolean,
    messageId?: string
  ): void {
    const timestamp = Date.now()
    const resultId = `result_${this.resultSequence++}_${timestamp}`
    const processingId = messageId ? `processing-${messageId}` : `processing-${resultId}`

    // Start transcription processing timing
    startWebSocketTiming(processingId, {
      isTurnComplete,
      partsCount: modelTurn.parts.length
    })

    // Extract text content
    const textParts = modelTurn.parts.filter((part: MessagePart) => part.text)
    const transcribedText = textParts.map((part: MessagePart) => part.text).join('')

    if (transcribedText.trim()) {
      // Create transcription result
      const result: TranscriptionResult = {
        id: resultId,
        text: transcribedText,
        timestamp: timestamp,
        isFinal: isTurnComplete,
        isPartial: !isTurnComplete,
        sessionId: this.currentSession?.id,
        sequence: this.resultSequence,
        confidence: 1.0, // Gemini doesn't provide confidence scores
        model: this.config.model.name,
        metadata: {
          turnComplete: isTurnComplete,
          partCount: textParts.length,
          messageId
        }
      }

      // Store result based on whether it's final or partial
      if (isTurnComplete) {
        // Store as final result
        this.transcriptionResults.set(resultId, result)

        // Remove any partial results that this final result replaces
        this.cleanupPartialResults(result)

        // Update metrics
        this.metrics.audio.totalBytesReceived += transcribedText.length

        // Log timing for final transcription
        const processingTime = endWebSocketTiming(processingId)
        logWebSocketTiming('final-transcription-processed', processingTime, {
          resultId,
          textLength: transcribedText.length,
          sessionId: this.currentSession?.id,
          messageId
        })

        logger.info('Final transcription result received', {
          resultId,
          textLength: transcribedText.length,
          sessionId: this.currentSession?.id,
          processingTime: `${processingTime.toFixed(2)}ms`
        })

        this.emit('transcriptionResult', result)
        this.emit('finalTranscriptionResult', result)
      } else {
        // Store as partial result
        this.partialResults.set(resultId, result)

        // Log timing for partial transcription
        const processingTime = endWebSocketTiming(processingId)
        logWebSocketTiming('partial-transcription-processed', processingTime, {
          resultId,
          textLength: transcribedText.length,
          sessionId: this.currentSession?.id,
          messageId
        })

        if (this.config.performance.enableDetailedLogging) {
          logger.debug('Partial transcription result received', {
            resultId,
            textLength: transcribedText.length,
            sessionId: this.currentSession?.id,
            processingTime: `${processingTime.toFixed(2)}ms`
          })
        }

        this.emit('transcriptionResult', result)
        this.emit('partialTranscriptionResult', result)
      }
    } else {
      // No text content, still complete timing
      endWebSocketTiming(processingId)
    }

    // Handle audio response parts
    const audioParts = modelTurn.parts.filter((part: MessagePart) =>
      part.inlineData?.mimeType?.startsWith('audio/')
    )

    if (audioParts.length > 0) {
      const audioResponse: AudioResponse = {
        audioData: audioParts.map((part: MessagePart) => part.inlineData?.data || ''),
        mimeType: audioParts[0].inlineData?.mimeType || 'audio/pcm',
        timestamp: timestamp,
        sessionId: this.currentSession?.id
      }

      logger.info('Audio response received', {
        audioPartsCount: audioParts.length,
        mimeType: audioResponse.mimeType,
        sessionId: this.currentSession?.id
      })

      this.emit('audioResponse', audioResponse)
    }
  }

  /**
   * Handle turn completion - finalize partial results
   */
  private handleTurnCompletion(): void {
    // Convert remaining partial results to final results
    const partialResultsArray = Array.from(this.partialResults.values())

    partialResultsArray.forEach(partialResult => {
      const finalResult: TranscriptionResult = {
        ...partialResult,
        isFinal: true,
        isPartial: false,
        metadata: {
          ...partialResult.metadata,
          convertedFromPartial: true
        }
      }

      // Move to final results
      this.transcriptionResults.set(partialResult.id, finalResult)
      this.partialResults.delete(partialResult.id)

      this.emit('finalTranscriptionResult', finalResult)
    })

    if (partialResultsArray.length > 0) {
      logger.info('Converted partial results to final', {
        count: partialResultsArray.length,
        sessionId: this.currentSession?.id
      })
    }

    this.emit('turnComplete', {
      sessionId: this.currentSession?.id,
      timestamp: Date.now(),
      finalResultsCount: this.transcriptionResults.size
    })
  }

  /**
   * Clean up partial results that are superseded by final results
   */
  private cleanupPartialResults(finalResult: TranscriptionResult): void {
    const partialToRemove: string[] = []

    // Find partial results that might be superseded by this final result
    this.partialResults.forEach((partial, id) => {
      // Simple heuristic: if partial text is contained in final text, remove it
      if (finalResult.text.includes(partial.text) && partial.text.length > 0) {
        partialToRemove.push(id)
      }
    })

    partialToRemove.forEach(id => {
      this.partialResults.delete(id)
    })

    if (partialToRemove.length > 0 && this.config.performance.enableDetailedLogging) {
      logger.debug('Cleaned up superseded partial results', {
        removedCount: partialToRemove.length,
        finalResultId: finalResult.id
      })
    }
  }

  /**
   * Handle Live API errors
   */
  private handleLiveError(error: Error): void {
    this.metrics.errors.total++

    logger.error('Live API error', {
      error: error.message,
      sessionId: this.currentSession?.id
    })

    this.emit('error', error)
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.liveSession) {
        // Send heartbeat message
        this.liveSession
          .send({
            type: 'heartbeat',
            data: {timestamp: Date.now()}
          })
          .catch(error => {
            logger.error('Heartbeat failed', {error: error.message})
          })
      }
    }, this.config.websocket.heartbeatInterval)
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnection(): void {
    if (this.reconnectTimer || !this.shouldReconnect) {
      return
    }

    if (this.connectionAttempts >= this.config.websocket.maxReconnectAttempts) {
      logger.error('Maximum reconnection attempts reached')
      this.emit('maxReconnectAttemptsReached')
      return
    }

    let delay = this.config.websocket.reconnectDelay

    if (this.config.websocket.exponentialBackoff) {
      delay = delay * Math.pow(2, this.connectionAttempts - 1)
    }

    logger.info(`Scheduling reconnection in ${delay}ms`, {
      attempt: this.connectionAttempts + 1,
      maxAttempts: this.config.websocket.maxReconnectAttempts
    })

    this.metrics.connection.state = 'reconnecting'

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch(error => {
        logger.error('Reconnection failed', {error: error.message})
      })
    }, delay)
  }

  // ========================
  // Public API Methods
  // ========================

  /**
   * Check if client is connected
   */
  isClientConnected(): boolean {
    return this.isConnected
  }

  /**
   * Check if client is streaming
   */
  isClientStreaming(): boolean {
    return this.isStreaming
  }

  /**
   * Get current session information
   */
  getCurrentSession(): LiveStreamingSession | null {
    return this.currentSession
  }

  // ========================
  // Model Management Public API
  // ========================

  /**
   * Get current model information
   */
  getCurrentModel(): {
    name: string
    type: GeminiLiveModel
    spec: ModelSpec
    config: ResolvedGCPLiveClientConfig['model']['config']
    performance: ResolvedGCPLiveClientConfig['model']['performance']
  } {
    return {
      name: this.config.model.name,
      type: this.config.model.modelType,
      spec: this.config.model.spec,
      config: this.config.model.config,
      performance: this.config.model.performance
    }
  }

  /**
   * Get all available models with their specifications
   */
  getAvailableModels(): Record<GeminiLiveModel, ModelSpec> {
    return MODEL_SPECS
  }

  /**
   * Validate a model configuration
   */
  validateModelConfiguration(config: Partial<GCPLiveClientConfig>): ModelValidationResult {
    const modelName = config.model?.name || GeminiLiveModel.NATIVE_AUDIO
    const modelType = this.parseModelType(modelName)
    const spec = MODEL_SPECS[modelType]

    if (!spec) {
      return {
        isValid: false,
        errors: [`Unsupported model: ${modelName}`],
        warnings: [],
        recommendations: []
      }
    }

    return this.validateModelConfigurationInternal(config as GCPLiveClientConfig, spec)
  }

  /**
   * Check model compatibility with current audio configuration
   */
  checkModelCompatibility(targetModel: GeminiLiveModel): {
    compatible: boolean
    issues: string[]
    recommendations: string[]
    requiredChanges?: Partial<GCPLiveClientConfig>
  } {
    const spec = MODEL_SPECS[targetModel]
    if (!spec) {
      return {
        compatible: false,
        issues: [`Model ${targetModel} not found`],
        recommendations: []
      }
    }

    const issues: string[] = []
    const recommendations: string[] = []

    // Check audio format compatibility
    const currentFormat = this.config.audio.format as AudioFormat
    if (!spec.supportedInputFormats.includes(currentFormat)) {
      issues.push(`Current audio format ${currentFormat} not supported by ${targetModel}`)
    }

    // Check sample rate compatibility
    if (!spec.inputSampleRates.includes(this.config.audio.inputSampleRate)) {
      issues.push(
        `Current input sample rate ${this.config.audio.inputSampleRate} not supported by ${targetModel}`
      )
    }

    // Check chunk size compatibility
    if (this.config.audio.chunkSize > spec.maxChunkSize) {
      issues.push(
        `Current chunk size ${this.config.audio.chunkSize} exceeds maximum ${spec.maxChunkSize} for ${targetModel}`
      )
    }

    if (this.config.audio.chunkSize < spec.minChunkSize) {
      issues.push(
        `Current chunk size ${this.config.audio.chunkSize} below minimum ${spec.minChunkSize} for ${targetModel}`
      )
    }

    // Add recommendations
    if (spec.configOptions.lowLatency) {
      recommendations.push('Enable low-latency mode for optimal performance')
    }

    if (spec.configOptions.voiceActivityDetection) {
      recommendations.push('Enable voice activity detection for better accuracy')
    }

    const compatible = issues.length === 0

    return {
      compatible,
      issues,
      recommendations,
      requiredChanges: compatible
        ? undefined
        : this.generateCompatibleConfiguration({model: {name: targetModel}}, spec)
    }
  }

  /**
   * Switch to a different model (requires reconnection)
   */
  async switchModel(config: ModelSwitchConfig): Promise<{
    success: boolean
    previousModel: GeminiLiveModel
    newModel: GeminiLiveModel
    errors?: string[]
  }> {
    const previousModel = this.config.model.modelType
    const targetSpec = MODEL_SPECS[config.targetModel]

    if (!targetSpec) {
      return {
        success: false,
        previousModel,
        newModel: config.targetModel,
        errors: [`Model ${config.targetModel} not supported`]
      }
    }

    try {
      // Check if we need to disconnect first
      const wasConnected = this.isConnected
      const wasStreaming = this.isStreaming

      if (wasConnected) {
        if (config.migrationStrategy === 'graceful') {
          // Stop streaming gracefully
          if (wasStreaming) {
            await this.stopStreaming()
          }
          await this.disconnect()
        } else if (config.migrationStrategy === 'drain') {
          // Wait for current operations to complete
          await new Promise(resolve => setTimeout(resolve, 1000))
          if (wasStreaming) {
            await this.stopStreaming()
          }
          await this.disconnect()
        } else {
          // Immediate disconnection
          if (wasStreaming) {
            this.stopStreaming()
          }
          this.disconnect()
        }
      }

      // Update model configuration
      const newModelConfig = this.resolveModelConfig({model: {name: config.targetModel}})
      this.config.model = newModelConfig

      // Validate configuration with timeout
      const validationPromise = new Promise<void>((resolve, reject) => {
        const validation = this.validateModelConfigurationInternal(
          {model: {name: config.targetModel}},
          targetSpec
        )
        if (validation.isValid) {
          resolve()
        } else {
          reject(new Error(`Model validation failed: ${validation.errors.join(', ')}`))
        }
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Model switch validation timeout')),
          config.validationTimeout || 5000
        )
      })

      await Promise.race([validationPromise, timeoutPromise])

      // Reconnect if we were connected
      if (wasConnected) {
        await this.connect()

        if (wasStreaming) {
          await this.startStreaming()
        }
      }

      logger.info(`Successfully switched from ${previousModel} to ${config.targetModel}`)

      return {
        success: true,
        previousModel,
        newModel: config.targetModel
      }
    } catch (error) {
      // Attempt fallback if configured
      if (config.fallbackModel && config.fallbackModel !== previousModel) {
        logger.warn(
          `Model switch to ${config.targetModel} failed, attempting fallback to ${config.fallbackModel}`
        )

        try {
          const fallbackConfig = this.resolveModelConfig({model: {name: config.fallbackModel}})
          this.config.model = fallbackConfig

          if (this.isConnected) {
            await this.connect()
          }

          return {
            success: true,
            previousModel,
            newModel: config.fallbackModel,
            errors: [
              `Primary switch failed: ${error instanceof Error ? error.message : 'Unknown error'}, used fallback`
            ]
          }
        } catch (fallbackError) {
          // Restore original model
          const originalConfig = this.resolveModelConfig({model: {name: previousModel}})
          this.config.model = originalConfig

          return {
            success: false,
            previousModel,
            newModel: config.targetModel,
            errors: [
              `Primary switch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              `Fallback failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`,
              `Restored original model: ${previousModel}`
            ]
          }
        }
      }

      return {
        success: false,
        previousModel,
        newModel: config.targetModel,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }
    }
  }

  /**
   * Get model performance metrics
   */
  getModelPerformanceMetrics(): ModelPerformanceMetrics {
    return {
      model: this.config.model.modelType,
      averageLatency: this.metrics.performance.averageLatency,
      throughput: this.metrics.performance.messagesPerSecond,
      errorRate: this.metrics.errors.total / Math.max(this.metrics.connection.uptime / 60000, 1), // errors per minute
      sessionDuration: this.currentSession ? Date.now() - this.currentSession.createdAt : 0,
      audioQualityScore: this.calculateAudioQualityScore(),
      transcriptionAccuracy: this.calculateTranscriptionAccuracy(),
      lastUpdated: Date.now()
    }
  }

  /**
   * Update model configuration without switching models
   */
  updateModelConfiguration(config: Partial<ResolvedGCPLiveClientConfig['model']['config']>): void {
    const updated = {...this.config.model.config, ...config}
    this.config.model.config = updated

    logger.info('Model configuration updated', {config: updated})
    this.emit('model:config-updated', updated)
  }

  /**
   * Calculate audio quality score based on current metrics
   */
  private calculateAudioQualityScore(): number {
    // Basic scoring based on error rates and latency
    const baseScore = 100
    const errorPenalty = Math.min(this.metrics.errors.audioErrors * 5, 50)
    const latencyPenalty = Math.min(this.metrics.performance.averageLatency / 10, 30)

    return Math.max(baseScore - errorPenalty - latencyPenalty, 0)
  }

  /**
   * Calculate transcription accuracy estimate
   */
  private calculateTranscriptionAccuracy(): number {
    // Basic estimation based on error rates and session stability
    const baseAccuracy = 95
    const errorPenalty = Math.min(this.metrics.errors.transcriptionErrors * 2, 20)
    const stabilityBonus = this.isConnected && this.currentSession ? 5 : 0

    return Math.max(Math.min(baseAccuracy - errorPenalty + stabilityBonus, 100), 0)
  }

  // ========================
  // Error Handling Public API
  // ========================

  /**
   * Get comprehensive error statistics
   */
  getErrorStatistics() {
    return {
      client: this.metrics.errors,
      handler: this.errorHandler.getStats(),
      circuitBreaker: this.errorHandler.getCircuitBreakerStatus(),
      recoveries: this.errorHandler.getRecoveryStats()
    }
  }

  /**
   * Get recent errors with optional filtering
   */
  getRecentErrors(limit?: number) {
    return this.errorHandler.getRecentErrors(limit)
  }

  /**
   * Get recent logs with optional level filtering
   */
  getRecentLogs(limit?: number, level?: LogLevel) {
    return this.errorHandler.getRecentLogs(limit, level)
  }

  /**
   * Clear error history
   */
  clearErrorHistory(): void {
    this.errorHandler.clearErrors()
    this.metrics.errors = {
      total: 0,
      connectionErrors: 0,
      audioErrors: 0,
      transcriptionErrors: 0,
      lastErrorTime: undefined
    }
    logger.info('Error history cleared')
  }

  /**
   * Reset circuit breaker to closed state
   */
  resetCircuitBreaker(): void {
    this.errorHandler.resetCircuitBreaker()
    if (this.metrics.connection.state === 'failed') {
      this.metrics.connection.state = 'disconnected'
      this.metrics.connection.lastError = undefined
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.errorHandler.getCircuitBreakerStatus()
  }

  /**
   * Check if operations can proceed (circuit breaker check)
   */
  canProceed(): boolean {
    return this.errorHandler.canProceed()
  }

  /**
   * Configure recovery strategy for specific error types
   */
  configureErrorRecovery(
    errorType: ErrorType,
    config: {
      strategy: RecoveryStrategy
      maxAttempts?: number
      baseDelay?: number
      maxDelay?: number
      backoffMultiplier?: number
    }
  ): void {
    this.errorHandler.configureRecoveryStrategy(errorType, {
      strategy: config.strategy,
      maxAttempts: config.maxAttempts || this.config.errorHandling.maxRetries,
      baseDelay: config.baseDelay || 1000,
      maxDelay: config.maxDelay || 30000,
      backoffMultiplier: config.backoffMultiplier || 2
    })
  }

  /**
   * Enable or disable automatic error recovery
   */
  setAutoRecoveryEnabled(enabled: boolean): void {
    this.config.errorHandling.enableAutoRecovery = enabled
    logger.info(enabled ? 'Auto recovery enabled' : 'Auto recovery disabled')
  }

  /**
   * Set maximum retry attempts for error recovery
   */
  setMaxRetries(maxRetries: number): void {
    this.config.errorHandling.maxRetries = maxRetries
    logger.info('Max retries set to', {maxRetries})
  }

  /**
   * Get active recovery processes
   */
  getActiveRecoveries() {
    return this.errorHandler.getActiveRecoveries()
  }

  /**
   * Export error logs as JSON
   */
  exportErrorLogs(level?: LogLevel): string {
    return this.errorHandler.exportLogs(level)
  }

  /**
   * Export all errors as JSON
   */
  exportErrors(): string {
    return this.errorHandler.exportErrors()
  }

  /**
   * Handle a custom error with the error handler
   */
  async handleCustomError(
    error: Error | unknown,
    context?: Record<string, unknown>,
    options?: {
      type?: ErrorType
      attemptRecovery?: boolean
    }
  ): Promise<{error: GeminiError; recovered: boolean}> {
    return this.errorHandler.handleErrorWithRecovery(error, context, {
      ...options,
      attemptRecovery: options?.attemptRecovery ?? this.config.errorHandling.enableAutoRecovery,
      maxRetries: this.config.errorHandling.maxRetries
    })
  }

  /**
   * Cancel all active recovery processes
   */
  cancelAllRecoveries(): number {
    return this.errorHandler.cancelAllRecoveries()
  }

  /**
   * Export all logs as JSON string
   */
  exportAllLogs(): string {
    return this.errorHandler.exportLogs()
  }

  /**
   * Get comprehensive error handling statistics
   */
  getErrorHandlingStats() {
    return {
      ...this.errorHandler.getStatistics(),
      circuitBreaker: this.errorHandler.getCircuitBreakerStatus(),
      recovery: this.errorHandler.getRecoveryStats(),
      clientMetrics: this.getMetrics()
    }
  }

  // ========================
  // Error Handling and Recovery API
  // ========================

  /**
   * Get comprehensive error statistics
   */
  getErrorStats() {
    return this.errorHandler.getStats()
  }

  // ========================
  // Transcription Result Management
  // ========================

  /**
   * Get all transcription results
   */
  getTranscriptionResults(): TranscriptionResult[] {
    return Array.from(this.transcriptionResults.values()).sort(
      (a, b) => (a.sequence || 0) - (b.sequence || 0)
    )
  }

  /**
   * Get partial/interim transcription results
   */
  getPartialResults(): TranscriptionResult[] {
    return Array.from(this.partialResults.values()).sort(
      (a, b) => (a.sequence || 0) - (b.sequence || 0)
    )
  }

  /**
   * Get final transcription results only
   */
  getFinalResults(): TranscriptionResult[] {
    return this.getTranscriptionResults().filter(result => result.isFinal)
  }

  /**
   * Get transcription results by session ID
   */
  getResultsBySession(sessionId: string): TranscriptionResult[] {
    return this.getTranscriptionResults().filter(result => result.sessionId === sessionId)
  }

  /**
   * Get a batch of recent results
   */
  getResultBatch(limit: number = 10, offset: number = 0): TranscriptionResultBatch {
    const allResults = this.getTranscriptionResults()
    const results = allResults.slice(offset, offset + limit)

    return {
      results,
      hasFinalResults: results.some(r => r.isFinal),
      hasPartialResults: results.some(r => r.isPartial),
      totalResults: allResults.length,
      sessionId: this.currentSession?.id,
      timestamp: Date.now()
    }
  }

  /**
   * Get combined text from all final results
   */
  getCombinedTranscription(sessionId?: string): string {
    let results = this.getFinalResults()

    if (sessionId) {
      results = results.filter(result => result.sessionId === sessionId)
    }

    return results
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
      .map(result => result.text)
      .join(' ')
      .trim()
  }

  /**
   * Clear all transcription results
   */
  clearTranscriptionResults(): void {
    const finalCount = this.transcriptionResults.size
    const partialCount = this.partialResults.size

    this.transcriptionResults.clear()
    this.partialResults.clear()
    this.resultSequence = 0

    logger.info('Cleared transcription results', {
      finalResultsCleared: finalCount,
      partialResultsCleared: partialCount,
      sessionId: this.currentSession?.id
    })

    this.emit('resultsCleared', {
      finalResultsCleared: finalCount,
      partialResultsCleared: partialCount,
      timestamp: Date.now()
    })
  }

  /**
   * Clear results for a specific session
   */
  clearResultsBySession(sessionId: string): void {
    let finalCleared = 0
    let partialCleared = 0

    // Clear final results for session
    for (const [id, result] of this.transcriptionResults.entries()) {
      if (result.sessionId === sessionId) {
        this.transcriptionResults.delete(id)
        finalCleared++
      }
    }

    // Clear partial results for session
    for (const [id, result] of this.partialResults.entries()) {
      if (result.sessionId === sessionId) {
        this.partialResults.delete(id)
        partialCleared++
      }
    }

    logger.info('Cleared session transcription results', {
      sessionId,
      finalResultsCleared: finalCleared,
      partialResultsCleared: partialCleared
    })

    this.emit('sessionResultsCleared', {
      sessionId,
      finalResultsCleared: finalCleared,
      partialResultsCleared: partialCleared,
      timestamp: Date.now()
    })
  }

  /**
   * Get transcription statistics
   */
  getTranscriptionStats(): {
    totalResults: number
    finalResults: number
    partialResults: number
    totalTextLength: number
    averageResultLength: number
    sessionsWithResults: number
  } {
    const finalResults = this.getTranscriptionResults()
    const partialResults = this.getPartialResults()
    const totalTextLength = finalResults.reduce((sum, result) => sum + result.text.length, 0)

    // Count unique sessions
    const sessionsSet = new Set<string>()
    finalResults.forEach(result => {
      if (result.sessionId) sessionsSet.add(result.sessionId)
    })

    return {
      totalResults: finalResults.length + partialResults.length,
      finalResults: finalResults.length,
      partialResults: partialResults.length,
      totalTextLength,
      averageResultLength: finalResults.length > 0 ? totalTextLength / finalResults.length : 0,
      sessionsWithResults: sessionsSet.size
    }
  }

  /**
   * Get client metrics
   */
  getMetrics(): ClientMetrics {
    // Update uptime
    this.metrics.connection.uptime = Date.now() - this.startTime

    // Update memory usage if monitoring is enabled
    if (this.config.performance.enableMonitoring) {
      const memUsage = process.memoryUsage()
      this.metrics.performance.memoryUsage = memUsage.heapUsed
    }

    return {...this.metrics}
  }

  /**
   * Update client configuration
   */
  updateConfig(updates: Partial<GCPLiveClientConfig>): void {
    // Merge updates with current config by creating a new config object
    const mergedConfig: GCPLiveClientConfig = {
      authentication: {...this.config.authentication, ...updates.authentication},
      model: {...this.config.model, ...updates.model},
      audio: {...this.config.audio, ...updates.audio},
      websocket: {...this.config.websocket, ...updates.websocket},
      performance: {...this.config.performance, ...updates.performance},
      debug: updates.debug ?? this.config.debug,
      logLevel: updates.logLevel ?? this.config.logLevel
    }

    this.config = this.mergeWithDefaults(mergedConfig)

    logger.info('Client configuration updated', updates)
    this.emit('configUpdated', this.config)
  }

  /**
   * Destroy the client and cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return
    }

    this.isDestroyed = true
    this.shouldReconnect = false

    logger.info('Destroying GCPGeminiLiveClient...')

    try {
      // Disconnect if connected
      if (this.isConnected) {
        await this.disconnect()
      }

      // Clear all timers
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }

      if (this.streamingInterval) {
        clearInterval(this.streamingInterval)
        this.streamingInterval = null
      }

      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval)
        this.heartbeatInterval = null
      }

      // Clear buffers
      this.audioBuffer = []

      // Clear transcription results
      this.transcriptionResults.clear()
      this.partialResults.clear()
      this.resultSequence = 0

      // Clean up audio streaming resources
      if (this.audioStreamingService) {
        try {
          await this.audioStreamingService.cleanup()
          this.audioStreamingService = null
        } catch (error) {
          logger.warn('Error cleaning up audio streaming service', {
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      if (this.audioFormatConverter) {
        try {
          await this.audioFormatConverter.destroy()
          this.audioFormatConverter = null
        } catch (error) {
          logger.warn('Error cleaning up audio format converter', {
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      // Clean up error handler
      try {
        this.errorHandler.cancelAllRecoveries()
        this.errorHandler.destroy()
      } catch (error) {
        logger.warn('Error cleaning up error handler', {
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }

      // Remove all event listeners
      this.removeAllListeners()

      logger.info('GCPGeminiLiveClient destroyed successfully')
    } catch (error) {
      logger.error('Error during client destruction', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}

// ========================
// Factory Functions
// ========================

/**
 * Create a new GCP Gemini Live client instance
 */
export function createGCPGeminiLiveClient(config?: GCPLiveClientConfig): GCPGeminiLiveClient {
  return new GCPGeminiLiveClient(config)
}

/**
 * Create client with native audio support
 */
export function createNativeAudioClient(config: GCPLiveClientConfig = {}): GCPGeminiLiveClient {
  return new GCPGeminiLiveClient({
    ...config,
    model: {
      name: 'gemini-2.5-flash-preview-native-audio-dialog',
      enableNativeAudio: true,
      enableTextMode: false,
      ...config.model
    }
  })
}

/**
 * Create client with half-cascade model
 */
export function createHalfCascadeClient(config: GCPLiveClientConfig = {}): GCPGeminiLiveClient {
  return new GCPGeminiLiveClient({
    ...config,
    model: {
      name: 'gemini-2.0-flash-live-001',
      enableNativeAudio: false,
      enableTextMode: true,
      ...config.model
    }
  })
}

export default GCPGeminiLiveClient
