/**
 * Language Detection and Quality System Types
 *
 * Comprehensive type definitions for advanced language detection, quality assessment,
 * and transcription provider management for mixed-language environments.
 */

import {EventEmitter} from 'events'

/**
 * Supported languages with comprehensive metadata
 */
export interface LanguageDefinition {
  code: string
  name: string
  nativeName: string
  region?: string
  direction: 'ltr' | 'rtl'
  family: string
  script: string
  confidence: number // 0-1, how well this language is supported
  models: {
    whisper?: string[]
    google?: string[]
    azure?: string[]
    aws?: string[]
  }
  phonemes: string[]
  commonWords: string[]
  stopWords: string[]
}

/**
 * Language detection sources and confidence levels
 */
export type LanguageDetectionSource =
  | 'browser_api'
  | 'audio_analysis'
  | 'text_analysis'
  | 'user_preference'
  | 'geo_location'
  | 'previous_session'
  | 'context_analysis'
  | 'mixed_detection'

export interface LanguageDetectionResult {
  language: string
  confidence: number // 0-1
  source: LanguageDetectionSource
  timestamp: number
  features: {
    audioFeatures?: AudioLanguageFeatures
    textFeatures?: TextLanguageFeatures
    contextFeatures?: ContextLanguageFeatures
  }
  alternatives: Array<{
    language: string
    confidence: number
    source: LanguageDetectionSource
  }>
  metadata: Record<string, unknown>
}

/**
 * Audio-based language detection features
 */
export interface AudioLanguageFeatures {
  spectralFeatures: {
    mfcc: number[] // Mel-frequency cepstral coefficients
    chroma: number[] // Chromagram features
    spectralCentroid: number // Center of mass of spectrum
    spectralBandwidth: number // Width of spectrum
    spectralRolloff: number // Frequency below which 85% of energy is contained
  }
  prosodyFeatures: {
    pitch: {
      mean: number
      variance: number
      range: number
    }
    rhythm: {
      syllableRate: number // syllables per second
      stressPattern: number[] // stress pattern indicators
    }
    intonation: {
      contour: number[] // intonation contour
      finalPattern: 'rising' | 'falling' | 'level'
    }
  }
  phonemeFeatures: {
    formants: number[][] // F1, F2, F3 for vowel identification
    consonantFeatures: number[] // Consonant characteristic features
    phonemeTransitions: number[] // Transition probabilities
  }
  temporalFeatures: {
    pauseDuration: number[] // Pause durations
    speechRate: number // Words per minute
    articulation: number // Articulation rate
  }
}

/**
 * Text-based language detection features
 */
export interface TextLanguageFeatures {
  characterFeatures: {
    scriptType: 'latin' | 'cyrillic' | 'arabic' | 'chinese' | 'japanese' | 'devanagari' | 'other'
    characterDistribution: Record<string, number>
    unicodeBlocks: string[]
    diacritics: string[]
  }
  linguisticFeatures: {
    nGrams: {
      unigrams: Record<string, number>
      bigrams: Record<string, number>
      trigrams: Record<string, number>
    }
    wordLengthDistribution: number[]
    morphologyIndicators: {
      prefixes: string[]
      suffixes: string[]
      inflections: string[]
    }
    syntaxIndicators: {
      wordOrder: 'svo' | 'sov' | 'vso' | 'other'
      articleUsage: number
      caseMarking: boolean
    }
  }
  vocabularyFeatures: {
    stopWordMatches: Record<string, number>
    functionWordRatio: number
    lexicalDiversity: number
    borrowedWords: string[]
  }
}

/**
 * Context-based language detection features
 */
export interface ContextLanguageFeatures {
  temporalContext: {
    timeOfDay: number
    dayOfWeek: number
    timezone: string
  }
  geographicContext: {
    country?: string
    region?: string
    coordinates?: {
      latitude: number
      longitude: number
    }
  }
  sessionContext: {
    previousLanguages: string[]
    languageSwitches: number
    sessionDuration: number
    userInteractions: number
  }
  applicationContext: {
    documentLanguage?: string
    uiLanguage?: string
    keyboardLayout?: string
    systemLocale?: string
  }
}

