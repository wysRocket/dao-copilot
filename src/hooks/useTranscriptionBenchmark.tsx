/**
 * React Hook for Transcription Performance Benchmarking
 * Integrates performance monitoring with React components
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { transcriptionBenchmark, type PerformanceMetrics } from '../utils/transcription-performance-benchmark';

export interface BenchmarkResults {
  current: Partial<PerformanceMetrics>;
  history: PerformanceMetrics[];
  averages: {
    audioCapture: number;
    websocket: number;
    processing: number;
    display: number;
    total: number;
  };
  isRecording: boolean;
}

export interface UseBenchmarkOptions {
  autoStart?: boolean;
  maxHistorySize?: number;
  enableComparison?: boolean;
  enableRealTimeLogging?: boolean;
}

export const useTranscriptionBenchmark = (options: UseBenchmarkOptions = {}) => {
  const {
    autoStart = false,
    maxHistorySize = 50,
    enableComparison = true,
    enableRealTimeLogging = true
  } = options;

  const [results, setResults] = useState<BenchmarkResults>({
    current: {},
    history: [],
    averages: {
      audioCapture: 0,
      websocket: 0,
      processing: 0,
      display: 0,
      total: 0
    },
    isRecording: false
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef(false);

  /**
   * Start benchmarking
   */
  const startBenchmark = useCallback(() => {
    transcriptionBenchmark.startBenchmark();
    isRecordingRef.current = true;
    
    setResults(prev => ({
      ...prev,
      isRecording: true,
      current: {}
    }));

    // Start real-time updates if enabled
    if (enableRealTimeLogging) {
      intervalRef.current = setInterval(() => {
        if (isRecordingRef.current) {
          const currentMetrics = transcriptionBenchmark.getCurrentMetrics();
          setResults(prev => ({
            ...prev,
            current: currentMetrics
          }));
        }
      }, 100); // Update every 100ms
    }
  }, [enableRealTimeLogging]);

  /**
   * Complete benchmarking
   */
  const completeBenchmark = useCallback(() => {
    if (!isRecordingRef.current) return null;

    const finalMetrics = transcriptionBenchmark.completeBenchmark();
    isRecordingRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setResults(prev => {
      const newHistory = [...prev.history, finalMetrics];
      if (newHistory.length > maxHistorySize) {
        newHistory.splice(0, newHistory.length - maxHistorySize);
      }

      // Calculate averages
      const averages = calculateAverages(newHistory);

      return {
        current: finalMetrics,
        history: newHistory,
        averages,
        isRecording: false
      };
    });

    if (enableComparison) {
      transcriptionBenchmark.compareWithYouTube();
    }

    return finalMetrics;
  }, [maxHistorySize, enableComparison]);

  /**
   * Mark audio capture events
   */
  const markAudioCapture = useCallback(() => ({
    start: () => transcriptionBenchmark.markAudioCaptureStart(),
    ready: () => transcriptionBenchmark.markAudioCaptureReady()
  }), []);

  /**
   * Mark WebSocket events
   */
  const markWebSocket = useCallback(() => ({
    connectionStart: () => transcriptionBenchmark.markWebSocketConnectionStart(),
    connected: () => transcriptionBenchmark.markWebSocketConnected(),
    firstMessageSent: () => transcriptionBenchmark.markFirstMessageSent(),
    firstResponseReceived: () => transcriptionBenchmark.markFirstResponseReceived()
  }), []);

  /**
   * Mark audio processing events
   */
  const markAudioProcessing = useCallback(() => ({
    start: () => transcriptionBenchmark.markAudioProcessingStart(),
    chunkProcessed: () => transcriptionBenchmark.markAudioChunkProcessed(),
    complete: () => transcriptionBenchmark.markAudioProcessingComplete()
  }), []);

  /**
   * Mark transcription display events
   */
  const markTranscriptionDisplay = useCallback(() => ({
    received: () => transcriptionBenchmark.markTranscriptionReceived(),
    domUpdated: () => transcriptionBenchmark.markDOMUpdated(),
    renderComplete: () => transcriptionBenchmark.markRenderComplete()
  }), []);

  /**
   * Export current metrics
   */
  const exportMetrics = useCallback(() => {
    return transcriptionBenchmark.exportMetrics();
  }, []);

  /**
   * Reset benchmark history
   */
  const resetHistory = useCallback(() => {
    setResults(prev => ({
      ...prev,
      history: [],
      averages: {
        audioCapture: 0,
        websocket: 0,
        processing: 0,
        display: 0,
        total: 0
      }
    }));
  }, []);

  /**
   * Get performance recommendations based on metrics
   */
  const getRecommendations = useCallback((): string[] => {
    const recommendations: string[] = [];
    const { averages } = results;

    if (averages.audioCapture > 100) {
      recommendations.push("Consider optimizing audio capture initialization - use pre-warmed AudioContext");
    }

    if (averages.websocket > 500) {
      recommendations.push("WebSocket connection is slow - consider connection pooling or HTTP/2");
    }

    if (averages.processing > 300) {
      recommendations.push("Audio processing bottleneck detected - consider WebAssembly or WebWorkers");
    }

    if (averages.display > 50) {
      recommendations.push("UI rendering is slow - implement virtualization or React.memo optimizations");
    }

    if (averages.total > 1000) {
      recommendations.push("Overall latency is high - prioritize parallel processing and pre-warming");
    }

    if (recommendations.length === 0) {
      recommendations.push("Performance looks good! Consider fine-tuning for edge cases.");
    }

    return recommendations;
  }, [results.averages]);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart) {
      startBenchmark();
    }

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      transcriptionBenchmark.cleanup();
    };
  }, [autoStart, startBenchmark]);

  return {
    results,
    startBenchmark,
    completeBenchmark,
    markAudioCapture,
    markWebSocket,
    markAudioProcessing,
    markTranscriptionDisplay,
    exportMetrics,
    resetHistory,
    getRecommendations
  };
};

