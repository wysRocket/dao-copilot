/**
 * Performance Benchmarking Tool for Transcription Latency Analysis
 * Provides comprehensive metrics for identifying bottlenecks in the transcription pipeline
 */

export interface PerformanceMetrics {
  audioCapture: {
    startTime: number;
    endTime: number;
    latency: number;
  };
  websocketConnection: {
    connectionStart: number;
    connectionEstablished: number;
    firstMessageSent: number;
    firstResponseReceived: number;
    latency: number;
  };
  audioProcessing: {
    startTime: number;
    endTime: number;
    latency: number;
    chunksProcessed: number;
  };
  transcriptionDisplay: {
    messageReceived: number;
    domUpdated: number;
    renderComplete: number;
    latency: number;
  };
  endToEnd: {
    totalLatency: number;
    timestamp: number;
  };
}

export class TranscriptionPerformanceBenchmark {
  private metrics: Partial<PerformanceMetrics> = {};
  private startTimestamp: number = 0;
  private observers: PerformanceObserver[] = [];
  private isRecording = false;

  constructor() {
    this.setupPerformanceObservers();
  }

  /**
   * Start recording performance metrics
   */
  startBenchmark(): void {
    this.isRecording = true;
    this.startTimestamp = performance.now();
    this.metrics = {};
    
    // Mark the start of the transcription process
    performance.mark('transcription-start');
    
    console.log('🚀 Performance benchmark started at:', this.startTimestamp);
  }

  /**
   * Mark the beginning of audio capture
   */
  markAudioCaptureStart(): void {
    if (!this.isRecording) return;
    
    const timestamp = performance.now();
    performance.mark('audio-capture-start');
    
    this.metrics.audioCapture = {
      startTime: timestamp,
      endTime: 0,
      latency: 0
    };
  }

  /**
   * Mark the end of audio capture initialization
   */
  markAudioCaptureReady(): void {
    if (!this.isRecording || !this.metrics.audioCapture) return;
    
    const timestamp = performance.now();
    performance.mark('audio-capture-ready');
    
    this.metrics.audioCapture.endTime = timestamp;
    this.metrics.audioCapture.latency = timestamp - this.metrics.audioCapture.startTime;
    
    performance.measure('audio-capture-duration', 'audio-capture-start', 'audio-capture-ready');
    
    console.log('🎵 Audio capture ready in:', this.metrics.audioCapture.latency.toFixed(2), 'ms');
  }

  /**
   * Mark WebSocket connection start
   */
  markWebSocketConnectionStart(): void {
    if (!this.isRecording) return;
    
    const timestamp = performance.now();
    performance.mark('websocket-connection-start');
    
    this.metrics.websocketConnection = {
      connectionStart: timestamp,
      connectionEstablished: 0,
      firstMessageSent: 0,
      firstResponseReceived: 0,
      latency: 0
    };
  }

  /**
   * Mark WebSocket connection established
   */
  markWebSocketConnected(): void {
    if (!this.isRecording || !this.metrics.websocketConnection) return;
    
    const timestamp = performance.now();
    performance.mark('websocket-connected');
    
    this.metrics.websocketConnection.connectionEstablished = timestamp;
    
    console.log('🔌 WebSocket connected in:', 
      (timestamp - this.metrics.websocketConnection.connectionStart).toFixed(2), 'ms');
  }

  /**
   * Mark first message sent to WebSocket
   */
  markFirstMessageSent(): void {
    if (!this.isRecording || !this.metrics.websocketConnection) return;
    
    const timestamp = performance.now();
    performance.mark('websocket-first-message-sent');
    
    this.metrics.websocketConnection.firstMessageSent = timestamp;
  }

  /**
   * Mark first response received from WebSocket
   */
  markFirstResponseReceived(): void {
    if (!this.isRecording || !this.metrics.websocketConnection) return;
    
    const timestamp = performance.now();
    performance.mark('websocket-first-response');
    
    this.metrics.websocketConnection.firstResponseReceived = timestamp;
    this.metrics.websocketConnection.latency = 
      timestamp - this.metrics.websocketConnection.connectionStart;
    
    performance.measure('websocket-total-latency', 
      'websocket-connection-start', 'websocket-first-response');
    
    console.log('🌐 WebSocket first response in:', 
      this.metrics.websocketConnection.latency.toFixed(2), 'ms');
  }

