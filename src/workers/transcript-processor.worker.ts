/**
 * Transcript Processing Web Worker
 * Offloads heavy transcript processing from the main thread for better UI performance
 */

// Web Worker type definitions
declare const self: Worker
export {}

interface TranscriptMetadata {
  originalText?: string
  wordCount?: number
  characterCount?: number
  textProcessingTime?: number
  duration?: number
  language?: string
  processingTime?: number
}

interface TranscriptEntry {
  id: string
  text: string
  confidence?: number
  timestamp: number
  isPartial: boolean
  isFinal: boolean
  speakerId?: string
  metadata?: TranscriptMetadata
}

interface SearchOptions {
  caseSensitive?: boolean
  wholeWords?: boolean
  fuzzy?: boolean
  maxResults?: number
}

interface WorkerMessage {
  type:
    | 'processText'
    | 'processEntries'
    | 'searchText'
    | 'compressText'
    | 'analyzeText'
    | 'getStats'
  id: string
  data: {
    text?: string
    entries?: TranscriptEntry[]
    query?: string
    options?: SearchOptions
  }
}

interface WorkerResponse {
  type: 'processed' | 'searchResults' | 'compressed' | 'analyzed' | 'stats' | 'error'
  id: string
  data: unknown
}

/**
 * Advanced text processing utilities for transcript optimization
 */
class TranscriptTextProcessor {
  private processingStats = {
    totalProcessed: 0,
    averageProcessingTime: 0,
    compressionRatio: 0,
    wordCount: 0,
    characterCount: 0
  }

  /**
   * Process and clean transcript text
   */
  processText(text: string): {
    original: string
    cleaned: string
    normalized: string
    wordCount: number
    characterCount: number
    processingTime: number
  } {
    const startTime = performance.now()

    // Clean text - remove extra whitespace, normalize punctuation
    const cleaned = text
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .replace(/\.{2,}/g, '...') // Multiple dots to ellipsis
      .replace(/!{2,}/g, '!') // Multiple exclamations to single
      .replace(/\?{2,}/g, '?') // Multiple questions to single
      .trim()

    // Normalize text - handle common speech recognition artifacts
    const normalized = cleaned
      .replace(/\b(um|uh|ah|er|mm)\b/gi, '') // Remove filler words
      .replace(/\s+/g, ' ') // Clean up spaces after removal
      .replace(/([.!?])\s*([a-z])/g, '$1 $2') // Ensure proper spacing after punctuation
      .trim()

    const wordCount = normalized.split(/\s+/).length
    const characterCount = normalized.length
    const processingTime = performance.now() - startTime

    this.updateStats(processingTime, wordCount, characterCount)

    return {
      original: text,
      cleaned,
      normalized,
      wordCount,
      characterCount,
      processingTime
    }
  }

  /**
   * Process batch of transcript entries
   */
  processEntries(entries: TranscriptEntry[]): {
    processedEntries: TranscriptEntry[]
    totalWords: number
    totalCharacters: number
    averageConfidence: number
    processingTime: number
  } {
    const startTime = performance.now()
    let totalWords = 0
    let totalCharacters = 0
    let totalConfidence = 0
    let confidenceCount = 0

    const processedEntries = entries.map(entry => {
      const processed = this.processText(entry.text)

      totalWords += processed.wordCount
      totalCharacters += processed.characterCount

      if (entry.confidence !== undefined) {
        totalConfidence += entry.confidence
        confidenceCount++
      }

      return {
        ...entry,
        text: processed.normalized,
        metadata: {
          ...entry.metadata,
          originalText: processed.original,
          wordCount: processed.wordCount,
          characterCount: processed.characterCount,
          textProcessingTime: processed.processingTime
        }
      }
    })

    const processingTime = performance.now() - startTime
    const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0

    return {
      processedEntries,
      totalWords,
      totalCharacters,
      averageConfidence,
      processingTime
    }
  }