/**
 * Calculate averages from benchmark history
 */
function calculateAverages(history: PerformanceMetrics[]): BenchmarkResults['averages'] {
  if (history.length === 0) {
    return {
      audioCapture: 0,
      websocket: 0,
      processing: 0,
      display: 0,
      total: 0
    };
  }

  const totals = history.reduce((acc, metrics) => {
    return {
      audioCapture: acc.audioCapture + (metrics.audioCapture?.latency || 0),
      websocket: acc.websocket + (metrics.websocketConnection?.latency || 0),
      processing: acc.processing + (metrics.audioProcessing?.latency || 0),
      display: acc.display + (metrics.transcriptionDisplay?.latency || 0),
      total: acc.total + metrics.endToEnd.totalLatency
    };
  }, { audioCapture: 0, websocket: 0, processing: 0, display: 0, total: 0 });

  return {
    audioCapture: totals.audioCapture / history.length,
    websocket: totals.websocket / history.length,
    processing: totals.processing / history.length,
    display: totals.display / history.length,
    total: totals.total / history.length
  };
}

/**
 * Component for displaying benchmark results
 */
export interface BenchmarkDisplayProps {
  results: BenchmarkResults;
  showHistory?: boolean;
  showRecommendations?: boolean;
  compact?: boolean;
}

export const BenchmarkDisplay: React.FC<BenchmarkDisplayProps> = ({
  results,
  showHistory = false,
  showRecommendations = true,
  compact = false
}) => {
  const { current, history, averages, isRecording } = results;

  if (compact) {
    return (
      <div className="benchmark-display-compact">
        <div className={`status ${isRecording ? 'recording' : 'idle'}`}>
          {isRecording ? '🔴 Recording' : '⏸️ Idle'}
        </div>
        {current.endToEnd && (
          <div className="total-latency">
            Total: {current.endToEnd.totalLatency.toFixed(0)}ms
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="benchmark-display">
      <h3>Performance Metrics</h3>
      
      <div className="current-metrics">
        <h4>Current Session {isRecording && '(Recording...)'}</h4>
        
        {current.audioCapture && (
          <div>Audio Capture: {current.audioCapture.latency.toFixed(2)}ms</div>
        )}
        
        {current.websocketConnection && (
          <div>WebSocket: {current.websocketConnection.latency.toFixed(2)}ms</div>
        )}
        
        {current.audioProcessing && (
          <div>Processing: {current.audioProcessing.latency.toFixed(2)}ms</div>
        )}
        
        {current.transcriptionDisplay && (
          <div>Display: {current.transcriptionDisplay.latency.toFixed(2)}ms</div>
        )}
        
        {current.endToEnd && (
          <div><strong>Total: {current.endToEnd.totalLatency.toFixed(2)}ms</strong></div>
        )}
      </div>

      {history.length > 0 && (
        <div className="averages">
          <h4>Averages ({history.length} sessions)</h4>
          <div>Audio Capture: {averages.audioCapture.toFixed(2)}ms</div>
          <div>WebSocket: {averages.websocket.toFixed(2)}ms</div>
          <div>Processing: {averages.processing.toFixed(2)}ms</div>
          <div>Display: {averages.display.toFixed(2)}ms</div>
          <div><strong>Total: {averages.total.toFixed(2)}ms</strong></div>
        </div>
      )}

      {showHistory && history.length > 0 && (
        <div className="history">
          <h4>Recent Sessions</h4>
          <div className="history-list">
            {history.slice(-5).map((metrics, index) => (
              <div key={index} className="history-item">
                Session {history.length - 4 + index}: {metrics.endToEnd.totalLatency.toFixed(2)}ms
              </div>
            ))}
          </div>
        </div>
      )}

      {showRecommendations && (
        <div className="recommendations">
          <h4>Performance Recommendations</h4>
          {/* Will be implemented with getRecommendations hook */}
        </div>
      )}
    </div>
  );
};
