/**
 * High-Performance Transcription Component
 * Uses optimized WebSocket service for minimal latency
 */

import React, {useCallback, useRef, useEffect, useState} from 'react'
import {
  useOptimizedWebSocket,
  useWebSocketMetrics,
  WebSocketStatus,
  type TranscriptionData
} from '../hooks/useOptimizedWebSocket'
import {useTranscriptionBenchmark, BenchmarkDisplay} from '../hooks/useTranscriptionBenchmark'
import type {OptimizedWebSocketConfig} from '../services/optimized-transcription-websocket'

export interface OptimizedTranscriptionProps {
  /** Configuration for the WebSocket connection */
  config: OptimizedWebSocketConfig
  /** Whether to auto-start transcription */
  autoStart?: boolean
  /** Whether to show performance metrics */
  showMetrics?: boolean
  /** Whether to show benchmarking data */
  showBenchmarks?: boolean
  /** Callback for transcription results */
  onTranscription?: (data: TranscriptionData) => void
  /** Callback for errors */
  onError?: (error: any) => void
  /** Custom styling */
  className?: string
  style?: React.CSSProperties
}

export const OptimizedTranscriptionComponent: React.FC<OptimizedTranscriptionProps> = ({
  config,
  autoStart = true,
  showMetrics = true,
  showBenchmarks = false,
  onTranscription,
  onError,
  className,
  style
}) => {
  // WebSocket management
  const websocket = useOptimizedWebSocket(config, {
    autoConnect: autoStart,
    autoReconnect: true,
    enableLogging: process.env.NODE_ENV === 'development',
    onTranscription: data => {
      // Mark benchmark points for performance analysis
      benchmark.markTranscriptionReceived()
      benchmark.markTranscriptionProcessed()

      setTranscriptionHistory(prev => [...prev.slice(-19), data]) // Keep last 20
      setCurrentTranscription(data)
      onTranscription?.(data)
    },
    onError
  })

  // Performance monitoring
  const metrics = useWebSocketMetrics(websocket)
  const benchmark = useTranscriptionBenchmark({
    targetLatency: 150, // YouTube-like performance target
    enableAutoReports: true
  })

  // Audio management
  const [isRecording, setIsRecording] = useState(false)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('default')

  // Transcription state
  const [currentTranscription, setCurrentTranscription] = useState<TranscriptionData | null>(null)
  const [transcriptionHistory, setTranscriptionHistory] = useState<TranscriptionData[]>([])

  // Refs for audio processing
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  /**
   * Initialize audio devices list
   */
  useEffect(() => {
    const loadAudioDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioInputs = devices.filter(device => device.kind === 'audioinput')
        setAudioDevices(audioInputs)
      } catch (error) {
        console.error('Failed to enumerate audio devices:', error)
      }
    }

    loadAudioDevices()
  }, [])

  /**
   * Initialize audio context and processing
   */
  const initializeAudio = useCallback(async () => {
    try {
      benchmark.markAudioCaptureStart()

      // Get user media with optimized settings
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedDevice === 'default' ? undefined : selectedDevice,
          sampleRate: 16000, // Optimized for speech recognition
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      // Create audio context with optimized settings
      const audioContext = new AudioContext({
        sampleRate: 16000,
        latencyHint: 'interactive' // Prioritize low latency
      })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)

      // Use ScriptProcessorNode for real-time processing (legacy but reliable)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = event => {
        if (!websocket.isConnected) return

        const inputData = event.inputBuffer.getChannelData(0)

        // Convert to format expected by Gemini Live
        const audioData = new Float32Array(inputData)

        benchmark.markAudioProcessed()
        websocket.sendAudio(audioData)
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      benchmark.markAudioCaptureComplete()
      console.log('🎤 Audio initialized successfully')

      return true
    } catch (error) {
      console.error('❌ Failed to initialize audio:', error)
      onError?.(error)
      return false
    }
  }, [selectedDevice, websocket, benchmark, onError])

  /**
   * Cleanup audio resources
   */
  const cleanupAudio = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  /**
   * Start transcription
   */
  const startTranscription = useCallback(async () => {
    try {
      benchmark.reset()
      benchmark.markSessionStart()

      // Connect WebSocket if not already connected
      if (!websocket.isConnected) {
        await websocket.connect()
      }

      // Initialize audio
      const audioInitialized = await initializeAudio()
      if (!audioInitialized) {
        throw new Error('Failed to initialize audio')
      }

      setIsRecording(true)
      setTranscriptionHistory([])
      setCurrentTranscription(null)

      console.log('🚀 Transcription started')
    } catch (error) {
      console.error('❌ Failed to start transcription:', error)
      onError?.(error)
    }
  }, [websocket, initializeAudio, benchmark, onError])

  /**
   * Stop transcription
   */
  const stopTranscription = useCallback(() => {
    setIsRecording(false)
    cleanupAudio()

    // Don't disconnect WebSocket to maintain connection pool

    benchmark.markSessionEnd()
    console.log('⏹️ Transcription stopped')
  }, [cleanupAudio, benchmark])

  /**
   * Toggle transcription
   */
  const toggleTranscription = useCallback(() => {
    if (isRecording) {
      stopTranscription()
    } else {
      startTranscription()
    }
  }, [isRecording, startTranscription, stopTranscription])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      cleanupAudio()
    }
  }, [cleanupAudio])

  /**
   * Performance status indicator
   */
  const getPerformanceStatus = () => {
    if (!websocket.metrics) return 'unknown'

    const latency = websocket.metrics.averageLatency
    if (latency < 150) return 'excellent'
    if (latency < 300) return 'good'
    if (latency < 500) return 'fair'
    return 'poor'
  }

  return (
    <div
      className={className}
      style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '20px',
        ...style
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}
      >
        <h2 style={{margin: 0, color: '#2c3e50'}}>Optimized Live Transcription</h2>
        <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
          <span
            style={{
              fontSize: '12px',
              color:
                getPerformanceStatus() === 'excellent'
                  ? '#28a745'
                  : getPerformanceStatus() === 'good'
                    ? '#ffc107'
                    : '#dc3545'
            }}
          >
            Performance: {getPerformanceStatus()}
          </span>
        </div>
      </div>

      {/* Connection Status */}
      {showMetrics && (
        <div style={{marginBottom: '20px'}}>
          <WebSocketStatus websocket={websocket} showMetrics={true} />
        </div>
      )}

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}
      >
        {/* Main control button */}
        <button
          onClick={toggleTranscription}
          disabled={websocket.isConnecting}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '8px',
            cursor: websocket.isConnecting ? 'not-allowed' : 'pointer',
            backgroundColor: isRecording ? '#dc3545' : '#28a745',
            color: 'white',
            transition: 'all 0.2s ease'
          }}
        >
          {websocket.isConnecting ? 'Connecting...' : isRecording ? '⏹️ Stop' : '🎤 Start'}
        </button>

        {/* Audio device selector */}
        <select
          value={selectedDevice}
          onChange={e => setSelectedDevice(e.target.value)}
          disabled={isRecording}
          style={{
            padding: '8px 12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: 'white'
          }}
        >
          <option value="default">Default Microphone</option>
          {audioDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>

        {/* Connection management */}
        {!websocket.isConnected && !websocket.isConnecting && (
          <button
            onClick={websocket.connect}
            style={{
              padding: '8px 16px',
              border: '1px solid #007bff',
              backgroundColor: 'transparent',
              color: '#007bff',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            🔌 Connect
          </button>
        )}
      </div>

      {/* Current transcription */}
      <div
        style={{
          minHeight: '120px',
          padding: '20px',
          border: '2px solid #e9ecef',
          borderRadius: '8px',
          backgroundColor: '#f8f9fa',
          marginBottom: '20px'
        }}
      >
        <h3 style={{margin: '0 0 10px 0', color: '#495057'}}>Live Transcription</h3>
        <div
          style={{
            fontSize: '18px',
            lineHeight: '1.5',
            color: currentTranscription ? '#212529' : '#6c757d',
            fontStyle: currentTranscription ? 'normal' : 'italic'
          }}
        >
          {currentTranscription ? (
            <span>
              {currentTranscription.text}
              {currentTranscription.isPartial && <span style={{opacity: 0.6}}> ...</span>}
            </span>
          ) : isRecording ? (
            'Listening...'
          ) : (
            'Click Start to begin transcription'
          )}
        </div>

        {currentTranscription && (
          <div
            style={{
              marginTop: '10px',
              fontSize: '12px',
              color: '#6c757d',
              display: 'flex',
              gap: '15px'
            }}
          >
            <span>Confidence: {((currentTranscription.confidence || 0) * 100).toFixed(1)}%</span>
            <span>Type: {currentTranscription.isPartial ? 'Partial' : 'Final'}</span>
            <span>Latency: {websocket.metrics?.averageLatency.toFixed(0) || 'N/A'}ms</span>
          </div>
        )}
      </div>

      {/* Benchmarking */}
      {showBenchmarks && (
        <div style={{marginBottom: '20px'}}>
          <BenchmarkDisplay benchmark={benchmark} />
        </div>
      )}

      {/* Performance Metrics */}
      {showMetrics && websocket.metrics && (
        <div
          style={{
            padding: '15px',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            backgroundColor: '#fff',
            marginBottom: '20px'
          }}
        >
          <h4 style={{margin: '0 0 10px 0'}}>Performance Metrics</h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '10px',
              fontSize: '14px'
            }}
          >
            <div>
              <strong>Avg Latency:</strong>
              <br />
              {websocket.metrics.averageLatency.toFixed(1)}ms
            </div>
            <div>
              <strong>Throughput:</strong>
              <br />
              {websocket.metrics.messagesPerSecond.toFixed(1)} msg/s
            </div>
            <div>
              <strong>Error Rate:</strong>
              <br />
              {(websocket.metrics.errorRate * 100).toFixed(1)}%
            </div>
            <div>
              <strong>Connection Time:</strong>
              <br />
              {websocket.metrics.connectionTime
                ? `${Date.now() - websocket.metrics.connectionTime}ms ago`
                : 'N/A'}
            </div>
          </div>

          {metrics.recommendations.length > 0 && (
            <div
              style={{
                marginTop: '10px',
                padding: '8px',
                backgroundColor: '#fff3cd',
                border: '1px solid #ffeaa7',
                borderRadius: '4px',
                fontSize: '12px'
              }}
            >
              <strong>💡 Recommendations:</strong>
              <ul style={{margin: '5px 0 0 0', paddingLeft: '20px'}}>
                {metrics.recommendations.map((rec, index) => (
                  <li key={`rec-${rec.substring(0, 20).replace(/\s+/g, '-')}-${index}`}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Recent transcription history */}
      {transcriptionHistory.length > 0 && (
        <div
          style={{
            padding: '15px',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            backgroundColor: '#fff'
          }}
        >
          <h4 style={{margin: '0 0 10px 0'}}>Recent Transcriptions</h4>
          <div style={{maxHeight: '200px', overflow: 'auto'}}>
            {transcriptionHistory
              .slice(-5)
              .reverse()
              .map((item, index) => (
                <div
                  key={`history-${item.timestamp || Date.now()}-${index}`}
                  style={{
                    padding: '8px',
                    marginBottom: '5px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                >
                  <div>{item.text}</div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#6c757d',
                      marginTop: '4px'
                    }}
                  >
                    {new Date(item.timestamp).toLocaleTimeString()} • Confidence:{' '}
                    {((item.confidence || 0) * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default OptimizedTranscriptionComponent
