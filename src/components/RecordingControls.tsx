import React, {useEffect, useState, useCallback, useMemo, memo} from 'react'

// Services and types
import {EnhancedAudioRecordingService, RecordingMode} from '../services/enhanced-audio-recording'
import {TranscriptionResult} from '../services/audio-recording'

// Hooks and connection types
import {GeminiConnectionState, GeminiConnectionControls} from '../hooks/useGeminiConnection'

// Audio setup components
import AudioSourceSelector, {AudioSourceType} from './AudioSourceSelector'

interface RecordingControlsProps {
  onTranscription: (transcript: TranscriptionResult) => void
  geminiConnection?: {
    state: GeminiConnectionState
    controls: GeminiConnectionControls
  }
}

interface RecordingState {
  isRecording: boolean
  isTranscribing: boolean
  recordingTime: number
  status: string
  showAudioSetup: boolean
}

const RecordingControls: React.FC<RecordingControlsProps> = memo(
  ({onTranscription, geminiConnection}) => {
    const [recordingState, setRecordingState] = useState<RecordingState>({
      isRecording: false,
      isTranscribing: false,
      recordingTime: 0,
      status: 'Ready to record',
      showAudioSetup: false
    })

    // Create enhanced audio service with interval-based recording (only once)
    const audioService = useMemo(() => {
      const service = new EnhancedAudioRecordingService()
      console.log('🎧 [DEBUG] Configuring EnhancedAudioRecordingService for interval recording...')
      service.updateConfig({
        mode: RecordingMode.INTERVAL, // Use interval mode for reliable recording
        intervalSeconds: 3, // Short interval for faster response
        enableRealTimeStreaming: false, // Disable real-time streaming for now
        adaptiveBuffering: true
      })
      console.log('✅ [DEBUG] EnhancedAudioRecordingService configured')
      return service
    }, []) // Empty dependency array is correct here - we only want to create this once

    // Log WebSocket connection status
    useEffect(() => {
      if (geminiConnection) {
        // Connection state monitoring without debug output
      }
    }, [geminiConnection?.state.connectionState, geminiConnection?.state.isStreaming])

    const handleTranscription = useCallback(
      (result: TranscriptionResult) => {
        console.log(
          '🎯 [DEBUG] RAW EnhancedAudioRecording result:',
          JSON.stringify(result, null, 2)
        )
        console.log('🎯 [DEBUG] Result analysis:', {
          text: result.text,
          textLength: result.text?.length,
          confidence: result.confidence,
          source: result.source,
          timestamp: result.timestamp,
          duration: result.duration,
          allKeys: Object.keys(result),
          hasOnTranscription: !!onTranscription,
          hasBroadcast: !!window.electronWindow?.broadcast
        })

        onTranscription(result)

        // NOTE: enhanced-audio-recording.ts already broadcasts streaming-transcription events
        // with correct isFinal/isPartial flags, so we don't need to broadcast again here
        // to avoid double broadcasts that override the correct flags
      },
      [onTranscription]
    )

    // Memoized WebSocket availability check
    const shouldUseWebSocket = useMemo(() => {
      return (
        geminiConnection &&
        geminiConnection.state.connectionState !== 'error' &&
        geminiConnection.state.errors < 3
      )
    }, [geminiConnection?.state.connectionState, geminiConnection?.state.errors])

    // Initialize the audio service
    useEffect(() => {
      const initializeService = async () => {
        try {
          console.log('🔧 [DEBUG] Initializing EnhancedAudioRecordingService...')
          // Initialize without integration service for now (will be set up during recording start)
          await audioService.initialize(null)
          console.log('✅ [DEBUG] EnhancedAudioRecordingService initialized successfully')
        } catch (error) {
          console.error('❌ [DEBUG] Failed to initialize audio service:', error)
        }
      }

      initializeService()
    }, [audioService])

    // Subscribe to recording state changes
    useEffect(() => {
      const subscription = audioService.getStateObservable().subscribe(newState => {
        setRecordingState(prev => ({
          ...prev,
          isRecording: newState.isRecording,
          isTranscribing: newState.isTranscribing,
          recordingTime: newState.recordingTime || 0,
          status: newState.status
        }))
      })

      // Initialize with current state
      const currentState = audioService.getState()
      setRecordingState(prev => ({
        ...prev,
        isRecording: currentState.isRecording,
        isTranscribing: currentState.isTranscribing,
        recordingTime: currentState.recordingTime || 0,
        status: currentState.status
      }))

      // Cleanup on unmount
      return () => {
        subscription.unsubscribe()
        // Note: Don't destroy service as it might be shared
      }
    }, [audioService])

    // Enhanced recording handler with quota-aware WebSocket integration
    const handleToggleRecording = async () => {
      console.log('🎤 [DEBUG] Toggle recording clicked, current state:', recordingState.isRecording)

      if (!recordingState.isRecording) {
        console.log('🚀 [DEBUG] Starting recording...')

        // Test microphone access first
        console.log('🎤 [DEBUG] Testing microphone access...')
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          console.log('✅ [DEBUG] Microphone access granted', {
            tracks: stream.getAudioTracks().length,
            trackState: stream.getAudioTracks()[0]?.readyState,
            trackEnabled: stream.getAudioTracks()[0]?.enabled
          })
          stream.getTracks().forEach(track => track.stop()) // Stop test stream
        } catch (error) {
          console.error('❌ [DEBUG] Microphone access denied or failed:', error)
          alert('Microphone access is required for transcription. Please allow microphone access and try again.')
          return
        }

        // Open Assistant window before starting recording
        console.log('🪟 [DEBUG] Opening Assistant window...')
        try {
          if (window.electronWindow) {
            // First, check if there's already an assistant window
            const windows = await window.electronWindow.getAllWindows()
            const assistantWindow = windows.find(w => w.type === 'assistant' || w.route?.includes('transcripts'))
            
            if (assistantWindow) {
              // Focus existing assistant window
              console.log('🪟 [DEBUG] Focusing existing assistant window:', assistantWindow.id)
              window.electronWindow.focusWindow(assistantWindow.id)
            } else {
              // Create new assistant window
              console.log('🪟 [DEBUG] Creating new assistant window...')
              await window.electronWindow.createWindow('assistant', { 
                route: '/assistant/transcripts',
                focus: true 
              })
            }
            console.log('✅ [DEBUG] Assistant window ready for transcription')
          } else {
            console.warn('⚠️ [DEBUG] electronWindow not available')
          }
        } catch (error) {
          console.warn('⚠️ [DEBUG] Failed to open Assistant window:', error)
          // Continue with recording even if window opening fails
        }

        // Starting recording

        // Only attempt WebSocket if we haven't exceeded quota recently
        if (shouldUseWebSocket && geminiConnection) {
          try {
            console.log('🔌 [DEBUG] Attempting WebSocket connection...')
            await geminiConnection.controls.connect()
            console.log('✅ [DEBUG] WebSocket connected successfully')
          } catch (error) {
            console.warn(
              '🔌 Failed to connect WebSocket (likely quota), falling back to batch mode:',
              error
            )
          }
        } else {
          console.log('🔌 [DEBUG] Skipping WebSocket (not available or quota exceeded)')
        }

        console.log('🎧 [DEBUG] Starting audio recording with callback...')
        // Start audio recording with real-time transcription
        await audioService.startRecording(handleTranscription)
        console.log('✅ [DEBUG] Audio recording started successfully')

        // Log the current state of the audio service
        const currentState = audioService.getState()
        console.log('🔍 [DEBUG] Audio service state after start:', {
          isRecording: currentState.isRecording,
          mode: currentState.mode,
          status: currentState.status,
          recordingTime: currentState.recordingTime,
          isTranscribing: currentState.isTranscribing
        })

        // Test if broadcast is working by sending a test message
        if (window.electronWindow?.broadcast) {
          console.log('📡 [DEBUG] Testing broadcast system...')
          window.electronWindow.broadcast('streaming-transcription', {
            text: 'Recording started - waiting for audio transcription...',
            isFinal: false,
            source: 'recording-start-notification',
            confidence: 1.0,
            timestamp: Date.now()
          })
          console.log('✅ [DEBUG] Test broadcast sent')
        } else {
          console.error('❌ [DEBUG] Broadcast system not available!')
        }

        // Real-time feedback will come from actual audio transcription
        console.log('🚀 [DEBUG] Audio recording started - waiting for real transcription data...')

        console.log('📤 [DEBUG] Broadcasting recording-state-changed: true')
        // Broadcast recording started
        window.electronWindow?.broadcast?.('recording-state-changed', true)
      } else {
        console.log('🛑 [DEBUG] Stopping recording...')

        // Stopping recording
        await audioService.stopRecording()
        console.log('✅ [DEBUG] Audio recording stopped successfully')

        console.log('📤 [DEBUG] Broadcasting recording-state-changed: false')
        // Broadcast recording stopped
        window.electronWindow?.broadcast?.('recording-state-changed', false)
        console.log('✅ [DEBUG] Recording stopped')
      }
    }

    // Audio setup handler
    const handleAudioSetup = useCallback(() => {
      setRecordingState(prev => ({ ...prev, showAudioSetup: !prev.showAudioSetup }))
    }, [])

    // Audio source change handler (always use 'both' as designed)
    const handleAudioSourceChange = useCallback((source: AudioSourceType) => {
      // For DAO copilot, we always want both sources, but we use this to verify setup
      console.log('🎧 Audio source verification:', source)
    }, [])

    return (
      <>
        {/* Audio Setup Panel - Collapsible */}
        {recordingState.showAudioSetup && (
          <div className="mb-4 p-4 border rounded-lg" style={{ 
            backgroundColor: 'var(--background-secondary)', 
            borderColor: 'var(--border-primary)' 
          }}>
            <div className="mb-3">
              <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                🎧 Audio Setup Verification
              </h4>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Verify both microphone and system audio are working for complete DAO transcription
              </p>
            </div>
            <AudioSourceSelector 
              currentSource="both" 
              onSourceChange={handleAudioSourceChange}
              className="border-0 p-0 bg-transparent"
            />
          </div>
        )}

        {/* Setup Button */}
        <button
          onClick={handleAudioSetup}
          className="setup-btn app-region-no-drag mr-2 border-none bg-none p-0 transition-opacity hover:opacity-80"
          style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
          title={recordingState.showAudioSetup ? 'Hide Audio Setup' : 'Show Audio Setup'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="8"
              cy="8"
              r="8"
              fill="#6366f1"
            />
            <path
              d="M8 4v8M4 8h8"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              className={recordingState.showAudioSetup ? 'rotate-45' : ''}
              style={{ transformOrigin: '8px 8px', transition: 'transform 0.2s' }}
            />
          </svg>
        </button>

        {/* Recording Button */}
        <button
          onClick={handleToggleRecording}
          className="record-btn app-region-no-drag mr-2 border-none bg-none p-0 transition-opacity hover:opacity-80"
          style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
          title={recordingState.isRecording ? 'Stop Recording' : 'Start Recording & Open Assistant'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="8"
              cy="8"
              r="8"
              fill={recordingState.isRecording ? '#ef4444' : '#2563eb'}
              className={recordingState.isRecording ? 'animate-pulse' : ''}
            />
            {recordingState.isRecording ? (
              <rect x="6" y="6" width="4" height="4" fill="white" />
            ) : (
              <rect x="6" y="4" width="4" height="8" rx="2" fill="white" />
            )}
          </svg>
        </button>
        <span
          className={`mr-4 text-base transition-colors duration-200 ${
            recordingState.isRecording ? 'font-semibold' : ''
          }`}
          style={{
            color: recordingState.isRecording ? 'var(--interactive-danger)' : 'var(--text-primary)'
          }}
        >
          {recordingState.isRecording || recordingState.recordingTime > 0
            ? `${Math.floor(recordingState.recordingTime / 60)
                .toString()
                .padStart(
                  2,
                  '0'
                )}:${(recordingState.recordingTime % 60).toString().padStart(2, '0')}`
            : '00:00'}
          {recordingState.isTranscribing && (
            <span
              className="ml-2 animate-pulse text-xs"
              style={{color: 'var(--interactive-primary)'}}
            >
              Processing...
            </span>
          )}
        </span>
      </>
    )
  },
  // Custom comparison function to prevent unnecessary re-renders
  (prevProps, nextProps) => {
    // Compare onTranscription function references
    if (prevProps.onTranscription !== nextProps.onTranscription) {
      return false
    }

    // Compare geminiConnection state deeply
    if (
      prevProps.geminiConnection?.state.connectionState !==
        nextProps.geminiConnection?.state.connectionState ||
      prevProps.geminiConnection?.state.isStreaming !==
        nextProps.geminiConnection?.state.isStreaming ||
      prevProps.geminiConnection?.state.errors !== nextProps.geminiConnection?.state.errors
    ) {
      return false
    }

    // Props are equal, skip re-render
    return true
  }
)

RecordingControls.displayName = 'RecordingControls'

export default RecordingControls
