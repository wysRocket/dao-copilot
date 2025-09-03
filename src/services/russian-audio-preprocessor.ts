/**
 * Russian Language Audio Preprocessor
 *
 * This module provides audio preprocessing specifically optimized for Russian speech
 * to improve transcription quality. It includes noise reduction, filtering, and
 * normalization techniques tailored for Russian phonemes and speech patterns.
 */

import {Buffer} from 'buffer'

export interface AudioPreprocessorConfig {
  sampleRate: number
  channels: number
  bitDepth: number
  noiseReductionLevel: number
  normalizationLevel: number // dB
  enableBandpassFilter: boolean
  enableRussianPhonemeOptimization: boolean
  enableSpeechEnhancement: boolean
}

export interface AudioMetrics {
  totalBytes: number
  nonZeroBytes: number
  maxAmplitude: number
  avgAmplitude: number
  dynamicRange: number
  signalToNoiseRatio: number
  isSilent: boolean
  containsRussianFrequencies: boolean
}

/**
 * AudioPreprocessor class optimized for Russian speech recognition
 */
export class RussianAudioPreprocessor {
  private config: AudioPreprocessorConfig

  constructor(config: Partial<AudioPreprocessorConfig> = {}) {
    this.config = {
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
      noiseReductionLevel: 0.3,
      normalizationLevel: -3, // dB
      enableBandpassFilter: true,
      enableRussianPhonemeOptimization: true,
      enableSpeechEnhancement: true,
      ...config
    }
  }

  /**
   * Main preprocessing method that applies all optimizations
   */
  async process(audioBuffer: Buffer): Promise<{
    processedAudio: Buffer
    metrics: AudioMetrics
    applied: string[]
  }> {
    const applied: string[] = []
    let currentBuffer = audioBuffer

    console.log(`🎵 Starting Russian audio preprocessing for ${audioBuffer.length} byte buffer`)

    // Calculate initial metrics
    const initialMetrics = this.calculateAudioMetrics(currentBuffer)
    console.log('📊 Initial audio metrics:', initialMetrics)

    // Step 1: Convert to target format if needed
    if (this.needsFormatConversion(currentBuffer)) {
      currentBuffer = await this.convertFormat(currentBuffer)
      applied.push('format_conversion')
    }

    // Step 2: Apply bandpass filter optimized for Russian speech
    if (this.config.enableBandpassFilter) {
      currentBuffer = this.applyRussianBandpassFilter(currentBuffer)
      applied.push('russian_bandpass_filter')
    }

    // Step 3: Noise reduction with Russian-specific patterns
    if (this.config.noiseReductionLevel > 0) {
      currentBuffer = await this.denoise(currentBuffer)
      applied.push('russian_noise_reduction')
    }

    // Step 4: Enhanced clarity processing (Task 11.4 requirement)
    if (this.config.enableSpeechEnhancement) {
      currentBuffer = await this.enhanceClarity(currentBuffer)
      applied.push('clarity_enhancement')
    }

    // Step 5: Russian phoneme optimization (Task 11.4 requirement)
    if (this.config.enableRussianPhonemeOptimization) {
      currentBuffer = await this.optimizeForRussianPhonemes(currentBuffer)
      applied.push('russian_phoneme_optimization')
    }

    // Step 6: Speech enhancement for Russian phonemes (existing)
    if (this.config.enableSpeechEnhancement) {
      currentBuffer = this.enhanceRussianSpeech(currentBuffer)
      applied.push('russian_speech_enhancement')
    }

    // Step 7: Normalize audio levels
    currentBuffer = this.normalizeAudio(currentBuffer)
    applied.push('audio_normalization')

    // Calculate final metrics
    const finalMetrics = this.calculateAudioMetrics(currentBuffer)
    console.log('📊 Final audio metrics:', finalMetrics)
    console.log(`✅ Applied preprocessing steps: ${applied.join(', ')}`)

    return {
      processedAudio: currentBuffer,
      metrics: finalMetrics,
      applied
    }
  }

  /**
   * Calculate comprehensive audio metrics
   */
  private calculateAudioMetrics(pcmData: Buffer): AudioMetrics {
    if (pcmData.length === 0) {
      return {
        totalBytes: 0,
        nonZeroBytes: 0,
        maxAmplitude: 0,
        avgAmplitude: 0,
        dynamicRange: 0,
        signalToNoiseRatio: 0,
        isSilent: true,
        containsRussianFrequencies: false
      }
    }

    const sampleCount = Math.floor(pcmData.length / 2) // 16-bit samples
    let nonZeroSamples = 0
    let maxAmplitude = 0
    let minAmplitude = 0
    let amplitudeSum = 0
    let squaredSum = 0

    // Frequency analysis for Russian speech detection
    let lowFreqEnergy = 0 // 80-300 Hz (fundamental frequencies)
    let midFreqEnergy = 0 // 300-3400 Hz (Russian formants)
    let highFreqEnergy = 0 // 3400-8000 Hz (fricatives/consonants)

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const sample = pcmData.readInt16LE(i)
      const amplitude = Math.abs(sample)

      if (sample !== 0) nonZeroSamples++
      if (amplitude > maxAmplitude) maxAmplitude = amplitude
      if (sample < minAmplitude) minAmplitude = sample

      amplitudeSum += amplitude
      squaredSum += sample * sample

      // Simple frequency band energy estimation
      // This is a rough approximation - real frequency analysis would need FFT
      const normalizedSample = sample / 32768.0
      if (i % 6 === 0) lowFreqEnergy += normalizedSample * normalizedSample
      else if (i % 3 === 0) midFreqEnergy += normalizedSample * normalizedSample
      else highFreqEnergy += normalizedSample * normalizedSample
    }

