/**
 * Text Differ Utility
 *
 * Provides efficient text diffing algorithms for identifying changes between
 * old and new text versions, enabling smooth correction animations.
 */

/**
 * Types of text differences
 */
export type DiffType = 'insert' | 'delete' | 'replace' | 'unchanged'

/**
 * Represents a single text difference
 */
export interface TextDiff {
  /** Type of difference */
  type: DiffType
  /** Original text (for delete/replace operations) */
  oldText?: string
  /** New text (for insert/replace operations) */
  newText?: string
  /** Position in the original text */
  position: number
  /** Length of the operation */
  length: number
  /** Unique identifier for tracking animations */
  id: string
}

/**
 * Word-level difference for more granular corrections
 */
export interface WordDiff extends TextDiff {
  /** Word index in the text */
  wordIndex: number
  /** Character offset within the word */
  charOffset: number
}

/**
 * Configuration for diff algorithm behavior
 */
export interface DiffConfig {
  /** Minimum word length to consider for word-level diffing */
  minWordLength?: number
  /** Whether to perform character-level diffing within words */
  enableCharacterDiff?: boolean
  /** Whether to ignore case differences */
  ignoreCase?: boolean
  /** Whether to ignore whitespace differences */
  ignoreWhitespace?: boolean
  /** Maximum edit distance for considering words similar */
  maxEditDistance?: number
}

/**
 * Default configuration for text diffing
 */
const defaultConfig: Required<DiffConfig> = {
  minWordLength: 2,
  enableCharacterDiff: true,
  ignoreCase: false,
  ignoreWhitespace: false,
  maxEditDistance: 3
}

/**
 * Text Differ Class
 *
 * Provides efficient algorithms for text comparison and difference detection
 */
export class TextDiffer {
  private config: Required<DiffConfig>
  private idCounter = 0

  constructor(config: DiffConfig = {}) {
    this.config = {...defaultConfig, ...config}
  }

  /**
   * Generate a unique ID for diff operations
   */
  private generateId(): string {
    return `diff-${Date.now()}-${++this.idCounter}`
  }