/**
 * Mixed-language detection result
 */
export interface MixedLanguageDetectionResult {
  isPrimaryLanguage: boolean
  primaryLanguage: string
  primaryConfidence: number
  secondaryLanguages: Array<{
    language: string
    confidence: number
    segments: Array<{
      start: number
      end: number
      text?: string
    }>
  }>
  languageSwitches: Array<{
    timestamp: number
    fromLanguage: string
    toLanguage: string
    confidence: number
    trigger: 'audio' | 'text' | 'context'
  }>
  overallPattern: 'monolingual' | 'code_switching' | 'mixed_domain' | 'multilingual'
  dominanceScore: Record<string, number> // Language dominance scores
}

/**
 * Language detection configuration
 */
export interface LanguageDetectionConfig {
  // Detection methods
  enabledMethods: LanguageDetectionSource[]
  audioAnalysis: {
    enabled: boolean
    minAudioLength: number // minimum audio length in seconds
    analysisWindow: number // window size for analysis
    featureExtraction: {
      mfcc: boolean
      prosody: boolean
      phoneme: boolean
      temporal: boolean
    }
  }

  textAnalysis: {
    enabled: boolean
    minTextLength: number // minimum text length for analysis
    nGramSize: number[] // n-gram sizes to analyze
    useStopWords: boolean
    useMorphology: boolean
  }

  contextAnalysis: {
    enabled: boolean
    useGeolocation: boolean
    useTimeContext: boolean
    useSessionHistory: boolean
    useSystemSettings: boolean
  }

  // Detection thresholds
  confidenceThresholds: {
    minimum: number // minimum confidence to accept detection
    switching: number // threshold for language switching
    mixed: number // threshold for mixed language detection
  }

  // Performance settings
  performance: {
    maxProcessingTime: number // max time for detection in ms
    enableCaching: boolean
    cacheSize: number
    enableParallelProcessing: boolean
  }

  // Quality settings
  quality: {
    enableValidation: boolean
    validateWithMultipleMethods: boolean
    requireConsistency: boolean
    consistencyThreshold: number
  }
}

/**
 * Language detection service interface
 */
export interface ILanguageDetectionService extends EventEmitter {
  // Core detection methods
  detectFromAudio(
    audioData: ArrayBuffer,
    options?: DetectionOptions
  ): Promise<LanguageDetectionResult>
  detectFromText(text: string, options?: DetectionOptions): Promise<LanguageDetectionResult>
  detectFromContext(
    context: ContextLanguageFeatures,
    options?: DetectionOptions
  ): Promise<LanguageDetectionResult>
  detectMixed(
    input: AudioTextInput,
    options?: DetectionOptions
  ): Promise<MixedLanguageDetectionResult>

  // Continuous detection
  startContinuousDetection(options?: ContinuousDetectionOptions): string
  stopContinuousDetection(sessionId: string): void
  updateContinuousDetection(sessionId: string, input: AudioTextInput): void

  // Configuration and management
  updateConfiguration(config: Partial<LanguageDetectionConfig>): void
  getConfiguration(): LanguageDetectionConfig
  getSupportedLanguages(): LanguageDefinition[]

  // Performance and analytics
  getPerformanceMetrics(): LanguageDetectionPerformanceMetrics
  getAccuracyMetrics(): LanguageDetectionAccuracyMetrics

  // Cleanup
  cleanup(): void
}

/**
 * Detection options
 */
export interface DetectionOptions {
  timeout?: number
  preferredLanguages?: string[]
  excludeLanguages?: string[]
  enableFallback?: boolean
  requireHighConfidence?: boolean
  includeMixedDetection?: boolean
  contextHints?: Record<string, unknown>
}

/**
 * Continuous detection options
 */
