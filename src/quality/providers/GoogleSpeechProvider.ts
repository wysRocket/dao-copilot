/**
 * Google Speech-to-Text Provider
 *
 * Implementation of Google Speech-to-Text API v2 as a transcription provider
 * with support for streaming, multiple languages, and mixed-language detection.
 * Integrates with the quality management system for automatic provider switching.
 */

import {EventEmitter} from 'events'
import type {
  TranscriptionProvider,
  TranscriptionOptions,
  TranscriptionResult
} from '../quality/services/TranscriptionQualityManager'

// Google Speech-to-Text specific types
interface GoogleSpeechConfig {
  projectId: string
  keyFilename?: string
  credentials?: {
    client_email: string
    private_key: string
    project_id: string
  }
  apiEndpoint?: string
  timeout?: number
}

interface GoogleStreamingConfig {
  config: {
    encoding:
      | 'LINEAR16'
      | 'FLAC'
      | 'MULAW'
      | 'AMR'
      | 'AMR_WB'
      | 'OGG_OPUS'
      | 'SPEEX_WITH_HEADER_BYTE'
      | 'WEBM_OPUS'
    sampleRateHertz: number
    languageCode: string
    alternativeLanguageCodes?: string[]
    maxAlternatives?: number
    profanityFilter?: boolean
    speechContexts?: Array<{
      phrases: string[]
      boost?: number
    }>
    enableAutomaticPunctuation?: boolean
    enableWordConfidence?: boolean
    enableWordTimeOffsets?: boolean
    enableSpeakerDiarization?: boolean
    diarizationConfig?: {
      enableSpeakerDiarization: boolean
      minSpeakerCount?: number
      maxSpeakerCount?: number
    }
    model?:
      | 'command_and_search'
      | 'phone_call'
      | 'video'
      | 'default'
      | 'latest_long'
      | 'latest_short'
    useEnhanced?: boolean
  }
  interimResults?: boolean
  singleUtterance?: boolean
  enableVoiceActivityDetection?: boolean
  voiceActivityTimeout?: {
    speechStartTimeout?: string
    speechEndTimeout?: string
  }
}

interface GoogleSpeechResponse {
  results: Array<{
    alternatives: Array<{
      transcript: string
      confidence: number
      words?: Array<{
        startTime: string
        endTime: string
        word: string
        confidence: number
        speakerTag?: number
      }>
    }>
    isFinal: boolean
    stability?: number
    resultEndTime?: string
    channelTag?: number
    languageCode?: string
  }>
  speechEventType?: 'SPEECH_EVENT_TYPE_UNSPECIFIED' | 'END_OF_SINGLE_UTTERANCE'
  speechEventTime?: string
  totalBilledTime?: string
}

// Mock Google Speech client interface (in production, use @google-cloud/speech)
interface MockSpeechClient {
  streamingRecognize(config: GoogleStreamingConfig): MockRecognizeStream
  recognize(config: {
    config: GoogleStreamingConfig['config']
    audio: {content: string}
  }): Promise<GoogleSpeechResponse>
}

interface MockRecognizeStream extends EventEmitter {
  write(chunk: Buffer): boolean
  end(): void
  destroy(): void
}

/**
 * Google Speech-to-Text Provider implementation
 */
export class GoogleSpeechProvider extends EventEmitter implements TranscriptionProvider {
  public readonly id = 'google-speech'
  public readonly name = 'Google Speech-to-Text'
  public readonly supportedLanguages = [
    'en-US',
    'en-GB',
    'en-AU',
    'en-CA',
    'en-IN',
    'uk-UA',
    'ru-RU',
    'de-DE',
    'fr-FR',
    'es-ES',
    'es-MX',
    'it-IT',
    'pt-BR',
    'pt-PT',
    'ja-JP',
    'ko-KR',
    'zh-CN',
    'zh-TW'
  ]

  public readonly capabilities = {
    realtime: true,
    mixedLanguage: true,
    confidence: true,
    alternatives: true
  }

  private speechClient: MockSpeechClient | null = null
  private config: GoogleSpeechConfig
  private streamingConfig: GoogleStreamingConfig
  private activeStreams = new Map<string, MockRecognizeStream>()
  private isInitialized = false

  constructor(config: GoogleSpeechConfig) {
    super()
    this.config = config
    this.streamingConfig = this.createDefaultStreamingConfig()
  }

