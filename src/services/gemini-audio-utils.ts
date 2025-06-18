/**
 * Audio utilities for Gemini Live API
 * Handles audio format conversion and validation for WebSocket streaming
 */

/**
 * Convert audio buffer to base64 format required by Gemini Live API
 * The API requires 16-bit PCM, 16kHz, mono format
 */
export function convertAudioToBase64(audioBuffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(audioBuffer)
  return btoa(String.fromCharCode(...uint8Array))
}

/**
 * Convert Float32Array audio data to 16-bit PCM format
 * Gemini Live API requires 16-bit PCM audio data
 */
export function convertFloat32ToPCM16(float32Array: Float32Array): ArrayBuffer {
  const pcm16 = new Int16Array(float32Array.length)
  
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp values to [-1, 1] range and convert to 16-bit integer
    const sample = Math.max(-1, Math.min(1, float32Array[i]))
    pcm16[i] = sample * 0x7FFF
  }
  
  return pcm16.buffer
}

/**
 * Resample audio data to target sample rate
 * Gemini Live API expects 16kHz sample rate
 */
export function resampleAudio(
  audioData: Float32Array,
  originalSampleRate: number,
  targetSampleRate: number
): Float32Array {
  if (originalSampleRate === targetSampleRate) {
    return audioData
  }

  const resampleRatio = originalSampleRate / targetSampleRate
  const outputLength = Math.floor(audioData.length / resampleRatio)
  const resampledData = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * resampleRatio
    const sourceIndexFloor = Math.floor(sourceIndex)
    const sourceIndexCeil = Math.min(sourceIndexFloor + 1, audioData.length - 1)
    const fraction = sourceIndex - sourceIndexFloor

    // Linear interpolation between samples
    resampledData[i] = audioData[sourceIndexFloor] * (1 - fraction) + 
                      audioData[sourceIndexCeil] * fraction
  }

  return resampledData
}

/**
 * Convert stereo audio to mono by averaging channels
 */
export function convertStereoToMono(stereoData: Float32Array): Float32Array {
  const monoLength = stereoData.length / 2
  const monoData = new Float32Array(monoLength)

  for (let i = 0; i < monoLength; i++) {
    monoData[i] = (stereoData[i * 2] + stereoData[i * 2 + 1]) / 2
  }

  return monoData
}

/**
 * Prepare audio data for Gemini Live API
 * Converts to required format: 16-bit PCM, 16kHz, mono
 */
export function prepareAudioForGemini(
  audioData: Float32Array,
  originalSampleRate: number,
  channels: number = 1
): string {
  let processedAudio = audioData

  // Convert stereo to mono if needed
  if (channels === 2) {
    processedAudio = convertStereoToMono(processedAudio)
  }

  // Resample to 16kHz if needed
  if (originalSampleRate !== 16000) {
    processedAudio = resampleAudio(processedAudio, originalSampleRate, 16000)
  }

  // Convert to 16-bit PCM
  const pcm16Buffer = convertFloat32ToPCM16(processedAudio)

  // Convert to base64
  return convertAudioToBase64(pcm16Buffer)
}

/**
 * Validate audio format for Gemini Live API compatibility
 */
export function validateAudioFormat(
  sampleRate: number,
  channels: number,
  bitDepth: number
): { isValid: boolean; issues: string[] } {
  const issues: string[] = []

  if (sampleRate !== 16000) {
    issues.push(`Sample rate should be 16000 Hz (got ${sampleRate} Hz)`)
  }

  if (channels !== 1) {
    issues.push(`Audio should be mono (got ${channels} channels)`)
  }

  if (bitDepth !== 16) {
    issues.push(`Bit depth should be 16-bit (got ${bitDepth}-bit)`)
  }

  return {
    isValid: issues.length === 0,
    issues
  }
}

/**
 * Create MIME type string for Gemini Live API
 */
export function createAudioMimeType(sampleRate: number = 16000): string {
  return `audio/pcm;rate=${sampleRate}`
}

export default {
  convertAudioToBase64,
  convertFloat32ToPCM16,
  resampleAudio,
  convertStereoToMono,
  prepareAudioForGemini,
  validateAudioFormat,
  createAudioMimeType
}
