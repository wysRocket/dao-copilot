import {EventEmitter} from 'events'

interface TranscriptionChunk {
  text: string
  isFinal: boolean
  confidence?: number
  timestamp: number
}

interface StreamingConfig {
  model: string
  responseModalities: string[]
  systemInstruction: string
}

/**
 * Ultra-low latency real-time transcription service
 * Maintains persistent Gemini Live WebSocket connections for instant transcription
 */
export class RealTimeTranscriptionService extends EventEmitter {
  private websocket: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private processor: ScriptProcessorNode | null = null
  private mediaRecorder: MediaRecorder | null = null
  private isConnected = false
  private isSetupComplete = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3
  private config: StreamingConfig
  private connectionStartTime = 0
  private audioChunks: Float32Array[] = []
  private isRecording = false

  constructor() {
    super()
    this.config = {
      model: 'gemini-live-2.5-flash-preview',
      responseModalities: ['TEXT'],
      systemInstruction:
        'You are a real-time speech-to-text transcription system. Provide immediate transcription of spoken words as they are being said. Return only the transcribed text without any additional commentary. Be responsive and provide partial results quickly.'
    }
  }

  /**
   * Initialize persistent WebSocket connection to Gemini Live API
   */
  async initialize(): Promise<void> {
    try {
      this.connectionStartTime = performance.now()
      console.log('🚀 Initializing real-time Gemini transcription service...')

      await this.setupAudioContext()
      await this.connectGeminiWebSocket()
      await this.startAudioCapture()

      console.log(
        `✅ Real-time Gemini service initialized in ${(performance.now() - this.connectionStartTime).toFixed(2)}ms`
      )
      this.emit('initialized')
    } catch (error) {
      console.error('❌ Failed to initialize real-time service:', error)
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Setup audio context for real-time capture with minimal latency
   */
  private async setupAudioContext(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000, // Gemini Live prefers 16kHz
        latencyHint: 'interactive' // Minimize latency
      })

      // Resume context if suspended (browser policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      console.log('🎤 Audio context initialized for real-time capture')
    } catch (error) {
      console.error('❌ Failed to setup audio context:', error)
      throw error
    }
  }

  /**
   * Get API key from environment (Electron or Web)
   */
  private getApiKey(): string | undefined {
    // Primary method: Check Vite environment variables (works in both dev and build)
    if (typeof process !== 'undefined' && process.env) {
      const viteKey = process.env.VITE_GOOGLE_API_KEY
      const regularKey = process.env.GOOGLE_API_KEY
      const geminiKey = process.env.GEMINI_API_KEY

      return viteKey || regularKey || geminiKey
    }

    // Fallback: Check if we're in Electron environment
    if (typeof window !== 'undefined') {
      const electronWindow = window as unknown as {electron?: {env?: Record<string, string>}}
      if (electronWindow.electron?.env) {
        return (
          electronWindow.electron.env.GOOGLE_API_KEY ||
          electronWindow.electron.env.GEMINI_API_KEY ||
          electronWindow.electron.env.VITE_GOOGLE_API_KEY
        )
      }
    }

    return undefined
  }

  /**
   * Connect to Gemini Live WebSocket with persistent connection
   */
  private async connectGeminiWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const apiKey = this.getApiKey()

        if (!apiKey) {
          throw new Error('Gemini API key not found in environment')
        }

        // Create persistent WebSocket connection to Gemini Live API
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.StreamGenerateContent?key=${apiKey}`
        this.websocket = new WebSocket(wsUrl)

        this.websocket.onopen = () => {
          console.log('🔗 Gemini Live WebSocket connected for real-time streaming')
          this.isConnected = true
          this.reconnectAttempts = 0

          // Send initial setup configuration
          this.sendSetupConfig()
        }

        this.websocket.onmessage = event => {
          this.handleGeminiMessage(event)
        }

        this.websocket.onerror = error => {
          console.error('❌ Gemini WebSocket error:', error)
          this.isConnected = false
          this.isSetupComplete = false
          reject(error)
        }

        this.websocket.onclose = event => {
          console.log('🔌 Gemini WebSocket disconnected:', event.code, event.reason)
          this.isConnected = false
          this.isSetupComplete = false
          this.handleReconnection()
        }

        // Wait for setup completion
        this.once('setup-complete', () => {
          console.log('✅ Gemini Live setup completed')
          resolve()
        })

        this.once('setup-error', error => {
          reject(error)
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Send initial setup configuration to Gemini Live API
   */
  private sendSetupConfig(): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return
    }

    const setupMessage = {
      setup: {
        model: `models/${this.config.model}`,
        generationConfig: {
          responseModalities: this.config.responseModalities,
          systemInstruction: this.config.systemInstruction,
          candidateCount: 1,
          maxOutputTokens: 2048,
          temperature: 0,
          topP: 1
        }
      }
    }

    console.log('📤 Sending Gemini Live setup config...')
    this.websocket.send(JSON.stringify(setupMessage))
  }

  /**
   * Start continuous audio capture with MediaRecorder for better performance
   */
  private async startAudioCapture(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      // Use MediaRecorder for efficient audio capture
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 16000
      })

      let audioBuffer: BlobPart[] = []

      this.mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0 && this.isSetupComplete) {
          audioBuffer.push(event.data)

          // Send audio data every 100ms for real-time processing
          if (audioBuffer.length >= 1) {
            this.sendAudioData(audioBuffer)
            audioBuffer = []
          }
        }
      }

      this.mediaRecorder.onerror = event => {
        console.error('❌ MediaRecorder error:', event)
        this.emit('error', new Error('Audio recording failed'))
      }

      // Start recording in 100ms chunks for real-time streaming
      this.mediaRecorder.start(100)
      this.isRecording = true

      console.log('🎤 Real-time audio capture started with MediaRecorder')
    } catch (error) {
      console.error('❌ Failed to start audio capture:', error)
      throw error
    }
  }

  /**
   * Send audio data to Gemini Live API
   */
  private async sendAudioData(audioChunks: BlobPart[]): Promise<void> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      return
    }

    try {
      // Combine audio chunks into a single blob
      const audioBlob = new Blob(audioChunks, {type: 'audio/webm;codecs=opus'})

      // Convert to base64 for Gemini API
      const arrayBuffer = await audioBlob.arrayBuffer()
      const base64Audio = this.arrayBufferToBase64(arrayBuffer)

      const audioMessage = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: 'audio/webm;codecs=opus',
              data: base64Audio
            }
          ]
        }
      }

      this.websocket.send(JSON.stringify(audioMessage))
    } catch (error) {
      console.error('❌ Failed to send audio data:', error)
    }
  }

  /**
   * Handle messages from Gemini Live API
   */
  private handleGeminiMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data)

      // Handle setup completion
      if (data.setupComplete) {
        this.isSetupComplete = true
        this.emit('setup-complete')
        return
      }

      // Handle server content (transcription results)
      if (data.serverContent) {
        const content = data.serverContent

        if (content.modelTurn && content.modelTurn.parts) {
          const textParts = content.modelTurn.parts.filter((part: any) => part.text)

          if (textParts.length > 0) {
            const text = textParts.map((part: any) => part.text).join(' ')
            const isFinal = !!content.turnComplete

            const chunk: TranscriptionChunk = {
              text: text.trim(),
              isFinal,
              confidence: 0.9, // Gemini doesn't provide confidence scores
              timestamp: performance.now()
            }

            // Emit immediately for zero-latency display
            this.emit('transcription', chunk)

            if (isFinal) {
              console.log(`📝 Final: "${chunk.text}"`)
            } else {
              console.log(`📝 Interim: "${chunk.text}"`)
            }
          }
        }
      }

      // Handle errors
      if (data.error) {
        console.error('❌ Gemini transcription error:', data.error)
        this.emit('error', new Error(data.error.message || 'Transcription failed'))
      }
    } catch (error) {
      console.error('❌ Failed to parse Gemini message:', error)
    }
  }

  /**
   * Handle WebSocket reconnection with exponential backoff
   */
  private handleReconnection(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(
        `🔄 Attempting Gemini reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`
      )

      setTimeout(
        () => {
          this.connectGeminiWebSocket().catch(error => {
            console.error('❌ Gemini reconnection failed:', error)
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
              this.emit('error', new Error('Max reconnection attempts reached'))
            }
          })
        },
        1000 * Math.pow(2, this.reconnectAttempts)
      ) // Exponential backoff
    }
  }

  /**
   * Convert ArrayBuffer to base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  /**
   * Stop the transcription service
   */
  stop(): void {
    console.log('🛑 Stopping real-time Gemini transcription service...')

    this.isRecording = false
    this.isSetupComplete = false

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
      this.mediaRecorder = null
    }

    if (this.processor) {
      this.processor.disconnect()
      this.processor = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close()
      this.audioContext = null
    }

    if (this.websocket) {
      this.websocket.close(1000, 'Service stopped')
      this.websocket = null
    }

    this.isConnected = false
    this.emit('stopped')
  }

  /**
   * Get current connection status
   */
  getStatus(): {
    connected: boolean
    latency: number
    reconnectAttempts: number
    setupComplete: boolean
  } {
    return {
      connected: this.isConnected,
      latency: this.connectionStartTime > 0 ? performance.now() - this.connectionStartTime : 0,
      reconnectAttempts: this.reconnectAttempts,
      setupComplete: this.isSetupComplete
    }
  }
}
