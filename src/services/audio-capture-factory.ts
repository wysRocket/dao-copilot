/**
 * Universal Audio Capture Factory
 *
 * Provides the correct audio capture service based on the Electron process type.
 * Main process gets the coordinator, renderer process gets direct AudioContext access.
 */

import type {AudioCaptureConfig, AudioChunkData} from './audio-capture-main'

// Define specific event listener types for better type safety
export type AudioEventListener = (chunkData: AudioChunkData) => void
export type ErrorEventListener = (error: Error) => void
export type StateEventListener = (state: {isCapturing: boolean}) => void
export type GenericEventListener = AudioEventListener | ErrorEventListener | StateEventListener

export interface UniversalAudioCapture {
  startCapture: (config?: AudioCaptureConfig) => Promise<void>
  stopCapture: () => Promise<void>
  isCapturing: () => boolean
  updateConfig: (config: Partial<AudioCaptureConfig>) => void
  getConfig: () => AudioCaptureConfig
  on(event: 'audioChunk', listener: AudioEventListener): void
  on(event: 'error', listener: ErrorEventListener): void
  on(event: 'stateChange', listener: StateEventListener): void
  off(event: 'audioChunk', listener: AudioEventListener): void
  off(event: 'error', listener: ErrorEventListener): void
  off(event: 'stateChange', listener: StateEventListener): void
  destroy: () => void
}

/**
 * Determines the current Electron process type
 */
function getElectronProcessType(): 'main' | 'renderer' | 'unknown' {
  // Safe check for Node.js/Electron environment
  if (typeof process !== 'undefined' && process && typeof process.type === 'string') {
    if (process.type === 'browser') {
      return 'main'
    } else if (process.type === 'renderer') {
      return 'renderer'
    }
  }

  // Enhanced fallback detection for browser/renderer environment
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'renderer'
  }

  // Check if we're in a Node.js environment (main process)
  if (
    typeof require !== 'undefined' &&
    typeof global !== 'undefined' &&
    typeof window === 'undefined'
  ) {
    return 'main'
  }

  return 'unknown'
}

/**
 * Create appropriate audio capture service based on process type
 */
export async function createAudioCapture(
  config?: AudioCaptureConfig
): Promise<UniversalAudioCapture> {
  const processType = getElectronProcessType()

  switch (processType) {
    case 'main': {
      // Dynamically import main process audio capture
      const {getMainAudioCapture} = await import('./audio-capture-main')
      const mainCapture = getMainAudioCapture(config)

      // Create a wrapper to match the UniversalAudioCapture interface
      return {
        startCapture: (newConfig?: AudioCaptureConfig) => {
          if (newConfig) {
            mainCapture.updateConfig(newConfig)
          }
          return mainCapture.startCapture()
        },
        stopCapture: () => mainCapture.stopCapture(),
        isCapturing: () => mainCapture.isCapturing(),
        updateConfig: (newConfig: Partial<AudioCaptureConfig>) =>
          mainCapture.updateConfig(newConfig),
        getConfig: () => mainCapture.getConfig(),
        on: (event: string, listener: GenericEventListener) => mainCapture.on(event, listener),
        off: (event: string, listener: GenericEventListener) => mainCapture.off(event, listener),
        destroy: () => mainCapture.destroy()
      } as UniversalAudioCapture
    }

    case 'renderer': {
      // For renderer process, create a wrapper that uses the existing audio_capture.ts
      return createRendererWrapper(config)
    }

    default:
      throw new Error(`Cannot create audio capture service: unknown process type '${processType}'`)
  }
}

/**
 * Create a wrapper for renderer process that uses the original audio_capture.ts
 * but with the new interface
 */