  /**
   * Search through text with advanced options
   */
  searchText(
    entries: TranscriptEntry[],
    query: string,
    options: {
      caseSensitive?: boolean
      wholeWords?: boolean
      fuzzy?: boolean
      maxResults?: number
    } = {}
  ): {
    results: Array<TranscriptEntry & {matchScore: number; matchContext: string}>
    searchTime: number
  } {
    const startTime = performance.now()
    const results: Array<TranscriptEntry & {matchScore: number; matchContext: string}> = []

    const searchTerm = options.caseSensitive ? query : query.toLowerCase()
    const regex = options.wholeWords
      ? new RegExp(`\\b${escapeRegex(searchTerm)}\\b`, options.caseSensitive ? 'g' : 'gi')
      : new RegExp(escapeRegex(searchTerm), options.caseSensitive ? 'g' : 'gi')

    for (const entry of entries) {
      const text = options.caseSensitive ? entry.text : entry.text.toLowerCase()
      const matches = text.match(regex)

      if (matches) {
        const matchScore = matches.length / entry.text.split(' ').length
        const matchContext = this.extractMatchContext(entry.text, query, 50)

        results.push({
          ...entry,
          matchScore,
          matchContext
        })
      }
    }

    // Sort by match score (relevance)
    results.sort((a, b) => b.matchScore - a.matchScore)

    // Limit results
    const limitedResults = options.maxResults ? results.slice(0, options.maxResults) : results

    const searchTime = performance.now() - startTime

    return {
      results: limitedResults,
      searchTime
    }
  }

  /**
   * Compress text for storage efficiency
   */
  compressText(text: string): {
    compressed: string
    originalSize: number
    compressedSize: number
    compressionRatio: number
    compressionTime: number
  } {
    const startTime = performance.now()
    const originalSize = text.length

    // Simple compression - remove redundant words and compress common patterns
    let compressed = text
      .replace(/\b(the|a|an)\s+/gi, '') // Remove articles
      .replace(/\b(is|are|was|were)\s+/gi, '') // Remove common verbs
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()

    // Further compression for repeated phrases
    const words = compressed.split(' ')
    const wordFreq = new Map<string, number>()

    words.forEach(word => {
      const count = wordFreq.get(word) || 0
      wordFreq.set(word, count + 1)
    })

    // Replace frequent words with shorter tokens
    const frequentWords = Array.from(wordFreq.entries())
      .filter(([, count]) => count > 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)

    frequentWords.forEach(([word], index) => {
      const token = `~${index}`
      compressed = compressed.replace(new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi'), token)
    })

    const compressedSize = compressed.length
    const compressionRatio = originalSize > 0 ? (originalSize - compressedSize) / originalSize : 0
    const compressionTime = performance.now() - startTime

    return {
      compressed,
      originalSize,
      compressedSize,
      compressionRatio,
      compressionTime
    }
  }

  /**
   * Analyze text for insights
   */
  analyzeText(text: string): {
    wordCount: number
    sentenceCount: number
    averageWordsPerSentence: number
    readabilityScore: number
    keyWords: string[]
    sentiment: 'positive' | 'negative' | 'neutral'
    topics: string[]
    analysisTime: number
  } {
    const startTime = performance.now()

    const words = text.split(/\s+/).filter(word => word.length > 0)
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)

    const wordCount = words.length
    const sentenceCount = sentences.length
    const averageWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0

    // Simple readability score (Flesch-like)
    const averageSentenceLength = averageWordsPerSentence
    const syllableCount = this.estimateSyllables(text)
    const averageSyllablesPerWord = wordCount > 0 ? syllableCount / wordCount : 0

    const readabilityScore = Math.max(
      0,
      206.835 - 1.015 * averageSentenceLength - 84.6 * averageSyllablesPerWord
    )

    // Extract key words (simple frequency analysis)
    const wordFreq = new Map<string, number>()
    words.forEach(word => {
      const cleanWord = word.toLowerCase().replace(/[^\w]/g, '')
      if (cleanWord.length > 3) {
        wordFreq.set(cleanWord, (wordFreq.get(cleanWord) || 0) + 1)
      }
    })

    const keyWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word)