  /**
   * Normalize text based on configuration
   */
  private normalizeText(text: string): string {
    let normalized = text

    if (this.config.ignoreCase) {
      normalized = normalized.toLowerCase()
    }

    if (this.config.ignoreWhitespace) {
      normalized = normalized.replace(/\s+/g, ' ').trim()
    }

    return normalized
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null))

    for (let i = 0; i <= str1.length; i += 1) {
      matrix[0][i] = i
    }

    for (let j = 0; j <= str2.length; j += 1) {
      matrix[j][0] = j
    }

    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        )
      }
    }

    return matrix[str2.length][str1.length]
  }

  /**
   * Split text into words with position tracking
   */
  private tokenizeWithPositions(text: string): Array<{word: string; start: number; end: number}> {
    const tokens: Array<{word: string; start: number; end: number}> = []
    const regex = /\S+/g
    let match

    while ((match = regex.exec(text)) !== null) {
      tokens.push({
        word: match[0],
        start: match.index,
        end: match.index + match[0].length
      })
    }

    return tokens
  }

  /**
   * Perform character-level diffing using Myers algorithm
   */
  public characterDiff(oldText: string, newText: string): TextDiff[] {
    const normalizedOld = this.normalizeText(oldText)
    const normalizedNew = this.normalizeText(newText)

    const diffs: TextDiff[] = []
    const oldLen = normalizedOld.length
    const newLen = normalizedNew.length

    // Simple implementation - can be optimized with Myers algorithm
    let oldPos = 0
    let newPos = 0

    while (oldPos < oldLen || newPos < newLen) {
      if (oldPos >= oldLen) {
        // Insertion at end
        diffs.push({
          type: 'insert',
          newText: normalizedNew.slice(newPos),
          position: oldPos,
          length: newLen - newPos,
          id: this.generateId()
        })
        break
      }

      if (newPos >= newLen) {
        // Deletion at end
        diffs.push({
          type: 'delete',
          oldText: normalizedOld.slice(oldPos),
          position: oldPos,
          length: oldLen - oldPos,
          id: this.generateId()
        })
        break
      }

      if (normalizedOld[oldPos] === normalizedNew[newPos]) {
        // Characters match
        let matchLength = 1
        while (
          oldPos + matchLength < oldLen &&
          newPos + matchLength < newLen &&
          normalizedOld[oldPos + matchLength] === normalizedNew[newPos + matchLength]
        ) {
          matchLength++
        }

        diffs.push({
          type: 'unchanged',
          oldText: normalizedOld.slice(oldPos, oldPos + matchLength),
          newText: normalizedNew.slice(newPos, newPos + matchLength),
          position: oldPos,
          length: matchLength,
          id: this.generateId()
        })

        oldPos += matchLength
        newPos += matchLength
      } else {
        // Find next matching character
        let nextMatch = -1
        let nextMatchInNew = -1

        for (let i = 1; i < Math.min(10, Math.max(oldLen - oldPos, newLen - newPos)); i++) {
          if (
            oldPos + i < oldLen &&
            newPos + i < newLen &&
            normalizedOld[oldPos + i] === normalizedNew[newPos + i]
          ) {
            nextMatch = i
            nextMatchInNew = i
            break
          }

          // Check for insertions
          if (newPos + i < newLen && normalizedOld[oldPos] === normalizedNew[newPos + i]) {
            nextMatchInNew = i
            break
          }

          // Check for deletions
          if (oldPos + i < oldLen && normalizedOld[oldPos + i] === normalizedNew[newPos]) {
            nextMatch = i
            break
          }
        }

        if (nextMatch > 0 && nextMatchInNew === nextMatch) {
          // Replace operation
          diffs.push({
            type: 'replace',
            oldText: normalizedOld.slice(oldPos, oldPos + nextMatch),
            newText: normalizedNew.slice(newPos, newPos + nextMatch),
            position: oldPos,
            length: nextMatch,
            id: this.generateId()
          })
          oldPos += nextMatch
          newPos += nextMatch
        } else if (nextMatchInNew > 0) {
          // Insert operation
          diffs.push({
            type: 'insert',
            newText: normalizedNew.slice(newPos, newPos + nextMatchInNew),
            position: oldPos,
            length: nextMatchInNew,
            id: this.generateId()
          })
          newPos += nextMatchInNew
        } else if (nextMatch > 0) {
          // Delete operation
          diffs.push({
            type: 'delete',
            oldText: normalizedOld.slice(oldPos, oldPos + nextMatch),
            position: oldPos,
            length: nextMatch,
            id: this.generateId()
          })
          oldPos += nextMatch
        } else {
          // Single character operation
          diffs.push({
            type: 'replace',
            oldText: normalizedOld[oldPos],
            newText: normalizedNew[newPos],
            position: oldPos,
            length: 1,
            id: this.generateId()
          })
          oldPos++
          newPos++
        }
      }
    }

    return diffs
  }

  /**
   * Perform word-level diffing for better readability
   */
  public wordDiff(oldText: string, newText: string): WordDiff[] {
    const oldTokens = this.tokenizeWithPositions(oldText)
    const newTokens = this.tokenizeWithPositions(newText)

    const diffs: WordDiff[] = []
    let oldIndex = 0
    let newIndex = 0

    while (oldIndex < oldTokens.length || newIndex < newTokens.length) {
      if (oldIndex >= oldTokens.length) {
        // Remaining words are insertions
        for (let i = newIndex; i < newTokens.length; i++) {
          const token = newTokens[i]
          diffs.push({
            type: 'insert',
            newText: token.word,
            position: oldText.length,
            length: token.word.length,
            wordIndex: i,
            charOffset: token.start,
            id: this.generateId()
          })
        }
        break
      }

      if (newIndex >= newTokens.length) {
        // Remaining words are deletions
        for (let i = oldIndex; i < oldTokens.length; i++) {
          const token = oldTokens[i]
          diffs.push({
            type: 'delete',
            oldText: token.word,
            position: token.start,
            length: token.word.length,
            wordIndex: i,
            charOffset: token.start,
            id: this.generateId()
          })
        }
        break
      }

      const oldToken = oldTokens[oldIndex]
      const newToken = newTokens[newIndex]

      if (this.normalizeText(oldToken.word) === this.normalizeText(newToken.word)) {
        // Words match
        diffs.push({
          type: 'unchanged',
          oldText: oldToken.word,
          newText: newToken.word,
          position: oldToken.start,
          length: oldToken.word.length,
          wordIndex: oldIndex,
          charOffset: oldToken.start,
          id: this.generateId()
        })
        oldIndex++
        newIndex++
      } else {
        // Check if words are similar (typo correction)
        const distance = this.levenshteinDistance(
          this.normalizeText(oldToken.word),
          this.normalizeText(newToken.word)
        )

        if (
          distance <= this.config.maxEditDistance &&
          Math.min(oldToken.word.length, newToken.word.length) >= this.config.minWordLength
        ) {
          // Replace similar word
          diffs.push({
            type: 'replace',
            oldText: oldToken.word,
            newText: newToken.word,
            position: oldToken.start,
            length: oldToken.word.length,
            wordIndex: oldIndex,
            charOffset: oldToken.start,
            id: this.generateId()
          })
          oldIndex++
          newIndex++
        } else {
          // Look ahead to find alignment
          let foundAlignment = false

          // Check if next few words align
          for (let lookahead = 1; lookahead <= 3; lookahead++) {
            if (
              oldIndex + lookahead < oldTokens.length &&
              newIndex + lookahead < newTokens.length
            ) {
              const futureOld = this.normalizeText(oldTokens[oldIndex + lookahead].word)
              const futureNew = this.normalizeText(newTokens[newIndex + lookahead].word)

              if (futureOld === futureNew) {
                // Found alignment - previous words are replacements
                for (let i = 0; i < lookahead; i++) {
                  if (oldIndex + i < oldTokens.length && newIndex + i < newTokens.length) {
                    const replaceOld = oldTokens[oldIndex + i]
                    const replaceNew = newTokens[newIndex + i]
                    diffs.push({
                      type: 'replace',
                      oldText: replaceOld.word,
                      newText: replaceNew.word,
                      position: replaceOld.start,
                      length: replaceOld.word.length,
                      wordIndex: oldIndex + i,
                      charOffset: replaceOld.start,
                      id: this.generateId()
                    })
                  }
                }
                oldIndex += lookahead
                newIndex += lookahead
                foundAlignment = true
                break
              }
            }
          }

          if (!foundAlignment) {
            // No alignment found - treat as individual operations
            diffs.push({
              type: 'replace',
              oldText: oldToken.word,
              newText: newToken.word,
              position: oldToken.start,
              length: oldToken.word.length,
              wordIndex: oldIndex,
              charOffset: oldToken.start,
              id: this.generateId()
            })
            oldIndex++
            newIndex++
          }
        }
      }
    }

    return diffs
  }

  /**
   * Get comprehensive diff with both word and character level analysis
   */
  public comprehensiveDiff(
    oldText: string,
    newText: string
  ): {
    wordDiffs: WordDiff[]
    characterDiffs: TextDiff[]
    summary: {
      insertions: number
      deletions: number
      replacements: number
      totalChanges: number
    }
  } {
    const wordDiffs = this.wordDiff(oldText, newText)
    const characterDiffs = this.characterDiff(oldText, newText)

    // Calculate summary statistics
    const summary = {
      insertions: wordDiffs.filter(d => d.type === 'insert').length,
      deletions: wordDiffs.filter(d => d.type === 'delete').length,
      replacements: wordDiffs.filter(d => d.type === 'replace').length,
      totalChanges: wordDiffs.filter(d => d.type !== 'unchanged').length
    }

    return {
      wordDiffs,
      characterDiffs,
      summary
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<DiffConfig>): void {
    this.config = {...this.config, ...newConfig}
  }

  /**
   * Reset the ID counter (useful for testing)
   */
  public resetIdCounter(): void {
    this.idCounter = 0
  }
}

/**
 * Convenience function to create a text differ with default settings
 */
export function createTextDiffer(config?: DiffConfig): TextDiffer {
  return new TextDiffer(config)
}

/**
 * Quick diff function for simple use cases
 */
export function quickDiff(oldText: string, newText: string): TextDiff[] {
  const differ = new TextDiffer()
  return differ.characterDiff(oldText, newText)
}

/**
 * Quick word diff function
 */
export function quickWordDiff(oldText: string, newText: string): WordDiff[] {
  const differ = new TextDiffer()
  return differ.wordDiff(oldText, newText)
}

export default TextDiffer
