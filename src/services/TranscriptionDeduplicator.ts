/**
 * TranscriptionDeduplicator - Eliminates duplicate transcription entries
 *
 * This service handles deduplication of transcriptions to ensure each unique
 * transcription appears only once in the analysis view, eliminating duplicates
 * caused by multiple sources, processing pipelines, or state synchronization.
 */

export interface Transcription {
  id: string
  text: string
  timestamp: number
  confidence?: number
  source?: string
  [key: string]: unknown // Allow for additional metadata
}

export interface DeduplicationConfig {
  deduplicateById: boolean
  deduplicateByContent: boolean
  deduplicateByTimestamp: boolean
  timeThreshold: number // in milliseconds
  contentSimilarityThreshold: number // 0-1, for fuzzy matching
  enableFuzzyMatching: boolean
}

export interface DeduplicationResult {
  deduplicated: Transcription[]
  removed: Transcription[]
  duplicateCount: number
  removalReasons: Array<{
    originalId: string
    duplicateId: string
    reason: 'exact_id' | 'exact_content' | 'similar_content' | 'time_proximity'
  }>
}

export interface DuplicateLogEntry {
  timestamp: number
  originalCount: number
  deduplicatedCount: number
  removedCount: number
  reasons: Record<string, number>
}

export class TranscriptionDeduplicator {
  private config: DeduplicationConfig
  private seen: Set<string> = new Set()
  private duplicateLog: DuplicateLogEntry[] = []

  constructor(config: Partial<DeduplicationConfig> = {}) {
    this.config = {
      deduplicateById: true,
      deduplicateByContent: true,
      deduplicateByTimestamp: true,
      timeThreshold: 5000, // 5 seconds
      contentSimilarityThreshold: 0.9, // 90% similarity
      enableFuzzyMatching: false, // Disabled by default for performance
      ...config
    }
  }

  /**
   * Main deduplication method that applies all configured strategies
   */
  deduplicate(transcriptions: Transcription[]): DeduplicationResult {
    const startTime = performance.now()
    let result = [...transcriptions]
    const removed: Transcription[] = []
    const removalReasons: Array<{
      originalId: string
      duplicateId: string
      reason: 'exact_id' | 'exact_content' | 'similar_content' | 'time_proximity'
    }> = []

    // Strategy 1: Deduplicate by exact ID matches
    if (this.config.deduplicateById) {
      const idResult = this.deduplicateById(result)
      result = idResult.deduplicated
      removed.push(...idResult.removed)
      idResult.removed.forEach(removedItem => {
        const original = result.find(t => t.id === removedItem.id)
        if (original) {
          removalReasons.push({
            originalId: original.id,
            duplicateId: removedItem.id,
            reason: 'exact_id'
          })
        }
      })
    }

    // Strategy 2: Deduplicate by content and timestamp proximity
    if (this.config.deduplicateByContent || this.config.deduplicateByTimestamp) {
      const contentResult = this.deduplicateByContentAndTime(result)
      result = contentResult.deduplicated
      removed.push(...contentResult.removed)

      // Track removal reasons for content/time deduplication
      contentResult.removed.forEach(removedItem => {
        const original = result.find(
          t =>
            this.areContentSimilar(t.text, removedItem.text) ||
            Math.abs(t.timestamp - removedItem.timestamp) < this.config.timeThreshold
        )
        if (original) {
          const isSimilarContent = this.areContentSimilar(original.text, removedItem.text)

          removalReasons.push({
            originalId: original.id,
            duplicateId: removedItem.id,
            reason: isSimilarContent ? 'exact_content' : 'time_proximity'
          })
        }
      })
    }

    // Strategy 3: Fuzzy content matching (if enabled)
    if (this.config.enableFuzzyMatching) {
      const fuzzyResult = this.deduplicateByFuzzyContent(result)
      result = fuzzyResult.deduplicated
      removed.push(...fuzzyResult.removed)

      fuzzyResult.removed.forEach(removedItem => {
        const original = result.find(
          t =>
            this.calculateSimilarity(t.text, removedItem.text) >=
            this.config.contentSimilarityThreshold
        )
        if (original) {
          removalReasons.push({
            originalId: original.id,
            duplicateId: removedItem.id,
            reason: 'similar_content'
          })
        }
      })
    }

    const processingTime = performance.now() - startTime

    // Log the deduplication operation
    this.logDeduplicationOperation(
      transcriptions.length,
      result.length,
      removalReasons,
      processingTime
    )

    return {
      deduplicated: result,
      removed,
      duplicateCount: removed.length,
      removalReasons
    }
  }

  /**
   * Deduplicate by exact ID matches
   */
  private deduplicateById(transcriptions: Transcription[]): {
    deduplicated: Transcription[]
    removed: Transcription[]
  } {
    const seen = new Set<string>()
    const deduplicated: Transcription[] = []
    const removed: Transcription[] = []

    for (const transcript of transcriptions) {
      if (seen.has(transcript.id)) {
        removed.push(transcript)
      } else {
        seen.add(transcript.id)
        deduplicated.push(transcript)
      }
    }

    return {deduplicated, removed}
  }

