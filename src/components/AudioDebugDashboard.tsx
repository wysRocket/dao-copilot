import React, { useState } from 'react'
import AudioSourceSelector, { AudioSourceType } from './AudioSourceSelector'
import WebSocketDebugger from './WebSocketDebugger'

interface AudioDebugDashboardProps {
  className?: string
}

export const AudioDebugDashboard: React.FC<AudioDebugDashboardProps> = ({ className = '' }) => {
  const [selectedSource, setSelectedSource] = useState<AudioSourceType>('none')
  const [debugLog, setDebugLog] = useState<string[]>([])

  const addToLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setDebugLog(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]) // Keep last 20 entries
  }

  const handleSourceChange = (newSource: AudioSourceType) => {
    setSelectedSource(newSource)
    addToLog(`Audio source changed to: ${newSource}`)
  }

  const testCurrentAudioCapture = async () => {
    addToLog('Testing current audio capture system...')
    
    try {
      // Test the existing Capturer class
      const { Capturer } = await import('../services/audio_capture')
      const capturer = new Capturer()
      
      let audioDataReceived = false
      let audioLevel = 0
      
      addToLog('Starting audio capture test (5 seconds)...')
      
      await capturer.startRecording((buffer: number[]) => {
        audioDataReceived = true
        // Calculate simple audio level
        const sum = buffer.reduce((acc, val) => acc + Math.abs(val), 0)
        audioLevel = Math.round((sum / buffer.length) * 1000) / 1000
        
        addToLog(`Audio chunk received: ${buffer.length} samples, level: ${audioLevel}`)
      }, {
        sampleRate: 16000,
        targetDurationMs: 1000 // 1 second chunks for testing
      })
      
      // Stop after 5 seconds
      setTimeout(async () => {
        await capturer.stopRecording()
        addToLog(`Test completed. Audio data received: ${audioDataReceived}`)
        if (!audioDataReceived) {
          addToLog('⚠️ NO AUDIO DATA RECEIVED - This likely explains empty transcriptions!')
        }
      }, 5000)
      
    } catch (error) {
      addToLog(`Error testing audio capture: ${error}`)
    }
  }

  const clearLog = () => {
    setDebugLog([])
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-xl font-bold text-blue-800 mb-2">🔧 Audio Debugging Dashboard</h2>
        <p className="text-blue-700 text-sm">
          This dashboard helps diagnose the empty transcription issue by testing audio capture and monitoring real-time audio levels.
        </p>
      </div>
      
      {/* Audio Source Selector */}
      <AudioSourceSelector 
        currentSource={selectedSource}
        onSourceChange={handleSourceChange}
      />
      
      {/* WebSocket Debug Tool */}
      <WebSocketDebugger />
      
      {/* Debug Controls */}
      <div className="space-y-4 p-4 border rounded-lg" style={{ 
        backgroundColor: 'var(--background-secondary)', 
        borderColor: 'var(--border-primary)' 
      }}>
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Debug Controls
        </h3>
        
        <div className="flex space-x-2">
          <button 
            onClick={testCurrentAudioCapture}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
          >
            Test Current Audio Capture (5s)
          </button>
          <button 
            onClick={clearLog}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Clear Log
          </button>
        </div>
      </div>

      {/* Debug Log */}
      {debugLog.length > 0 && (
        <div className="space-y-2 p-4 border rounded-lg" style={{ 
          backgroundColor: 'var(--background-secondary)', 
          borderColor: 'var(--border-primary)' 
        }}>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Debug Log
          </h3>
          <div 
            className="max-h-64 overflow-y-auto p-3 rounded font-mono text-sm space-y-1"
            style={{ backgroundColor: 'var(--background-tertiary)' }}
          >
            {debugLog.map((entry, index) => (
              <div 
                key={index} 
                className={`${
                  entry.includes('⚠️') || entry.includes('Error') ? 'text-red-600' :
                  entry.includes('✅') || entry.includes('received') ? 'text-green-600' :
                  'text-gray-700'
                }`}
              >
                {entry}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagnosis Information */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-800 mb-2">🎯 Expected Diagnosis</h3>
        <div className="text-yellow-700 text-sm space-y-2">
          <p><strong>If you see empty transcriptions:</strong></p>
          <ol className="list-decimal list-inside space-y-1 ml-4">
            <li>Test &quot;System Audio&quot; option above - this should show audio levels when you play a video</li>
            <li>If system audio levels are 0, the user didn&apos;t check &quot;Share audio&quot; in the screen share dialog</li>
            <li>If microphone levels are 0, the user isn&apos;t speaking or mic permissions are denied</li>
            <li>The &quot;Test Current Audio Capture&quot; button will show if the existing system gets any audio data</li>
          </ol>
          <p className="mt-2"><strong>Solution:</strong> Use the audio source selector to choose the right input source and verify permissions are granted.</p>
        </div>
      </div>
    </div>
  )
}

export default AudioDebugDashboard