  /**
   * Initialize the Google Speech client
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // In production, this would be:
      // const { SpeechClient } = require('@google-cloud/speech');
      // this.speechClient = new SpeechClient(this.config);

      // Mock implementation for development
      this.speechClient = this.createMockSpeechClient()

      // Test the connection
      await this.testConnection()

      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      this.emit('initialization:error', error)
      throw new Error(`Failed to initialize Google Speech client: ${error}`)
    }
  }

  /**
   * Transcribe audio using Google Speech-to-Text
   */
  public async transcribe(
    audio: ArrayBuffer,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    if (!this.speechClient) {
      throw new Error('Google Speech client not initialized')
    }

    const startTime = performance.now()

    try {
      // Prepare configuration
      const config = this.prepareTranscriptionConfig(options)

      // Convert ArrayBuffer to Base64 for Google API
      const audioContent = this.arrayBufferToBase64(audio)

      // Perform transcription
      const response = await this.speechClient.recognize({
        config: config.config,
        audio: {content: audioContent}
      })

      const processingTime = performance.now() - startTime

      // Process results
      const result = this.processTranscriptionResult(response, processingTime, options)

      this.emit('transcription:completed', result)
      return result
    } catch (error) {
      const processingTime = performance.now() - startTime
      this.emit('transcription:error', error, {options, processingTime})
      throw new Error(`Google Speech transcription failed: ${error}`)
    }
  }

  /**
   * Start streaming transcription
   */
  public startStreaming(options: TranscriptionOptions = {}): {
    streamId: string
    writeAudio: (chunk: ArrayBuffer) => void
    endStream: () => void
  } {
    if (!this.isInitialized || !this.speechClient) {
      throw new Error('Google Speech client not initialized')
    }

    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const config = this.prepareTranscriptionConfig(options)

    // Create streaming recognize stream
    const recognizeStream = this.speechClient.streamingRecognize(config)
    this.activeStreams.set(streamId, recognizeStream)

    // Set up event handlers
    recognizeStream.on('data', (data: GoogleSpeechResponse) => {
      const result = this.processStreamingResult(data, streamId, options)
      this.emit('streaming:data', streamId, result)
    })

    recognizeStream.on('error', (error: Error) => {
      this.emit('streaming:error', streamId, error)
      this.activeStreams.delete(streamId)
    })

    recognizeStream.on('end', () => {
      this.emit('streaming:end', streamId)
      this.activeStreams.delete(streamId)
    })

    return {
      streamId,
      writeAudio: (chunk: ArrayBuffer) => {
        const buffer = Buffer.from(chunk)
        recognizeStream.write(buffer)
      },
      endStream: () => {
        recognizeStream.end()
        this.activeStreams.delete(streamId)
      }
    }
  }

  /**
   * Stop streaming transcription
   */
  public stopStreaming(streamId: string): void {
    const stream = this.activeStreams.get(streamId)
    if (stream) {
      stream.end()
      this.activeStreams.delete(streamId)
    }
  }

  /**
   * Get current configuration
   */
  public getConfiguration(): Record<string, unknown> {
    return {
      provider: 'google-speech',
      projectId: this.config.projectId,
      supportedLanguages: this.supportedLanguages,
      capabilities: this.capabilities,
      streamingConfig: this.streamingConfig,
      activeStreams: this.activeStreams.size,
      isInitialized: this.isInitialized
    }
  }

  /**
   * Update configuration
   */
  public updateConfiguration(config: Record<string, unknown>): void {
    // Update Google Speech specific config
    if (config.projectId) this.config.projectId = config.projectId as string
    if (config.apiEndpoint) this.config.apiEndpoint = config.apiEndpoint as string
    if (config.timeout) this.config.timeout = config.timeout as number

    // Update streaming config
    if (config.streamingConfig) {
      this.streamingConfig = {
        ...this.streamingConfig,
        ...(config.streamingConfig as Partial<GoogleStreamingConfig>)
      }
    }

    this.emit('configuration:updated', this.getConfiguration())
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    // End all active streams
    for (const [, stream] of this.activeStreams) {
      stream.destroy()
    }
    this.activeStreams.clear()

    // Close speech client connection if needed
    if (this.speechClient) {
      // In production: await this.speechClient.close();
    }

    this.speechClient = null
    this.isInitialized = false
    this.removeAllListeners()
  }

  // Private helper methods

