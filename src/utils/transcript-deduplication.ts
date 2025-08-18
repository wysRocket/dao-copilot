/**
 * Transcript Deduplication Utilities
 *
 * Enhanced duplicate detection and transcript processing utilities to ensure
 * consistent unique identification and prevent duplicate transcript blocks
 * in the UI and state management.
 */

import {TranscriptionResult} from '../state/TranscriptionStateManager'

/**
 * Generate a deterministic unique ID for a transcript
 * Ensures consistent identification across components and state management
 */
export function generateTranscriptId(
  transcript: Omit<TranscriptionResult, 'id'> | TranscriptionResult
): string {
  // If transcript already has an ID, validate and use it
  if ('id' in transcript && transcript.id && typeof transcript.id === 'string') {
    return transcript.id
  }

  // Generate a deterministic ID based on content and metadata
  const baseString = [
    transcript.text?.trim(),
    transcript.timestamp?.toString(),
    transcript.source || 'unknown',
    transcript.confidence?.toString() || '0'
  ]
    .filter(Boolean)
    .join('|')

  // Create a hash of the base string for uniqueness
  let hash = 0
  for (let i = 0; i < baseString.length; i++) {
    const char = baseString.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }

  return `transcript-${Math.abs(hash)}-${transcript.timestamp || Date.now()}`
}

/**
 * Enhanced duplicate detection with multiple strategies
 */
export interface DuplicateDetectionOptions {
  /** Use exact ID matching as primary strategy */
  checkIds: boolean
  /** Use content + timestamp matching */
  checkContentAndTimestamp: boolean
  /** Use fuzzy content matching for near-duplicates */
  checkFuzzyContent: boolean
  /** Similarity threshold for fuzzy matching (0-1) */
  fuzzyThreshold: number
  /** Time window for grouping similar transcripts (ms) */
  timeWindow: number
}

const DEFAULT_DETECTION_OPTIONS: DuplicateDetectionOptions = {
  checkIds: true,
  checkContentAndTimestamp: true,
  checkFuzzyContent: false, // Disabled by default for performance
  fuzzyThreshold: 0.9,
  timeWindow: 5000 // 5 seconds
}

/**
 * Check if two transcripts are duplicates using multiple strategies
 */
export function areTranscriptsDuplicate(
  transcript1: TranscriptionResult,
  transcript2: TranscriptionResult,
  options: Partial<DuplicateDetectionOptions> = {}
): boolean {
  const opts = {...DEFAULT_DETECTION_OPTIONS, ...options}

  // Strategy 1: ID-based comparison (most reliable)
  if (opts.checkIds && transcript1.id && transcript2.id) {
    if (transcript1.id === transcript2.id) {
      return true
    }
    // If IDs are different, they're definitely different transcripts
    if (transcript1.id !== transcript2.id) {
      return false
    }
  }

  // Strategy 2: Content + timestamp exact match
  if (opts.checkContentAndTimestamp) {
    const exactMatch =
      transcript1.text === transcript2.text && transcript1.timestamp === transcript2.timestamp
    if (exactMatch) {
      return true
    }
  }

  // Strategy 3: Fuzzy content matching within time window
  if (opts.checkFuzzyContent) {
    const timeDiff = Math.abs((transcript1.timestamp || 0) - (transcript2.timestamp || 0))
    if (timeDiff <= opts.timeWindow) {
      const similarity = calculateTextSimilarity(transcript1.text, transcript2.text)
      if (similarity >= opts.fuzzyThreshold) {
        return true
      }
    }
  }

  return false
}

/**
 * Process an array of transcripts to remove duplicates
 */
