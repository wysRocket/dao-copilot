import React, { useState, useCallback, useRef } from 'react'

interface WebSocketDebuggerProps {
  className?: string
}

interface DebugLogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'success'
  category: 'websocket' | 'audio' | 'api' | 'setup' | 'response'
  message: string
  data?: unknown
}

interface TestResults {
  apiKeyValid: boolean | null
  websocketConnected: boolean | null
  audioStreamActive: boolean | null
  responseReceived: boolean | null
}

export default function WebSocketDebugger({ className = '' }: WebSocketDebuggerProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<DebugLogEntry[]>([])
  const [results, setResults] = useState<TestResults>({
    apiKeyValid: null,
    websocketConnected: null,
    audioStreamActive: null,
    responseReceived: null
  })
  const [apiKey, setApiKey] = useState('')
  const [testDuration, setTestDuration] = useState(10) // seconds
  const [audioLevel, setAudioLevel] = useState(0)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyzerRef = useRef<AnalyserNode | null>(null)
  const clientRef = useRef<any>(null)

  const addLog = useCallback((entry: Omit<DebugLogEntry, 'timestamp'>) => {
    const logEntry: DebugLogEntry = {
      ...entry,
      timestamp: Date.now()
    }
    setLogs(prev => [...prev, logEntry])
    console.log(`[${entry.category}] ${entry.message}`, entry.data || '')
  }, [])

  const updateResult = useCallback((key: keyof TestResults, value: boolean) => {
    setResults(prev => ({ ...prev, [key]: value }))
  }, [])

  const setupAudioAnalysis = useCallback(async (): Promise<MediaStream | null> => {
    try {
      addLog({
        level: 'info',
        category: 'audio',
        message: 'Requesting microphone access...'
      })

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      // Setup audio analysis
      audioContextRef.current = new AudioContext({ sampleRate: 16000 })
      analyzerRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyzerRef.current)

      analyzerRef.current.fftSize = 256
      const bufferLength = analyzerRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      // Audio level monitoring
      const updateAudioLevel = () => {
        if (analyzerRef.current) {
          analyzerRef.current.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength
          setAudioLevel(Math.round((average / 255) * 100))
        }
      }

      const intervalId = setInterval(updateAudioLevel, 100)
      
      // Cleanup function
      const cleanup = () => {
        clearInterval(intervalId)
        stream.getTracks().forEach(track => track.stop())
        if (audioContextRef.current) {
          audioContextRef.current.close()
        }
      }

      // Store cleanup function
      ;(stream as any).cleanup = cleanup

      addLog({
        level: 'success',
        category: 'audio',
        message: 'Microphone access granted and audio analysis setup complete'
      })

      return stream
    } catch (error) {
      addLog({
        level: 'error',
        category: 'audio',
        message: `Failed to setup audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: error
      })
      return null
    }
  }, [addLog])

  const runComprehensiveTest = useCallback(async () => {
    if (!apiKey.trim()) {
      addLog({
        level: 'error',
        category: 'setup',
        message: 'API key is required for testing'
      })
      return
    }

    setIsRunning(true)
    setLogs([])
    setResults({
      apiKeyValid: null,
      websocketConnected: null,
      audioStreamActive: null,
      responseReceived: null
    })

    try {
      // Test 1: API Key validation
      addLog({
        level: 'info',
        category: 'api',
        message: 'Validating API key...'
      })

      // Basic API key format check
      if (apiKey.startsWith('AIza') && apiKey.length > 30) {
        updateResult('apiKeyValid', true)
        addLog({
          level: 'success',
          category: 'api',
          message: 'API key format appears valid'
        })
      } else {
        updateResult('apiKeyValid', false)
        addLog({
          level: 'error',
          category: 'api',
          message: 'API key format appears invalid'
        })
        return
      }

      // Test 2: WebSocket setup
      addLog({
        level: 'info',
        category: 'websocket',
        message: 'Creating WebSocket client...'
      })

      const { GeminiLiveWebSocketClient } = await import('../services/gemini-live-websocket')
      
      const client = new GeminiLiveWebSocketClient({
        apiKey: apiKey,
        model: 'gemini-2.0-flash-live-001',
        apiVersion: 'v1beta',
        systemInstruction: 'You are a real-time speech transcription assistant. Your primary task is to transcribe speech accurately and immediately.',
        generationConfig: {
          temperature: 0.0,
          topP: 1.0,
          maxOutputTokens: 1024
        }
      })

      clientRef.current = client

      // Setup event listeners
      client.on('setupComplete', (data: any) => {
        updateResult('websocketConnected', true)
        addLog({
          level: 'success',
          category: 'websocket',
          message: 'WebSocket setup complete',
          data
        })
      })

      client.on('serverContent', (data: any) => {
        updateResult('responseReceived', true)
        addLog({
          level: 'success',
          category: 'response',
          message: 'Received server content',
          data
        })
      })

      client.on('inputTranscription', (data: any) => {
        addLog({
          level: 'info',
          category: 'response',
          message: 'Input transcription received',
          data
        })
      })

      client.on('error', (error: any) => {
        addLog({
          level: 'error',
          category: 'websocket',
          message: `WebSocket error: ${error.message || 'Unknown error'}`,
          data: error
        })
      })

      client.on('connectionStateChange', (state: any) => {
        addLog({
          level: 'info',
          category: 'websocket',
          message: `Connection state changed to: ${state}`,
          data: state
        })
      })

      // Test 3: Connect to WebSocket
      addLog({
        level: 'info',
        category: 'websocket',
        message: 'Connecting to Gemini Live API...'
      })

      await client.connect()

      // Wait for setup to complete
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Setup timeout'))
        }, 10000) // 10 second timeout

        client.on('setupComplete', () => {
          clearTimeout(timeout)
          resolve(void 0)
        })

        client.on('error', (error: any) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

      // Test 4: Audio streaming
      addLog({
        level: 'info',
        category: 'audio',
        message: 'Setting up audio stream...'
      })

      const stream = await setupAudioAnalysis()
      if (!stream) {
        updateResult('audioStreamActive', false)
        return
      }

      updateResult('audioStreamActive', true)

      // Setup MediaRecorder for audio capture
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=pcm'
      })
      mediaRecorderRef.current = mediaRecorder

      let audioChunks: Blob[] = []

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
          
          // Convert to PCM and send to WebSocket
          try {
            const arrayBuffer = await event.data.arrayBuffer()
            const audioContext = new AudioContext({ sampleRate: 16000 })
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
            const pcmData = audioBuffer.getChannelData(0)
            
            // Convert to base64
            const pcmArray = new Float32Array(pcmData)
            const pcmBuffer = new ArrayBuffer(pcmArray.length * 2)
            const pcmView = new Int16Array(pcmBuffer)
            
            for (let i = 0; i < pcmArray.length; i++) {
              pcmView[i] = Math.max(-32768, Math.min(32767, pcmArray[i] * 32768))
            }
            
            const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcmBuffer)))
            
            await client.sendRealtimeInput({
              audio: {
                data: base64Audio,
                mimeType: 'audio/pcm;rate=16000'
              }
            })

            addLog({
              level: 'info',
              category: 'audio',
              message: `Sent audio chunk (${base64Audio.length} bytes)`
            })

          } catch (error) {
            addLog({
              level: 'error',
              category: 'audio',
              message: `Failed to process audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
              data: error
            })
          }
        }
      }

      // Start recording
      mediaRecorder.start(1000) // Capture audio every 1000ms

      addLog({
        level: 'info',
        category: 'audio',
        message: `Starting audio capture for ${testDuration} seconds...`
      })

      // Test for specified duration
      await new Promise(resolve => {
        const timer = setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
          }
          resolve(void 0)
        }, testDuration * 1000)

        mediaRecorder.onstop = () => {
          clearTimeout(timer)
          resolve(void 0)
        }
      })

      // Send turn completion signal
      await client.sendTurnCompletion()

      addLog({
        level: 'info',
        category: 'websocket',
        message: 'Audio capture complete, sent turn completion signal'
      })

      // Cleanup
      if (stream && (stream as any).cleanup) {
        (stream as any).cleanup()
      }

      // Wait a bit for final responses
      await new Promise(resolve => setTimeout(resolve, 2000))

      addLog({
        level: 'success',
        category: 'setup',
        message: 'Comprehensive test completed!'
      })

    } catch (error) {
      addLog({
        level: 'error',
        category: 'setup',
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: error
      })
      
      if (error instanceof Error && error.message.includes('API key')) {
        updateResult('apiKeyValid', false)
      }
      if (error instanceof Error && error.message.includes('WebSocket')) {
        updateResult('websocketConnected', false)
      }
    } finally {
      // Cleanup
      if (clientRef.current) {
        try {
          await clientRef.current.disconnect()
        } catch (error) {
          addLog({
            level: 'warn',
            category: 'websocket',
            message: 'Error during cleanup'
          })
        }
        clientRef.current = null
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }

      setIsRunning(false)
    }
  }, [apiKey, testDuration, addLog, updateResult, setupAudioAnalysis])

  const clearLogs = useCallback(() => {
    setLogs([])
    setResults({
      apiKeyValid: null,
      websocketConnected: null,
      audioStreamActive: null,
      responseReceived: null
    })
  }, [])

  const getStatusIcon = (status: boolean | null) => {
    if (status === null) return '⏱️'
    return status ? '✅' : '❌'
  }

  const getStatusColor = (status: boolean | null) => {
    if (status === null) return 'text-yellow-400'
    return status ? 'text-green-400' : 'text-red-400'
  }

  const getLevelColor = (level: DebugLogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-400'
      case 'warn': return 'text-yellow-400'
      case 'success': return 'text-green-400'
      default: return 'text-gray-300'
    }
  }

  const getCategoryColor = (category: DebugLogEntry['category']) => {
    switch (category) {
      case 'websocket': return 'text-blue-400'
      case 'audio': return 'text-purple-400'
      case 'api': return 'text-orange-400'
      case 'setup': return 'text-cyan-400'
      case 'response': return 'text-green-400'
      default: return 'text-gray-400'
    }
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          🔧 WebSocket Transcription Debugger
        </h3>
        <p className="text-gray-300 mb-6">
          This tool performs a comprehensive test of your WebSocket transcription setup to identify why you&apos;re getting no text from the API.
        </p>

        {/* Configuration */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Gemini API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Gemini API key..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Test Duration (seconds)
            </label>
            <input
              type="number"
              value={testDuration}
              onChange={(e) => setTestDuration(parseInt(e.target.value) || 10)}
              min="5"
              max="60"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Audio Level Indicator */}
        {isRunning && (
          <div className="mb-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-300">Audio Level:</span>
              <div className="flex-1 bg-gray-700 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-200"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
              <span className="text-sm text-gray-300 w-12">{audioLevel}%</span>
            </div>
          </div>
        )}

        {/* Test Controls */}
        <div className="flex space-x-4 mb-6">
          <button
            onClick={runComprehensiveTest}
            disabled={isRunning || !apiKey.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md transition-colors"
          >
            {isRunning ? '🔄 Running Test...' : '🚀 Run Comprehensive Test'}
          </button>
          
          <button
            onClick={clearLogs}
            disabled={isRunning}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white rounded-md transition-colors"
          >
            Clear Logs
          </button>
        </div>

        {/* Test Results Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-700/50 rounded-lg p-3 text-center">
            <div className={`text-2xl ${getStatusColor(results.apiKeyValid)}`}>
              {getStatusIcon(results.apiKeyValid)}
            </div>
            <div className="text-sm text-gray-300">API Key</div>
          </div>
          
          <div className="bg-gray-700/50 rounded-lg p-3 text-center">
            <div className={`text-2xl ${getStatusColor(results.websocketConnected)}`}>
              {getStatusIcon(results.websocketConnected)}
            </div>
            <div className="text-sm text-gray-300">WebSocket</div>
          </div>
          
          <div className="bg-gray-700/50 rounded-lg p-3 text-center">
            <div className={`text-2xl ${getStatusColor(results.audioStreamActive)}`}>
              {getStatusIcon(results.audioStreamActive)}
            </div>
            <div className="text-sm text-gray-300">Audio Stream</div>
          </div>
          
          <div className="bg-gray-700/50 rounded-lg p-3 text-center">
            <div className={`text-2xl ${getStatusColor(results.responseReceived)}`}>
              {getStatusIcon(results.responseReceived)}
            </div>
            <div className="text-sm text-gray-300">Response</div>
          </div>
        </div>

        {/* Debug Logs */}
        <div className="bg-gray-900/50 rounded-lg p-4 max-h-96 overflow-y-auto">
          <h4 className="text-md font-medium text-white mb-3">Debug Logs</h4>
          {logs.length === 0 ? (
            <div className="text-gray-400 text-center py-4">
              No logs yet. Run a test to see detailed debug information.
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log, index) => (
                <div key={index} className="text-sm font-mono">
                  <span className="text-gray-400">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`ml-2 ${getCategoryColor(log.category)}`}>
                    [{log.category.toUpperCase()}]
                  </span>
                  <span className={`ml-2 ${getLevelColor(log.level)}`}>
                    {log.message}
                  </span>
                  {log.data && (
                    <div className="text-gray-400 text-xs mt-1 ml-8">
                      {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}