  private createDefaultStreamingConfig(): GoogleStreamingConfig {
    return {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        maxAlternatives: 3,
        profanityFilter: false,
        enableAutomaticPunctuation: true,
        enableWordConfidence: true,
        enableWordTimeOffsets: false,
        model: 'latest_long',
        useEnhanced: true
      },
      interimResults: true,
      singleUtterance: false,
      enableVoiceActivityDetection: true,
      voiceActivityTimeout: {
        speechStartTimeout: '1s',
        speechEndTimeout: '3s'
      }
    }
  }

  private prepareTranscriptionConfig(options: TranscriptionOptions): GoogleStreamingConfig {
    const config: GoogleStreamingConfig = JSON.parse(JSON.stringify(this.streamingConfig))

    // Apply language settings
    if (options.language) {
      const googleLangCode = this.mapLanguageCodeToGoogle(options.language)
      config.config.languageCode = googleLangCode
    }

    // Enable mixed language if requested
    if (options.enableMixedLanguage) {
      config.config.alternativeLanguageCodes = this.getAlternativeLanguages(
        config.config.languageCode
      )
    }

    // Adjust quality settings
    switch (options.quality) {
      case 'low':
        config.config.model = 'default'
        config.config.useEnhanced = false
        break
      case 'medium':
        config.config.model = 'latest_short'
        config.config.useEnhanced = true
        break
      case 'high':
        config.config.model = 'latest_long'
        config.config.useEnhanced = true
        config.config.enableWordConfidence = true
        config.config.maxAlternatives = 5
        break
    }

    // Enable alternatives if requested
    if (options.alternatives) {
      config.config.maxAlternatives = Math.max(config.config.maxAlternatives || 1, 3)
    }

    return config
  }

  private mapLanguageCodeToGoogle(languageCode: string): string {
    // Map common language codes to Google's format
    const mappings: Record<string, string> = {
      en: 'en-US',
      uk: 'uk-UA',
      ru: 'ru-RU',
      de: 'de-DE',
      fr: 'fr-FR',
      es: 'es-ES'
    }

    return mappings[languageCode] || languageCode
  }

  private getAlternativeLanguages(primaryLanguage: string): string[] {
    // Common language combinations for mixed-language scenarios
    const alternatives: Record<string, string[]> = {
      'en-US': ['uk-UA', 'es-ES', 'fr-FR'],
      'uk-UA': ['en-US', 'ru-RU'],
      'ru-RU': ['en-US', 'uk-UA'],
      'de-DE': ['en-US', 'fr-FR'],
      'fr-FR': ['en-US', 'de-DE', 'es-ES'],
      'es-ES': ['en-US', 'fr-FR']
    }

    return alternatives[primaryLanguage] || ['en-US']
  }

  private processTranscriptionResult(
    response: GoogleSpeechResponse,
    processingTime: number,
    options: TranscriptionOptions
  ): TranscriptionResult {
    if (!response.results || response.results.length === 0) {
      return {
        text: '',
        confidence: 0,
        language: options.language || 'en',
        processingTime,
        metadata: {
          provider: 'google-speech',
          isEmpty: true
        }
      }
    }

    const bestResult = response.results[0]
    const bestAlternative = bestResult.alternatives[0]

    if (!bestAlternative) {
      return {
        text: '',
        confidence: 0,
        language: options.language || 'en',
        processingTime,
        metadata: {
          provider: 'google-speech',
          noAlternatives: true
        }
      }
    }

    const alternatives = options.alternatives
      ? bestResult.alternatives.slice(1).map(alt => ({
          text: alt.transcript,
          confidence: alt.confidence
        }))
      : undefined

    return {
      text: bestAlternative.transcript,
      confidence: bestAlternative.confidence,
      language: bestResult.languageCode || options.language || 'en',
      alternatives,
      processingTime,
      metadata: {
        provider: 'google-speech',
        isFinal: bestResult.isFinal,
        stability: bestResult.stability,
        speechEventType: response.speechEventType,
        totalBilledTime: response.totalBilledTime
      }
    }
  }

  private processStreamingResult(
    data: GoogleSpeechResponse,
    streamId: string,
    options: TranscriptionOptions
  ): TranscriptionResult {
    const result = this.processTranscriptionResult(data, 0, options)
    result.metadata = {
      ...result.metadata,
      streamId,
      isStreaming: true
    }
    return result
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  private async testConnection(): Promise<void> {
    if (!this.speechClient) {
      throw new Error('Speech client not available')
    }

    try {
      // In production, this would test actual connectivity
      // For now, we'll simulate a successful test
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      throw new Error(`Connection test failed: ${error}`)
    }
  }

  // Mock speech client implementation for development
  private createMockSpeechClient(): MockSpeechClient {
    const mockClient: MockSpeechClient = {
      recognize: async config => {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300))

        // Mock response based on language
        const language = config.config.languageCode || 'en-US'
        const mockTexts: Record<string, string[]> = {
          'en-US': [
            'Hello, this is a test transcription.',
            'How are you today?',
            'The weather is nice.'
          ],
          'uk-UA': ['Привіт, це тестова транскрипція.', 'Як справи сьогодні?', 'Погода хороша.'],
          'ru-RU': ['Привет, это тестовая транскрипция.', 'Как дела сегодня?', 'Погода хорошая.'],
          'de-DE': [
            'Hallo, dies ist eine Test-Transkription.',
            'Wie geht es dir heute?',
            'Das Wetter ist schön.'
          ],
          'fr-FR': [
            'Bonjour, ceci est une transcription test.',
            "Comment allez-vous aujourd'hui?",
            'Il fait beau.'
          ],
          'es-ES': [
            'Hola, esta es una transcripción de prueba.',
            '¿Cómo estás hoy?',
            'El tiempo es agradable.'
          ]
        }

        const texts = mockTexts[language] || mockTexts['en-US']
        const randomText = texts[Math.floor(Math.random() * texts.length)]
        const confidence = 0.85 + Math.random() * 0.1

        return {
          results: [
            {
              alternatives: [
                {
                  transcript: randomText,
                  confidence: confidence
                },
                {
                  transcript: randomText.replace(/\./g, ''),
                  confidence: confidence - 0.1
                }
              ],
              isFinal: true,
              languageCode: language
            }
          ],
          totalBilledTime: '2s'
        }
      },

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      streamingRecognize: config => {
        const stream = new EventEmitter() as MockRecognizeStream

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        stream.write = (chunk: Buffer) => {
          // Simulate streaming recognition
          setTimeout(
            () => {
              const mockResult: GoogleSpeechResponse = {
                results: [
                  {
                    alternatives: [
                      {
                        transcript: 'Streaming result...',
                        confidence: 0.7 + Math.random() * 0.2
                      }
                    ],
                    isFinal: false,
                    stability: 0.6 + Math.random() * 0.3
                  }
                ]
              }
              stream.emit('data', mockResult)
            },
            100 + Math.random() * 200
          )
          return true
        }

        stream.end = () => {
          setTimeout(() => {
            const finalResult: GoogleSpeechResponse = {
              results: [
                {
                  alternatives: [
                    {
                      transcript: 'Final streaming result.',
                      confidence: 0.9
                    }
                  ],
                  isFinal: true
                }
              ],
              speechEventType: 'END_OF_SINGLE_UTTERANCE'
            }
            stream.emit('data', finalResult)
            stream.emit('end')
          }, 100)
        }

        stream.destroy = () => {
          stream.emit('end')
        }

        return stream
      }
    }

    return mockClient
  }
}