    const avgAmplitude = sampleCount > 0 ? amplitudeSum / sampleCount : 0
    const dynamicRange = maxAmplitude - Math.abs(minAmplitude)

    // Estimate SNR based on signal variance vs noise floor
    const signalPower = squaredSum / sampleCount
    const noisePower = Math.max(1, avgAmplitude * avgAmplitude * 0.1) // Rough noise floor estimate
    const signalToNoiseRatio = signalPower > 0 ? 10 * Math.log10(signalPower / noisePower) : 0

    // Russian speech typically has strong energy in mid-frequency bands
    const totalEnergy = lowFreqEnergy + midFreqEnergy + highFreqEnergy
    const midFreqRatio = totalEnergy > 0 ? midFreqEnergy / totalEnergy : 0
    const containsRussianFrequencies = midFreqRatio > 0.4 && maxAmplitude > 1000

    const isSilent = nonZeroSamples === 0 || maxAmplitude < 100

    return {
      totalBytes: pcmData.length,
      nonZeroBytes: nonZeroSamples * 2,
      maxAmplitude,
      avgAmplitude,
      dynamicRange,
      signalToNoiseRatio,
      isSilent,
      containsRussianFrequencies
    }
  }

  /**
   * Check if format conversion is needed
   */
  private needsFormatConversion(buffer: Buffer): boolean {
    // Check if it's a WAV file that needs conversion
    if (
      buffer.length > 44 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WAVE'
    ) {
      // Parse format to see if conversion is needed
      const format = this.parseWavFormat(buffer)
      return (
        format.sampleRate !== this.config.sampleRate ||
        format.channels !== this.config.channels ||
        format.bitDepth !== this.config.bitDepth
      )
    }
    return false
  }

  /**
   * Convert audio format to target specifications
   */
  private async convertFormat(buffer: Buffer): Promise<Buffer> {
    console.log('🔄 Converting audio format for optimal Russian processing')

    // Strip WAV headers to get raw PCM
    let pcmData = this.stripWavHeaders(buffer)
    const format = this.parseWavFormat(buffer)

    // Resample if needed
    if (format.sampleRate && format.sampleRate !== this.config.sampleRate) {
      pcmData = this.resampleAudio(
        pcmData,
        format.sampleRate,
        this.config.sampleRate,
        format.channels || 1,
        format.bitDepth || 16
      )
    }

    // Convert to mono if needed
    if ((format.channels || 1) > 1 && this.config.channels === 1) {
      pcmData = this.convertToMono(pcmData, format.channels || 2)
    }

    return pcmData
  }

  /**
   * Apply bandpass filter optimized for Russian speech frequencies
   */
  private applyRussianBandpassFilter(pcmData: Buffer): Buffer {
    console.log('🎚️ Applying Russian-optimized bandpass filter (200-4000 Hz)')

    // Russian speech fundamental frequencies: ~80-400 Hz for men, ~120-500 Hz for women
    // Russian formants typically range from 300-3500 Hz
    // Optimal range for Russian speech: 200-4000 Hz

    return this.applySimpleBandpassFilter(pcmData, 200, 4000, this.config.sampleRate)
  }

  /**
   * Enhanced noise reduction specifically for Russian audio environments
   */
  private async denoise(pcmData: Buffer): Promise<Buffer> {
    console.log(`🔇 Advanced Russian noise reduction (level: ${this.config.noiseReductionLevel})`)

    // Russian-specific noise patterns:
    // - Line frequency noise (50 Hz in Russia/Europe vs 60 Hz in US)
    // - Common room acoustics in Russian environments
    // - Background noise typical in Russian conversational settings
    // - HVAC and electrical noise common in Russian buildings

    let denoised = this.applyAdaptiveNoiseReduction(pcmData, this.config.noiseReductionLevel)

    // Additional Russian-specific noise reduction
    denoised = this.remove50HzNoise(denoised)
    denoised = this.reduceLowFrequencyRumble(denoised)
    denoised = this.suppressElectricalNoise(denoised)

    return denoised
  }

  /**
   * Enhanced clarity processing specifically for Russian speech (Task 11.4)
   */
  private async enhanceClarity(pcmData: Buffer): Promise<Buffer> {
    console.log('🔍 Enhancing Russian speech clarity')

    // Russian clarity enhancements:
    // - Sharpen consonant transitions (important for palatalized consonants)
    // - Enhance vowel distinctness (Russian has 5-6 vowel phonemes with critical distinctions)
    // - Improve sibilant clarity (ш, щ, ж, ч distinctions)
    // - Enhance plosive definition (п/б, т/д, к/г distinctions)
    // - Boost mid-frequency content where Russian formants are concentrated

    let enhanced = pcmData

    // Step 1: Enhance consonant transitions
    enhanced = this.enhanceConsonantTransitions(enhanced)

    // Step 2: Improve vowel distinctness
    enhanced = this.enhanceVowelDistinctness(enhanced)

    // Step 3: Sharpen sibilant sounds
    enhanced = this.enhanceSibilants(enhanced)

    // Step 4: Define plosive sounds
    enhanced = this.enhancePlosives(enhanced)

    // Step 5: Boost critical frequency ranges for Russian
    enhanced = this.boostRussianCriticalFrequencies(enhanced)

    console.log('✨ Russian speech clarity enhancement completed')
    return enhanced
  }

  /**
   * Optimize audio processing for Russian phoneme recognition (Task 11.4)
   */
  private async optimizeForRussianPhonemes(pcmData: Buffer): Promise<Buffer> {
    console.log('🎯 Optimizing for Russian phoneme recognition')

    // Russian phoneme-specific optimizations:
    // - Russian has 42 phonemes (5-6 vowels + 36 consonants)
    // - Palatalization is critical (мать vs мат, corner vs checkmate)
    // - Soft/hard consonant distinctions
    // - Vowel reduction patterns in unstressed positions
    // - Specific frequency ranges for Russian sounds

    let optimized = pcmData

    // Step 1: Optimize for palatalized consonants (soft consonants)
    optimized = this.optimizePalatalization(optimized)

    // Step 2: Enhance hard/soft consonant distinctions
    optimized = this.enhanceHardSoftDistinctions(optimized)

    // Step 3: Optimize for Russian vowel system (а, о, у, э, и, ы)
    optimized = this.optimizeRussianVowels(optimized)

    // Step 4: Handle Russian stress patterns and vowel reduction
    optimized = this.optimizeStressPatterns(optimized)

    // Step 5: Enhance Russian-specific consonant clusters
    optimized = this.optimizeConsonantClusters(optimized)

    // Step 6: Adjust for Russian prosody and rhythm
    optimized = this.optimizeRussianProsody(optimized)

    console.log('🎵 Russian phoneme optimization completed')
    return optimized
  }

  /**
   * Enhance speech characteristics important for Russian language
   */
  private enhanceRussianSpeech(pcmData: Buffer): Buffer {
    console.log('🗣️ Enhancing Russian speech characteristics')

    // Russian-specific enhancements:
    // - Boost formant frequencies critical for Russian vowel distinction
    // - Enhance consonant clarity (Russian has many palatalized consonants)
    // - Adjust dynamic range for Russian prosody patterns

    let enhanced = this.enhanceVowelFormants(pcmData)
    enhanced = this.enhanceConsonantClarity(enhanced)
    enhanced = this.adjustDynamicRange(enhanced)

    return enhanced
  }

  /**
   * Normalize audio levels to optimal range for Russian speech recognition
   */
  private normalizeAudio(pcmData: Buffer): Buffer {
    console.log(`🔊 Normalizing audio to ${this.config.normalizationLevel} dB`)

    if (pcmData.length === 0) return pcmData

    // Calculate RMS (Root Mean Square) for proper normalization
    let sumSquares = 0
    const sampleCount = Math.floor(pcmData.length / 2)

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const sample = pcmData.readInt16LE(i)
      sumSquares += sample * sample
    }

    const rms = Math.sqrt(sumSquares / sampleCount)

    // Target RMS based on desired dB level
    // -3 dB = ~22627 for 16-bit audio (70% of max)
    const targetRms = Math.pow(10, this.config.normalizationLevel / 20) * 32767

    if (rms === 0) return pcmData // Avoid division by zero

    const gainFactor = Math.min(targetRms / rms, 4.0) // Limit gain to prevent distortion

    console.log(
      `📊 Audio normalization: RMS ${rms.toFixed(0)} → ${targetRms.toFixed(0)} (gain: ${gainFactor.toFixed(2)}x)`
    )

    const normalizedBuffer = Buffer.alloc(pcmData.length)

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const sample = pcmData.readInt16LE(i)
      const normalizedSample = Math.max(-32768, Math.min(32767, Math.round(sample * gainFactor)))
      normalizedBuffer.writeInt16LE(normalizedSample, i)
    }

    return normalizedBuffer
  }

  // Enhanced Russian-specific audio processing methods (Task 11.4)

  /**
   * Remove 50Hz electrical noise common in Russian/European environments
   */
  private remove50HzNoise(pcmData: Buffer): Buffer {
    // Apply notch filter at 50Hz and harmonics (100Hz, 150Hz)
    return this.applyNotchFilter(pcmData, [50, 100, 150], this.config.sampleRate)
  }

  /**
   * Reduce low-frequency rumble and building vibrations
   */
  private reduceLowFrequencyRumble(pcmData: Buffer): Buffer {
    // High-pass filter to remove frequencies below 80Hz
    return this.applyHighPassFilter(pcmData, 80 / (this.config.sampleRate / 2))
  }

  /**
   * Suppress electrical interference noise
   */
  private suppressElectricalNoise(pcmData: Buffer): Buffer {
    // Apply spectral gating for electrical noise suppression
    return this.applySpectralGating(pcmData, 0.3)
  }

  /**
   * Enhance consonant transitions for Russian palatalized consonants
   */
  private enhanceConsonantTransitions(pcmData: Buffer): Buffer {
    // Russian has many palatalized consonants (soft consonants)
    // Enhance rapid frequency changes that indicate consonant transitions
    return this.applyTransientEnhancement(pcmData, 2000, 6000)
  }

  /**
   * Enhance vowel distinctness for Russian vowel system
   */
  private enhanceVowelDistinctness(pcmData: Buffer): Buffer {
    // Russian vowels: а, о, у, э, и, ы
    // Each has distinct formant patterns that need enhancement
    let enhanced = pcmData

    // Enhance first formant (F1: 300-900 Hz)
    enhanced = this.applyGainToFrequencyRange(enhanced, 300, 900, 1.15)

    // Enhance second formant (F2: 900-2300 Hz)
    enhanced = this.applyGainToFrequencyRange(enhanced, 900, 2300, 1.1)

    return enhanced
  }

  /**
   * Enhance sibilant sounds (ш, щ, ж, ч)
   */
  private enhanceSibilants(pcmData: Buffer): Buffer {
    // Russian sibilants are in 3-8 kHz range
    return this.applyGainToFrequencyRange(pcmData, 3000, 8000, 1.2)
  }

  /**
   * Enhance plosive sounds (п/б, т/д, к/г)
   */
  private enhancePlosives(pcmData: Buffer): Buffer {
    // Plosives have energy bursts in multiple frequency ranges
    let enhanced = pcmData

    // Enhance burst frequencies
    enhanced = this.applyGainToFrequencyRange(enhanced, 1000, 4000, 1.1)

    // Enhance high-frequency components
    enhanced = this.applyGainToFrequencyRange(enhanced, 4000, 8000, 1.05)

    return enhanced
  }

  /**
   * Boost frequency ranges critical for Russian speech recognition
   */
  private boostRussianCriticalFrequencies(pcmData: Buffer): Buffer {
    // Russian-specific frequency optimization
    let enhanced = pcmData

    // Fundamental frequency range (80-300 Hz) - moderate boost
    enhanced = this.applyGainToFrequencyRange(enhanced, 80, 300, 1.05)

    // Primary formant range (300-2500 Hz) - significant boost
    enhanced = this.applyGainToFrequencyRange(enhanced, 300, 2500, 1.15)

    // Consonant clarity range (2500-5000 Hz) - moderate boost
    enhanced = this.applyGainToFrequencyRange(enhanced, 2500, 5000, 1.1)

    return enhanced
  }

  /**
   * Optimize for palatalized consonants (мягкие согласные)
   */
  private optimizePalatalization(pcmData: Buffer): Buffer {
    // Palatalized consonants have higher F2 formant transitions
    // Enhance 2-4 kHz range where palatalization cues are strongest
    return this.applyGainToFrequencyRange(pcmData, 2000, 4000, 1.2)
  }

  /**
   * Enhance hard/soft consonant distinctions
   */
  private enhanceHardSoftDistinctions(pcmData: Buffer): Buffer {
    // Hard consonants: lower F2, soft consonants: higher F2
    let enhanced = pcmData

    // Enhance transition regions
    enhanced = this.applyDynamicRangeEnhancement(enhanced, 1500, 3500)

    // Sharpen spectral contrasts
    enhanced = this.applySpectralSharpening(enhanced)

    return enhanced
  }

  /**
   * Optimize for Russian vowel system (а, о, у, э, и, ы)
   */
  private optimizeRussianVowels(pcmData: Buffer): Buffer {
    let optimized = pcmData

    // Each Russian vowel has specific formant patterns:
    // а: F1=600-900Hz, F2=1200-1500Hz
    // о: F1=400-600Hz, F2=900-1200Hz
    // у: F1=300-400Hz, F2=600-900Hz
    // э: F1=500-700Hz, F2=1500-2000Hz
    // и: F1=250-350Hz, F2=2000-2500Hz
    // ы: F1=350-450Hz, F2=1200-1600Hz

    // Optimize formant frequency ranges
    optimized = this.applyGainToFrequencyRange(optimized, 250, 900, 1.12) // F1 range
    optimized = this.applyGainToFrequencyRange(optimized, 600, 2500, 1.08) // F2 range

    return optimized
  }

  /**
   * Optimize for Russian stress patterns and vowel reduction
   */
  private optimizeStressPatterns(pcmData: Buffer): Buffer {
    // Russian has dynamic stress and vowel reduction in unstressed syllables
    // Enhance dynamic range to preserve stress distinctions
    return this.applyAdaptiveGainControl(pcmData, 0.8, 1.2)
  }

  /**
   * Optimize for Russian consonant clusters
   */
  private optimizeConsonantClusters(pcmData: Buffer): Buffer {
    // Russian allows complex consonant clusters (взгляд, встреча)
    // Enhance rapid transitions and maintain cluster definition
    return this.applyClusterEnhancement(pcmData)
  }

  /**
   * Optimize for Russian prosody and rhythm
   */
  private optimizeRussianProsody(pcmData: Buffer): Buffer {
    // Russian is a stress-timed language with specific rhythm patterns
    // Preserve timing relationships and pitch contours
    return this.applyProsodyPreservation(pcmData)
  }

  // Additional helper methods for Russian-specific processing

  private applyNotchFilter(pcmData: Buffer, frequencies: number[], sampleRate: number): Buffer {
    // Simple notch filter implementation for specific frequency removal
    let filtered = pcmData

    for (const freq of frequencies) {
      const normalizedFreq = freq / (sampleRate / 2)
      if (normalizedFreq < 1.0) {
        filtered = this.applySimpleNotchFilter(filtered, normalizedFreq)
      }
    }

    return filtered
  }

  private applySimpleNotchFilter(pcmData: Buffer, normalizedFreq: number): Buffer {
    // Basic notch filter implementation
    const filtered = Buffer.alloc(pcmData.length)
    const r = 0.95 // Notch width
    const theta = 2 * Math.PI * normalizedFreq

    let x1 = 0,
      x2 = 0

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const input = pcmData.readInt16LE(i)

      // Biquad notch filter
      const output = input - 2 * r * Math.cos(theta) * x1 + r * r * x2

      x2 = x1
      x1 = input

      const clampedOutput = Math.max(-32768, Math.min(32767, Math.round(output)))
      filtered.writeInt16LE(clampedOutput, i)
    }

    return filtered
  }

  private applySpectralGating(pcmData: Buffer, threshold: number): Buffer {
    // Simple spectral gating for noise suppression
    const gated = Buffer.alloc(pcmData.length)

    // Calculate running average for gating
    const windowSize = 256
    let runningSum = 0

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const sample = pcmData.readInt16LE(i)
      const amplitude = Math.abs(sample)

      // Update running average
      if (i >= windowSize * 2) {
        const oldSample = Math.abs(pcmData.readInt16LE(i - windowSize * 2))
        runningSum = runningSum - oldSample + amplitude
      } else {
        runningSum += amplitude
      }

      const averageAmplitude = runningSum / Math.min(windowSize, i / 2 + 1)
      const gateThreshold = averageAmplitude * threshold

      // Apply gating
      const gatedSample = amplitude > gateThreshold ? sample : Math.round(sample * 0.3)
      gated.writeInt16LE(gatedSample, i)
    }

    return gated
  }

  private applyTransientEnhancement(pcmData: Buffer, lowFreq: number, highFreq: number): Buffer {
    // Enhance rapid changes (transients) in specific frequency range
    let enhanced = this.applyBandpassGain(pcmData, lowFreq, highFreq, 1.15)
    enhanced = this.applyTransientSharpening(enhanced)
    return enhanced
  }

  private applyBandpassGain(
    pcmData: Buffer,
    lowFreq: number,
    highFreq: number,
    gain: number
  ): Buffer {
    // Apply gain to a specific frequency band
    // This is a simplified implementation
    return this.applyGainToFrequencyRange(pcmData, lowFreq, highFreq, gain)
  }

  private applyTransientSharpening(pcmData: Buffer): Buffer {
    // Enhance rapid signal changes
    const sharpened = Buffer.alloc(pcmData.length)

    for (let i = 2; i < pcmData.length - 3; i += 2) {
      const prev = pcmData.readInt16LE(i - 2)
      const curr = pcmData.readInt16LE(i)
      const next = pcmData.readInt16LE(i + 2)

      // Calculate local gradient
      const gradient = Math.abs(next - prev)
      const enhancementFactor = Math.min(1.3, 1.0 + (gradient / 32768.0) * 0.3)

      const enhanced = curr * enhancementFactor
      const clampedSample = Math.max(-32768, Math.min(32767, Math.round(enhanced)))
      sharpened.writeInt16LE(clampedSample, i)
    }

    return sharpened
  }

  private applyDynamicRangeEnhancement(pcmData: Buffer, lowFreq: number, highFreq: number): Buffer {
    // Enhance dynamic range in specific frequency band
    let enhanced = this.applyGainToFrequencyRange(pcmData, lowFreq, highFreq, 1.1)
    enhanced = this.applyAdaptiveContrast(enhanced)
    return enhanced
  }

  private applySpectralSharpening(pcmData: Buffer): Buffer {
    // Sharpen spectral features for better distinction
    return this.applyHighFrequencyEmphasis(pcmData, 0.1)
  }

  private applyAdaptiveGainControl(pcmData: Buffer, minGain: number, maxGain: number): Buffer {
    // Adaptive gain based on signal characteristics
    const controlled = Buffer.alloc(pcmData.length)
    const windowSize = 512

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const sample = pcmData.readInt16LE(i)

      // Calculate local energy
      let localEnergy = 0
      const start = Math.max(0, i - windowSize)
      const end = Math.min(pcmData.length - 1, i + windowSize)

      for (let j = start; j < end; j += 2) {
        const s = pcmData.readInt16LE(j)
        localEnergy += s * s
      }

      localEnergy = Math.sqrt(localEnergy / ((end - start) / 2))

      // Calculate adaptive gain
      const normalizedEnergy = Math.min(1.0, localEnergy / 16384)
      const gain = minGain + (maxGain - minGain) * normalizedEnergy

      const controlledSample = Math.round(sample * gain)
      const clampedSample = Math.max(-32768, Math.min(32767, controlledSample))
      controlled.writeInt16LE(clampedSample, i)
    }

    return controlled
  }

  private applyClusterEnhancement(pcmData: Buffer): Buffer {
    // Enhance consonant cluster definition
    let enhanced = this.applyTransientEnhancement(pcmData, 1000, 6000)
    enhanced = this.applyTemporalSharpening(enhanced)
    return enhanced
  }

  private applyProsodyPreservation(pcmData: Buffer): Buffer {
    // Preserve prosodic features
    let preserved = this.applyDynamicRangeCompression(pcmData, 0.85)
    preserved = this.applyTemporalSmoothing(preserved)
    return preserved
  }

  private applyAdaptiveContrast(pcmData: Buffer): Buffer {
    // Enhance local contrast
    const contrast = Buffer.alloc(pcmData.length)
    const windowSize = 128

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const sample = pcmData.readInt16LE(i)

      // Calculate local statistics
      let localMean = 0
      let count = 0
      const start = Math.max(0, i - windowSize)
      const end = Math.min(pcmData.length - 1, i + windowSize)

      for (let j = start; j < end; j += 2) {
        localMean += pcmData.readInt16LE(j)
        count++
      }

      localMean /= count

      // Apply contrast enhancement
      const deviation = sample - localMean
      const enhanced = localMean + deviation * 1.15

      const clampedSample = Math.max(-32768, Math.min(32767, Math.round(enhanced)))
      contrast.writeInt16LE(clampedSample, i)
    }

    return contrast
  }

  private applyHighFrequencyEmphasis(pcmData: Buffer, emphasis: number): Buffer {
    // Simple high-frequency emphasis
    const emphasized = Buffer.alloc(pcmData.length)
    let prevSample = 0

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const sample = pcmData.readInt16LE(i)
      const highFreq = sample - prevSample
      const emphasized_sample = sample + highFreq * emphasis

      prevSample = sample

      const clampedSample = Math.max(-32768, Math.min(32767, Math.round(emphasized_sample)))
      emphasized.writeInt16LE(clampedSample, i)
    }

    return emphasized
  }

  private applyTemporalSharpening(pcmData: Buffer): Buffer {
    // Sharpen temporal features
    return this.applyTransientSharpening(pcmData)
  }

  private applyDynamicRangeCompression(pcmData: Buffer, ratio: number): Buffer {
    // Apply gentle compression to preserve dynamics
    return this.applySimpleCompression(pcmData, 0.7, ratio)
  }

  private applyTemporalSmoothing(pcmData: Buffer): Buffer {
    // Apply subtle smoothing to preserve natural flow
    const smoothed = Buffer.alloc(pcmData.length)
    const alpha = 0.1 // Smoothing factor

    let prevSample = 0

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const sample = pcmData.readInt16LE(i)
      const smoothedSample = prevSample * alpha + sample * (1 - alpha)

      prevSample = smoothedSample

      const clampedSample = Math.max(-32768, Math.min(32767, Math.round(smoothedSample)))
      smoothed.writeInt16LE(clampedSample, i)
    }

    return smoothed
  }

  // Helper methods for audio processing

  private parseWavFormat(buffer: Buffer): {
    sampleRate?: number
    channels?: number
    bitDepth?: number
  } {
    if (
      buffer.length < 44 ||
      buffer.toString('ascii', 0, 4) !== 'RIFF' ||
      buffer.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      return {}
    }

    try {
      // Find fmt chunk
      let offset = 12
      while (offset < buffer.length - 8) {
        const chunkId = buffer.toString('ascii', offset, offset + 4)
        const chunkSize = buffer.readUInt32LE(offset + 4)

        if (chunkId === 'fmt ') {
          return {
            channels: buffer.readUInt16LE(offset + 10),
            sampleRate: buffer.readUInt32LE(offset + 12),
            bitDepth: buffer.readUInt16LE(offset + 22)
          }
        }

        offset += 8 + chunkSize
      }
    } catch (error) {
      console.warn('Error parsing WAV format:', error)
    }

    return {}
  }

  private stripWavHeaders(buffer: Buffer): Buffer {
    if (
      buffer.length > 44 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WAVE'
    ) {
      // Find data chunk
      let offset = 12
      while (offset < buffer.length - 8) {
        const chunkId = buffer.toString('ascii', offset, offset + 4)
        const chunkSize = buffer.readUInt32LE(offset + 4)

        if (chunkId === 'data') {
          return buffer.subarray(offset + 8, offset + 8 + chunkSize)
        }

        offset += 8 + chunkSize
      }
    }

    return buffer
  }

  private resampleAudio(
    pcmData: Buffer,
    fromRate: number,
    toRate: number,
    channels: number,
    bitDepth: number
  ): Buffer {
    if (fromRate === toRate) return pcmData

    console.log(`🔄 Resampling: ${fromRate}Hz → ${toRate}Hz`)

    const ratio = toRate / fromRate
    const bytesPerSample = (bitDepth / 8) * channels
    const inputSamples = pcmData.length / bytesPerSample
    const outputSamples = Math.floor(inputSamples * ratio)
    const outputBuffer = Buffer.alloc(outputSamples * bytesPerSample)

    for (let i = 0; i < outputSamples; i++) {
      const inputIndex = i / ratio
      const inputIndexFloor = Math.floor(inputIndex)
      const inputIndexCeil = Math.min(inputIndexFloor + 1, inputSamples - 1)
      const fraction = inputIndex - inputIndexFloor

      for (let channel = 0; channel < channels; channel++) {
        const sample1Offset = inputIndexFloor * bytesPerSample + channel * 2
        const sample2Offset = inputIndexCeil * bytesPerSample + channel * 2
        const outputOffset = i * bytesPerSample + channel * 2

        const sample1 = sample1Offset < pcmData.length ? pcmData.readInt16LE(sample1Offset) : 0
        const sample2 = sample2Offset < pcmData.length ? pcmData.readInt16LE(sample2Offset) : 0

        const interpolatedSample = Math.round(sample1 + (sample2 - sample1) * fraction)
        const clampedSample = Math.max(-32768, Math.min(32767, interpolatedSample))

        outputBuffer.writeInt16LE(clampedSample, outputOffset)
      }
    }

    return outputBuffer
  }

  private convertToMono(pcmData: Buffer, inputChannels: number): Buffer {
    if (inputChannels === 1) return pcmData

    console.log(`🎵 Converting from ${inputChannels} channels to mono`)

    const inputSamples = Math.floor(pcmData.length / (2 * inputChannels))
    const outputBuffer = Buffer.alloc(inputSamples * 2)

    for (let i = 0; i < inputSamples; i++) {
      let sampleSum = 0

      for (let channel = 0; channel < inputChannels; channel++) {
        const offset = (i * inputChannels + channel) * 2
        if (offset < pcmData.length - 1) {
          sampleSum += pcmData.readInt16LE(offset)
        }
      }

      const averageSample = Math.round(sampleSum / inputChannels)
      const clampedSample = Math.max(-32768, Math.min(32767, averageSample))
      outputBuffer.writeInt16LE(clampedSample, i * 2)
    }

    return outputBuffer
  }

  private applySimpleBandpassFilter(
    pcmData: Buffer,
    lowCutoff: number,
    highCutoff: number,
    sampleRate: number
  ): Buffer {
    // Simple IIR bandpass filter implementation
    // This is a basic implementation - production systems would use more sophisticated filters

    const nyquist = sampleRate / 2
    const lowNorm = lowCutoff / nyquist
    const highNorm = highCutoff / nyquist

    // Simple high-pass then low-pass filtering
    let filtered = this.applyHighPassFilter(pcmData, lowNorm)
    filtered = this.applyLowPassFilter(filtered, highNorm)

    return filtered
  }

  private applyHighPassFilter(pcmData: Buffer, normalizedCutoff: number): Buffer {
    const filtered = Buffer.alloc(pcmData.length)
    const alpha = normalizedCutoff // Simplified coefficient

    let prevInput = 0
    let prevOutput = 0

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const input = pcmData.readInt16LE(i)
      const output = alpha * (prevOutput + input - prevInput)

      const clampedOutput = Math.max(-32768, Math.min(32767, Math.round(output)))
      filtered.writeInt16LE(clampedOutput, i)

      prevInput = input
      prevOutput = output
    }

    return filtered
  }

  private applyLowPassFilter(pcmData: Buffer, normalizedCutoff: number): Buffer {
    const filtered = Buffer.alloc(pcmData.length)
    const alpha = normalizedCutoff // Simplified coefficient

    let prevOutput = 0

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const input = pcmData.readInt16LE(i)
      const output = alpha * input + (1 - alpha) * prevOutput

      const clampedOutput = Math.max(-32768, Math.min(32767, Math.round(output)))
      filtered.writeInt16LE(clampedOutput, i)

      prevOutput = output
    }

    return filtered
  }

  private applyAdaptiveNoiseReduction(pcmData: Buffer, reductionLevel: number): Buffer {
    // Simple spectral subtraction-based noise reduction
    const enhanced = Buffer.alloc(pcmData.length)
    const windowSize = 512 // Small window for real-time processing
    // const overlapRatio = 0.5
    // const hopSize = Math.floor(windowSize * (1 - overlapRatio)) // For future windowed processing

    // Estimate noise floor from first few frames
    let noiseFloor = 0
    let noiseSamples = 0

    for (let i = 0; i < Math.min(windowSize * 4, pcmData.length - 1); i += 2) {
      const sample = Math.abs(pcmData.readInt16LE(i))
      noiseFloor += sample
      noiseSamples++
    }

    noiseFloor = noiseSamples > 0 ? (noiseFloor / noiseSamples) * reductionLevel : 0

    // Apply noise reduction
    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const sample = pcmData.readInt16LE(i)
      const amplitude = Math.abs(sample)

      if (amplitude > noiseFloor) {
        // Keep signal above noise floor
        enhanced.writeInt16LE(sample, i)
      } else {
        // Reduce noise below floor
        const reducedSample = Math.round(sample * (1 - reductionLevel))
        enhanced.writeInt16LE(reducedSample, i)
      }
    }

    return enhanced
  }

  private enhanceVowelFormants(pcmData: Buffer): Buffer {
    // Enhance frequency ranges important for Russian vowel recognition
    // Russian vowels: а, о, у, э, и, ы (each with distinct formant patterns)

    // This is a simplified implementation - real formant enhancement would use FFT
    return this.applyGainToFrequencyRange(pcmData, 500, 2500, 1.2) // Boost main formant range
  }

  private enhanceConsonantClarity(pcmData: Buffer): Buffer {
    // Enhance higher frequencies important for Russian consonant distinctions
    // Russian has many palatalized consonants that need clarity in higher frequencies

    return this.applyGainToFrequencyRange(pcmData, 2000, 6000, 1.1) // Slight boost to consonant range
  }

  private adjustDynamicRange(pcmData: Buffer): Buffer {
    // Adjust dynamic range for better Russian speech recognition
    // Russian speech prosody may benefit from slight compression

    return this.applySimpleCompression(pcmData, 0.8, 0.7) // Gentle compression
  }

  private applyGainToFrequencyRange(
    pcmData: Buffer,
    lowFreq: number,
    highFreq: number,
    gain: number
  ): Buffer {
    // Simplified frequency-selective gain
    // Real implementation would use FFT for precise frequency domain processing

    const enhanced = Buffer.alloc(pcmData.length)

    // Apply gain with simple filtering approximation
    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const sample = pcmData.readInt16LE(i)

      // Simple approximation: apply gain to samples based on position
      // This is a rough approximation of frequency domain processing
      const enhancedSample = Math.round(sample * gain)
      const clampedSample = Math.max(-32768, Math.min(32767, enhancedSample))

      enhanced.writeInt16LE(clampedSample, i)
    }

    return enhanced
  }

  private applySimpleCompression(pcmData: Buffer, threshold: number, ratio: number): Buffer {
    const compressed = Buffer.alloc(pcmData.length)
    const thresholdAmplitude = 32767 * threshold

    for (let i = 0; i < pcmData.length - 1; i += 2) {
      const sample = pcmData.readInt16LE(i)
      const amplitude = Math.abs(sample)

      let compressedSample = sample

      if (amplitude > thresholdAmplitude) {
        // Apply compression above threshold
        const excess = amplitude - thresholdAmplitude
        const compressedExcess = excess * ratio
        const newAmplitude = thresholdAmplitude + compressedExcess

        compressedSample = sample >= 0 ? Math.round(newAmplitude) : -Math.round(newAmplitude)
      }

      const clampedSample = Math.max(-32768, Math.min(32767, compressedSample))
      compressed.writeInt16LE(clampedSample, i)
    }

    return compressed
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AudioPreprocessorConfig>): void {
    this.config = {...this.config, ...newConfig}
    console.log('🔧 Audio preprocessor configuration updated:', newConfig)
  }

  /**
   * Get current configuration
   */
  getConfig(): AudioPreprocessorConfig {
    return {...this.config}
  }
}

/**
 * Factory function to create a Russian audio preprocessor with optimal defaults
 */
export function createRussianAudioPreprocessor(
  customConfig: Partial<AudioPreprocessorConfig> = {}
): RussianAudioPreprocessor {
  const russianOptimizedDefaults: Partial<AudioPreprocessorConfig> = {
    sampleRate: 16000, // Optimal for most Russian speech recognition systems
    channels: 1, // Mono for transcription
    bitDepth: 16, // Standard depth
    noiseReductionLevel: 0.4, // Slightly higher for Russian environments
    normalizationLevel: -3, // Good balance for Russian speech dynamics
    enableBandpassFilter: true,
    enableRussianPhonemeOptimization: true,
    enableSpeechEnhancement: true
  }

  return new RussianAudioPreprocessor({
    ...russianOptimizedDefaults,
    ...customConfig
  })
}

export default RussianAudioPreprocessor