async function createRendererWrapper(config?: AudioCaptureConfig): Promise<UniversalAudioCapture> {
  // Dynamically import the original Capturer class
  const {Capturer} = await import('./audio_capture')

  const capturer = new Capturer()
  let currentConfig: AudioCaptureConfig = {
    sampleRate: 44100,
    channels: 1,
    bufferSize: 4096,
    intervalSeconds: 10,
    ...config
  }

  let isRecording = false

  // Create event emitter-like interface with proper typing
  const listeners: {
    audioChunk: AudioEventListener[]
    error: ErrorEventListener[]
    stateChange: StateEventListener[]
  } = {
    audioChunk: [],
    error: [],
    stateChange: []
  }

  const wrapper: UniversalAudioCapture = {
    async startCapture(newConfig?: AudioCaptureConfig): Promise<void> {
      if (newConfig) {
        currentConfig = {...currentConfig, ...newConfig}
      }

      try {
        await capturer.startRecording((buffer: number[]) => {
          const chunkData: AudioChunkData = {
            buffer,
            timestamp: Date.now(),
            sampleRate: currentConfig.sampleRate || 44100,
            channels: currentConfig.channels || 1
          }

          listeners.audioChunk.forEach(fn => fn(chunkData))
        })

        isRecording = true
        listeners.stateChange.forEach(fn => fn({isCapturing: true}))

        console.log('Audio capture started in renderer process wrapper')
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error))
        listeners.error.forEach(fn => fn(errorObj))
        console.error('Failed to start audio capture:', error)
        throw error
      }
    },

    async stopCapture(): Promise<void> {
      try {
        await capturer.stopRecording()
        isRecording = false
        listeners.stateChange.forEach(fn => fn({isCapturing: false}))
        console.log('Audio capture stopped in renderer process wrapper')
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error))
        listeners.error.forEach(fn => fn(errorObj))
        console.error('Failed to stop audio capture:', error)
        throw error
      }
    },

    isCapturing(): boolean {
      return isRecording
    },

    updateConfig(newConfig: Partial<AudioCaptureConfig>): void {
      currentConfig = {...currentConfig, ...newConfig}
    },

    getConfig(): AudioCaptureConfig {
      return {...currentConfig}
    },

    on(event: string, listener: GenericEventListener): void {
      if (event === 'audioChunk' && listeners.audioChunk) {
        listeners.audioChunk.push(listener as AudioEventListener)
      } else if (event === 'error' && listeners.error) {
        listeners.error.push(listener as ErrorEventListener)
      } else if (event === 'stateChange' && listeners.stateChange) {
        listeners.stateChange.push(listener as StateEventListener)
      }
    },

    off(event: string, listener: GenericEventListener): void {
      if (event === 'audioChunk' && listeners.audioChunk) {
        const index = listeners.audioChunk.indexOf(listener as AudioEventListener)
        if (index > -1) {
          listeners.audioChunk.splice(index, 1)
        }
      } else if (event === 'error' && listeners.error) {
        const index = listeners.error.indexOf(listener as ErrorEventListener)
        if (index > -1) {
          listeners.error.splice(index, 1)
        }
      } else if (event === 'stateChange' && listeners.stateChange) {
        const index = listeners.stateChange.indexOf(listener as StateEventListener)
        if (index > -1) {
          listeners.stateChange.splice(index, 1)
        }
      }
    },

    destroy(): void {
      if (isRecording) {
        this.stopCapture()
      }

      listeners.audioChunk = []
      listeners.error = []
      listeners.stateChange = []
    }
  }

  return wrapper
}

/**
 * Singleton instance cache
 */
let audioCaptureInstance: UniversalAudioCapture | null = null

/**
 * Get singleton audio capture instance
 */
export async function getAudioCapture(config?: AudioCaptureConfig): Promise<UniversalAudioCapture> {
  if (!audioCaptureInstance) {
    audioCaptureInstance = await createAudioCapture(config)
  }
  return audioCaptureInstance
}

/**
 * Type exports for convenience
 */
export type {AudioCaptureConfig, AudioChunkData}

export default createAudioCapture