export function processTranscripts(
  transcripts: TranscriptionResult[],
  options: Partial<DuplicateDetectionOptions> = {}
): TranscriptionResult[] {
  if (!Array.isArray(transcripts) || transcripts.length === 0) {
    return []
  }

  const opts = {...DEFAULT_DETECTION_OPTIONS, ...options}
  const uniqueTranscripts = new Map<string, TranscriptionResult>()

  // Sort transcripts by timestamp to ensure consistent processing
  const sortedTranscripts = [...transcripts].sort((a, b) => {
    const timeA = a.timestamp || 0
    const timeB = b.timestamp || 0
    return timeA - timeB
  })

  for (const transcript of sortedTranscripts) {
    // Ensure transcript has an ID
    const transcriptWithId: TranscriptionResult = {
      ...transcript,
      id: transcript.id || generateTranscriptId(transcript)
    }

    // Check for duplicates against existing transcripts
    let isDuplicate = false

    for (const [existingId, existingTranscript] of uniqueTranscripts) {
      if (areTranscriptsDuplicate(transcriptWithId, existingTranscript, opts)) {
        isDuplicate = true

        // If we found a duplicate, keep the one with higher confidence
        if ((transcriptWithId.confidence || 0) > (existingTranscript.confidence || 0)) {
          uniqueTranscripts.set(existingId, transcriptWithId)
          console.debug('Transcript duplicate: Replaced with higher confidence version', {
            originalId: existingTranscript.id,
            newId: transcriptWithId.id,
            originalConfidence: existingTranscript.confidence,
            newConfidence: transcriptWithId.confidence
          })
        } else {
          console.debug('Transcript duplicate: Kept existing higher confidence version', {
            existingId: existingTranscript.id,
            duplicateId: transcriptWithId.id
          })
        }
        break
      }
    }

    // Add if not duplicate
    if (!isDuplicate) {
      uniqueTranscripts.set(transcriptWithId.id, transcriptWithId)
    }
  }

  return Array.from(uniqueTranscripts.values()).sort((a, b) => {
    const timeA = a.timestamp || 0
    const timeB = b.timestamp || 0
    return timeA - timeB
  })
}

/**
 * Calculate text similarity using simple word-based algorithm
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0
  if (text1 === text2) return 1

  const words1 = text1.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const words2 = text2.toLowerCase().trim().split(/\s+/).filter(Boolean)

  if (words1.length === 0 && words2.length === 0) return 1
  if (words1.length === 0 || words2.length === 0) return 0

  // Calculate Jaccard similarity (intersection over union)
  const set1 = new Set(words1)
  const set2 = new Set(words2)

  const intersection = new Set([...set1].filter(word => set2.has(word)))
  const union = new Set([...set1, ...set2])

  return intersection.size / union.size
}

/**
 * Validate transcript structure and ensure required fields
 */
export function validateTranscript(transcript: unknown): transcript is TranscriptionResult {
  if (!transcript || typeof transcript !== 'object' || transcript === null) {
    return false
  }

  const obj = transcript as Record<string, unknown>

  // Check required text field
  if (typeof obj.text !== 'string' || obj.text.length === 0) {
    return false
  }

  // Check optional fields
  if (obj.timestamp !== undefined && typeof obj.timestamp !== 'number') {
    return false
  }

  if (obj.confidence !== undefined && typeof obj.confidence !== 'number') {
    return false
  }

  if (obj.source !== undefined && typeof obj.source !== 'string') {
    return false
  }

  return true
}

/**
 * Sanitize and normalize transcript data
 */
export function sanitizeTranscript(transcript: unknown): TranscriptionResult | null {
  if (!validateTranscript(transcript)) {
    console.warn('Invalid transcript data:', transcript)
    return null
  }

  const sanitized: TranscriptionResult = {
    id: transcript.id || generateTranscriptId(transcript),
    text: transcript.text.trim(),
    timestamp: transcript.timestamp || Date.now(),
    confidence:
      typeof transcript.confidence === 'number'
        ? Math.max(0, Math.min(1, transcript.confidence))
        : undefined,
    source: transcript.source || 'unknown'
  }

  // Add optional fields if present
  if ('duration' in transcript && transcript.duration !== undefined) {
    sanitized.duration = transcript.duration as number
  }
  if ('startTime' in transcript && transcript.startTime !== undefined) {
    sanitized.startTime = transcript.startTime as number
  }
  if ('endTime' in transcript && transcript.endTime !== undefined) {
    sanitized.endTime = transcript.endTime as number
  }

  return sanitized
}

/**
 * Performance metrics for duplicate detection
 */
export interface DeduplicationMetrics {
  totalProcessed: number
  duplicatesFound: number
  processingTimeMs: number
  uniqueTranscripts: number
}

/**
 * Process transcripts with performance monitoring
 */
export function processTranscriptsWithMetrics(
  transcripts: TranscriptionResult[],
  options: Partial<DuplicateDetectionOptions> = {}
): {transcripts: TranscriptionResult[]; metrics: DeduplicationMetrics} {
  const startTime = performance.now()
  const originalCount = transcripts.length

  const processedTranscripts = processTranscripts(transcripts, options)

  const endTime = performance.now()
  const metrics: DeduplicationMetrics = {
    totalProcessed: originalCount,
    duplicatesFound: originalCount - processedTranscripts.length,
    processingTimeMs: endTime - startTime,
    uniqueTranscripts: processedTranscripts.length
  }

  if (metrics.duplicatesFound > 0) {
    console.log('Transcript deduplication completed:', metrics)
  }

  return {transcripts: processedTranscripts, metrics}
}