    // Simple sentiment analysis (keyword-based)
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic']
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'disappointing', 'poor']

    const lowerText = text.toLowerCase()
    const positiveCount = positiveWords.reduce(
      (count, word) => count + (lowerText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length,
      0
    )
    const negativeCount = negativeWords.reduce(
      (count, word) => count + (lowerText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length,
      0
    )

    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral'
    if (positiveCount > negativeCount) sentiment = 'positive'
    else if (negativeCount > positiveCount) sentiment = 'negative'

    // Topic extraction (simplified)
    const topics = this.extractTopics(text)

    const analysisTime = performance.now() - startTime

    return {
      wordCount,
      sentenceCount,
      averageWordsPerSentence,
      readabilityScore,
      keyWords,
      sentiment,
      topics,
      analysisTime
    }
  }

  /**
   * Get processing statistics
   */
  getStats() {
    return {...this.processingStats}
  }

  // Helper methods
  private updateStats(processingTime: number, wordCount: number, characterCount: number): void {
    this.processingStats.totalProcessed++
    this.processingStats.averageProcessingTime =
      (this.processingStats.averageProcessingTime + processingTime) /
      this.processingStats.totalProcessed
    this.processingStats.wordCount += wordCount
    this.processingStats.characterCount += characterCount
  }

  private extractMatchContext(text: string, query: string, contextLength: number): string {
    const index = text.toLowerCase().indexOf(query.toLowerCase())
    if (index === -1) return text.substring(0, contextLength)

    const start = Math.max(0, index - contextLength / 2)
    const end = Math.min(text.length, index + query.length + contextLength / 2)

    return text.substring(start, end)
  }

  private estimateSyllables(text: string): number {
    // Simple syllable estimation
    const words = text.split(/\s+/)
    return words.reduce((total, word) => {
      const vowels = word.toLowerCase().match(/[aeiouy]+/g)
      return total + (vowels ? vowels.length : 1)
    }, 0)
  }

  private extractTopics(text: string): string[] {
    // Simple topic extraction based on noun frequency
    const words = text.toLowerCase().split(/\s+/)
    const nouns = words.filter(
      word =>
        word.length > 4 &&
        !['this', 'that', 'they', 'them', 'with', 'from', 'were', 'been'].includes(word)
    )

    const freq = new Map<string, number>()
    nouns.forEach(noun => {
      freq.set(noun, (freq.get(noun) || 0) + 1)
    })

    return Array.from(freq.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word]) => word)
  }
}

// Helper function to escape regex special characters
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Initialize processor
const processor = new TranscriptTextProcessor()

// Handle messages from main thread
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const {type, id, data} = event.data

  try {
    let result: unknown

    switch (type) {
      case 'processText':
        if (!data.text) throw new Error('Text is required for processText')
        result = processor.processText(data.text)
        break

      case 'processEntries':
        if (!data.entries) throw new Error('Entries are required for processEntries')
        result = processor.processEntries(data.entries)
        break

      case 'searchText':
        if (!data.entries || !data.query)
          throw new Error('Entries and query are required for searchText')
        result = processor.searchText(data.entries, data.query, data.options || {})
        break

      case 'compressText':
        if (!data.text) throw new Error('Text is required for compressText')
        result = processor.compressText(data.text)
        break

      case 'analyzeText':
        if (!data.text) throw new Error('Text is required for analyzeText')
        result = processor.analyzeText(data.text)
        break

      case 'getStats':
        result = processor.getStats()
        break

      default:
        throw new Error(`Unknown message type: ${type}`)
    }

    const response: WorkerResponse = {
      type:
        type === 'searchText'
          ? 'searchResults'
          : type === 'compressText'
            ? 'compressed'
            : type === 'analyzeText'
              ? 'analyzed'
              : type === 'getStats'
                ? 'stats'
                : 'processed',
      id,
      data: result
    }

    self.postMessage(response)
  } catch (error) {
    const errorResponse: WorkerResponse = {
      type: 'error',
      id,
      data: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    }

    self.postMessage(errorResponse)
  }
}
