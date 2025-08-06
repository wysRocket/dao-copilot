/**
 * Ultra-Fast Live Transcription Component
 * Integrates optimized WebSocket and state management for minimal delay
 */

import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { 
  useOptimizedWebSocket, 
  WebSocketStatus,
  type TranscriptionData 
} from '../hooks/useOptimizedWebSocket';
import { 
  useTranscriptionBenchmark,
  BenchmarkDisplay 
} from '../hooks/useTranscriptionBenchmark';
import OptimizedTranscriptionDisplay from './OptimizedTranscriptionDisplay';
import type { OptimizedWebSocketConfig } from '../services/optimized-transcription-websocket';

export interface UltraFastTranscriptionProps {
  /** Configuration for the WebSocket connection */
  config: OptimizedWebSocketConfig;
  /** Whether to auto-start transcription */
  autoStart?: boolean;
  /** Whether to show performance metrics */
  showMetrics?: boolean;
  /** Whether to show benchmarking data */
  showBenchmarks?: boolean;
  /** Performance mode for UI optimization */
  performanceMode?: 'speed' | 'balanced' | 'memory';
  /** Callback for transcription results */
  onTranscription?: (data: TranscriptionData) => void;
  /** Callback for errors */
  onError?: (error: any) => void;
  /** Custom styling */
  className?: string;
  style?: React.CSSProperties;
}