  /**
   * Mark audio processing start
   */
  markAudioProcessingStart(): void {
    if (!this.isRecording) return;
    
    const timestamp = performance.now();
    performance.mark('audio-processing-start');
    
    this.metrics.audioProcessing = {
      startTime: timestamp,
      endTime: 0,
      latency: 0,
      chunksProcessed: 0
    };
  }

  /**
   * Mark audio chunk processed
   */
  markAudioChunkProcessed(): void {
    if (!this.isRecording || !this.metrics.audioProcessing) return;
    
    this.metrics.audioProcessing.chunksProcessed++;
  }

  /**
   * Mark audio processing complete
   */
  markAudioProcessingComplete(): void {
    if (!this.isRecording || !this.metrics.audioProcessing) return;
    
    const timestamp = performance.now();
    performance.mark('audio-processing-complete');
    
    this.metrics.audioProcessing.endTime = timestamp;
    this.metrics.audioProcessing.latency = 
      timestamp - this.metrics.audioProcessing.startTime;
    
    performance.measure('audio-processing-duration', 
      'audio-processing-start', 'audio-processing-complete');
    
    console.log('🔊 Audio processing complete in:', 
      this.metrics.audioProcessing.latency.toFixed(2), 'ms');
    console.log('📊 Chunks processed:', this.metrics.audioProcessing.chunksProcessed);
  }

  /**
   * Mark transcription message received
   */
  markTranscriptionReceived(): void {
    if (!this.isRecording) return;
    
    const timestamp = performance.now();
    performance.mark('transcription-received');
    
    this.metrics.transcriptionDisplay = {
      messageReceived: timestamp,
      domUpdated: 0,
      renderComplete: 0,
      latency: 0
    };
  }

  /**
   * Mark DOM updated with transcription
   */
  markDOMUpdated(): void {
    if (!this.isRecording || !this.metrics.transcriptionDisplay) return;
    
    const timestamp = performance.now();
    performance.mark('transcription-dom-updated');
    
    this.metrics.transcriptionDisplay.domUpdated = timestamp;
  }

  /**
   * Mark rendering complete
   */
  markRenderComplete(): void {
    if (!this.isRecording || !this.metrics.transcriptionDisplay) return;
    
    const timestamp = performance.now();
    performance.mark('transcription-render-complete');
    
    this.metrics.transcriptionDisplay.renderComplete = timestamp;
    this.metrics.transcriptionDisplay.latency = 
      timestamp - this.metrics.transcriptionDisplay.messageReceived;
    
    performance.measure('transcription-display-duration', 
      'transcription-received', 'transcription-render-complete');
    
    console.log('🎨 Transcription rendered in:', 
      this.metrics.transcriptionDisplay.latency.toFixed(2), 'ms');
  }

  /**
   * Complete the benchmark and calculate total metrics
   */
  completeBenchmark(): PerformanceMetrics {
    if (!this.isRecording) {
      throw new Error('No benchmark is currently recording');
    }
    
    const endTimestamp = performance.now();
    performance.mark('transcription-complete');
    
    this.metrics.endToEnd = {
      totalLatency: endTimestamp - this.startTimestamp,
      timestamp: Date.now()
    };
    
    performance.measure('total-transcription-latency', 
      'transcription-start', 'transcription-complete');
    
    this.isRecording = false;
    
    console.log('🏁 Total transcription latency:', 
      this.metrics.endToEnd.totalLatency.toFixed(2), 'ms');
    
    this.logDetailedReport();
    
    return this.metrics as PerformanceMetrics;
  }

  /**
   * Get current metrics (even if benchmark is ongoing)
   */
  getCurrentMetrics(): Partial<PerformanceMetrics> {
    return { ...this.metrics };
  }

  /**
   * Log a detailed performance report
   */
  private logDetailedReport(): void {
    console.group('🔍 Detailed Performance Report');
    
    if (this.metrics.audioCapture) {
      console.log('🎵 Audio Capture:', this.metrics.audioCapture.latency.toFixed(2), 'ms');
    }
    
    if (this.metrics.websocketConnection) {
      console.log('🔌 WebSocket Connection:', this.metrics.websocketConnection.latency.toFixed(2), 'ms');
      console.log('  ├─ Connection established:', 
        (this.metrics.websocketConnection.connectionEstablished - 
         this.metrics.websocketConnection.connectionStart).toFixed(2), 'ms');
      console.log('  └─ First response:', 
        (this.metrics.websocketConnection.firstResponseReceived - 
         this.metrics.websocketConnection.connectionStart).toFixed(2), 'ms');
    }
    
    if (this.metrics.audioProcessing) {
      console.log('🔊 Audio Processing:', this.metrics.audioProcessing.latency.toFixed(2), 'ms');
      console.log('  └─ Chunks processed:', this.metrics.audioProcessing.chunksProcessed);
    }
    
    if (this.metrics.transcriptionDisplay) {
      console.log('🎨 Display Rendering:', this.metrics.transcriptionDisplay.latency.toFixed(2), 'ms');
    }
    
    if (this.metrics.endToEnd) {
      console.log('🏁 Total End-to-End:', this.metrics.endToEnd.totalLatency.toFixed(2), 'ms');
    }
    
    console.groupEnd();
  }

