import {EventEmitter} from 'events'
import {
  resampleAudio,
  convertFloat32ToPCM16,
  convertAudioToBase64,
  createAudioMimeType
} from './gemini-audio-utils'
import {logger} from '../utils/logger'

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
  private workletNode: AudioWorkletNode | null = null
  private mediaRecorder: MediaRecorder | null = null
  private isConnected = false
  private isSetupComplete = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3
  private config: StreamingConfig
  private connectionStartTime = 0
  private audioChunks: Float32Array[] = []
  private isRecording = false
  // Buffer audio chunks that arrive before Gemini setup completes
  private pendingAudio: string[] = [] // base64 encoded PCM frames
  // PCM framing - increased for better quality
  private targetSampleRate = 16000
  private frameDurationMs = 100 // Increased from 20ms to 100ms for better transcription quality
  private samplesPerFrame = Math.floor((16000 * 100) / 1000) // 1600 samples
  private overlapMs = 20 // Reduced overlap
  private overlapSamples = Math.floor((16000 * 20) / 1000) // 320 samples
  private floatBuffer: Float32Array = new Float32Array(0)
  // Simple backpressure-aware send queue
  private sendQueue: string[] = []
  private drainTimer: number | null = null
  private bufferedThreshold = 256 * 1024 // 256KB
  // Congestion-aware coalescing of frames into a single WS message - optimized for quality
  private coalesceBuffer: string[] = []
  private coalesceTimer: number | null = null
  private coalesceMaxFrames = 5 // Increased from 3 for better context
  private coalesceDelayMs = 50 // Increased from 5ms for better quality
  private congestionThreshold = Math.floor((256 * 1024) / 2)
  // Lightweight metrics interval
  private metricsTimer: number | null = null
  // No-text detection timer
  private noTextTimer: number | null = null
  private noTextTimeoutMs = 8000 // Increased timeout
  // Adaptive tuning state
  private metricsWindow: Array<{buffered: number; qlen: number; t: number}> = []
  private lastAutoAdjustAt = 0
  private autoAdjustCooldownMs = 2000 // Increased cooldown
  private coalesceMaxFramesBounds: [number, number] = [3, 8] // Increased range
  // Latency sampling (rough): timestamp last audio enqueue
  private lastEnqueueAt = 0
  // Optional silence gating to reduce traffic during inactivity
  private enableSilenceDrop = false
  private silenceRmsThreshold = 0.005 // ~ -46 dBFS
  private silenceKeepAliveEvery = 20 // send every Nth silent frame
  private silentFrameCounter = 0
  // Mixed capture configuration
  private preferredCaptureMode: 'mic' | 'system' | 'mixed' = 'mixed'
  private mixedCaptureAttempted = false
  // Instrumentation counters
  private framesCaptured = 0
  private framesQueuedBeforeSetup = 0
  private framesSent = 0
  private firstTranscriptionAt = 0
  private lastTranscriptionAt = 0
  private rawMessageLog: unknown[] = []
  private messageCounter = 0

  private updateDebugProbe(): void {
    if (typeof window === 'undefined') return
    const w = window as unknown as {__REALTIME_TRANSCRIPTION_DEBUG?: Record<string, unknown>}
    if (!w.__REALTIME_TRANSCRIPTION_DEBUG) w.__REALTIME_TRANSCRIPTION_DEBUG = {}
    w.__REALTIME_TRANSCRIPTION_DEBUG.realtime = {
      framesCaptured: this.framesCaptured,
      framesQueuedBeforeSetup: this.framesQueuedBeforeSetup,
      framesSent: this.framesSent,
      firstTranscriptionAt: this.firstTranscriptionAt,
      lastTranscriptionAt: this.lastTranscriptionAt,
      isSetupComplete: this.isSetupComplete,
      isConnected: this.isConnected,
      sendQueue: this.sendQueue.length,
      bufferedAmount: this.websocket?.bufferedAmount ?? 0,
      coalesceBuffer: this.coalesceBuffer.length,
      coalesceMaxFrames: this.coalesceMaxFrames
    }
  }

  /**
   * Enqueue a JSON-serializable message for sending over WebSocket.
   * Applies backpressure using websocket.bufferedAmount and drains progressively.
   */
  private enqueueWsMessage(obj: unknown): void {
    try {
      const payload = JSON.stringify(obj)
      this.sendQueue.push(payload)
      this.scheduleDrain()
    } catch (e) {
      logger.warn('Failed to enqueue WS message:', e)
    }
  }

  private scheduleDrain(): void {
    if (this.drainTimer != null) return
    const drain = () => {
      if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        // Try again soon if socket is reconnecting
        this.drainTimer = window.setTimeout(drain, 25)
        return
      }

      // Drain while under threshold
      while (
        this.sendQueue.length > 0 &&
        this.websocket.bufferedAmount < this.bufferedThreshold &&
        this.websocket.readyState === WebSocket.OPEN
      ) {
        const msg = this.sendQueue.shift()!
        try {
          this.websocket.send(msg)
        } catch (e) {
          // Put back and retry later
          this.sendQueue.unshift(msg)
          logger.warn('WS send failed during drain, will retry:', e)
          break
        }
      }

      if (this.sendQueue.length > 0) {
        // Still have backlog, schedule next tick with small delay
        this.drainTimer = window.setTimeout(drain, 10)
      } else {
        // Queue empty; clear timer
        this.drainTimer = null
      }
    }

    this.drainTimer = window.setTimeout(drain, 0)
  }

  constructor() {
    super()
    this.config = {
      model: 'gemini-live-2.5-flash-preview-native-audio', // Native audio model for transcription
      responseModalities: ['TEXT'], // Only want text transcription, not audio response
      systemInstruction: 'Transcribe speech to text. Output only what was spoken.'
    }
  }

  /**
   * Initialize persistent WebSocket connection to Gemini Live API
   */
  async initialize(): Promise<void> {
    try {
      this.connectionStartTime = performance.now()
      logger.log('🚀 Initializing real-time Gemini transcription service...')

      // Clear all buffers and reset counters for clean start - CRITICAL FIX
      this.pendingAudio = []
      this.audioChunks = []
      this.floatBuffer = new Float32Array(0)
      this.framesCaptured = 0
      this.framesQueuedBeforeSetup = 0
      this.framesSent = 0
      this.firstTranscriptionAt = 0
      this.lastTranscriptionAt = 0
      this.reconnectAttempts = 0
      this.messageCounter = 0
      this.rawMessageLog = []
      this.silentFrameCounter = 0
      this.lastEnqueueAt = 0
      this.metricsWindow = []
      this.lastAutoAdjustAt = 0
      this.sendQueue = []
      this.coalesceBuffer = []
      logger.log('🧹 Cleared all buffers for clean start')

      // Audio context first (required by browsers), then parallelize capture + websocket
      await this.setupAudioContext()
      await Promise.all([this.startAudioCapture(), this.connectGeminiWebSocket()])

      logger.log(
        `✅ Real-time Gemini service initialized in ${(performance.now() - this.connectionStartTime).toFixed(2)}ms`
      )
      this.emit('initialized')
    } catch (error) {
      logger.error('❌ Failed to initialize real-time service:', error)
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Setup audio context for real-time capture with minimal latency
   */
  private async setupAudioContext(): Promise<void> {
    try {
      const win = window as unknown as {
        AudioContext: typeof AudioContext
        webkitAudioContext?: typeof AudioContext
      }
      this.audioContext = new (win.AudioContext || win.webkitAudioContext!)({
        sampleRate: 16000, // Gemini Live prefers 16kHz
        latencyHint: 'interactive' // Minimize latency
      })

      // Resume context if suspended (browser policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      logger.log('🎤 Audio context initialized for real-time capture')
    } catch (error) {
      logger.error('❌ Failed to setup audio context:', error)
      throw error
    }
  }

  /**
   * Get API key from environment (Electron or Web)
   */
  private getApiKey(): string | undefined {
    // Candidate variable names (order = priority)
    const CANDIDATES = [
      'VITE_GOOGLE_API_KEY',
      'GOOGLE_API_KEY',
      'GEMINI_API_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY'
    ] as const

    let found: string | undefined
    const foundSources: Array<{name: string; present: boolean; prefix?: string}> = []

    if (typeof process !== 'undefined' && process.env) {
      for (const name of CANDIDATES) {
        const val = process.env[name]
        foundSources.push({name, present: !!val, prefix: val ? val.substring(0, 6) : undefined})
        if (!found && val) found = val
      }
    }

    // Renderer / preload injected environment (Electron)
    if (!found && typeof window !== 'undefined') {
      const electronWindow = window as unknown as {electron?: {env?: Record<string, string>}}
      const env = electronWindow.electron?.env
      if (env) {
        for (const name of CANDIDATES) {
          const val = env[name]
          const existing = foundSources.find(s => s.name === name)
          if (!existing) {
            foundSources.push({name, present: !!val, prefix: val ? val.substring(0, 6) : undefined})
          } else if (!existing.present && val) {
            existing.present = true
            existing.prefix = val.substring(0, 6)
          }
          if (!found && val) found = val
        }
      }
    }

    // Expose debug info (without full key) for troubleshooting
    if (typeof window !== 'undefined') {
      const w = window as unknown as {__REALTIME_TRANSCRIPTION_DEBUG?: Record<string, unknown>}
      if (!w.__REALTIME_TRANSCRIPTION_DEBUG) w.__REALTIME_TRANSCRIPTION_DEBUG = {}
      w.__REALTIME_TRANSCRIPTION_DEBUG.apiKeyProbe = foundSources
      w.__REALTIME_TRANSCRIPTION_DEBUG.apiKeyFound = !!found
    }

    if (!found) {
      console.warn(
        '🔐 Gemini API key not located. Checked variables:',
        foundSources.map(s => `${s.name}=${s.present ? s.prefix + '…' : '∅'}`).join(', ')
      )
    } else {
      console.log(
        '🔐 Gemini API key resolved from environment (masked):',
        found.substring(0, 6) + '…'
      )
    }

    return found
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

          // Start metrics emission
          if (this.metricsTimer == null) {
            this.metricsTimer = window.setInterval(() => {
              try {
                const buffered = this.websocket?.bufferedAmount ?? 0
                const qlen = this.sendQueue.length
                const now = performance.now()
                // keep small rolling window (last ~5s)
                this.metricsWindow.push({buffered, qlen, t: now})
                const fiveSecAgo = now - 5000
                this.metricsWindow = this.metricsWindow.filter(m => m.t >= fiveSecAgo)

                // Emit
                this.emit('metrics', {
                  queueLength: this.sendQueue.length,
                  bufferedAmount: buffered
                })

                // Adaptive tuning with hysteresis and cooldown
                const samples = this.metricsWindow
                if (samples.length >= 3) {
                  const avgBuffered = samples.reduce((a, b) => a + b.buffered, 0) / samples.length
                  const avgQ = samples.reduce((a, b) => a + b.qlen, 0) / samples.length
                  const sinceAdjust = now - this.lastAutoAdjustAt
                  if (sinceAdjust > this.autoAdjustCooldownMs) {
                    // Congested: raise coalescing a bit
                    if (avgBuffered > this.congestionThreshold * 1.2 || avgQ > 800) {
                      const next = Math.min(
                        this.coalesceMaxFrames + 1,
                        this.coalesceMaxFramesBounds[1]
                      )
                      if (next !== this.coalesceMaxFrames) {
                        this.coalesceMaxFrames = next
                        this.coalesceDelayMs = Math.min(this.coalesceDelayMs + 2, 12)
                        this.lastAutoAdjustAt = now
                      }
                    }
                    // Clear: reduce coalescing for lower latency
                    else if (avgBuffered < this.congestionThreshold * 0.2 && avgQ < 100) {
                      const next = Math.max(
                        this.coalesceMaxFrames - 1,
                        this.coalesceMaxFramesBounds[0]
                      )
                      if (next !== this.coalesceMaxFrames) {
                        this.coalesceMaxFrames = next
                        this.coalesceDelayMs = Math.max(this.coalesceDelayMs - 2, 2)
                        this.lastAutoAdjustAt = now
                      }
                    }
                  }
                }
              } catch {
                // ignore metrics emit errors
              }
              this.updateDebugProbe()
            }, 1000)
          }

          // Schedule no-text warning after setup completes; if already setup, start timer now
          if (this.noTextTimer) {
            clearTimeout(this.noTextTimer)
          }
          this.noTextTimer = window.setTimeout(() => {
            if (this.firstTranscriptionAt === 0 && this.framesSent > 10) {
              console.warn(
                `⚠️ No transcription text received after ${this.noTextTimeoutMs}ms. framesSent=${this.framesSent}, framesCaptured=${this.framesCaptured}`
              )
              this.emit('no-text', {
                framesCaptured: this.framesCaptured,
                framesSent: this.framesSent,
                setupComplete: this.isSetupComplete
              })
            }
          }, this.noTextTimeoutMs)
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
        systemInstruction: {
          parts: [
            {
              text: this.config.systemInstruction
            }
          ]
        },
        generationConfig: {
          responseModalities: this.config.responseModalities,
          candidateCount: 1,
          maxOutputTokens: 2048,
          temperature: 0.1,
          topP: 0.95,
          topK: 40,
          // Enable input audio transcription - CRITICAL for getting transcripts
          inputAudioTranscription: {
            language: 'en-US' // Can be auto-detected or set to specific language
          },
          // Disable output audio since we only want text transcription
          outputAudioTranscription: {}
        }
      }
    }

    console.log('📤 Enqueueing Gemini Live setup config with proper structure...')
    console.log('📝 System instruction:', this.config.systemInstruction)
    this.enqueueWsMessage(setupMessage)
  }

  /**
   * Start continuous audio capture with MediaRecorder for better performance
   */
  private async startAudioCapture(): Promise<void> {
    try {
      // Decide capture strategy (env override optional)
      try {
        const envMode =
          (typeof process !== 'undefined' && process.env.REALTIME_CAPTURE_MODE) ||
          (typeof window !== 'undefined'
            ? (window as unknown as {__REALTIME_TRANSCRIPTION_MODE__?: string})
                .__REALTIME_TRANSCRIPTION_MODE__
            : undefined)
        if (envMode === 'mic' || envMode === 'system' || envMode === 'mixed') {
          this.preferredCaptureMode = envMode
        }
      } catch {
        // ignore
      }

      const wantMixed = this.preferredCaptureMode === 'mixed'
      let micStream: MediaStream | null = null
      let systemStream: MediaStream | null = null

      // Always get mic first (faster prompt on most platforms)
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true, // Enable for better quality
            noiseSuppression: true, // Enable for cleaner audio
            autoGainControl: true // Enable for consistent volume
          }
        })
      } catch (e) {
        console.warn('⚠️ Mic capture failed:', e)
        // Fallback with simpler constraints
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              sampleRate: 16000
            }
          })
        } catch (fallbackError) {
          console.error('❌ Mic capture completely failed:', fallbackError)
        }
      }

      if (wantMixed || this.preferredCaptureMode === 'system') {
        try {
          systemStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: {width: 320, height: 180, frameRate: 5}
          })
          this.mixedCaptureAttempted = true
        } catch (e) {
          console.warn('⚠️ System audio capture failed or denied:', e)
        }
      }

      // If we have both streams, mix them into single MediaStream
      if (micStream && systemStream) {
        console.log('🎛️ Using mixed mic+system real-time capture')
        if (!this.audioContext) throw new Error('AudioContext not initialized')
        const destination = this.audioContext.createMediaStreamDestination()
        const micSource = this.audioContext.createMediaStreamSource(micStream)
        const sysSource = this.audioContext.createMediaStreamSource(systemStream)
        const micGain = this.audioContext.createGain()
        const sysGain = this.audioContext.createGain()
        micGain.gain.value = 0.9
        sysGain.gain.value = 0.9
        micSource.connect(micGain).connect(destination)
        sysSource.connect(sysGain).connect(destination)
        this.mediaStream = destination.stream
        // Keep references so we can stop later
        interface ExtendedStream extends MediaStream {
          __micTracks?: MediaStreamTrack[]
          __systemTracks?: MediaStreamTrack[]
        }
        const ext = this.mediaStream as ExtendedStream
        ext.__micTracks = micStream.getTracks()
        ext.__systemTracks = systemStream.getTracks()
      } else if (systemStream) {
        console.log('🎧 Using system audio only for real-time capture')
        this.mediaStream = systemStream
      } else if (micStream) {
        console.log('🎤 Using microphone only for real-time capture')
        this.mediaStream = micStream
      } else {
        throw new Error('No audio sources available (mic & system capture failed)')
      }

      if (!this.audioContext) throw new Error('AudioContext not initialized')
      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      // Silent sink keeps processing graph alive without audible output
      const silentSink = this.audioContext.createGain()
      silentSink.gain.value = 0
      silentSink.connect(this.audioContext.destination)

      // Prefer AudioWorklet for lower jitter; fallback to ScriptProcessor
      let workletReady = false
      try {
        await this.audioContext.audioWorklet.addModule(
          new URL('./workers/audio-streaming-worklet.js', import.meta.url)
        )

        this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-streaming-processor', {
          processorOptions: {
            bufferSize: 256,
            sampleRate: this.audioContext.sampleRate
          }
        })

        this.workletNode.port.onmessage = event => {
          const msg = event.data as {type: string; audioData?: Float32Array; sampleRate?: number}
          if (msg.type === 'audioData' && msg.audioData) {
            this.handleFloatAudio(msg.audioData, msg.sampleRate || this.audioContext!.sampleRate)
          }
        }

        source.connect(this.workletNode)
        // Route to silent sink to keep node alive without audio output
        this.workletNode.connect(silentSink)
        workletReady = true
        console.log('🎧 AudioWorklet capture enabled')
      } catch (err) {
        console.warn('AudioWorklet not available, using ScriptProcessor fallback:', err)
      }

      if (!workletReady) {
        const bufferSize = 256
        this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1)
        this.processor.onaudioprocess = e => {
          const input = new Float32Array(e.inputBuffer.getChannelData(0))
          this.handleFloatAudio(input, this.audioContext!.sampleRate)
        }
        source.connect(this.processor)
        this.processor.connect(silentSink)
      }

      this.isRecording = true
      console.log('🎤 Real-time audio capture started with PCM streaming')
    } catch (error) {
      console.error('❌ Failed to start audio capture:', error)
      throw error
    }
  }

  /**
   * Ingest Float32 audio, resample to 16 kHz, frame to ~30 ms, and enqueue/send
   */
  private handleFloatAudio(input: Float32Array, originalRate: number): void {
    const mono16k =
      originalRate === this.targetSampleRate
        ? input
        : resampleAudio(input, originalRate, this.targetSampleRate)

    // Append to rolling buffer
    if (this.floatBuffer.length === 0) {
      this.floatBuffer = mono16k
    } else {
      const tmp = new Float32Array(this.floatBuffer.length + mono16k.length)
      tmp.set(this.floatBuffer, 0)
      tmp.set(mono16k, this.floatBuffer.length)
      this.floatBuffer = tmp
    }

    // While we have at least one full frame, send it
    while (this.floatBuffer.length >= this.samplesPerFrame) {
      const frame = this.floatBuffer.slice(0, this.samplesPerFrame)
      // Keep overlap by not discarding the last N samples
      const discard = Math.max(0, this.samplesPerFrame - this.overlapSamples)
      this.floatBuffer = this.floatBuffer.slice(discard)
      this.framesCaptured++

      // Optional silence gating
      if (this.enableSilenceDrop) {
        let sum = 0
        for (let i = 0; i < frame.length; i++) {
          const v = frame[i]
          sum += v * v
        }
        const rms = Math.sqrt(sum / frame.length)
        if (rms < this.silenceRmsThreshold) {
          this.silentFrameCounter++
          if (this.silentFrameCounter % this.silenceKeepAliveEvery !== 0) {
            continue
          }
        } else {
          this.silentFrameCounter = 0
        }
      }

      const pcm = convertFloat32ToPCM16(frame)
      const base64 = convertAudioToBase64(pcm)

      if (!this.isSetupComplete) {
        this.pendingAudio.push(base64)
        this.framesQueuedBeforeSetup++
      } else {
        this.sendPcmBase64(base64)
      }
      this.updateDebugProbe()
    }
  }

  /**
   * Send audio data to Gemini Live API
   */
  private async sendPcmBase64(base64Audio: string): Promise<void> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      return
    }

    try {
      this.lastEnqueueAt = performance.now()
      const enqueueSingle = () => {
        const audioMessage = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: createAudioMimeType(this.targetSampleRate),
                data: base64Audio
              }
            ]
          }
        }
        this.enqueueWsMessage(audioMessage)
      }

      // If socket is congested, coalesce multiple frames into a single message
      const buffered = this.websocket.bufferedAmount
      if (buffered > this.congestionThreshold || this.sendQueue.length > 1000) {
        this.coalesceBuffer.push(base64Audio)
        if (this.coalesceTimer == null) {
          this.coalesceTimer = window.setTimeout(() => {
            const frames: string[] = []
            while (frames.length < this.coalesceMaxFrames && this.coalesceBuffer.length > 0) {
              frames.push(this.coalesceBuffer.shift()!)
            }
            if (frames.length > 0) {
              const audioMessage = {
                realtimeInput: {
                  mediaChunks: frames.map(data => ({
                    mimeType: createAudioMimeType(this.targetSampleRate),
                    data
                  }))
                }
              }
              this.enqueueWsMessage(audioMessage)
              this.framesSent += frames.length
              this.updateDebugProbe()
            }
            this.coalesceTimer = null
          }, this.coalesceDelayMs)
        }
      } else {
        enqueueSingle()
        this.framesSent++
        this.updateDebugProbe()
      }
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
      this.messageCounter++
      if (this.rawMessageLog.length < 10) {
        this.rawMessageLog.push(data)
        this.updateDebugProbe()
      }
      if (this.messageCounter <= 10) {
        console.debug('[Gemini][RAW]', this.messageCounter, Object.keys(data))
      }

      // Handle setup completion
      if (data.setupComplete) {
        this.isSetupComplete = true
        this.emit('setup-complete')
        // Flush any audio captured before setup completed
        this.flushPendingAudio()
        this.updateDebugProbe()
        return
      }

      // Handle server content (transcription results)
      if (data.serverContent) {
        const content: Record<string, unknown> = data.serverContent as Record<string, unknown>
        let textCandidate: string | null = null

        // First, look for dedicated input_transcription field (Gemini Live native audio)
        if (content.input_transcription && typeof content.input_transcription === 'object') {
          const inputTranscription = content.input_transcription as Record<string, unknown>
          if (typeof inputTranscription.text === 'string') {
            textCandidate = inputTranscription.text
            console.log('📝 Found input_transcription:', textCandidate)
          }
        }

        // Also check for inputTranscription (alternative field name)
        if (
          !textCandidate &&
          content.inputTranscription &&
          typeof content.inputTranscription === 'object'
        ) {
          const inputTranscription = content.inputTranscription as Record<string, unknown>
          if (typeof inputTranscription.text === 'string') {
            textCandidate = inputTranscription.text
            console.log('📝 Found inputTranscription:', textCandidate)
          }
        }

        // Legacy parsing for other field structures
        if (!textCandidate) {
          const it = (content as Record<string, unknown>).inputTranscription as unknown
          if (it && typeof it === 'object') {
            const rec = it as Record<string, unknown>
            const direct = typeof rec.text === 'string' ? rec.text : null
            const nested =
              rec.transcription &&
              typeof (rec.transcription as Record<string, unknown>).text === 'string'
                ? ((rec.transcription as Record<string, unknown>).text as string)
                : null
            const alt =
              rec.partial && typeof (rec.partial as Record<string, unknown>).text === 'string'
                ? ((rec.partial as Record<string, unknown>).text as string)
                : null
            textCandidate = direct || nested || alt || textCandidate
          }
        }

        // Log all fields for debugging
        console.log('🔍 All serverContent fields:', Object.keys(content))
        if (this.messageCounter <= 5) {
          console.log('🔍 Full serverContent:', JSON.stringify(content, null, 2))
        }

        // Heuristic scan: look for first string-valued 'text' deep inside if still empty
        if (!textCandidate) {
          try {
            const stack: unknown[] = [content]
            let safety = 0
            while (stack.length && !textCandidate && safety < 200) {
              safety++
              const node = stack.pop()
              if (!node || typeof node !== 'object') continue
              for (const [k, v] of Object.entries(node)) {
                if (!textCandidate && k.toLowerCase().includes('text') && typeof v === 'string') {
                  textCandidate = v
                  break
                }
                if (typeof v === 'object' && v) stack.push(v)
              }
            }
          } catch {
            // ignore scan errors
          }
        }

        // ===== CRITICAL FIX: Block modelTurn responses from transcription =====
        // Check if this is a modelTurn response (AI/search results)
        const hasModelTurn = !!content.modelTurn
        if (hasModelTurn) {
          console.group('🚨 REAL-TIME-TRANSCRIPTION: Blocking modelTurn response')
          console.warn('🚨 BLOCKING modelTurn response from being processed as transcription!')
          console.warn('🚨 This should be handled by Chat tab, not Transcriptions tab')
          console.warn('🚨 Content keys:', Object.keys(content))
          console.groupEnd()
          return // Block AI responses/search results from transcription processing
        }

        // Fallback to modelTurn.parts[].text - REMOVED DUE TO SECURITY ISSUE
        // This was causing Google Search results to appear in Transcriptions tab
        // const mt = content.modelTurn as unknown as Record<string, unknown> | undefined
        // const rawParts = mt && 'parts' in mt ? (mt.parts as unknown) : undefined
        // const mtParts = Array.isArray(rawParts) ? (rawParts as Array<unknown>) : null
        // if (!textCandidate && mtParts) {
        //   const parts = mtParts.filter((p): p is {text: string} => {
        //     if (!p || typeof p !== 'object') return false
        //     const maybe = p as Record<string, unknown>
        //     return typeof maybe.text === 'string'
        //   })
        //   if (parts.length > 0) {
        //     textCandidate = parts.map(part => part.text).join(' ')
        //   }
        // }

        if (typeof textCandidate === 'string' && textCandidate.trim().length > 0) {
          const cleanText = textCandidate.trim()

          // Filter out test data and corrupted text - CRITICAL FIX
          const isTestData =
            cleanText.toLowerCase().includes('quick brown fox') ||
            cleanText.toLowerCase().includes('lazy dog') ||
            cleanText.includes('The quick') ||
            cleanText.includes('jumps over')

          // Filter out non-Latin characters that might indicate encoding issues
          const hasCorruptedChars =
            /[\u0500-\u052F]/.test(cleanText) || // Cyrillic Extension-A
            /[\u0530-\u058F]/.test(cleanText) || // Armenian
            /[\u0590-\u05FF]/.test(cleanText) // Hebrew

          if (isTestData) {
            console.warn('🚫 Filtered out test data:', cleanText)
            return
          }

          if (hasCorruptedChars) {
            console.warn('🚫 Filtered out corrupted text with encoding issues:', cleanText)
            return
          }

          const isFinal = !!content.turnComplete
          const chunk: TranscriptionChunk = {
            text: cleanText,
            isFinal,
            confidence: 0.9,
            timestamp: performance.now()
          }
          this.emit('transcription', chunk)
          if (this.firstTranscriptionAt === 0) {
            this.firstTranscriptionAt = performance.now()
            if (this.noTextTimer) {
              clearTimeout(this.noTextTimer)
              this.noTextTimer = null
            }
          }
          this.lastTranscriptionAt = performance.now()
          this.updateDebugProbe()
          // Emit a rough latency sample from last audio enqueue to first text
          if (this.lastEnqueueAt > 0) {
            const latencyMs = performance.now() - this.lastEnqueueAt
            this.emit('latency', {ms: latencyMs})
          }
          if (isFinal) console.log(`📝 Final: "${chunk.text}"`)
          else console.log(`📝 Interim: "${chunk.text}"`)
        } else if (
          data.serverContent &&
          (data.serverContent.turnComplete || data.serverContent.inputTranscription)
        ) {
          // Received a serverContent structure but no text extracted – log once per turnComplete
          if (data.serverContent.turnComplete) {
            console.warn(
              '⚠️ Received turnComplete with no extractable text. serverContent keys:',
              Object.keys(data.serverContent)
            )
            this.emit('empty-transcription', {serverContent: data.serverContent})
          }
        }
      }

      // Handle errors
      if (data.error) {
        console.error('❌ Gemini transcription error:', data.error)
        this.emit('error', new Error(data.error.message || 'Transcription failed'))
      }
      // If we reach many messages with no transcription, emit diagnostic snapshot
      if (this.firstTranscriptionAt === 0 && this.framesSent > 30 && this.messageCounter > 15) {
        this.emit('diagnostic', {
          reason: 'no-text-after-messages',
          framesSent: this.framesSent,
          messageCounter: this.messageCounter,
          sampleMessages: this.rawMessageLog.slice(0, 5)
        })
      }
    } catch (error) {
      console.error('❌ Failed to parse Gemini message:', error)
    }
  }

  /**
   * Flush any pending audio chunks captured before setup completion
   */
  private async flushPendingAudio(): Promise<void> {
    if (!this.pendingAudio.length) return
    const buffered = [...this.pendingAudio]
    this.pendingAudio = []
    try {
      // Batch frames to avoid initial surge (3 frames ~= 60ms per message)
      const batchSize = this.coalesceMaxFrames
      for (let i = 0; i < buffered.length; i += batchSize) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) break
        const group = buffered.slice(i, i + batchSize)
        const audioMessage = {
          realtimeInput: {
            mediaChunks: group.map(data => ({
              mimeType: createAudioMimeType(this.targetSampleRate),
              data
            }))
          }
        }
        this.enqueueWsMessage(audioMessage)
      }
    } catch (e) {
      console.warn('Failed flushing pending audio:', e)
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

    // MediaRecorder not used in PCM path
    this.mediaRecorder = null

    if (this.processor) {
      this.processor.disconnect()
      this.processor = null
    }

    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode = null
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

    if (this.noTextTimer) {
      clearTimeout(this.noTextTimer)
      this.noTextTimer = null
    }

    if (this.firstTranscriptionAt === 0 && this.framesSent > 0) {
      console.warn(
        `⚠️ Real-time session ended with no transcription text. framesSent=${this.framesSent}, framesCaptured=${this.framesCaptured}`
      )
      this.emit('no-text', {
        framesCaptured: this.framesCaptured,
        framesSent: this.framesSent,
        setupComplete: this.isSetupComplete
      })
      this.updateDebugProbe()
    }

    // Clear send queue and timers
    this.sendQueue = []
    if (this.drainTimer != null) {
      clearTimeout(this.drainTimer)
      this.drainTimer = null
    }
    if (this.coalesceTimer != null) {
      clearTimeout(this.coalesceTimer)
      this.coalesceTimer = null
      this.coalesceBuffer = []
    }
    if (this.metricsTimer != null) {
      clearInterval(this.metricsTimer)
      this.metricsTimer = null
    }

    // Clear all audio buffers and reset counters - CRITICAL FIX
    this.pendingAudio = []
    this.audioChunks = []
    this.floatBuffer = new Float32Array(0)
    this.framesCaptured = 0
    this.framesQueuedBeforeSetup = 0
    this.framesSent = 0
    this.firstTranscriptionAt = 0
    this.lastTranscriptionAt = 0
    this.reconnectAttempts = 0
    this.messageCounter = 0
    this.rawMessageLog = []
    this.silentFrameCounter = 0
    this.lastEnqueueAt = 0
    this.metricsWindow = []
    this.lastAutoAdjustAt = 0

    console.log('🧹 Cleared all audio buffers and reset counters')

    this.isConnected = false
    this.emit('stopped')
  }

  /**
   * Force cleanup and reset all buffers and state
   * Use this when you suspect buffer corruption or persistent issues
   */
  forceCleanup(): void {
    console.log('🧹 Force cleanup: Resetting all buffers and state...')

    // Stop everything first
    this.stop()

    // Force garbage collection of any remaining references
    setTimeout(() => {
      // Additional cleanup after stop
      this.pendingAudio = []
      this.audioChunks = []
      this.floatBuffer = new Float32Array(0)
      this.sendQueue = []
      this.coalesceBuffer = []
      this.rawMessageLog = []
      this.metricsWindow = []

      // Reset all counters
      this.framesCaptured = 0
      this.framesQueuedBeforeSetup = 0
      this.framesSent = 0
      this.firstTranscriptionAt = 0
      this.lastTranscriptionAt = 0
      this.reconnectAttempts = 0
      this.messageCounter = 0
      this.silentFrameCounter = 0
      this.lastEnqueueAt = 0
      this.lastAutoAdjustAt = 0

      console.log('✅ Force cleanup completed')
      this.emit('cleaned')
    }, 100)
  }

  /**
   * Runtime tuning for streaming thresholds and silence gating.
   */
  setTuning(options: {
    bufferedThreshold?: number
    congestionThreshold?: number
    coalesceMaxFrames?: number
    coalesceDelayMs?: number
    enableSilenceDrop?: boolean
    silenceRmsThreshold?: number
    silenceKeepAliveEvery?: number
  }): void {
    if (typeof options.bufferedThreshold === 'number')
      this.bufferedThreshold = options.bufferedThreshold
    if (typeof options.congestionThreshold === 'number')
      this.congestionThreshold = options.congestionThreshold
    if (typeof options.coalesceMaxFrames === 'number')
      this.coalesceMaxFrames = options.coalesceMaxFrames
    if (typeof options.coalesceDelayMs === 'number') this.coalesceDelayMs = options.coalesceDelayMs
    if (typeof options.enableSilenceDrop === 'boolean')
      this.enableSilenceDrop = options.enableSilenceDrop
    if (typeof options.silenceRmsThreshold === 'number')
      this.silenceRmsThreshold = options.silenceRmsThreshold
    if (typeof options.silenceKeepAliveEvery === 'number')
      this.silenceKeepAliveEvery = options.silenceKeepAliveEvery
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