export interface ContinuousDetectionOptions extends DetectionOptions {
  updateInterval: number // how often to update detection
  bufferSize: number // how much data to keep in buffer
  enableAdaptation: boolean // adapt to user patterns over time
  enableLearning: boolean // learn from corrections
}

/**
 * Audio and text input for detection
 */
export interface AudioTextInput {
  audio?: ArrayBuffer
  text?: string
  timestamp: number
  sessionId?: string
  metadata?: Record<string, unknown>
}

/**
 * Performance metrics
 */
export interface LanguageDetectionPerformanceMetrics {
  averageLatency: number
  maxLatency: number
  throughput: number // detections per second
  cacheHitRate: number
  resourceUsage: {
    cpuUsage: number
    memoryUsage: number
    networkRequests: number
  }
  errorRate: number
  timeoutRate: number
}

/**
 * Accuracy metrics
 */
export interface LanguageDetectionAccuracyMetrics {
  overallAccuracy: number
  languageSpecificAccuracy: Record<string, number>
  confidenceCalibration: {
    bins: number[]
    accuracy: number[]
  }
  confusionMatrix: Record<string, Record<string, number>>
  mixedLanguageAccuracy: {
    primaryLanguageAccuracy: number
    switchDetectionAccuracy: number
    segmentationAccuracy: number
  }
}

/**
 * Language detection events
 */
export interface LanguageDetectionEvents {
  'detection:completed': (result: LanguageDetectionResult) => void
  'detection:mixed': (result: MixedLanguageDetectionResult) => void
  'detection:error': (error: Error, context?: Record<string, unknown>) => void
  'detection:switch': (fromLanguage: string, toLanguage: string, confidence: number) => void
  'detection:update': (sessionId: string, result: LanguageDetectionResult) => void
  'performance:metrics': (metrics: LanguageDetectionPerformanceMetrics) => void
}

/**
 * Default supported languages
 */
