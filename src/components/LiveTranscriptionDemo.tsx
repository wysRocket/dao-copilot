/**
 * Demo component showing the enhanced live transcription system
 *
 * This demonstrates:
 * 1. Immediate text display when recording starts
 * 2. Persistent text that never disappears
 * 3. Integration with existing systems
 * 4. Performance monitoring
 */

import React, {useState, useEffect} from 'react'
import {cn} from '../utils/tailwind'
import UnifiedLiveStreamingDisplay from './UnifiedLiveStreamingDisplay'
import useTranscriptionIntegration from '../hooks/useTranscriptionIntegration'

const LiveTranscriptionDemo: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [demoMode, setDemoMode] = useState<'manual' | 'simulated'>('manual')
  const [simulationRunning, setSimulationRunning] = useState(false)

  // Initialize the integration system
  const {
    currentText,
    isActivelyTranscribing,
    hasRecentActivity,
    stats,
    injectTranscription,
    startSession,
    endSession,
    clearAll
  } = useTranscriptionIntegration({
    bridgeStateManager: true,
    bridgeStreamingContext: true,
    sourceId: 'demo-transcription',
    autoStartSession: true,
    autoHandleCompletion: true
  })

  // Demo transcription data for simulation
  const demoTranscriptions = [
    {text: 'Hello', isPartial: true, delay: 500},
    {text: 'Hello world', isPartial: true, delay: 800},
    {text: 'Hello world, this is', isPartial: true, delay: 1200},
    {text: 'Hello world, this is a test', isPartial: true, delay: 1500},
    {text: 'Hello world, this is a test of the enhanced', isPartial: true, delay: 2000},
    {
      text: 'Hello world, this is a test of the enhanced live transcription system.',
      isPartial: false,
      delay: 2500
    },
    {
      text: 'Hello world, this is a test of the enhanced live transcription system. This text',
      isPartial: true,
      delay: 3000
    },
    {
      text: 'Hello world, this is a test of the enhanced live transcription system. This text should appear',
      isPartial: true,
      delay: 3500
    },
    {
      text: 'Hello world, this is a test of the enhanced live transcription system. This text should appear immediately',
      isPartial: true,
      delay: 4000
    },
    {
      text: 'Hello world, this is a test of the enhanced live transcription system. This text should appear immediately and never disappear during the session.',
      isPartial: false,
      delay: 4500
    }
  ]

  // Handle recording state changes
  const handleRecordingToggle = () => {
    if (isRecording) {
      console.log('🔴 Demo: Stopping recording')
      setIsRecording(false)
      endSession()
      setSimulationRunning(false)
    } else {
      console.log('🔴 Demo: Starting recording')
      setIsRecording(true)
      startSession()

      if (demoMode === 'simulated') {
        setSimulationRunning(true)
      }
    }
  }

  // Run simulation
  useEffect(() => {
    if (!simulationRunning) return

    console.log('🔴 Demo: Starting transcription simulation')

    let timeoutId: NodeJS.Timeout
    let currentIndex = 0

    const runNextStep = () => {
      if (currentIndex >= demoTranscriptions.length || !simulationRunning) {
        console.log('🔴 Demo: Simulation completed')
        return
      }

      const step = demoTranscriptions[currentIndex]

      console.log(`🔴 Demo: Simulating step ${currentIndex + 1}:`, {
        text: step.text.substring(0, 30) + '...',
        isPartial: step.isPartial
      })

      injectTranscription(step.text, step.isPartial, 'demo-simulation')

      currentIndex++
      timeoutId = setTimeout(runNextStep, step.delay)
    }

    // Start with a small delay
    timeoutId = setTimeout(runNextStep, 200)

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [simulationRunning, injectTranscription])

  // Manual transcription input
  const [manualText, setManualText] = useState('')
  const [isManualPartial, setIsManualPartial] = useState(true)

  const handleManualTranscription = () => {
    if (!manualText.trim()) return

    console.log('🔴 Demo: Manual transcription injection:', {
      text: manualText,
      isPartial: isManualPartial
    })

    injectTranscription(manualText, isManualPartial, 'manual-input')

    // Clear input if it was final
    if (!isManualPartial) {
      setManualText('')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-white">Enhanced Live Transcription Demo</h1>
        <p className="text-white/70">Demonstrating persistent, immediate transcription display</p>
      </div>

      {/* Demo Controls */}
      <div className="space-y-4 rounded-lg bg-white/10 p-4 backdrop-blur-sm">
        <h2 className="text-xl font-semibold text-white">Demo Controls</h2>

        {/* Recording Toggle */}
        <div className="flex items-center space-x-4">
          <button
            onClick={handleRecordingToggle}
            className={cn(
              'rounded-lg px-6 py-3 font-medium transition-all duration-200',
              'focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:outline-none',
              isRecording
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-green-500 text-white hover:bg-green-600'
            )}
          >
            {isRecording ? '⏹️ Stop Recording' : '🔴 Start Recording'}
          </button>

          <div className="flex items-center space-x-2">
            <span className="text-white/70">Demo Mode:</span>
            <select
              value={demoMode}
              onChange={e => setDemoMode(e.target.value as 'manual' | 'simulated')}
              disabled={isRecording}
              className="rounded border border-white/30 bg-white/20 px-3 py-1 text-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
            >
              <option value="manual">Manual</option>
              <option value="simulated">Simulated</option>
            </select>
          </div>
        </div>

        {/* Manual Input */}
        {demoMode === 'manual' && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={manualText}
                onChange={e => setManualText(e.target.value)}
                placeholder="Enter transcription text..."
                className="flex-1 rounded border border-white/30 bg-white/20 px-3 py-2 text-white placeholder-white/50 focus:ring-2 focus:ring-blue-400 focus:outline-none"
                onKeyPress={e => {
                  if (e.key === 'Enter') {
                    handleManualTranscription()
                  }
                }}
              />
              <label className="flex items-center space-x-2 text-white/70">
                <input
                  type="checkbox"
                  checked={isManualPartial}
                  onChange={e => setIsManualPartial(e.target.checked)}
                  className="rounded"
                />
                <span>Partial</span>
              </label>
              <button
                onClick={handleManualTranscription}
                disabled={!manualText.trim()}
                className="rounded bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-500"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Clear Button */}
        <div className="flex justify-end">
          <button
            onClick={clearAll}
            className="rounded bg-gray-500 px-4 py-2 text-white transition-colors hover:bg-gray-600"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Enhanced Live Streaming Area */}
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Live Transcription Display</h2>
        <UnifiedLiveStreamingDisplay
          variant="enhanced"
          isRecording={isRecording}
          isStreamingActive={isActivelyTranscribing}
          streamingSource="demo"
          onStreamingComplete={(text?: string) => {
            console.log('🔴 Demo: Streaming completed:', text?.substring(0, 50) + '...')
          }}
          onTextUpdate={(text: string, isPartial: boolean) => {
            console.log('🔴 Demo: Text update:', {
              length: text.length,
              isPartial,
              preview: text.substring(0, 30) + '...'
            })
          }}
          config={{
            immediateDisplay: true,
            persistentDisplay: true,
            showSourceBadge: true,
            showConfidenceScore: true,
            enableAnimations: true
          }}
        />
      </div>

      {/* Statistics */}
      <div className="space-y-4 rounded-lg bg-white/10 p-4 backdrop-blur-sm">
        <h2 className="text-xl font-semibold text-white">System Statistics</h2>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">{stats.segmentCount}</div>
            <div className="text-sm text-white/70">Segments</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">{stats.sessionDuration}s</div>
            <div className="text-sm text-white/70">Duration</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">
              {Math.round(stats.memoryUsage / 1024)}KB
            </div>
            <div className="text-sm text-white/70">Memory</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">
              {Math.round(stats.averageConfidence * 100)}%
            </div>
            <div className="text-sm text-white/70">Confidence</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <div className="text-center">
            <div
              className={cn(
                'mx-auto mb-1 h-3 w-3 rounded-full',
                isActivelyTranscribing ? 'bg-green-400' : 'bg-gray-400'
              )}
            />
            <div className="text-white/70">
              {isActivelyTranscribing ? 'Actively Transcribing' : 'Idle'}
            </div>
          </div>

          <div className="text-center">
            <div
              className={cn(
                'mx-auto mb-1 h-3 w-3 rounded-full',
                hasRecentActivity ? 'bg-blue-400' : 'bg-gray-400'
              )}
            />
            <div className="text-white/70">
              {hasRecentActivity ? 'Recent Activity' : 'No Recent Activity'}
            </div>
          </div>

          <div className="text-center">
            <div
              className={cn(
                'mx-auto mb-1 h-3 w-3 rounded-full',
                currentText.length > 0 ? 'bg-yellow-400' : 'bg-gray-400'
              )}
            />
            <div className="text-white/70">
              {currentText.length > 0 ? `${currentText.length} chars` : 'No Text'}
            </div>
          </div>
        </div>
      </div>

      {/* Raw Text Output */}
      {currentText && (
        <div className="space-y-2 rounded-lg bg-white/10 p-4 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white">Raw Text Output</h3>
          <div className="max-h-40 overflow-y-auto rounded bg-black/30 p-3 font-mono text-sm whitespace-pre-wrap text-white/90">
            {currentText || 'No transcription data'}
          </div>
        </div>
      )}
    </div>
  )
}

export default LiveTranscriptionDemo