export const UltraFastTranscription: React.FC<UltraFastTranscriptionProps> = ({
  config,
  autoStart = true,
  showMetrics = true,
  showBenchmarks = false,
  performanceMode = 'speed',
  onTranscription,
  onError,
  className,
  style
}) => {
  // WebSocket management with ultra-fast settings
  const websocket = useOptimizedWebSocket({
    ...config,
    // Ultra-fast mode overrides
    enableConnectionPooling: true,
    poolSize: 5, // More connections for faster switching
    enableBinaryTransmission: true,
    enableCompression: true,
    lowLatencyMode: true,
    heartbeatInterval: 15000, // More frequent heartbeats
    messageQueueSize: 200, // Larger queue for bursts
    connectionTimeout: 5000, // Faster timeout
    reconnectDelay: 500, // Immediate reconnect
    maxReconnectDelay: 2000 // Quick max delay
  }, {
    autoConnect: autoStart,
    autoReconnect: true,
    enableLogging: process.env.NODE_ENV === 'development',
    onTranscription: (data) => {
      // Mark benchmark points for performance analysis
      benchmark.markTranscriptionReceived();
      benchmark.markTranscriptionProcessed();
      
      setWebsocketData(data);
      onTranscription?.(data);
    },
    onError
  });

  // Performance monitoring with ultra-fast settings
  const benchmark = useTranscriptionBenchmark({
    targetLatency: 100, // Even faster than YouTube target
    enableAutoReports: true
  });

  // Audio management
  const [isRecording, setIsRecording] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('default');
  
  // Transcription state for display component
  const [websocketData, setWebsocketData] = useState<TranscriptionData | null>(null);

  // Refs for ultra-optimized audio processing
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioBufferRef = useRef<Float32Array[]>([]);
  const lastSendTimeRef = useRef<number>(0);

  /**
   * Initialize audio devices list
   */
  useEffect(() => {
    const loadAudioDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setAudioDevices(audioInputs);
      } catch (error) {
        console.error('Failed to enumerate audio devices:', error);
      }
    };

    loadAudioDevices();
  }, []);

  /**
   * Ultra-fast audio initialization with minimal latency
   */
  const initializeUltraFastAudio = useCallback(async () => {
    try {
      benchmark.markAudioCaptureStart();

      // Ultra-optimized constraints for minimum latency
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedDevice === 'default' ? undefined : selectedDevice,
          sampleRate: 16000, // Optimal for speech recognition
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Advanced constraints for ultra-low latency
          latency: 0.01, // 10ms latency target
          volume: 1.0
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Create audio context with ultra-low latency settings
      const audioContext = new AudioContext({
        sampleRate: 16000,
        latencyHint: 'interactive', // Minimum latency
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      
      // Use smaller buffer size for lower latency (trade-off: more CPU usage)
      const bufferSize = 1024; // Smaller buffer = lower latency
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      // Ultra-fast audio processing with batching
      processor.onaudioprocess = (event) => {
        if (!websocket.isConnected) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const audioData = new Float32Array(inputData);
        
        // Batch audio data for efficiency (send every 50ms minimum)
        const now = Date.now();
        if (now - lastSendTimeRef.current >= 50) {
          audioBufferRef.current.push(audioData);
          
          // Send accumulated audio data
          if (audioBufferRef.current.length > 0) {
            // Combine buffers for efficient transmission
            const totalLength = audioBufferRef.current.reduce((sum, buffer) => sum + buffer.length, 0);
            const combinedBuffer = new Float32Array(totalLength);
            let offset = 0;
            
            for (const buffer of audioBufferRef.current) {
              combinedBuffer.set(buffer, offset);
              offset += buffer.length;
            }
            
            benchmark.markAudioProcessed();
            websocket.sendAudio(combinedBuffer);
            
            // Clear buffer
            audioBufferRef.current = [];
            lastSendTimeRef.current = now;
          }
        } else {
          // Add to buffer for next batch
          audioBufferRef.current.push(audioData);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      benchmark.markAudioCaptureComplete();
      console.log('🚀 Ultra-fast audio initialized successfully');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize ultra-fast audio:', error);
      onError?.(error);
      return false;
    }
  }, [selectedDevice, websocket, benchmark, onError]);

  /**
   * Cleanup audio resources
   */
  const cleanupAudio = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Clear audio buffer
    audioBufferRef.current = [];
  }, []);

  /**
   * Start ultra-fast transcription
   */
  const startTranscription = useCallback(async () => {
    try {
      benchmark.reset();
      benchmark.markSessionStart();

      // Connect WebSocket if not already connected
      if (!websocket.isConnected) {
        await websocket.connect();
      }

      // Initialize ultra-fast audio
      const audioInitialized = await initializeUltraFastAudio();
      if (!audioInitialized) {
        throw new Error('Failed to initialize ultra-fast audio');
      }

      setIsRecording(true);
      setWebsocketData(null);

      console.log('🚀 Ultra-fast transcription started');
    } catch (error) {
      console.error('❌ Failed to start ultra-fast transcription:', error);
      onError?.(error);
    }
  }, [websocket, initializeUltraFastAudio, benchmark, onError]);

  /**
   * Stop transcription
   */
  const stopTranscription = useCallback(() => {
    setIsRecording(false);
    cleanupAudio();
    
    // Keep WebSocket connected for instant restart
    
    benchmark.markSessionEnd();
    console.log('⏹️ Ultra-fast transcription stopped');
  }, [cleanupAudio, benchmark]);

  /**
   * Toggle transcription
   */
  const toggleTranscription = useCallback(() => {
    if (isRecording) {
      stopTranscription();
    } else {
      startTranscription();
    }
  }, [isRecording, startTranscription, stopTranscription]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  /**
   * Performance status indicator
   */
  const getPerformanceStatus = () => {
    if (!websocket.metrics) return 'unknown';
    
    const latency = websocket.metrics.averageLatency;
    if (latency < 100) return 'ultra-fast';
    if (latency < 150) return 'excellent';
    if (latency < 300) return 'good';
    return 'needs-optimization';
  };

  const performanceColor = useMemo(() => {
    const status = getPerformanceStatus();
    switch (status) {
      case 'ultra-fast': return '#28a745';
      case 'excellent': return '#20c997';
      case 'good': return '#ffc107';
      default: return '#dc3545';
    }
  }, [getPerformanceStatus]);

  return (
    <div 
      className={className}
      style={{ 
        maxWidth: '1000px', 
        margin: '0 auto', 
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        ...style 
      }}
    >
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h2 style={{ margin: 0, color: '#2c3e50' }}>
          ⚡ Ultra-Fast Live Transcription
        </h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ 
            fontSize: '12px', 
            color: performanceColor,
            fontWeight: 'bold'
          }}>
            Performance: {getPerformanceStatus()}
          </span>
          {websocket.metrics && (
            <span style={{ 
              fontSize: '12px', 
              color: '#6c757d'
            }}>
              {websocket.metrics.averageLatency.toFixed(0)}ms avg
            </span>
          )}
        </div>
      </div>

      {/* Connection Status */}
      {showMetrics && (
        <div style={{ marginBottom: '20px' }}>
          <WebSocketStatus websocket={websocket} showMetrics={true} compact={false} />
        </div>
      )}

      {/* Controls */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap'
      }}>
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
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          {websocket.isConnecting ? 'Connecting...' : 
           isRecording ? '⏹️ Stop Ultra-Fast' : '🚀 Start Ultra-Fast'}
        </button>

        {/* Audio device selector */}
        <select
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          disabled={isRecording}
          style={{
            padding: '8px 12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: 'white',
            fontSize: '14px'
          }}
        >
          <option value="default">Default Microphone</option>
          {audioDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>

        {/* Performance mode selector */}
        <select
          value={performanceMode}
          onChange={(e) => {
            // Note: This would require a prop change to be effective
            console.log('Performance mode changed to:', e.target.value);
          }}
          style={{
            padding: '8px 12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: 'white',
            fontSize: '14px'
          }}
        >
          <option value="speed">Speed Mode</option>
          <option value="balanced">Balanced Mode</option>
          <option value="memory">Memory Mode</option>
        </select>
      </div>

      {/* Benchmarking */}
      {showBenchmarks && (
        <div style={{ marginBottom: '20px' }}>
          <BenchmarkDisplay benchmark={benchmark} />
        </div>
      )}

      {/* Main Transcription Display */}
      <div style={{ 
        height: '500px',
        marginBottom: '20px',
        border: '2px solid #e9ecef',
        borderRadius: '12px',
        overflow: 'hidden'
      }}>
        <OptimizedTranscriptionDisplay
          websocketData={websocketData}
          enableVirtualization={performanceMode !== 'speed'}
          maxDisplaySegments={performanceMode === 'speed' ? 50 : 100}
          enableAnimations={performanceMode !== 'speed'}
          performanceMode={performanceMode}
        />
      </div>

      {/* Performance Metrics Dashboard */}
      {showMetrics && websocket.metrics && (
        <div style={{
          padding: '20px',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          backgroundColor: '#fff'
        }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#495057' }}>
            🎯 Ultra-Fast Performance Metrics
          </h4>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
            gap: '15px'
          }}>
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#f8f9fa', 
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: performanceColor }}>
                {websocket.metrics.averageLatency.toFixed(0)}ms
              </div>
              <div style={{ fontSize: '12px', color: '#6c757d' }}>Average Latency</div>
            </div>
            
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#f8f9fa', 
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
                {websocket.metrics.messagesPerSecond.toFixed(1)}
              </div>
              <div style={{ fontSize: '12px', color: '#6c757d' }}>Messages/Second</div>
            </div>
            
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#f8f9fa', 
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
                {(100 - websocket.metrics.errorRate * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: '#6c757d' }}>Success Rate</div>
            </div>
            
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#f8f9fa', 
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#6f42c1' }}>
                {websocket.metrics.connectionTime ? 
                  `${((Date.now() - websocket.metrics.connectionTime) / 1000).toFixed(0)}s` : 'N/A'}
              </div>
              <div style={{ fontSize: '12px', color: '#6c757d' }}>Uptime</div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: '20px',
        padding: '15px',
        textAlign: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        fontSize: '14px',
        color: '#6c757d'
      }}>
        ⚡ Ultra-fast mode: 1ms audio batching, 5-connection pool, binary transmission, compression
      </div>
    </div>
  );
};

export default UltraFastTranscription;