export const DEFAULT_SUPPORTED_LANGUAGES: LanguageDefinition[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    direction: 'ltr',
    family: 'Germanic',
    script: 'Latin',
    confidence: 0.95,
    models: {
      whisper: ['whisper-1'],
      google: ['en-US', 'en-GB', 'en-AU', 'en-CA'],
      azure: ['en-US', 'en-GB'],
      aws: ['en-US', 'en-GB']
    },
    phonemes: [
      '/i/',
      '/ɪ/',
      '/e/',
      '/ɛ/',
      '/æ/',
      '/a/',
      '/ɑ/',
      '/ɔ/',
      '/o/',
      '/ʊ/',
      '/u/',
      '/ʌ/',
      '/ə/'
    ],
    commonWords: ['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'I'],
    stopWords: [
      'the',
      'be',
      'to',
      'of',
      'and',
      'a',
      'in',
      'that',
      'have',
      'I',
      'it',
      'for',
      'not',
      'on',
      'with'
    ]
  },
  {
    code: 'uk',
    name: 'Ukrainian',
    nativeName: 'Українська',
    direction: 'ltr',
    family: 'Slavic',
    script: 'Cyrillic',
    confidence: 0.85,
    models: {
      whisper: ['whisper-1'],
      google: ['uk-UA'],
      azure: ['uk-UA']
    },
    phonemes: ['/i/', '/ɪ/', '/e/', '/ɛ/', '/a/', '/ɔ/', '/o/', '/u/', '/ɨ/', '/ə/'],
    commonWords: ['і', 'в', 'на', 'з', 'що', 'не', 'він', 'та', 'як', 'до'],
    stopWords: [
      'і',
      'в',
      'на',
      'з',
      'що',
      'не',
      'він',
      'та',
      'як',
      'до',
      'за',
      'по',
      'від',
      'при',
      'або'
    ]
  },
  {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    direction: 'ltr',
    family: 'Slavic',
    script: 'Cyrillic',
    confidence: 0.9,
    models: {
      whisper: ['whisper-1'],
      google: ['ru-RU'],
      azure: ['ru-RU']
    },
    phonemes: ['/i/', '/ɨ/', '/e/', '/a/', '/o/', '/u/'],
    commonWords: ['и', 'в', 'не', 'на', 'я', 'быть', 'он', 'с', 'что', 'а'],
    stopWords: [
      'и',
      'в',
      'не',
      'на',
      'я',
      'быть',
      'он',
      'с',
      'что',
      'а',
      'то',
      'все',
      'она',
      'так',
      'его'
    ]
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    direction: 'ltr',
    family: 'Germanic',
    script: 'Latin',
    confidence: 0.9,
    models: {
      whisper: ['whisper-1'],
      google: ['de-DE', 'de-AT', 'de-CH'],
      azure: ['de-DE']
    },
    phonemes: ['/i/', '/ɪ/', '/e/', '/ɛ/', '/a/', '/ɔ/', '/o/', '/ʊ/', '/u/', '/y/', '/ø/', '/ə/'],
    commonWords: ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich'],
    stopWords: [
      'der',
      'die',
      'und',
      'in',
      'den',
      'von',
      'zu',
      'das',
      'mit',
      'sich',
      'auf',
      'für',
      'ist',
      'im',
      'dem'
    ]
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    direction: 'ltr',
    family: 'Romance',
    script: 'Latin',
    confidence: 0.9,
    models: {
      whisper: ['whisper-1'],
      google: ['fr-FR', 'fr-CA'],
      azure: ['fr-FR']
    },
    phonemes: ['/i/', '/e/', '/ɛ/', '/a/', '/ɔ/', '/o/', '/u/', '/y/', '/ø/', '/œ/', '/ə/'],
    commonWords: ['le', 'de', 'et', 'à', 'un', 'il', 'être', 'et', 'en', 'avoir'],
    stopWords: [
      'le',
      'de',
      'et',
      'à',
      'un',
      'il',
      'être',
      'et',
      'en',
      'avoir',
      'que',
      'pour',
      'dans',
      'ce',
      'son'
    ]
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    direction: 'ltr',
    family: 'Romance',
    script: 'Latin',
    confidence: 0.9,
    models: {
      whisper: ['whisper-1'],
      google: ['es-ES', 'es-MX', 'es-AR'],
      azure: ['es-ES']
    },
    phonemes: ['/i/', '/e/', '/a/', '/o/', '/u/'],
    commonWords: ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'ser', 'se'],
    stopWords: [
      'el',
      'la',
      'de',
      'que',
      'y',
      'a',
      'en',
      'un',
      'ser',
      'se',
      'no',
      'te',
      'lo',
      'le',
      'da'
    ]
  }
]

/**
 * Default configuration for language detection
 */
export const DEFAULT_LANGUAGE_DETECTION_CONFIG: LanguageDetectionConfig = {
  enabledMethods: ['browser_api', 'audio_analysis', 'text_analysis', 'context_analysis'],

  audioAnalysis: {
    enabled: true,
    minAudioLength: 1.0,
    analysisWindow: 2.0,
    featureExtraction: {
      mfcc: true,
      prosody: true,
      phoneme: false, // Requires more advanced processing
      temporal: true
    }
  },

  textAnalysis: {
    enabled: true,
    minTextLength: 10,
    nGramSize: [1, 2, 3],
    useStopWords: true,
    useMorphology: false // Requires language-specific models
  },

  contextAnalysis: {
    enabled: true,
    useGeolocation: false, // Privacy concerns
    useTimeContext: true,
    useSessionHistory: true,
    useSystemSettings: true
  },

  confidenceThresholds: {
    minimum: 0.6,
    switching: 0.7,
    mixed: 0.5
  },

  performance: {
    maxProcessingTime: 2000,
    enableCaching: true,
    cacheSize: 100,
    enableParallelProcessing: true
  },

  quality: {
    enableValidation: true,
    validateWithMultipleMethods: true,
    requireConsistency: false,
    consistencyThreshold: 0.8
  }
}