  /**
   * Setup Performance Observers for additional metrics
   */
  private setupPerformanceObservers(): void {
    // Observe long tasks that might block the main thread
    if ('PerformanceObserver' in window) {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 16) { // Longer than one frame (60fps)
            console.warn('⚠️ Long task detected:', entry.duration.toFixed(2), 'ms');
          }
        }
      });
      
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        this.observers.push(longTaskObserver);
      } catch (e) {
        console.log('Long task observer not supported');
      }
      
      // Observe layout shifts
      const layoutShiftObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.value > 0.1) { // Significant layout shift
            console.warn('⚠️ Layout shift detected:', entry.value);
          }
        }
      });
      
      try {
        layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(layoutShiftObserver);
      } catch (e) {
        console.log('Layout shift observer not supported');
      }
    }
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): string {
    return JSON.stringify({
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      metrics: this.metrics,
      performanceEntries: performance.getEntriesByType('measure')
    }, null, 2);
  }

  /**
   * Compare with YouTube benchmark (estimated values)
   */
  compareWithYouTube(): void {
    if (!this.metrics.endToEnd) {
      console.warn('No complete benchmark to compare');
      return;
    }
    
    // YouTube typical latency ranges (estimated)
    const youtubeLatency = {
      audioCapture: 50, // ms
      websocket: 100, // ms
      processing: 200, // ms
      display: 30, // ms
      total: 380 // ms
    };
    
    console.group('📊 Comparison with YouTube Performance');
    
    if (this.metrics.audioCapture) {
      const diff = this.metrics.audioCapture.latency - youtubeLatency.audioCapture;
      console.log(`🎵 Audio Capture: ${this.metrics.audioCapture.latency.toFixed(2)}ms vs ${youtubeLatency.audioCapture}ms (${diff > 0 ? '+' : ''}${diff.toFixed(2)}ms)`);
    }
    
    if (this.metrics.websocketConnection) {
      const diff = this.metrics.websocketConnection.latency - youtubeLatency.websocket;
      console.log(`🔌 WebSocket: ${this.metrics.websocketConnection.latency.toFixed(2)}ms vs ${youtubeLatency.websocket}ms (${diff > 0 ? '+' : ''}${diff.toFixed(2)}ms)`);
    }
    
    if (this.metrics.transcriptionDisplay) {
      const diff = this.metrics.transcriptionDisplay.latency - youtubeLatency.display;
      console.log(`🎨 Display: ${this.metrics.transcriptionDisplay.latency.toFixed(2)}ms vs ${youtubeLatency.display}ms (${diff > 0 ? '+' : ''}${diff.toFixed(2)}ms)`);
    }
    
    const totalDiff = this.metrics.endToEnd.totalLatency - youtubeLatency.total;
    console.log(`🏁 Total: ${this.metrics.endToEnd.totalLatency.toFixed(2)}ms vs ${youtubeLatency.total}ms (${totalDiff > 0 ? '+' : ''}${totalDiff.toFixed(2)}ms)`);
    
    if (totalDiff > 0) {
      console.log(`🚀 Target improvement: ${((totalDiff / this.metrics.endToEnd.totalLatency) * 100).toFixed(1)}% faster needed`);
    } else {
      console.log(`✅ Performance is ${((-totalDiff / youtubeLatency.total) * 100).toFixed(1)}% better than YouTube!`);
    }
    
    console.groupEnd();
  }

  /**
   * Cleanup observers
   */
  cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// Global instance for easy access
export const transcriptionBenchmark = new TranscriptionPerformanceBenchmark();

// Auto-cleanup on page unload
window.addEventListener('beforeunload', () => {
  transcriptionBenchmark.cleanup();
});