// Factory function
export function createGoogleSpeechProvider(config: GoogleSpeechConfig): GoogleSpeechProvider {
  return new GoogleSpeechProvider(config)
}

// Configuration validation helper
export function validateGoogleSpeechConfig(config: Partial<GoogleSpeechConfig>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!config.projectId) {
    errors.push('projectId is required')
  }

  if (!config.keyFilename && !config.credentials) {
    errors.push('Either keyFilename or credentials must be provided')
  }

  if (config.credentials) {
    if (!config.credentials.client_email) {
      errors.push('credentials.client_email is required')
    }
    if (!config.credentials.private_key) {
      errors.push('credentials.private_key is required')
    }
    if (!config.credentials.project_id) {
      errors.push('credentials.project_id is required')
    }
  }

  if (config.timeout && (config.timeout < 1000 || config.timeout > 300000)) {
    errors.push('timeout must be between 1000ms and 300000ms')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

// Default configuration for different scenarios
export const GoogleSpeechConfigurations = {
  /**
   * Configuration optimized for Ukrainian-English mixed environments
   */
  ukrainianMixed: (projectId: string, credentials: GoogleSpeechConfig['credentials']) => ({
    projectId,
    credentials,
    streamingConfig: {
      config: {
        encoding: 'LINEAR16' as const,
        sampleRateHertz: 16000,
        languageCode: 'uk-UA',
        alternativeLanguageCodes: ['en-US', 'ru-RU'],
        maxAlternatives: 3,
        enableAutomaticPunctuation: true,
        enableWordConfidence: true,
        model: 'latest_long' as const,
        useEnhanced: true
      },
      interimResults: true,
      enableVoiceActivityDetection: true
    }
  }),

  /**
   * High-accuracy configuration
   */
  highAccuracy: (projectId: string, credentials: GoogleSpeechConfig['credentials']) => ({
    projectId,
    credentials,
    streamingConfig: {
      config: {
        encoding: 'LINEAR16' as const,
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        maxAlternatives: 5,
        enableAutomaticPunctuation: true,
        enableWordConfidence: true,
        enableWordTimeOffsets: true,
        model: 'latest_long' as const,
        useEnhanced: true
      },
      interimResults: true
    }
  }),

  /**
   * Low-latency configuration
   */
  lowLatency: (projectId: string, credentials: GoogleSpeechConfig['credentials']) => ({
    projectId,
    credentials,
    streamingConfig: {
      config: {
        encoding: 'LINEAR16' as const,
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        maxAlternatives: 1,
        model: 'latest_short' as const,
        useEnhanced: false
      },
      interimResults: true,
      singleUtterance: true
    }
  })
}
