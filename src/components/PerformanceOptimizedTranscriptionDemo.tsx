/**
 * Performance-Optimized Transcription Demo
 *
 * This demo showcases the enhanced live transcription system with performance optimizations,
 * including virtual scrolling, performance monitoring, and gap detection capabilities.
 */

import React, {useState, useEffect, useCallback} from 'react'
import {
  PerformanceOptimizedTranscriptionRenderer,
  PerformanceMetrics
} from './PerformanceOptimizedTranscriptionRenderer'
import {useEnhancedLiveTranscription} from '../hooks/useEnhancedLiveTranscription'
import {TranscriptionPerformanceMonitor} from '../services/TranscriptionPerformanceMonitor'
import type {PerformanceAlert} from '../services/TranscriptionPerformanceMonitor'

const PerformanceOptimizedTranscriptionDemo: React.FC = () => {
  const {
    state,
    addSegment,
    startSession,
    endSession,
    isActive,
    timelineAnalysis,
    detectedGaps,
    continuityScore,
    hasSignificantGaps,
    gapRecommendations,
    validateContinuity
  } = useEnhancedLiveTranscription({
    timestampTrackingConfig: {
      gapDetectionThreshold: 1000, // 1 second
      maxAcceptableGap: 3000, // 3 seconds
      estimationStrategy: 'adaptive',
      enableGapFilling: false,
      timelinePrecision: 100
    },
    onGapDetected: gap => {
      console.log('Gap detected:', gap)
    },
    onSignificantGap: gap => {
      console.warn('Significant gap detected:', gap)
    }
  })

  const [performanceMonitor] = useState(() => new TranscriptionPerformanceMonitor())
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null)
  const [performanceAlerts, setPerformanceAlerts] = useState<PerformanceAlert[]>([])
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationSpeed, setSimulationSpeed] = useState(500) // ms between segments

  // Performance monitoring
  useEffect(() => {
    performanceMonitor.startMonitoring()
    return () => performanceMonitor.stopMonitoring()
  }, [performanceMonitor])

  const handlePerformanceMetrics = useCallback(
    (metrics: PerformanceMetrics) => {
      setPerformanceMetrics(metrics)
      const alerts = performanceMonitor.getActiveAlerts()
      setPerformanceAlerts(alerts)
    },
    [performanceMonitor]
  )

  // Simulation functions
  const startSimulation = useCallback(() => {
    startSession()
    setIsSimulating(true)
    simulateTranscription()
  }, [startSession])

  const stopSimulation = useCallback(() => {
    setIsSimulating(false)
    endSession()
  }, [endSession])

  const simulateTranscription = useCallback(() => {
    const sampleTexts = [
      'Welcome to the performance optimized transcription demo.',
      'This system demonstrates advanced features like gap detection,',
      'performance monitoring, and virtual scrolling capabilities.',
      'Real-time transcription with continuous text display ensures',
      'that no content is lost during the transcription process.',
      'The system can handle high-frequency updates efficiently',
      'while maintaining smooth user interface responsiveness.',
      'Performance metrics are tracked in real-time to identify',
      'any potential bottlenecks or optimization opportunities.',
      'Gap detection helps maintain timeline continuity by',
      'identifying silence periods and processing delays.',
      'Virtual scrolling enables handling of very large transcripts',
      'without degrading browser performance or memory usage.',
      'This concludes the performance optimization demonstration.'
    ]

    let index = 0

    const addNextSegment = () => {
      if (!isSimulating || index >= sampleTexts.length) {
        setIsSimulating(false)
        return
      }

      const text = sampleTexts[index]
      const isPartial = Math.random() > 0.7 // 30% chance of partial
      const confidence = 0.8 + Math.random() * 0.2 // 80-100% confidence

      // Simulate audio timestamp
      const audioTimestamp = Date.now() - 10000 + index * 2000

      addSegment(text, isPartial, 'demo-simulation', audioTimestamp, confidence)

      index++

      // Add some variation in timing to test gap detection
      const delay = simulationSpeed + (Math.random() > 0.8 ? 2000 : 0) // Occasional 2s gap
      setTimeout(addNextSegment, delay)
    }

    setTimeout(addNextSegment, 1000) // Start after 1 second
  }, [isSimulating, simulationSpeed, addSegment])

  const continuityReport = validateContinuity()

  return (
    <div
      className="performance-optimized-demo"
      style={{padding: '20px', fontFamily: 'Arial, sans-serif'}}
    >
      <h2>Performance-Optimized Live Transcription Demo</h2>

      {/* Control Panel */}
      <div
        style={{
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px'
        }}
      >
        <h3>Controls</h3>
        <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px'}}>
          <button
            onClick={startSimulation}
            disabled={isActive || isSimulating}
            style={{padding: '8px 16px', borderRadius: '4px', border: '1px solid #ccc'}}
          >
            Start Simulation
          </button>
          <button
            onClick={stopSimulation}
            disabled={!isActive && !isSimulating}
            style={{padding: '8px 16px', borderRadius: '4px', border: '1px solid #ccc'}}
          >
            Stop Simulation
          </button>
          <label>
            Speed:
            <input
              type="range"
              min="100"
              max="2000"
              value={simulationSpeed}
              onChange={e => setSimulationSpeed(Number(e.target.value))}
              style={{marginLeft: '8px'}}
            />
            {simulationSpeed}ms
          </label>
        </div>
        <div style={{fontSize: '14px', color: '#666'}}>
          Status: {isActive ? 'Active' : 'Inactive'} | Simulating: {isSimulating ? 'Yes' : 'No'} |
          Segments: {state.segments.length}
        </div>
      </div>

      {/* Performance Metrics */}
      <div
        style={{marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}
      >
        <div style={{padding: '15px', backgroundColor: '#e8f4fd', borderRadius: '8px'}}>
          <h3>Performance Metrics</h3>
          {performanceMetrics ? (
            <div style={{fontSize: '14px'}}>
              <div>Render Time: {performanceMetrics.renderTime.toFixed(2)}ms</div>
              <div>Memory Usage: {performanceMetrics.memoryUsage.toFixed(2)}MB</div>
              <div>Visible Segments: {performanceMetrics.visibleSegments}</div>
              <div>Total Segments: {performanceMetrics.totalSegments}</div>
              <div>Update Frequency: {performanceMetrics.updateFrequency.toFixed(1)} Hz</div>
            </div>
          ) : (
            <div style={{fontSize: '14px', color: '#666'}}>No performance data yet</div>
          )}
        </div>

        <div style={{padding: '15px', backgroundColor: '#fff2e8', borderRadius: '8px'}}>
          <h3>Timeline Analysis</h3>
          <div style={{fontSize: '14px'}}>
            <div>Continuity Score: {(continuityScore * 100).toFixed(1)}%</div>
            <div>Active Transcription: {timelineAnalysis.activeTranscriptionTime.toFixed(0)}ms</div>
            <div>Detected Gaps: {detectedGaps.length}</div>
            <div>Significant Gaps: {hasSignificantGaps ? 'Yes' : 'No'}</div>
            <div>
              Average Segment Duration: {timelineAnalysis.averageSegmentDuration.toFixed(0)}ms
            </div>
          </div>
        </div>
      </div>

      {/* Alerts and Recommendations */}
      {(performanceAlerts.length > 0 ||
        gapRecommendations.hasIssues ||
        !continuityReport.isValid) && (
        <div
          style={{
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#ffe8e8',
            borderRadius: '8px'
          }}
        >
          <h3>Alerts & Recommendations</h3>

          {performanceAlerts.length > 0 && (
            <div style={{marginBottom: '10px'}}>
              <h4>Performance Alerts:</h4>
              {performanceAlerts.map(alert => (
                <div
                  key={alert.id}
                  style={{
                    fontSize: '14px',
                    color: alert.type === 'critical' ? '#d32f2f' : '#f57c00',
                    marginBottom: '4px'
                  }}
                >
                  [{alert.type.toUpperCase()}] {alert.message}
                </div>
              ))}
            </div>
          )}

          {gapRecommendations.hasIssues && (
            <div style={{marginBottom: '10px'}}>
              <h4>Gap Recommendations:</h4>
              {gapRecommendations.recommendations.map((rec, index) => (
                <div key={index} style={{fontSize: '14px', color: '#666', marginBottom: '4px'}}>
                  • {rec}
                </div>
              ))}
            </div>
          )}

          {!continuityReport.isValid && (
            <div>
              <h4>Continuity Issues:</h4>
              {continuityReport.issues.map((issue, index) => (
                <div key={index} style={{fontSize: '14px', color: '#d32f2f', marginBottom: '4px'}}>
                  • {issue}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transcription Display */}
      <div style={{marginBottom: '20px'}}>
        <h3>Live Transcription (Performance Optimized)</h3>
        <div style={{border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden'}}>
          <PerformanceOptimizedTranscriptionRenderer
            segments={state.segments}
            currentText={state.currentText}
            isStreaming={state.isActivelyStreaming}
            onPerformanceMetrics={handlePerformanceMetrics}
            config={{
              virtualScrolling: true,
              containerHeight: 300,
              itemHeight: 30,
              overscan: 3,
              renderBatchSize: 10,
              updateThrottle: 16,
              maxVisibleSegments: 100,
              enableProfiling: true,
              logPerformanceMetrics: false,
              enableGarbageCollection: true,
              gcThreshold: 150
            }}
            autoScroll={true}
            highlightPartial={true}
            className="demo-transcription-display"
          />
        </div>
      </div>

      {/* Gap Analysis */}
      {detectedGaps.length > 0 && (
        <div style={{padding: '15px', backgroundColor: '#f0f8ff', borderRadius: '8px'}}>
          <h3>Gap Analysis</h3>
          <div style={{fontSize: '14px'}}>
            {detectedGaps.map(gap => (
              <div
                key={gap.id}
                style={{
                  marginBottom: '8px',
                  padding: '8px',
                  backgroundColor: 'white',
                  borderRadius: '4px'
                }}
              >
                <div>
                  Gap ID: {gap.id} | Type: {gap.type}
                </div>
                <div>
                  Duration: {gap.duration}ms | Time: {gap.startTime} - {gap.endTime}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debug Information */}
      <details style={{marginTop: '20px', fontSize: '12px', color: '#666'}}>
        <summary>Debug Information</summary>
        <pre
          style={{
            backgroundColor: '#f5f5f5',
            padding: '10px',
            borderRadius: '4px',
            overflow: 'auto'
          }}
        >
          {JSON.stringify(
            {
              segments: state.segments.length,
              currentText: state.currentText.slice(0, 50) + '...',
              isStreaming: state.isActivelyStreaming,
              lastUpdate: state.lastUpdateTime,
              sessionStart: state.sessionStartTime,
              stats: state.stats,
              timelineAnalysis: {
                totalDuration: timelineAnalysis.totalDuration,
                continuityScore: timelineAnalysis.continuityScore,
                gaps: timelineAnalysis.gaps.length
              }
            },
            null,
            2
          )}
        </pre>
      </details>
    </div>
  )
}

export default PerformanceOptimizedTranscriptionDemo
