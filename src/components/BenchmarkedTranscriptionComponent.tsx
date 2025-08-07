/**
 * Enhanced Live Transcription Component with Performance Benchmarking
 * Integrates real-time performance monitoring with existing transcription functionality
 */

import React, {useEffect, useState, useCallback, useRef} from 'react'
import {useTranscriptionBenchmark, BenchmarkDisplay} from '../hooks/useTranscriptionBenchmark'

interface TranscriptionSegment {
  id: string
  text: string
  timestamp: number
  confidence?: number
  isPartial?: boolean
}

interface BenchmarkedTranscriptionProps {
  onTranscriptionStart?: () => void
  onTranscriptionEnd?: () => void
  onError?: (error: Error) => void
  showBenchmarks?: boolean
  enableOptimizations?: boolean
}

export const BenchmarkedTranscriptionComponent: React.FC<BenchmarkedTranscriptionProps> = ({
  onTranscriptionStart,
  onTranscriptionEnd,
  onError,
  showBenchmarks = true,
  enableOptimizations = true
}) => {
  const [isRecording, setIsRecording] = useState(false)
  const [transcriptions, setTranscriptions] = useState<TranscriptionSegment[]>([])
  const [currentStatus, setCurrentStatus] = useState('Ready')

  // Get benchmark hooks
  const {
    results,
    startBenchmark,
    completeBenchmark,
    markAudioCapture,
    markWebSocket,
    markAudioProcessing,
    markTranscriptionDisplay,
    getRecommendations
  } = useTranscriptionBenchmark({
    autoStart: false,
    enableComparison: true,
    enableRealTimeLogging: true
  })

  // Refs for WebSocket and audio context
  const websocketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  /**
   * Start recording with comprehensive benchmarking
   */
  const startRecording = useCallback(async () => {
    try {
      setCurrentStatus('Initializing...')

      // Start performance benchmarking
      startBenchmark()

      // Mark audio capture start
      markAudioCapture().start()

      // Initialize audio capture
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000 // High quality for better transcription
        }
      })

      streamRef.current = stream

      // Initialize audio context with optimizations
      audioContextRef.current = new AudioContext({
        sampleRate: 48000,
        latencyHint: enableOptimizations ? 'interactive' : 'balanced'
      })

      // Mark audio capture ready
      markAudioCapture().ready()
      setCurrentStatus('Audio Ready')

      // Mark WebSocket connection start
      markWebSocket().connectionStart()

      // Initialize WebSocket connection with optimizations
      const wsUrl =
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta/models/gemini-2.0-flash-thinking-exp:streamGenerateContent'
      const apiKey = process.env.VITE_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY

      if (!apiKey) {
        throw new Error('API key not found')
      }

      // Create WebSocket with optimized settings
      const websocket = new WebSocket(`${wsUrl}?key=${apiKey}`)
      websocket.binaryType = 'arraybuffer' // Optimize for binary data

      websocketRef.current = websocket

      websocket.onopen = () => {
        markWebSocket().connected()
        setCurrentStatus('Connected')
        console.log('🔌 WebSocket connected successfully')

        // Send initial setup message
        const setupMessage = {
          setup: {
            model: 'models/gemini-2.0-flash-thinking-exp',
            generationConfig: {
              responseModalities: ['TEXT'],
              speechConfig: {
                voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Aoede'}}
              }
            },
            systemInstruction: {
              parts: [{text: 'You are a helpful assistant for transcribing audio in real-time.'}]
            }
          }
        }

        websocket.send(JSON.stringify(setupMessage))
        markWebSocket().firstMessageSent()
        setCurrentStatus('Setup Sent')
      }

      websocket.onmessage = event => {
        // Mark first response if this is the first message
        if (currentStatus === 'Setup Sent') {
          markWebSocket().firstResponseReceived()
          setCurrentStatus('Ready to Transcribe')
        }

        // Mark transcription received
        markTranscriptionDisplay().received()

        try {
          const data = JSON.parse(event.data)

          if (data.candidates && data.candidates[0]?.content?.parts) {
            const text = data.candidates[0].content.parts[0]?.text
            if (text) {
              const newTranscription: TranscriptionSegment = {
                id: Date.now().toString(),
                text: text.trim(),
                timestamp: Date.now(),
                confidence: data.candidates[0].finishReason ? 1.0 : 0.8,
                isPartial: !data.candidates[0].finishReason
              }

              setTranscriptions(prev => {
                // Mark DOM update
                markTranscriptionDisplay().domUpdated()

                // Avoid duplicates
                const filtered = prev.filter(t => t.id !== newTranscription.id)
                return [...filtered, newTranscription]
              })

              // Mark render complete (will be called after state update)
              setTimeout(() => {
                markTranscriptionDisplay().renderComplete()
              }, 0)
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
          onError?.(error as Error)
        }
      }

      websocket.onerror = error => {
        console.error('WebSocket error:', error)
        setCurrentStatus('Error')
        onError?.(new Error('WebSocket connection failed'))
      }

      websocket.onclose = () => {
        setCurrentStatus('Disconnected')
        console.log('WebSocket disconnected')
      }

      // Start audio processing
      markAudioProcessing().start()
      await setupAudioProcessing(stream, websocket)
      markAudioProcessing().complete()

      setIsRecording(true)
      setCurrentStatus('Recording')
      onTranscriptionStart?.()
    } catch (error) {
      console.error('Error starting recording:', error)
      setCurrentStatus('Error')
      onError?.(error as Error)
    }
  }, [
    startBenchmark,
    markAudioCapture,
    markWebSocket,
    markAudioProcessing,
    markTranscriptionDisplay,
    enableOptimizations,
    onTranscriptionStart,
    onError,
    currentStatus
  ])

  /**
   * Stop recording and complete benchmark
   */
  const stopRecording = useCallback(() => {
    setIsRecording(false)
    setCurrentStatus('Stopping...')

    // Close WebSocket
    if (websocketRef.current) {
      websocketRef.current.close()
      websocketRef.current = null
    }

    // Stop audio stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // Complete benchmark
    const finalMetrics = completeBenchmark()
    setCurrentStatus('Stopped')

    onTranscriptionEnd?.()

    // Log performance recommendations
    const recommendations = getRecommendations()
    if (recommendations.length > 0) {
      console.group('🚀 Performance Recommendations')
      recommendations.forEach(rec => console.log('•', rec))
      console.groupEnd()
    }

    return finalMetrics
  }, [completeBenchmark, getRecommendations, onTranscriptionEnd])

  /**
   * Setup audio processing with optimizations
   */
  const setupAudioProcessing = async (stream: MediaStream, websocket: WebSocket) => {
    if (!audioContextRef.current) return

    const audioContext = audioContextRef.current
    const source = audioContext.createMediaStreamSource(stream)

    if (enableOptimizations && 'AudioWorklet' in window) {
      // Use AudioWorklet for better performance (if available)
      try {
        await audioContext.audioWorklet.addModule('/audio-processor-worklet.js')
        const processor = new AudioWorkletNode(audioContext, 'audio-processor')

        processor.port.onmessage = event => {
          markAudioProcessing().chunkProcessed()
          // Send audio data to WebSocket
          if (websocket.readyState === WebSocket.OPEN) {
            websocket.send(event.data)
          }
        }

        source.connect(processor)
      } catch (error) {
        console.warn('AudioWorklet not available, falling back to ScriptProcessor')
        setupScriptProcessor(source, websocket)
      }
    } else {
      // Fallback to ScriptProcessor
      setupScriptProcessor(source, websocket)
    }
  }

  /**
   * Fallback audio processing using ScriptProcessor
   */
  const setupScriptProcessor = (source: MediaStreamAudioSourceNode, websocket: WebSocket) => {
    if (!audioContextRef.current) return

    const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1)

    processor.onaudioprocess = event => {
      markAudioProcessing().chunkProcessed()

      const audioData = event.inputBuffer.getChannelData(0)

      // Convert to base64 for transmission
      const audioMessage = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: 'audio/pcm',
              data: btoa(String.fromCharCode(...new Uint8Array(audioData.buffer)))
            }
          ]
        }
      }

      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify(audioMessage))
      }
    }

    source.connect(processor)
    processor.connect(audioContextRef.current.destination)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording()
      }
    }
  }, [isRecording, stopRecording])

  return (
    <div className="benchmarked-transcription">
      <div className="controls">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`record-button ${isRecording ? 'recording' : 'ready'}`}
          disabled={currentStatus === 'Initializing...' || currentStatus === 'Stopping...'}
        >
          {isRecording ? '⏹️ Stop' : '🎙️ Start Recording'}
        </button>

        <div className="status">Status: {currentStatus}</div>
      </div>

      <div className="transcription-display">
        <h3>Live Transcriptions</h3>
        <div className="transcripts">
          {transcriptions.map(segment => (
            <div
              key={segment.id}
              className={`transcript-segment ${segment.isPartial ? 'partial' : 'final'}`}
            >
              <span className="text">{segment.text}</span>
              <span className="metadata">
                {segment.confidence && (
                  <span className="confidence">{(segment.confidence * 100).toFixed(0)}%</span>
                )}
                <span className="timestamp">
                  {new Date(segment.timestamp).toLocaleTimeString()}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {showBenchmarks && (
        <div className="performance-metrics">
          <BenchmarkDisplay
            results={results}
            showHistory={true}
            showRecommendations={true}
            compact={false}
          />
        </div>
      )}
    </div>
  )
}

export default BenchmarkedTranscriptionComponent
