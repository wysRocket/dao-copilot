/**
 * Transcription Quality Optimizer
 * 
 * This service optimizes transcription quality by ensuring proper model configuration,
 * audio processing settings, and system instructions for the best possible results.
 */

import { logger } from './gemini-logger'
import { GeminiLiveConfig, ResponseModality } from './gemini-live-websocket'

export interface TranscriptionQualityConfig {
  // Model configuration for optimal transcription
  model: {
    name: string
    version: string
    optimizedForSpeech: boolean
  }
  
  // Audio processing configuration
  audio: {
    sampleRate: number
    channels: number
    bitDepth: number
    noiseReduction: boolean
    enableVAD: boolean // Voice Activity Detection
  }
  
  // Language and context settings
  language: {
    primary: string
    fallback?: string[]
    autoDetect: boolean
  }
  
  // System instruction optimization
  instruction: {
    mode: 'transcription' | 'conversation' | 'hybrid'
    punctuation: boolean
    capitalization: boolean
    numbersAsWords: boolean
  }
}

export const OPTIMAL_TRANSCRIPTION_CONFIG: TranscriptionQualityConfig = {
  model: {
    name: 'gemini-2.0-flash-live-001', // Latest and most accurate model
    version: 'v1beta',
    optimizedForSpeech: true
  },
  audio: {
    sampleRate: 16000, // Standard for speech recognition
    channels: 1, // Mono for better processing
    bitDepth: 16, // Standard bit depth
    noiseReduction: true,
    enableVAD: true
  },
  language: {
    primary: 'en-US',
    fallback: ['en-GB', 'en'],
    autoDetect: true
  },
  instruction: {
    mode: 'transcription',
    punctuation: true,
    capitalization: true,
    numbersAsWords: false
  }
}

/**
 * Generate optimized system instruction for transcription
 */
export function generateOptimizedSystemInstruction(config: TranscriptionQualityConfig): string {
  const { instruction, language } = config
  
  let systemInstruction = ''
  
  switch (instruction.mode) {
    case 'transcription':
      systemInstruction = `You are a professional speech-to-text transcription service. Your primary goal is to provide the most accurate, word-for-word transcription of audio input.

TRANSCRIPTION RULES:
- Transcribe exactly what is spoken, including filler words (um, uh, etc.)
- Maintain speaker's natural speech patterns and rhythm
- ${instruction.punctuation ? 'Include appropriate punctuation based on speech patterns and pauses' : 'Do not add punctuation'}
- ${instruction.capitalization ? 'Use proper capitalization for names, places, and sentence beginnings' : 'Use lowercase except for proper nouns'}
- ${instruction.numbersAsWords ? 'Write numbers as words (e.g., "twenty-one" not "21")' : 'Use numerical digits for numbers'}
- For unclear audio, use [inaudible] or [unclear]
- For background noise, use [noise] or [background sounds]

LANGUAGE: Primary language is ${language.primary}${language.autoDetect ? ', but auto-detect and adapt to the actual spoken language' : ''}

OUTPUT FORMAT: Provide only the transcribed text without any additional commentary, explanations, or formatting unless specifically requested.`
      break
      
    case 'conversation':
      systemInstruction = `You are an AI assistant that provides real-time conversation transcription and can respond to questions or comments in the audio.

TRANSCRIPTION RULES:
- Provide accurate transcription of spoken content
- ${instruction.punctuation ? 'Include natural punctuation' : 'Use minimal punctuation'}
- ${instruction.capitalization ? 'Use proper capitalization' : 'Use sentence case'}
- If the speaker asks a question or makes a request, you may provide a helpful response after the transcription

LANGUAGE: ${language.primary}${language.autoDetect ? ' (auto-detect other languages)' : ''}

OUTPUT FORMAT: Transcribe the audio, then if appropriate, provide a brief response.`
      break
      
    case 'hybrid':
      systemInstruction = `You are an intelligent transcription and assistance service that adapts to the context of the audio.

TRANSCRIPTION RULES:
- Always provide accurate transcription first
- ${instruction.punctuation ? 'Use appropriate punctuation' : 'Use minimal punctuation'}
- ${instruction.capitalization ? 'Apply proper capitalization' : 'Use standard capitalization'}
- If the content contains questions or requires assistance, provide helpful responses
- For pure transcription needs, focus only on accuracy

LANGUAGE: ${language.primary}${language.autoDetect ? ' with automatic language detection' : ''}

OUTPUT FORMAT: Transcribed text first, followed by any relevant assistance or clarification if needed.`
      break
  }
  
  return systemInstruction
}