  /**
   * Deduplicate by content and timestamp proximity
   */
  private deduplicateByContentAndTime(transcriptions: Transcription[]): {
    deduplicated: Transcription[]
    removed: Transcription[]
  } {
    const result: Transcription[] = []
    const removed: Transcription[] = []

    // Sort by timestamp for efficient comparison
    const sorted = [...transcriptions].sort((a, b) => a.timestamp - b.timestamp)

    for (const current of sorted) {
      let isDuplicate = false

      // Check against already added transcripts
      for (const existing of result) {
        const isContentDuplicate =
          this.config.deduplicateByContent && this.areContentSimilar(existing.text, current.text)

        const isTimeProximate =
          this.config.deduplicateByTimestamp &&
          Math.abs(existing.timestamp - current.timestamp) < this.config.timeThreshold

        // Consider it a duplicate if both content is similar AND timestamps are close
        if (isContentDuplicate && isTimeProximate) {
          isDuplicate = true
          break
        }

        // Or if they're exact content matches regardless of time
        if (isContentDuplicate && existing.text.trim() === current.text.trim()) {
          isDuplicate = true
          break
        }
      }

      if (isDuplicate) {
        removed.push(current)
      } else {
        result.push(current)
      }
    }

    return {deduplicated: result, removed}
  }

  /**
   * Deduplicate by fuzzy content matching
   */
  private deduplicateByFuzzyContent(transcriptions: Transcription[]): {
    deduplicated: Transcription[]
    removed: Transcription[]
  } {
    const result: Transcription[] = []
    const removed: Transcription[] = []

    for (const current of transcriptions) {
      let isDuplicate = false

      for (const existing of result) {
        const similarity = this.calculateSimilarity(existing.text, current.text)
        if (similarity >= this.config.contentSimilarityThreshold) {
          isDuplicate = true
          break
        }
      }

      if (isDuplicate) {
        removed.push(current)
      } else {
        result.push(current)
      }
    }

    return {deduplicated: result, removed}
  }

  /**
   * Check if two texts are considered similar (exact match with normalization)
   */
  private areContentSimilar(text1: string, text2: string): boolean {
    const normalize = (text: string) =>
      text
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,!?;:]/g, '')

    return normalize(text1) === normalize(text2)
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const normalize = (text: string) => text.trim().toLowerCase()
    const a = normalize(str1)
    const b = normalize(str2)

    if (a === b) return 1.0
    if (a.length === 0 || b.length === 0) return 0.0

    const matrix: number[][] = []

    // Initialize the matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j
    }

    // Fill the matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        }
      }
    }

    const maxLength = Math.max(a.length, b.length)
    const distance = matrix[b.length][a.length]

    return (maxLength - distance) / maxLength
  }

  /**
   * Log deduplication operation for analysis
   */
  private logDeduplicationOperation(
    originalCount: number,
    deduplicatedCount: number,
    reasons: Array<{reason: string}>,
    processingTime: number
  ): void {
    const removedCount = originalCount - deduplicatedCount

    if (removedCount > 0) {
      const reasonCounts = reasons.reduce(
        (acc, {reason}) => {
          acc[reason] = (acc[reason] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )

      const logEntry: DuplicateLogEntry = {
        timestamp: Date.now(),
        originalCount,
        deduplicatedCount,
        removedCount,
        reasons: reasonCounts
      }

      this.duplicateLog.push(logEntry)

      // Keep only recent entries (last 100)
      if (this.duplicateLog.length > 100) {
        this.duplicateLog = this.duplicateLog.slice(-100)
      }

      console.log(
        `🔄 TranscriptionDeduplicator: Removed ${removedCount} duplicates in ${processingTime.toFixed(2)}ms`
      )
      console.log('   Reasons:', reasonCounts)
    }
  }

  /**
   * Get deduplication statistics
   */
  getDuplicationStats(): {
    totalOperations: number
    totalRemoved: number
    averageProcessingTime: number
    reasonBreakdown: Record<string, number>
    recentActivity: DuplicateLogEntry[]
  } {
    const totalOperations = this.duplicateLog.length
    const totalRemoved = this.duplicateLog.reduce((sum, entry) => sum + entry.removedCount, 0)

    const reasonBreakdown = this.duplicateLog.reduce(
      (acc, entry) => {
        Object.entries(entry.reasons).forEach(([reason, count]) => {
          acc[reason] = (acc[reason] || 0) + count
        })
        return acc
      },
      {} as Record<string, number>
    )

    return {
      totalOperations,
      totalRemoved,
      averageProcessingTime: 0, // Would need to track processing times in log entries
      reasonBreakdown,
      recentActivity: this.duplicateLog.slice(-10) // Last 10 operations
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<DeduplicationConfig>): void {
    this.config = {...this.config, ...newConfig}
  }

  /**
   * Clear internal state and logs
   */
  reset(): void {
    this.seen.clear()
    this.duplicateLog = []
  }

  /**
   * Get current configuration
   */
  getConfig(): DeduplicationConfig {
    return {...this.config}
  }
}

/**
 * Factory function to create a TranscriptionDeduplicator with default configuration
 */
export function createTranscriptionDeduplicator(
  config: Partial<DeduplicationConfig> = {}
): TranscriptionDeduplicator {
  return new TranscriptionDeduplicator(config)
}

/**
 * Utility function for quick deduplication without class instantiation
 */
export function deduplicateTranscriptions(
  transcriptions: Transcription[],
  config: Partial<DeduplicationConfig> = {}
): DeduplicationResult {
  const deduplicator = createTranscriptionDeduplicator(config)
  return deduplicator.deduplicate(transcriptions)
}

// Export default instance for global use
export const globalTranscriptionDeduplicator = createTranscriptionDeduplicator({
  deduplicateById: true,
  deduplicateByContent: true,
  deduplicateByTimestamp: true,
  timeThreshold: 3000, // 3 seconds for global use
  contentSimilarityThreshold: 0.95,
  enableFuzzyMatching: false // Keep it fast by default
})
