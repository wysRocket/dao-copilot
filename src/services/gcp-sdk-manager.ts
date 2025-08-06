/**
 * GCP SDK Initialization Service
 * Centralized initialization and configuration for Google Cloud Platform services
 *
 * Features:
 * - Environment-based authentication
 * - Service account and API key support
 * - Gemini Live API initialization
 * - WebSocket connection management
 * - Error handling and retry logic
 * - TypeScript support with proper interfaces
 */

export interface LiveMessage {
  type: string
  data?: unknown
}

export interface LiveRealtimeInput {
  audio?: {
    data: string // Base64 encoded audio data
    mimeType: string // e.g., "audio/pcm;rate=16000"
  }
  text?: string
}

export interface LiveServerContent {
  modelTurn?: {
    parts: Array<{
      text?: string
      inlineData?: {
        mimeType: string
        data: string // Base64 encoded audio response
      }
    }>
  }
  turnComplete?: boolean
}

export interface LiveSessionMessage {
  serverContent?: LiveServerContent
  data?: ArrayBuffer // Raw audio data for convenience
}

export interface LiveSession {
  id: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  send: (message: LiveMessage) => Promise<void>
  sendRealtimeInput: (input: LiveRealtimeInput) => Promise<void>
  close: () => Promise<void>

  // Event handlers
  onOpen?: () => void
  onMessage?: (message: LiveSessionMessage) => void
  onError?: (error: Error) => void
  onClose?: (code: number, reason: string) => void
}

import {GoogleGenAI, Modality} from '@google/genai'
import {GoogleAuth} from 'google-auth-library'
import {GCPAuthManager, AuthConfig, AuthResult} from './gcp-auth-manager'

export interface GCPSDKConfig {
  /** Authentication method preference */
  authMethod?: 'api-key' | 'service-account' | 'default' | 'auto'

  /** API key for direct authentication */
  apiKey?: string

  /** Service account configuration */
  serviceAccount?: {
    keyFile?: string
    credentials?: Record<string, unknown>
  }

  /** GCP Project configuration */
  project?: {
    id?: string
    region?: string
  }

  /** Gemini Live API configuration */
  geminiLive?: {
    model?: string
    enableNativeAudio?: boolean
    enableTextMode?: boolean
    websocketTimeout?: number
  }

  /** Retry and error handling */
  retryConfig?: {
    maxRetries?: number
    retryDelay?: number
    exponentialBackoff?: boolean
  }

  /** Development/debugging options */
  debug?: boolean
  logLevel?: 'error' | 'warn' | 'info' | 'debug'
}

export interface GCPSDKInstance {
  /** Google Gen AI client */
  genAI: GoogleGenAI

  /** Google Auth client */
  auth: GoogleAuth

  /** Authentication result */
  authResult: AuthResult

  /** Configuration used for initialization */
  config: GCPSDKConfig

  /** SDK status */
  status: {
    initialized: boolean
    authenticated: boolean
    error?: string
  }
}

