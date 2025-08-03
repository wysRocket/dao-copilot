import React, { useState, useEffect, useCallback, useRef } from 'react'

export type AudioSourceType = 'microphone' | 'system' | 'both' | 'none'

export interface AudioLevels {
  microphone: number // 0-100
  systemAudio: number // 0-100
  combined: number // 0-100
}

export interface AudioSourceState {
  selectedSource: AudioSourceType
  isCapturing: boolean
  levels: AudioLevels
  errors: {
    microphone?: string
    systemAudio?: string
  }
  permissions: {
    microphone: boolean
    screenRecording: boolean
  }
}

interface AudioSourceSelectorProps {
  currentSource: AudioSourceType
  onSourceChange: (source: AudioSourceType) => void
  className?: string
}

export const AudioSourceSelector: React.FC<AudioSourceSelectorProps> = ({
  currentSource,
  onSourceChange,
  className = ''
}) => {
  const [state, setState] = useState<AudioSourceState>({
    selectedSource: currentSource,
    isCapturing: false,
    levels: { microphone: 0, systemAudio: 0, combined: 0 },
    errors: {},
    permissions: { microphone: false, screenRecording: false }
  })

  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const systemAnalyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Check permissions on mount
  useEffect(() => {
    checkPermissions()
  }, [])

  const checkPermissions = async () => {
    try {
      // Check microphone permission
      const micPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      
      setState(prev => ({
        ...prev,
        permissions: {
          ...prev.permissions,
          microphone: micPermission.state === 'granted'
        }
      }))
    } catch (error) {
      console.warn('Could not check permissions:', error)
    }
  }

  const testMicrophoneAccess = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('🎤 Testing microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      console.log('✅ Microphone access granted:', {
        tracks: stream.getAudioTracks().length,
        trackState: stream.getAudioTracks()[0]?.readyState,
        trackEnabled: stream.getAudioTracks()[0]?.enabled
      })
      
      // Clean up test stream
      stream.getTracks().forEach(track => track.stop())
      
      setState(prev => ({
        ...prev,
        permissions: { ...prev.permissions, microphone: true },
        errors: { ...prev.errors, microphone: undefined }
      }))
      
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ Microphone access failed:', error)
      
      setState(prev => ({
        ...prev,
        permissions: { ...prev.permissions, microphone: false },
        errors: { ...prev.errors, microphone: errorMessage }
      }))
      
      return { success: false, error: errorMessage }
    }
  }

  const testSystemAudioAccess = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('🔊 Testing system audio access...')
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        audio: true, 
        video: { width: 320, height: 240, frameRate: 1 } // Minimal video to reduce resources
      })
      
      const audioTracks = stream.getAudioTracks()
      console.log('✅ System audio access granted:', {
        audioTracks: audioTracks.length,
        trackState: audioTracks[0]?.readyState,
        trackEnabled: audioTracks[0]?.enabled,
        hasAudioConstraints: audioTracks[0]?.getSettings()
      })
      
      // Clean up test stream
      stream.getTracks().forEach(track => track.stop())
      
      setState(prev => ({
        ...prev,
        permissions: { ...prev.permissions, screenRecording: true },
        errors: { ...prev.errors, systemAudio: undefined }
      }))
      
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ System audio access failed:', error)
      
      setState(prev => ({
        ...prev,
        permissions: { ...prev.permissions, screenRecording: false },
        errors: { ...prev.errors, systemAudio: errorMessage }
      }))
      
      return { success: false, error: errorMessage }
    }
  }

  const startAudioLevelMonitoring = useCallback(async (source: AudioSourceType) => {
    if (source === 'none') return

    try {
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      let micStream: MediaStream | null = null
      let systemStream: MediaStream | null = null

      // Get appropriate streams based on selected source
      if (source === 'microphone' || source === 'both') {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          const micSource = audioContext.createMediaStreamSource(micStream)
          const micAnalyser = audioContext.createAnalyser()
          micAnalyser.fftSize = 256
          micSource.connect(micAnalyser)
          micAnalyserRef.current = micAnalyser
        } catch (error) {
          console.error('Failed to get microphone stream:', error)
        }
      }

      if (source === 'system' || source === 'both') {
        try {
          systemStream = await navigator.mediaDevices.getDisplayMedia({ 
            audio: true, 
            video: { width: 320, height: 240, frameRate: 1 }
          })
          const systemSource = audioContext.createMediaStreamSource(systemStream)
          const systemAnalyser = audioContext.createAnalyser()
          systemAnalyser.fftSize = 256
          systemSource.connect(systemAnalyser)
          systemAnalyserRef.current = systemAnalyser
        } catch (error) {
          console.error('Failed to get system audio stream:', error)
        }
      }

      // Start monitoring levels
      const updateLevels = () => {
        const levels: AudioLevels = { microphone: 0, systemAudio: 0, combined: 0 }

        // Calculate microphone level
        if (micAnalyserRef.current) {
          const micDataArray = new Uint8Array(micAnalyserRef.current.frequencyBinCount)
          micAnalyserRef.current.getByteFrequencyData(micDataArray)
          const micAverage = micDataArray.reduce((sum, value) => sum + value, 0) / micDataArray.length
          levels.microphone = Math.round((micAverage / 255) * 100)
        }

        // Calculate system audio level
        if (systemAnalyserRef.current) {
          const systemDataArray = new Uint8Array(systemAnalyserRef.current.frequencyBinCount)
          systemAnalyserRef.current.getByteFrequencyData(systemDataArray)
          const systemAverage = systemDataArray.reduce((sum, value) => sum + value, 0) / systemDataArray.length
          levels.systemAudio = Math.round((systemAverage / 255) * 100)
        }

        // Calculate combined level
        levels.combined = Math.max(levels.microphone, levels.systemAudio)

        setState(prev => ({ ...prev, levels, isCapturing: true }))
        animationFrameRef.current = requestAnimationFrame(updateLevels)
      }

      updateLevels()
    } catch (error) {
      console.error('Failed to start audio level monitoring:', error)
    }
  }, [])

  const stopAudioLevelMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    micAnalyserRef.current = null
    systemAnalyserRef.current = null

    setState(prev => ({ 
      ...prev, 
      isCapturing: false, 
      levels: { microphone: 0, systemAudio: 0, combined: 0 } 
    }))
  }, [])

  const handleSourceChange = useCallback(async (newSource: AudioSourceType) => {
    // Stop current monitoring
    stopAudioLevelMonitoring()

    // Update selected source
    setState(prev => ({ ...prev, selectedSource: newSource }))

    // Test access for new source
    if (newSource === 'microphone' || newSource === 'both') {
      await testMicrophoneAccess()
    }
    if (newSource === 'system' || newSource === 'both') {
      await testSystemAudioAccess()
    }

    // Start monitoring for new source
    if (newSource !== 'none') {
      await startAudioLevelMonitoring(newSource)
    }

    // Notify parent component
    onSourceChange(newSource)
  }, [onSourceChange, startAudioLevelMonitoring, stopAudioLevelMonitoring])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioLevelMonitoring()
    }
  }, [stopAudioLevelMonitoring])

  const renderAudioLevelBar = (level: number, label: string, color: string = '#3b82f6') => (
    <div className="flex items-center space-x-2 text-sm">
      <span className="w-20 text-right" style={{ color: 'var(--text-secondary)' }}>
        {label}:
      </span>
      <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--background-tertiary)' }}>
        <div 
          className="h-full rounded-full transition-all duration-100"
          style={{ 
            width: `${level}%`, 
            backgroundColor: level > 5 ? color : 'var(--text-muted)' 
          }}
        />
      </div>
      <span className="w-8 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
        {level}%
      </span>
    </div>
  )

  return (
    <div className={`space-y-4 p-4 border rounded-lg ${className}`} style={{ 
      backgroundColor: 'var(--background-secondary)', 
      borderColor: 'var(--border-primary)' 
    }}>
      <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        Audio Source Selection
      </h3>

      {/* Audio Source Options */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { value: 'microphone', label: '🎤 Microphone Only', description: 'Capture voice input' },
          { value: 'system', label: '🔊 System Audio', description: 'Capture speaker output' },
          { value: 'both', label: '🎧 Both Sources', description: 'Mic + system audio' },
          { value: 'none', label: '🔇 Disabled', description: 'No audio capture' }
        ].map(option => (
          <button
            key={option.value}
            onClick={() => handleSourceChange(option.value as AudioSourceType)}
            className={`p-3 rounded-lg border-2 text-left transition-all ${
              state.selectedSource === option.value 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
            style={{
              backgroundColor: state.selectedSource === option.value 
                ? 'var(--background-accent)' 
                : 'var(--background-primary)',
              borderColor: state.selectedSource === option.value 
                ? 'var(--interactive-primary)' 
                : 'var(--border-secondary)'
            }}
          >
            <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {option.label}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {option.description}
            </div>
          </button>
        ))}
      </div>

      {/* Real-time Audio Levels */}
      {state.isCapturing && (
        <div className="space-y-2">
          <h4 className="font-medium" style={{ color: 'var(--text-primary)' }}>Real-time Audio Levels</h4>
          {(state.selectedSource === 'microphone' || state.selectedSource === 'both') && 
            renderAudioLevelBar(state.levels.microphone, 'Microphone', '#10b981')}
          {(state.selectedSource === 'system' || state.selectedSource === 'both') && 
            renderAudioLevelBar(state.levels.systemAudio, 'System Audio', '#f59e0b')}
          {state.selectedSource === 'both' && 
            renderAudioLevelBar(state.levels.combined, 'Combined', '#3b82f6')}
        </div>
      )}

      {/* Permissions Status */}
      <div className="space-y-2">
        <h4 className="font-medium" style={{ color: 'var(--text-primary)' }}>Permissions Status</h4>
        <div className="flex items-center space-x-4 text-sm">
          <span className={`flex items-center space-x-1 ${state.permissions.microphone ? 'text-green-600' : 'text-red-600'}`}>
            <span>{state.permissions.microphone ? '✅' : '❌'}</span>
            <span>Microphone</span>
          </span>
          <span className={`flex items-center space-x-1 ${state.permissions.screenRecording ? 'text-green-600' : 'text-red-600'}`}>
            <span>{state.permissions.screenRecording ? '✅' : '❌'}</span>
            <span>Screen Recording</span>
          </span>
        </div>
      </div>

      {/* Error Messages */}
      {(state.errors.microphone || state.errors.systemAudio) && (
        <div className="space-y-2">
          <h4 className="font-medium text-red-600">Errors</h4>
          {state.errors.microphone && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              <strong>Microphone:</strong> {state.errors.microphone}
            </div>
          )}
          {state.errors.systemAudio && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              <strong>System Audio:</strong> {state.errors.systemAudio}
            </div>
          )}
        </div>
      )}

      {/* macOS Guidance */}
      {(!state.permissions.screenRecording && state.selectedSource !== 'microphone') && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <h4 className="font-medium text-yellow-800">macOS System Audio Setup</h4>
          <ol className="text-sm text-yellow-700 mt-2 space-y-1 list-decimal list-inside">
            <li>Open System Preferences → Security & Privacy → Privacy</li>
            <li>Select &quot;Screen Recording&quot; from the left sidebar</li>
            <li>Check the box next to your browser (Chrome, Safari, etc.)</li>
            <li>Restart your browser</li>
            <li>When prompted to share screen, select a window/screen</li>
            <li><strong>Important:</strong> Check &quot;Share audio&quot; in the sharing dialog</li>
          </ol>
        </div>
      )}

      {/* Quick Test Buttons */}
      <div className="flex space-x-2">
        <button 
          onClick={testMicrophoneAccess}
          className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
        >
          Test Microphone
        </button>
        <button 
          onClick={testSystemAudioAccess}
          className="px-3 py-1 text-sm bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
        >
          Test System Audio
        </button>
      </div>
    </div>
  )
}

export default AudioSourceSelector