/**
 * Generate optimized Gemini Live configuration for transcription
 */
export function generateOptimizedGeminiConfig(
  apiKey: string,
  qualityConfig: TranscriptionQualityConfig = OPTIMAL_TRANSCRIPTION_CONFIG
): GeminiLiveConfig {
  return {
    apiKey,
    model: qualityConfig.model.name,
    apiVersion: qualityConfig.model.version,
    responseModalities: [ResponseModality.TEXT], // Text only for better transcription focus
    systemInstruction: generateOptimizedSystemInstruction(qualityConfig),
    
    // Connection optimization
    reconnectAttempts: 5,
    heartbeatInterval: 30000,
    connectionTimeout: 15000,
    
    // Generation config optimized for transcription
    generationConfig: {
      temperature: 0.1, // Very low temperature for consistency
      maxOutputTokens: 2048, // Sufficient for transcription
      topP: 0.95,
      topK: 40
    },
    
    // Safety settings for transcription (allow all content)
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE'
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE'
      }
    ]
  }
}

/**
 * Validate and optimize audio configuration
 */
export function optimizeAudioConfig(audioConfig: Record<string, unknown>): Record<string, unknown> {
  const optimal = OPTIMAL_TRANSCRIPTION_CONFIG.audio
  
  return {
    ...audioConfig,
    sampleRate: optimal.sampleRate,
    channels: optimal.channels,
    bitDepth: optimal.bitDepth,
    // Add audio processing optimizations
    echoCancellation: true,
    noiseSuppression: optimal.noiseReduction,
    autoGainControl: true,
    voiceActivityDetection: optimal.enableVAD
  }
}

/**
 * Transcription Quality Optimizer Service
 */
export class TranscriptionQualityOptimizer {
  private config: TranscriptionQualityConfig
  
  constructor(config: Partial<TranscriptionQualityConfig> = {}) {
    this.config = {
      ...OPTIMAL_TRANSCRIPTION_CONFIG,
      ...config
    }
  }
  
  /**
   * Get optimized Gemini Live configuration
   */
  getOptimizedConfig(apiKey: string): GeminiLiveConfig {
    logger.info('Generating optimized transcription configuration', {
      model: this.config.model.name,
      version: this.config.model.version,
      language: this.config.language.primary,
      mode: this.config.instruction.mode
    })
    
    return generateOptimizedGeminiConfig(apiKey, this.config)
  }
  
  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TranscriptionQualityConfig>): void {
    this.config = {
      ...this.config,
      ...updates
    }
    
    logger.info('Transcription quality configuration updated', updates)
  }
  
  /**
   * Get current configuration
   */
  getCurrentConfig(): TranscriptionQualityConfig {
    return { ...this.config }
  }
  
  /**
   * Analyze and suggest improvements for poor quality transcription
   */
  analyzeQualityIssues(transcriptionText: string): {
    issues: string[]
    suggestions: string[]
    confidence: number
  } {
    const issues: string[] = []
    const suggestions: string[] = []
    
    // Check for common quality issues
    const hasGarbledText = /[^\w\s\p{P}]/gu.test(transcriptionText)
    const hasRepeatedChars = /(.)\1{3,}/g.test(transcriptionText)
    const hasRandomChars = /[^\w\s\p{P}\p{L}]/gu.test(transcriptionText)
    const isVeryShort = transcriptionText.length < 10
    const isIncoherent = transcriptionText.split(' ').length < 3
    
    if (hasGarbledText || hasRandomChars) {
      issues.push('Garbled or corrupted text detected')
      suggestions.push('Check audio quality and encoding')
      suggestions.push('Verify microphone settings and reduce background noise')
    }
    
    if (hasRepeatedChars) {
      issues.push('Repeated character patterns detected')
      suggestions.push('Check for audio feedback or connection issues')
    }
    
    if (isVeryShort || isIncoherent) {
      issues.push('Very short or incoherent transcription')
      suggestions.push('Ensure sufficient audio duration')
      suggestions.push('Check audio volume and clarity')
    }
    
    // Calculate confidence score (0-1)
    let confidence = 1.0
    if (hasGarbledText) confidence -= 0.4
    if (hasRepeatedChars) confidence -= 0.3
    if (isVeryShort) confidence -= 0.2
    if (isIncoherent) confidence -= 0.3
    
    confidence = Math.max(0, confidence)
    
    return {
      issues,
      suggestions,
      confidence
    }
  }
}

export default TranscriptionQualityOptimizer