export class GCPSDKManager {
  private static instance: GCPSDKManager | null = null
  private sdkInstance: GCPSDKInstance | null = null
  private authManager: GCPAuthManager | null = null
  private initPromise: Promise<GCPSDKInstance> | null = null

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): GCPSDKManager {
    if (!this.instance) {
      this.instance = new GCPSDKManager()
    }
    return this.instance
  }

  /**
   * Initialize the GCP SDK with configuration
   */
  async initialize(config: GCPSDKConfig = {}): Promise<GCPSDKInstance> {
    // Return existing promise if initialization is in progress
    if (this.initPromise) {
      return this.initPromise
    }

    // Return existing instance if already initialized
    if (this.sdkInstance?.status.initialized) {
      return this.sdkInstance
    }

    // Start initialization
    this.initPromise = this._performInitialization(config)

    try {
      this.sdkInstance = await this.initPromise
      return this.sdkInstance
    } catch (error) {
      this.initPromise = null // Reset on failure
      throw error
    }
  }

  /**
   * Internal initialization logic
   */
  private async _performInitialization(config: GCPSDKConfig): Promise<GCPSDKInstance> {
    const finalConfig = this._mergeWithDefaults(config)

    try {
      // Initialize authentication manager
      const authConfig = this._createAuthConfig(finalConfig)
      this.authManager = new GCPAuthManager(authConfig)

      // Initialize authentication
      const authResult = await this.authManager.initialize()

      if (!authResult.success) {
        throw new Error(authResult.error || 'Authentication failed')
      }

      // Initialize Google Gen AI client
      const genAI = this._createGenAIClient(authResult, finalConfig)

      // Initialize Google Auth client
      const auth = this._createGoogleAuthClient(finalConfig)

      // Create SDK instance
      const sdkInstance: GCPSDKInstance = {
        genAI,
        auth,
        authResult,
        config: finalConfig,
        status: {
          initialized: true,
          authenticated: true
        }
      }

      // Validate the setup
      await this._validateSDKSetup(sdkInstance)

      if (finalConfig.debug) {
        console.log('✅ GCP SDK initialized successfully', {
          authMethod: authResult.method,
          hasGenAI: !!genAI,
          hasAuth: !!auth,
          project: finalConfig.project?.id
        })
      }

      return sdkInstance
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (finalConfig.debug) {
        console.error('❌ GCP SDK initialization failed:', errorMessage)
      }

      throw new Error(`GCP SDK initialization failed: ${errorMessage}`)
    }
  }

  /**
   * Merge user config with defaults
   */
  private _mergeWithDefaults(config: GCPSDKConfig): GCPSDKConfig {
    return {
      authMethod: 'auto',
      geminiLive: {
        model: 'gemini-2.5-flash-preview-native-audio-dialog',
        enableNativeAudio: true,
        enableTextMode: true,
        websocketTimeout: 30000,
        ...config.geminiLive
      },
      retryConfig: {
        maxRetries: 3,
        retryDelay: 1000,
        exponentialBackoff: true,
        ...config.retryConfig
      },
      debug: process.env.NODE_ENV === 'development',
      logLevel: 'info',
      ...config
    }
  }

  /**
   * Create authentication configuration
   */
  private _createAuthConfig(config: GCPSDKConfig): AuthConfig {
    const authConfig: AuthConfig = {
      method:
        config.authMethod === 'auto'
          ? 'api-key'
          : config.authMethod === 'api-key' ||
              config.authMethod === 'service-account' ||
              config.authMethod === 'default'
            ? config.authMethod
            : 'api-key'
    }

    if (config.apiKey) {
      authConfig.apiKey = config.apiKey
    }

    if (config.serviceAccount) {
      authConfig.method = 'service-account'
      if (config.serviceAccount.keyFile) {
        authConfig.serviceAccountKeyFile = config.serviceAccount.keyFile
      }
      if (config.serviceAccount.credentials) {
        authConfig.serviceAccountKey = config.serviceAccount.credentials
      }
    }

    if (config.project?.id) {
      authConfig.projectId = config.project.id
    }

    return authConfig
  }

  /**
   * Create Google Gen AI client
   */
  private _createGenAIClient(authResult: AuthResult, config: GCPSDKConfig): GoogleGenAI {
    const initConfig: Record<string, unknown> = {}

    if (authResult.method === 'api-key' && authResult.credentials?.apiKey) {
      initConfig.apiKey = authResult.credentials.apiKey
    } else if (authResult.credentials?.accessToken) {
      initConfig.apiKey = authResult.credentials.accessToken
    }

    // Add project configuration if available
    if (config.project?.id) {
      initConfig.project = config.project.id
    }

    return new GoogleGenAI(initConfig)
  }

  /**
   * Create Google Auth client
   */
  private _createGoogleAuthClient(config: GCPSDKConfig): GoogleAuth {
    const authConfig: Record<string, unknown> = {
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/generative-language'
      ]
    }

    if (config.project?.id) {
      authConfig.projectId = config.project.id
    }

    if (config.serviceAccount?.keyFile) {
      authConfig.keyFile = config.serviceAccount.keyFile
    } else if (config.serviceAccount?.credentials) {
      authConfig.credentials = config.serviceAccount.credentials
    }

    return new GoogleAuth(authConfig)
  }

  /**
   * Validate SDK setup
   */
  private async _validateSDKSetup(sdkInstance: GCPSDKInstance): Promise<void> {
    try {
      // Test Gen AI client with a simple request
      const response = await sdkInstance.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            parts: [{text: 'Test SDK initialization'}]
          }
        ]
      })

      if (!response.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Gen AI client validation failed - no response')
      }

      // Test Live API availability
      if (!sdkInstance.genAI.live) {
        console.warn('⚠️ Live API interface not available - check model support')
      }
    } catch (error) {
      throw new Error(
        `SDK validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Get current SDK instance
   */
  getInstance(): GCPSDKInstance | null {
    return this.sdkInstance
  }

  /**
   * Check if SDK is initialized
   */
  isInitialized(): boolean {
    return this.sdkInstance?.status.initialized ?? false
  }

  /**
   * Reinitialize with new configuration
   */
  async reinitialize(config: GCPSDKConfig): Promise<GCPSDKInstance> {
    this.sdkInstance = null
    this.initPromise = null
    return this.initialize(config)
  }

  /**
   * Create Live API session
   */
  async createLiveSession(
    options: {
      model?: string
      enableNativeAudio?: boolean
      onMessage?: (message: LiveSessionMessage) => void
      onError?: (error: Error) => void
      onOpen?: () => void
      onClose?: (code: number, reason: string) => void
    } = {}
  ): Promise<LiveSession> {
    if (!this.sdkInstance?.status.initialized) {
      throw new Error('SDK not initialized - call initialize() first')
    }

    if (!this.sdkInstance.genAI.live) {
      throw new Error('Live API not available')
    }

    const model =
      options.model ??
      this.sdkInstance.config.geminiLive?.model ??
      'gemini-2.5-flash-preview-native-audio-dialog'

    try {
      // Create configuration for the Live API session
      const liveConfig = {
        responseModalities: (options.enableNativeAudio ? ['AUDIO'] : ['TEXT']) as Modality[],
        systemInstruction:
          'You are a helpful assistant for real-time transcription and conversation.'
      }

      // Generate unique session ID
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Track session state
      let sessionStatus: LiveSession['status'] = 'connecting'
      let liveSessionInstance: any = null

      // Create the Live API session using Google AI SDK
      try {
        liveSessionInstance = await this.sdkInstance.genAI.live.connect({
          model: model,
          config: liveConfig,
          callbacks: {
            onopen: () => {
              sessionStatus = 'connected'
              if (this.sdkInstance?.config.debug) {
                console.log('✅ Live API WebSocket opened', {sessionId, model})
              }
              options.onOpen?.()
            },
            onmessage: (message: any) => {
              if (this.sdkInstance?.config.debug) {
                console.log('📨 Live API message received', {
                  sessionId,
                  messageType: typeof message
                })
              }

              // Convert message to our standardized format
              const sessionMessage: LiveSessionMessage = {
                serverContent: message.serverContent,
                data: message.data
              }

              options.onMessage?.(sessionMessage)
            },
            onerror: (error: any) => {
              sessionStatus = 'error'
              const errorObj = error instanceof Error ? error : new Error(String(error))
              if (this.sdkInstance?.config.debug) {
                console.error('❌ Live API WebSocket error', {sessionId, error: errorObj.message})
              }
              options.onError?.(errorObj)
            },
            onclose: (event: any) => {
              sessionStatus = 'disconnected'
              const code = event?.code || 1000
              const reason = event?.reason || 'Connection closed'
              if (this.sdkInstance?.config.debug) {
                console.log('🔌 Live API WebSocket closed', {sessionId, code, reason})
              }
              options.onClose?.(code, reason)
            }
          }
        })
      } catch (connectionError) {
        throw new Error(
          `Failed to connect to Live API: ${connectionError instanceof Error ? connectionError.message : 'Unknown error'}`
        )
      }

      // Create our LiveSession wrapper
      const session: LiveSession = {
        id: sessionId,
        get status() {
          return sessionStatus
        },

        async send(message: LiveMessage): Promise<void> {
          if (!liveSessionInstance) {
            throw new Error('Session not connected')
          }

          try {
            // Send message through the Live API session
            await liveSessionInstance.send(message)

            if (this.sdkInstance?.config.debug) {
              console.log('📤 Message sent to Live API', {sessionId, messageType: message.type})
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            throw new Error(`Failed to send message: ${errorMessage}`)
          }
        },

        async sendRealtimeInput(input: LiveRealtimeInput): Promise<void> {
          if (!liveSessionInstance) {
            throw new Error('Session not connected')
          }

          try {
            // Send realtime input (audio/text) through the Live API
            if (input.audio) {
              await liveSessionInstance.send_realtime_input({
                audio: {
                  data: input.audio.data,
                  mime_type: input.audio.mimeType
                }
              })
            } else if (input.text) {
              await liveSessionInstance.send_realtime_input({
                text: input.text
              })
            }

            if (this.sdkInstance?.config.debug) {
              console.log('🎤 Realtime input sent to Live API', {
                sessionId,
                hasAudio: !!input.audio,
                hasText: !!input.text,
                audioSize: input.audio?.data.length || 0
              })
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            throw new Error(`Failed to send realtime input: ${errorMessage}`)
          }
        },

        async close(): Promise<void> {
          if (liveSessionInstance) {
            try {
              await liveSessionInstance.close()
              sessionStatus = 'disconnected'

              if (this.sdkInstance?.config.debug) {
                console.log('🔐 Live API session closed', {sessionId})
              }
            } catch (error) {
              if (this.sdkInstance?.config.debug) {
                console.error('❌ Error closing Live API session', {
                  sessionId,
                  error: error instanceof Error ? error.message : 'Unknown error'
                })
              }
            }
            liveSessionInstance = null
          }
        },

        // Expose event handlers for direct access if needed
        onOpen: options.onOpen,
        onMessage: options.onMessage,
        onError: options.onError,
        onClose: options.onClose
      }

      if (this.sdkInstance.config.debug) {
        console.log('✅ Live API session created successfully', {
          sessionId,
          model,
          enableNativeAudio: options.enableNativeAudio,
          responseModalities: liveConfig.responseModalities
        })
      }

      return session
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (this.sdkInstance.config.debug) {
        console.error('❌ Live API session creation failed:', errorMessage)
      }
      throw new Error(`Live API session creation failed: ${errorMessage}`)
    }
  }

  /**
   * Refresh authentication credentials
   */
  async refreshCredentials(): Promise<void> {
    if (!this.authManager) {
      throw new Error('Auth manager not initialized')
    }

    try {
      const newAuthResult = await this.authManager.getCredentials()

      if (this.sdkInstance) {
        this.sdkInstance.authResult = newAuthResult
        // Recreate Gen AI client with new credentials
        this.sdkInstance.genAI = this._createGenAIClient(newAuthResult, this.sdkInstance.config)
      }
    } catch (error) {
      throw new Error(
        `Credential refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Get environment-based configuration
   */
  static getEnvironmentConfig(): GCPSDKConfig {
    const config: GCPSDKConfig = {
      debug: process.env.NODE_ENV === 'development',
      logLevel: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') ?? 'info'
    }

    // API Key from environment
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY) {
      config.apiKey =
        process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY
      config.authMethod = 'api-key'
    }

    // Service Account from environment
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_SERVICE_ACCOUNT_KEY) {
      config.authMethod = 'service-account'
      config.serviceAccount = {}

      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        config.serviceAccount.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS
      }

      if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
        try {
          config.serviceAccount.credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY)
        } catch {
          console.warn('⚠️ Invalid JSON in GCP_SERVICE_ACCOUNT_KEY environment variable')
        }
      }
    }

    // Project configuration
    if (process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT) {
      config.project = {
        id: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
        region: process.env.GCP_REGION || process.env.GOOGLE_CLOUD_REGION
      }
    }

    return config
  }
}

// Export convenience functions
export const gcpSDK = GCPSDKManager.getInstance()

/**
 * Initialize GCP SDK with environment configuration
 */
export async function initializeGCPSDK(config?: GCPSDKConfig): Promise<GCPSDKInstance> {
  const envConfig = GCPSDKManager.getEnvironmentConfig()
  const finalConfig = {...envConfig, ...config}
  return gcpSDK.initialize(finalConfig)
}

/**
 * Get initialized GCP SDK instance
 */
export function getGCPSDK(): GCPSDKInstance | null {
  return gcpSDK.getInstance()
}

/**
 * Create Live API session
 */
export async function createGeminiLiveSession(options?: {
  model?: string
  enableNativeAudio?: boolean
  onMessage?: (message: LiveSessionMessage) => void
  onError?: (error: Error) => void
  onOpen?: () => void
  onClose?: (code: number, reason: string) => void
}): Promise<LiveSession> {
  return gcpSDK.createLiveSession(options)
}

export default GCPSDKManager
