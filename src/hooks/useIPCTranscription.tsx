import {useEffect, useState, useCallback} from 'react'

interface TranscriptionResult {
  text: string
  confidence?: number
  duration?: number
  source?: string
}

interface IPCTranscriptionState {
  currentText: string
  isActive: boolean
  latestResult: TranscriptionResult | null
  error: string | null
}

// Type for window.electron
interface ElectronAPI {
  ipcRenderer: {
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => () => void
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  }
}

interface WindowWithElectron {
  electron?: ElectronAPI
  transcriptionAPI?: {
    transcribeAudio: (audioData: Uint8Array) => Promise<TranscriptionResult>
  }
}

/**
 * Hook that directly calls the working IPC transcription API
 * Uses the same channel that's successfully capturing text in your logs
 */
export function useIPCTranscription() {
  const [state, setState] = useState<IPCTranscriptionState>({
    currentText: '',
    isActive: false,
    latestResult: null,
    error: null
  })

  // Function to actually trigger transcription using the working API
  const triggerTranscription = useCallback(async (audioData: Uint8Array) => {
    const windowWithElectron = window as WindowWithElectron

    if (!windowWithElectron.transcriptionAPI) {
      console.error('❌ useIPCTranscription: transcriptionAPI not available')
      setState(prev => ({...prev, error: 'transcriptionAPI not available'}))
      return
    }

    try {
      setState(prev => ({...prev, isActive: true, error: null}))
      console.log('🔌 useIPCTranscription: Calling working transcriptionAPI...')

      const result = await windowWithElectron.transcriptionAPI.transcribeAudio(audioData)

      console.log('🎯 useIPCTranscription: Received transcription result:', {
        textLength: result.text?.length,
        textPreview: result.text?.substring(0, 50) + '...',
        source: result.source,
        confidence: result.confidence,
        duration: result.duration
      })

      setState(prev => ({
        ...prev,
        currentText: result.text || '',
        latestResult: result,
        isActive: false,
        error: null
      }))

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ useIPCTranscription: Transcription failed:', errorMessage)
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isActive: false
      }))
    }
  }, [])

  // Function to test with mock audio data
  const testTranscription = useCallback(async () => {
    console.log('🧪 useIPCTranscription: Testing with mock audio data...')
    // Create a small mock audio buffer for testing
    const mockAudioData = new Uint8Array(1024).fill(0)
    return triggerTranscription(mockAudioData)
  }, [triggerTranscription])

  useEffect(() => {
    const windowWithElectron = window as WindowWithElectron

    if (windowWithElectron.transcriptionAPI) {
      console.log('✅ useIPCTranscription: transcriptionAPI is available')
      setState(prev => ({...prev, error: null}))
    } else {
      console.warn('⚠️ useIPCTranscription: transcriptionAPI not found')
      setState(prev => ({...prev, error: 'transcriptionAPI not available'}))
    }
  }, [])

  return {
    currentText: state.currentText,
    isActive: state.isActive,
    latestResult: state.latestResult,
    error: state.error,
    hasText: state.currentText.length > 0,
    triggerTranscription,
    testTranscription
  }
}
