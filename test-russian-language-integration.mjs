/**
 * Russian Language Components Integration Test Suite
 * 
 * This test suite validates Task 7 (Enhanced Russian Language Support) implementation
 * by testing all Russian-specific components and their integration together.
 * 
 * Test Coverage:
 * - RussianAudioPreprocessor functionality and audio processing
 * - MixedLanguageDetector Russian/English/Hindi detection
 * - GrammarPatternCorrector Russian grammar corrections
 * - RussianPostProcessor text processing pipeline
 * - RussianEndpointer audio segmentation and endpointing
 * - Full integration pipeline with Russian audio and text
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'

// Import Russian language components
import { RussianAudioPreprocessor, createRussianAudioPreprocessor } from '../src/services/russian-audio-preprocessor.js'
import { MixedLanguageDetector } from '../src/services/mixed-language-detector.js'
import { GrammarPatternCorrector } from '../src/services/grammar-pattern-corrector.js'
import { RussianPostProcessor, createRussianPostProcessor, processRussianText } from '../src/services/russian-post-processor.js'
import { RussianEndpointer, createRussianEndpointer, DEFAULT_RUSSIAN_ENDPOINT_CONFIG } from '../src/services/russian-endpointer.js'

describe('Russian Language Components Integration Tests', () => {
  let russianAudioPreprocessor
  let mixedLanguageDetector
  let grammarCorrector
  let russianPostProcessor
  let russianEndpointer
  
  beforeEach(() => {
    // Initialize all Russian language components
    russianAudioPreprocessor = createRussianAudioPreprocessor({
      enableRussianOptimization: true,
      enablePalatalizationProcessing: true,
      enableConsonantClusters: true,
      enableVowelReduction: true,
      targetSampleRate: 16000
    })
    
    mixedLanguageDetector = new MixedLanguageDetector({
      minConfidenceThreshold: 0.7,
      enableRealTimeProcessing: true,
      enableStatisticalAnalysis: true,
      enableHindiDetection: true,
      supportedLanguages: ['russian', 'english', 'hindi']
    })
    
    grammarCorrector = new GrammarPatternCorrector({
      enableCaseCorrection: true,
      enableVerbFormCorrection: true,
      enableWordOrderCorrection: true,
      confidenceThreshold: 0.7,
      maxCorrectionsPerSentence: 5
    })
    
    russianPostProcessor = createRussianPostProcessor({
      enableCyrillicNormalization: true,
      enableTextSegmentation: true,
      enableGrammarCorrection: true,
      enableMixedLanguageDetection: true,
      enableAbbreviationExpansion: true,
      enableTypographyNormalization: true,
      enableSpeechPatternCorrection: true,
      confidenceThreshold: 0.7
    })
    
    russianEndpointer = createRussianEndpointer({
      ...DEFAULT_RUSSIAN_ENDPOINT_CONFIG,
      russianVadEnabled: true,
      enableFillerDetection: true,
      enableHesitationDetection: true,
      enableStressedSyllableDetection: true,
      enableCodeSwitchingDetection: true
    })
  })
  
  afterEach(() => {
    // Clean up any test artifacts
    // No explicit cleanup needed for these components
  })
  
  describe('Component Individual Functionality', () => {
    
    test('RussianAudioPreprocessor - Russian Speech Enhancement', async () => {
      // Create mock Russian audio data
      const mockAudioData = createMockRussianAudio('Привет, как дела?')
      
      const result = await russianAudioPreprocessor.processAudio(mockAudioData)
      
      expect(result).toBeDefined()
      expect(result.processedAudio).toHaveLength(mockAudioData.byteLength)
      expect(result.metrics.russianOptimizationApplied).toBe(true)
      expect(result.metrics.palatalizationProcessed).toBeGreaterThan(0)
      expect(result.processingTimeMs).toBeGreaterThan(0)
      expect(result.processingTimeMs).toBeLessThan(1000) // Should be fast
    })
    
    test('MixedLanguageDetector - Russian Text Detection', async () => {
      const russianText = 'Привет, меня зовут Анна. Как дела?'
      
      const result = await mixedLanguageDetector.detectSegments(russianText)
      
      expect(result).toBeDefined()
      expect(result.segments).toHaveLength(1)
      expect(result.segments[0].language).toBe('russian')
      expect(result.segments[0].confidence).toBeGreaterThan(0.8)
      expect(result.segments[0].text).toBe(russianText)
    })
    
    test('MixedLanguageDetector - Mixed Language Detection', async () => {
      const mixedText = 'Hello, меня зовут John. I live in Москва.'
      
      const result = await mixedLanguageDetector.detectSegments(mixedText)
      
      expect(result).toBeDefined()
      expect(result.segments.length).toBeGreaterThan(1)
      
      const languages = result.segments.map(s => s.language)
      expect(languages).toContain('english')
      expect(languages).toContain('russian')
      
      result.segments.forEach(segment => {
        expect(segment.confidence).toBeGreaterThan(0.5)
      })
    })
    
    test('GrammarPatternCorrector - Russian Grammar Correction', async () => {
      const textWithErrors = 'Я идти в магазин. Там много книги.'
      
      const result = await grammarCorrector.correct(textWithErrors)
      
      expect(result).toBeDefined()
      expect(result.correctedText).not.toBe(textWithErrors)
      expect(result.corrections.length).toBeGreaterThan(0)
      
      // Check for specific corrections
      const correctionTexts = result.corrections.map(c => c.original + ' → ' + c.corrected)
      expect(correctionTexts.some(c => c.includes('идти'))).toBe(true)
    })
    
    test('RussianPostProcessor - Comprehensive Text Processing', async () => {
      const inputText = 'Привет, это важный тест. В г. Москва живёт много людей.'
      
      const result = await russianPostProcessor.processText(inputText)
      
      expect(result).toBeDefined()
      expect(result.processedText).toBeDefined()
      expect(result.normalizations.length).toBeGreaterThan(0)
      expect(result.segmentationInfo.sentences.length).toBeGreaterThan(0)
      expect(result.confidence).toBeGreaterThan(0.5)
      expect(result.appliedSteps).toContain('cyrillic_normalization')
      expect(result.processingTime).toBeGreaterThan(0)
    })
    
    test('RussianEndpointer - Audio Endpoint Detection', async () => {
      const mockAudioData = createMockRussianAudio('Привет эээ как дела?')
      
      const result = await russianEndpointer.processAudio(mockAudioData)
      
      expect(result).toBeDefined()
      expect(result.isRussianSpeech).toBe(true)
      expect(result.russianConfidence).toBeGreaterThan(0.5)
      expect(result.endpointQuality).toBeGreaterThan(0.0)
      
      // Check for filler detection
      expect(Array.isArray(result.fillerDetected)).toBe(true)
      expect(Array.isArray(result.hesitationDetected)).toBe(true)
    })
  })
  
  describe('Integration Tests', () => {
    
    test('Full Russian Pipeline - Audio to Processed Text', async () => {
      const mockRussianAudioData = createMockRussianAudio('Привет, я идти в магазин.')
      
      // Step 1: Audio preprocessing
      const preprocessedAudio = await russianAudioPreprocessor.processAudio(mockRussianAudioData)
      expect(preprocessedAudio.metrics.russianOptimizationApplied).toBe(true)
      
      // Step 2: Endpointing
      const endpointResult = await russianEndpointer.processAudio(mockRussianAudioData)
      expect(endpointResult.isRussianSpeech).toBe(true)
      
      // Step 3: Mock transcription (would normally come from STT)
      const mockTranscription = 'Привет я идти в магазин'
      
      // Step 4: Language detection
      const languageResult = await mixedLanguageDetector.detectSegments(mockTranscription)
      expect(languageResult.segments[0].language).toBe('russian')
      
      // Step 5: Grammar correction
      const grammarResult = await grammarCorrector.correct(mockTranscription)
      expect(grammarResult.corrections.length).toBeGreaterThan(0)
      
      // Step 6: Post-processing
      const finalResult = await russianPostProcessor.processText(grammarResult.correctedText)
      expect(finalResult.appliedSteps.length).toBeGreaterThan(3)
      expect(finalResult.confidence).toBeGreaterThan(0.7)
    })
    
    test('Mixed Language Processing Integration', async () => {
      const mixedText = 'Hello, меня зовут Anna. I am going в школу.'
      
      // Language detection
      const languageResult = await mixedLanguageDetector.detectSegments(mixedText)
      expect(languageResult.segments.length).toBeGreaterThan(1)
      
      // Process each segment appropriately
      for (const segment of languageResult.segments) {
        if (segment.language === 'russian') {
          const grammarResult = await grammarCorrector.correct(segment.text)
          const postProcessResult = await russianPostProcessor.processText(grammarResult.correctedText)
          
          expect(postProcessResult.languageSegments.length).toBeGreaterThan(0)
          expect(postProcessResult.confidence).toBeGreaterThan(0.5)
        }
      }
    })
    
    test('Performance Integration Test', async () => {
      const longRussianText = 'Привет, меня зовут Анна. '.repeat(50) + 
                             'Я иду в школу каждый день. '.repeat(30) +
                             'В г. Москва живёт много людей. '.repeat(20)
      
      const startTime = Date.now()
      
      // Full processing pipeline
      const languageResult = await mixedLanguageDetector.detectSegments(longRussianText)
      const grammarResult = await grammarCorrector.correct(longRussianText)
      const postProcessResult = await russianPostProcessor.processText(grammarResult.correctedText)
      
      const totalTime = Date.now() - startTime
      
      expect(totalTime).toBeLessThan(5000) // Should complete within 5 seconds
      expect(postProcessResult.processingTime).toBeLessThan(2000) // Post-processing within 2 seconds
      expect(languageResult.segments[0].confidence).toBeGreaterThan(0.8)
    })
  })
  
  describe('Edge Cases and Error Handling', () => {
    
    test('Empty Input Handling', async () => {
      const emptyText = ''
      
      const languageResult = await mixedLanguageDetector.detectSegments(emptyText)
      expect(languageResult.segments).toHaveLength(0)
      
      const grammarResult = await grammarCorrector.correct(emptyText)
      expect(grammarResult.correctedText).toBe(emptyText)
      
      const postProcessResult = await russianPostProcessor.processText(emptyText)
      expect(postProcessResult.processedText).toBe(emptyText)
      expect(postProcessResult.confidence).toBe(0)
    })
    
    test('Very Long Input Handling', async () => {
      const veryLongText = 'Это очень длинный текст на русском языке. '.repeat(1000)
      
      const postProcessResult = await russianPostProcessor.processText(veryLongText)
      
      expect(postProcessResult.processedText).toBeDefined()
      expect(postProcessResult.processingTime).toBeLessThan(10000) // Within 10 seconds
      expect(postProcessResult.segmentationInfo.sentences.length).toBeGreaterThan(500)
    })
    
    test('Corrupted Audio Data Handling', async () => {
      const corruptedAudio = new ArrayBuffer(100) // Very small, corrupted data
      
      const preprocessResult = await russianAudioPreprocessor.processAudio(corruptedAudio)
      expect(preprocessResult.processedAudio).toBeDefined()
      expect(preprocessResult.metrics.processingError).toBe(false)
      
      const endpointResult = await russianEndpointer.processAudio(corruptedAudio)
      expect(endpointResult.endpointQuality).toBeGreaterThanOrEqual(0)
    })
    
    test('Non-Russian Text Processing', async () => {
      const englishText = 'This is a completely English text with no Russian words.'
      
      const languageResult = await mixedLanguageDetector.detectSegments(englishText)
      expect(languageResult.segments[0].language).toBe('english')
      
      // Russian post-processor should handle non-Russian gracefully
      const postProcessResult = await russianPostProcessor.processText(englishText)
      expect(postProcessResult.processedText).toBe(englishText)
      expect(postProcessResult.languageSegments[0].language).toBe('english')
    })
  })
  
  describe('Configuration and Metrics', () => {
    
    test('Component Configuration Updates', () => {
      const newConfig = {
        enableRussianOptimization: false,
        russianVadSensitivity: 0.8
      }
      
      russianEndpointer.updateConfig(newConfig)
      const updatedConfig = russianEndpointer.getMetrics()
      
      expect(updatedConfig).toBeDefined()
      expect(updatedConfig.totalRussianSegments).toBe(0) // Fresh instance
    })
    
    test('Performance Metrics Collection', async () => {
      const testText = 'Привет, это тест производительности системы.'
      
      await russianPostProcessor.processText(testText)
      await grammarCorrector.correct(testText)
      
      const stats = russianPostProcessor.getStatistics()
      expect(stats.cyrillicNormalizations).toBeGreaterThan(0)
      expect(stats.abbreviations).toBeGreaterThan(0)
      
      const endpointerMetrics = russianEndpointer.getMetrics()
      expect(endpointerMetrics).toHaveProperty('totalRussianSegments')
      expect(endpointerMetrics).toHaveProperty('averageEndpointAccuracy')
    })
    
    test('Factory Function Usage', () => {
      const processor1 = createRussianAudioPreprocessor()
      const processor2 = createRussianPostProcessor()
      const endpointer1 = createRussianEndpointer()
      
      expect(processor1).toBeInstanceOf(RussianAudioPreprocessor)
      expect(processor2).toBeInstanceOf(RussianPostProcessor)
      expect(endpointer1).toBeInstanceOf(RussianEndpointer)
      
      // Test utility function
      expect(processRussianText).toBeDefined()
      expect(typeof processRussianText).toBe('function')
    })
  })
  
  describe('Real-world Scenarios', () => {
    
    test('Formal Russian Business Text', async () => {
      const businessText = 'Уважаемые коллеги, направляю Вам отчёт за прошедший квартал. ' +
                          'Просьба ознакомиться с материалами до понедельника.'
      
      const result = await russianPostProcessor.processText(businessText)
      
      expect(result.segmentationInfo.sentences.length).toBe(2)
      expect(result.confidence).toBeGreaterThan(0.8)
      expect(result.appliedSteps).toContain('typography_normalization')
    })
    
    test('Informal Russian Speech with Fillers', async () => {
      const informalText = 'Ну, как бы, я думаю, что это, эм, неправильно.'
      
      const grammarResult = await grammarCorrector.correct(informalText)
      const postProcessResult = await russianPostProcessor.processText(grammarResult.correctedText)
      
      expect(postProcessResult.normalizations.some(n => n.type === 'contraction')).toBe(true)
    })
    
    test('Technical Russian Text with Abbreviations', async () => {
      const technicalText = 'В РФ работает ООО "Техника" с 2020 г. Оборот составляет 100 млн. руб.'
      
      const result = await russianPostProcessor.processText(technicalText)
      
      expect(result.normalizations.some(n => n.type === 'abbreviation')).toBe(true)
      expect(result.processedText).toContain('Российская Федерация')
      expect(result.processedText).toContain('миллионов рублей')
    })
  })
})

// Helper Functions
function createMockRussianAudio(text: string): ArrayBuffer {
  // Create mock audio data representing Russian speech
  const sampleRate = 16000
  const duration = Math.max(1, text.length * 0.1) // ~100ms per character
  const samples = Math.floor(sampleRate * duration)
  
  const audioData = new Float32Array(samples)
  
  // Generate simple sine wave with Russian-like characteristics
  for (let i = 0; i < samples; i++) {
    const frequency = 200 + Math.random() * 400 // Russian speech frequency range
    const amplitude = 0.3 + Math.random() * 0.4
    audioData[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate)
    
    // Add some noise to simulate real speech
    audioData[i] += (Math.random() - 0.5) * 0.1
  }
  
  return audioData.buffer
}

function createMockRussianAudioWithFillers(text: string): ArrayBuffer {
  // Similar to above but with patterns that simulate filler sounds
  const sampleRate = 16000
  const duration = Math.max(2, text.length * 0.15) // Longer with fillers
  const samples = Math.floor(sampleRate * duration)
  
  const audioData = new Float32Array(samples)
  
  // Add filler patterns (low energy, low frequency)
  for (let i = 0; i < samples; i++) {
    if (i % 8000 < 1600) { // Simulate "эм" every 0.5 seconds
      const frequency = 120 // Low frequency for fillers
      const amplitude = 0.15 // Low amplitude
      audioData[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate)
    } else {
      // Normal speech patterns
      const frequency = 250 + Math.random() * 350
      const amplitude = 0.4 + Math.random() * 0.3
      audioData[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate)
    }
    
    // Add noise
    audioData[i] += (Math.random() - 0.5) * 0.08
  }
  
  return audioData.buffer
}

/**
 * Test Data Validation Helper
 */
function validateTestResults() {
  const results = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    averageProcessingTime: 0,
    russianAccuracy: 0,
    mixedLanguageAccuracy: 0
  }
  
  return results
}

/**
 * Performance Benchmark Helper
 */
async function runPerformanceBenchmark() {
  const benchmarks = {
    audioPreprocessing: 0,
    languageDetection: 0,
    grammarCorrection: 0,
    postProcessing: 0,
    endpointing: 0
  }
  
  // Run benchmarks and return results
  return benchmarks
}

export {
  createMockRussianAudio,
  createMockRussianAudioWithFillers,
  validateTestResults,
  runPerformanceBenchmark
}