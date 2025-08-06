/**
 * Performance Testing Page for Transcription Latency Analysis
 * Use this page to test and analyze your transcription performance vs YouTube
 */

import React, { useState } from 'react';
import BenchmarkedTranscriptionComponent from '../components/BenchmarkedTranscriptionComponent';
import { useTranscriptionBenchmark } from '../hooks/useTranscriptionBenchmark';

const TranscriptionPerformanceTestPage: React.FC = () => {
  const [testResults, setTestResults] = useState<any[]>([]);
  const [showInstructions, setShowInstructions] = useState(true);

  const handleTranscriptionStart = () => {
    console.log('🎙️ Transcription started - benchmarking active');
  };

  const handleTranscriptionEnd = () => {
    console.log('⏹️ Transcription ended - benchmark complete');
  };

  const handleError = (error: Error) => {
    console.error('❌ Transcription error:', error);
  };

  return (
    <div className="transcription-test-page" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '30px' }}>
        <h1>🚀 Transcription Performance Analysis</h1>
        <p>Compare your transcription latency with YouTube-like performance</p>
      </header>

      {showInstructions && (
        <div style={{ 
          background: '#f0f8ff', 
          border: '1px solid #007acc', 
          borderRadius: '8px', 
          padding: '20px', 
          marginBottom: '30px' 
        }}>
          <h3>🔍 How to Use This Performance Test</h3>
          <ol>
            <li><strong>Click "Start Recording"</strong> - This begins audio capture and WebSocket connection benchmarking</li>
            <li><strong>Speak clearly</strong> - Say a few sentences to test transcription quality and speed</li>
            <li><strong>Monitor metrics</strong> - Watch the real-time performance metrics below</li>
            <li><strong>Click "Stop Recording"</strong> - This completes the benchmark and shows recommendations</li>
          </ol>
          
          <h4>📊 What You'll See:</h4>
          <ul>
            <li><strong>Audio Capture:</strong> Time to initialize microphone (~50ms target)</li>
            <li><strong>WebSocket:</strong> Connection and first response time (~100ms target)</li>
            <li><strong>Processing:</strong> Audio processing latency (~200ms target)</li>
            <li><strong>Display:</strong> UI rendering time (~30ms target)</li>
            <li><strong>Total:</strong> End-to-end latency (~380ms YouTube-like target)</li>
          </ul>

          <div style={{ marginTop: '15px' }}>
            <button 
              onClick={() => setShowInstructions(false)}
              style={{ 
                background: '#007acc', 
                color: 'white', 
                border: 'none', 
                padding: '8px 16px', 
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Got it, let's test!
            </button>
          </div>
        </div>
      )}

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '30px',
        marginBottom: '30px'
      }}>
        <div>
          <h2>🎙️ Live Transcription Test</h2>
          <BenchmarkedTranscriptionComponent
            onTranscriptionStart={handleTranscriptionStart}
            onTranscriptionEnd={handleTranscriptionEnd}
            onError={handleError}
            showBenchmarks={true}
            enableOptimizations={true}
          />
        </div>

        <div>
          <h2>📈 Performance Comparison</h2>
          <div style={{ 
            background: '#f8f9fa', 
            border: '1px solid #dee2e6', 
            borderRadius: '8px', 
            padding: '20px' 
          }}>
            <h3>🎯 Target Performance (YouTube-like)</h3>
            <div style={{ fontFamily: 'monospace', fontSize: '14px' }}>
              <div>🎵 Audio Capture: &lt; 50ms</div>
              <div>🔌 WebSocket: &lt; 100ms</div>
              <div>🔊 Processing: &lt; 200ms</div>
              <div>🎨 Display: &lt; 30ms</div>
              <div><strong>🏁 Total: &lt; 380ms</strong></div>
            </div>

            <h3 style={{ marginTop: '20px' }}>🚨 Common Bottlenecks</h3>
            <ul style={{ fontSize: '14px' }}>
              <li><strong>Audio Capture &gt; 100ms:</strong> Pre-warm AudioContext</li>
              <li><strong>WebSocket &gt; 500ms:</strong> Connection pooling needed</li>
              <li><strong>Processing &gt; 300ms:</strong> Use WebAssembly/Workers</li>
              <li><strong>Display &gt; 50ms:</strong> Implement React.memo/virtualization</li>
            </ul>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '30px' }}>
        <h2>💡 Quick Performance Tips</h2>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
          gap: '20px' 
        }}>
          <div style={{ background: '#e8f5e8', padding: '15px', borderRadius: '8px' }}>
            <h4>🚀 Speed Optimizations</h4>
            <ul style={{ fontSize: '14px', margin: 0 }}>
              <li>Use AudioWorklet over ScriptProcessor</li>
              <li>Enable WebSocket compression</li>
              <li>Implement connection pre-warming</li>
              <li>Use React.memo for transcription items</li>
            </ul>
          </div>

          <div style={{ background: '#fff3e0', padding: '15px', borderRadius: '8px' }}>
            <h4>⚡ Browser Optimizations</h4>
            <ul style={{ fontSize: '14px', margin: 0 }}>
              <li>Set AudioContext latencyHint: 'interactive'</li>
              <li>Use high sample rate (48kHz)</li>
              <li>Enable audio enhancements</li>
              <li>Implement proper cleanup</li>
            </ul>
          </div>

          <div style={{ background: '#f3e5f5', padding: '15px', borderRadius: '8px' }}>
            <h4>🎯 UI Performance</h4>
            <ul style={{ fontSize: '14px', margin: 0 }}>
              <li>Virtualize long transcript lists</li>
              <li>Use useDeferredValue for updates</li>
              <li>Debounce rapid state changes</li>
              <li>Implement proper memoization</li>
            </ul>
          </div>
        </div>
      </div>

      <div style={{ 
        marginTop: '30px', 
        padding: '20px', 
        background: '#f8f9fa', 
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <p style={{ margin: 0, color: '#6c757d' }}>
          💡 <strong>Pro Tip:</strong> Run multiple tests to get accurate averages. 
          Network conditions and system load can affect individual measurements.
        </p>
      </div>
    </div>
  );
};

export default TranscriptionPerformanceTestPage;
