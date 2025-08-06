/**
 * Test page for the optimized transcription system
 * Demonstrates the performance improvements and benchmarking
 */

import React, { useState } from 'react';
import OptimizedTranscriptionComponent from '../components/OptimizedTranscriptionComponent';
import type { OptimizedWebSocketConfig } from '../services/optimized-transcription-websocket';

const OptimizedTranscriptionTestPage: React.FC = () => {
  const [config, setConfig] = useState<OptimizedWebSocketConfig>({
    apiKey: process.env.REACT_APP_GEMINI_API_KEY || '',
    model: 'gemini-2.0-flash-exp',
    enableConnectionPooling: true,
    poolSize: 3,
    enableBinaryTransmission: true,
    enableCompression: true,
    enableHeartbeat: true,
    heartbeatInterval: 30000,
    enablePerformanceMetrics: true,
    lowLatencyMode: true,
    reconnectAttempts: 5,
    reconnectDelay: 1000,
    maxReconnectDelay: 30000,
    connectionTimeout: 10000,
    messageQueueSize: 100,
    enableMessageQueuing: true
  });

  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const handleConfigChange = (key: keyof OptimizedWebSocketConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={{ 
      maxWidth: '1200px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ 
          color: '#2c3e50', 
          marginBottom: '10px',
          fontSize: '2.5em'
        }}>
          🚀 Optimized Live Transcription Test
        </h1>
        <p style={{ 
          color: '#7f8c8d', 
          fontSize: '1.2em',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          Testing the high-performance WebSocket transcription system with YouTube-level latency optimization
        </p>
      </div>

      {/* Configuration Panel */}
      <div style={{
        marginBottom: '30px',
        padding: '20px',
        border: '1px solid #e1e8ed',
        borderRadius: '12px',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '15px'
        }}>
          <h3 style={{ margin: 0, color: '#2c3e50' }}>
            Configuration
          </h3>
          <button
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            style={{
              padding: '6px 12px',
              border: '1px solid #007bff',
              backgroundColor: 'transparent',
              color: '#007bff',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {showAdvancedSettings ? 'Hide' : 'Show'} Advanced
          </button>
        </div>

        {/* Basic Configuration */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
          gap: '15px',
          marginBottom: showAdvancedSettings ? '20px' : '0'
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              API Key:
            </label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => handleConfigChange('apiKey', e.target.value)}
              placeholder="Enter your Gemini API key"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
            {!config.apiKey && (
              <div style={{ fontSize: '12px', color: '#e74c3c', marginTop: '4px' }}>
                ⚠️ API key required for transcription
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Model:
            </label>
            <select
              value={config.model}
              onChange={(e) => handleConfigChange('model', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            >
              <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Experimental)</option>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
            </select>
          </div>
        </div>

        {/* Advanced Configuration */}
        {showAdvancedSettings && (
          <div style={{
            borderTop: '1px solid #dee2e6',
            paddingTop: '20px'
          }}>
            <h4 style={{ marginBottom: '15px', color: '#495057' }}>
              Performance Optimization Settings
            </h4>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
              gap: '15px'
            }}>
              {/* Connection Pooling */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={config.enableConnectionPooling}
                    onChange={(e) => handleConfigChange('enableConnectionPooling', e.target.checked)}
                  />
                  <span style={{ fontWeight: 'bold' }}>Connection Pooling</span>
                </label>
                {config.enableConnectionPooling && (
                  <div style={{ marginLeft: '24px', marginTop: '5px' }}>
                    <label style={{ fontSize: '14px' }}>Pool Size:</label>
                    <input
                      type="number"
                      value={config.poolSize}
                      onChange={(e) => handleConfigChange('poolSize', parseInt(e.target.value))}
                      min="1"
                      max="10"
                      style={{
                        width: '60px',
                        marginLeft: '8px',
                        padding: '4px',
                        border: '1px solid #ddd',
                        borderRadius: '4px'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Binary Transmission */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={config.enableBinaryTransmission}
                    onChange={(e) => handleConfigChange('enableBinaryTransmission', e.target.checked)}
                  />
                  <span style={{ fontWeight: 'bold' }}>Binary Transmission</span>
                </label>
                <div style={{ fontSize: '12px', color: '#6c757d', marginLeft: '24px' }}>
                  Reduces payload size by ~40%
                </div>
              </div>

              {/* Compression */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={config.enableCompression}
                    onChange={(e) => handleConfigChange('enableCompression', e.target.checked)}
                  />
                  <span style={{ fontWeight: 'bold' }}>Compression</span>
                </label>
                <div style={{ fontSize: '12px', color: '#6c757d', marginLeft: '24px' }}>
                  Additional bandwidth reduction
                </div>
              </div>

              {/* Low Latency Mode */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={config.lowLatencyMode}
                    onChange={(e) => handleConfigChange('lowLatencyMode', e.target.checked)}
                  />
                  <span style={{ fontWeight: 'bold' }}>Low Latency Mode</span>
                </label>
                <div style={{ fontSize: '12px', color: '#6c757d', marginLeft: '24px' }}>
                  Optimizes for minimal delay
                </div>
              </div>

              {/* Heartbeat */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={config.enableHeartbeat}
                    onChange={(e) => handleConfigChange('enableHeartbeat', e.target.checked)}
                  />
                  <span style={{ fontWeight: 'bold' }}>Heartbeat</span>
                </label>
                {config.enableHeartbeat && (
                  <div style={{ marginLeft: '24px', marginTop: '5px' }}>
                    <label style={{ fontSize: '14px' }}>Interval (ms):</label>
                    <input
                      type="number"
                      value={config.heartbeatInterval}
                      onChange={(e) => handleConfigChange('heartbeatInterval', parseInt(e.target.value))}
                      min="5000"
                      max="60000"
                      step="5000"
                      style={{
                        width: '80px',
                        marginLeft: '8px',
                        padding: '4px',
                        border: '1px solid #ddd',
                        borderRadius: '4px'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Message Queuing */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={config.enableMessageQueuing}
                    onChange={(e) => handleConfigChange('enableMessageQueuing', e.target.checked)}
                  />
                  <span style={{ fontWeight: 'bold' }}>Message Queuing</span>
                </label>
                {config.enableMessageQueuing && (
                  <div style={{ marginLeft: '24px', marginTop: '5px' }}>
                    <label style={{ fontSize: '14px' }}>Queue Size:</label>
                    <input
                      type="number"
                      value={config.messageQueueSize}
                      onChange={(e) => handleConfigChange('messageQueueSize', parseInt(e.target.value))}
                      min="10"
                      max="1000"
                      style={{
                        width: '80px',
                        marginLeft: '8px',
                        padding: '4px',
                        border: '1px solid #ddd',
                        borderRadius: '4px'
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Connection Settings */}
            <h4 style={{ marginTop: '20px', marginBottom: '15px', color: '#495057' }}>
              Connection Settings
            </h4>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '15px'
            }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
                  Connection Timeout (ms):
                </label>
                <input
                  type="number"
                  value={config.connectionTimeout}
                  onChange={(e) => handleConfigChange('connectionTimeout', parseInt(e.target.value))}
                  min="1000"
                  max="30000"
                  style={{
                    width: '100%',
                    padding: '6px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
                  Reconnect Attempts:
                </label>
                <input
                  type="number"
                  value={config.reconnectAttempts}
                  onChange={(e) => handleConfigChange('reconnectAttempts', parseInt(e.target.value))}
                  min="0"
                  max="10"
                  style={{
                    width: '100%',
                    padding: '6px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
                  Reconnect Delay (ms):
                </label>
                <input
                  type="number"
                  value={config.reconnectDelay}
                  onChange={(e) => handleConfigChange('reconnectDelay', parseInt(e.target.value))}
                  min="500"
                  max="5000"
                  style={{
                    width: '100%',
                    padding: '6px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Performance Info Panel */}
      <div style={{
        marginBottom: '30px',
        padding: '20px',
        border: '1px solid #e1e8ed',
        borderRadius: '12px',
        backgroundColor: '#fff'
      }}>
        <h3 style={{ marginBottom: '15px', color: '#2c3e50' }}>
          🎯 Performance Targets vs YouTube
        </h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '15px'
        }}>
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#e8f5e8', 
            borderRadius: '8px',
            border: '1px solid #c3e6cb'
          }}>
            <div style={{ fontWeight: 'bold', color: '#155724' }}>Target Latency</div>
            <div style={{ fontSize: '18px', color: '#155724' }}>≤ 150ms</div>
            <div style={{ fontSize: '12px', color: '#6c757d' }}>YouTube baseline</div>
          </div>
          
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#e3f2fd', 
            borderRadius: '8px',
            border: '1px solid #90caf9'
          }}>
            <div style={{ fontWeight: 'bold', color: '#0d47a1' }}>Throughput Target</div>
            <div style={{ fontSize: '18px', color: '#0d47a1' }}>≥ 10 msg/s</div>
            <div style={{ fontSize: '12px', color: '#6c757d' }}>Real-time audio</div>
          </div>
          
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#fff3e0', 
            borderRadius: '8px',
            border: '1px solid #ffcc02'
          }}>
            <div style={{ fontWeight: 'bold', color: '#e65100' }}>Error Rate Target</div>
            <div style={{ fontSize: '18px', color: '#e65100' }}>≤ 1%</div>
            <div style={{ fontSize: '12px', color: '#6c757d' }}>Reliable service</div>
          </div>

          <div style={{ 
            padding: '12px', 
            backgroundColor: '#f3e5f5', 
            borderRadius: '8px',
            border: '1px solid #ce93d8'
          }}>
            <div style={{ fontWeight: 'bold', color: '#4a148c' }}>Connection Time</div>
            <div style={{ fontSize: '18px', color: '#4a148c' }}>≤ 2s</div>
            <div style={{ fontSize: '12px', color: '#6c757d' }}>Instant start</div>
          </div>
        </div>
      </div>

      {/* Main Transcription Component */}
      {config.apiKey ? (
        <OptimizedTranscriptionComponent
          config={config}
          autoStart={false}
          showMetrics={true}
          showBenchmarks={true}
          onTranscription={(data) => {
            console.log('📝 Transcription received:', data);
          }}
          onError={(error) => {
            console.error('❌ Transcription error:', error);
          }}
        />
      ) : (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          border: '2px dashed #dee2e6',
          borderRadius: '12px',
          backgroundColor: '#f8f9fa'
        }}>
          <h3 style={{ color: '#6c757d', marginBottom: '10px' }}>
            API Key Required
          </h3>
          <p style={{ color: '#6c757d' }}>
            Please enter your Gemini API key in the configuration above to test the transcription system.
          </p>
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: '40px',
        padding: '20px',
        textAlign: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: '12px'
      }}>
        <p style={{ margin: 0, color: '#6c757d', fontSize: '14px' }}>
          🚀 Optimized for minimal latency using connection pooling, binary transmission, and compression
        </p>
      </div>
    </div>
  );
};

export default OptimizedTranscriptionTestPage;
