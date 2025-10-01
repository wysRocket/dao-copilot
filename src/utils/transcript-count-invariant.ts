/**
 * Transcript Count Invariant Check System
 * Development-mode validation to ensure UI transcript count matches store transcript count
 * Helps identify UI/state synchronization issues during development
 */

import {useTranscriptStore, transcriptSelectors} from '../state/transcript-state'

export interface TranscriptCountMismatch {
  componentName: string
  uiCount: number
  storeCount: number
  storeFilteredCount: number
  timestamp: number
  stackTrace?: string
  additionalInfo?: Record<string, unknown>
}

export interface InvariantCheckOptions {
  componentName: string
  uiCount: number
  includeFiltered?: boolean
  throwOnMismatch?: boolean
  logMismatches?: boolean
  additionalInfo?: Record<string, unknown>
}

/**
 * Development-mode invariant check for transcript count consistency
 * Compares visible UI transcript count with store transcript count
 */
export class TranscriptCountInvariant {
  private static isEnabled = process.env.NODE_ENV === 'development'
  private static mismatches: TranscriptCountMismatch[] = []
  private static maxMismatches = 50 // Limit stored mismatches to prevent memory bloat

  /**
   * Check if UI transcript count matches store transcript count
   * Only runs in development mode for performance
   */
  static check(options: InvariantCheckOptions): TranscriptCountMismatch | null {
    if (!this.isEnabled) return null

    try {
      const store = useTranscriptStore.getState()
      const storeCount = store.recentEntries.length
      const storeFilteredCount = transcriptSelectors.filteredEntries(store).length

      // Determine which count to compare against
      const expectedCount = options.includeFiltered ? storeFilteredCount : storeCount

      // Check for mismatch
      if (options.uiCount !== expectedCount) {
        const mismatch: TranscriptCountMismatch = {
          componentName: options.componentName,
          uiCount: options.uiCount,
          storeCount,
          storeFilteredCount,
          timestamp: Date.now(),
          stackTrace: this.captureStackTrace(),
          additionalInfo: options.additionalInfo
        }

        // Store mismatch for debugging
        this.recordMismatch(mismatch)

        // Log mismatch if enabled
        if (options.logMismatches !== false) {
          this.logMismatch(mismatch)
        }

        // Throw error if requested
        if (options.throwOnMismatch) {
          throw new TranscriptCountMismatchError(mismatch)
        }

        return mismatch
      }

      return null
    } catch (error) {
      if (error instanceof TranscriptCountMismatchError) {
        throw error
      }

      // Log other errors but don't throw to avoid breaking the app
      console.warn('[TranscriptCountInvariant] Check failed:', error)
      return null
    }
  }

  /**
   * React hook for automatic invariant checking after renders
   * Should be called in components that display transcript counts
   */
  static useInvariantCheck(options: Omit<InvariantCheckOptions, 'uiCount'>) {
    if (!this.isEnabled) return

    // Return check function that components can call with their UI count
    return (uiCount: number) => {
      return this.check({
        ...options,
        uiCount
      })
    }
  }

  /**
   * Check all common transcript display patterns
   * Useful for comprehensive validation during testing
   */
  static checkAllPatterns(componentName: string): TranscriptCountMismatch[] {
    if (!this.isEnabled) return []

    const mismatches: TranscriptCountMismatch[] = []
    const store = useTranscriptStore.getState()

    // Common count patterns to check
    const patterns = [
      {name: 'recentEntries', count: store.recentEntries.length},
      {name: 'filteredEntries', count: transcriptSelectors.filteredEntries(store).length},
      {name: 'finalEntries', count: store.recentEntries.filter(e => e.isFinal).length},
      {name: 'partialEntries', count: store.recentEntries.filter(e => e.isPartial).length},
      {
        name: 'chunkedEntries',
        count: store.chunks.reduce((total, chunk) => total + chunk.entries.length, 0)
      },
      {name: 'searchResults', count: store.searchResults.length}
    ]

    patterns.forEach(pattern => {
      const mismatch = this.check({
        componentName: `${componentName}.${pattern.name}`,
        uiCount: pattern.count, // This will match, but we're testing the system
        includeFiltered: pattern.name === 'filteredEntries',
        throwOnMismatch: false,
        logMismatches: false,
        additionalInfo: {pattern: pattern.name}
      })

      if (mismatch) {
        mismatches.push(mismatch)
      }
    })

    return mismatches
  }

  /**
   * Create a development-mode assertion for transcript count
   */
  static assert(
    componentName: string,
    uiCount: number,
    options?: Partial<InvariantCheckOptions>
  ): void {
    this.check({
      componentName,
      uiCount,
      throwOnMismatch: true,
      logMismatches: true,
      ...options
    })
  }

  /**
   * Get all recorded mismatches for debugging
   */
  static getMismatches(): TranscriptCountMismatch[] {
    return [...this.mismatches]
  }

  /**
   * Clear recorded mismatches
   */
  static clearMismatches(): void {
    this.mismatches.length = 0
  }

  /**
   * Get mismatch statistics for debugging
   */
  static getMismatchStats(): {
    total: number
    byComponent: Record<string, number>
    recent: TranscriptCountMismatch[]
  } {
    const byComponent: Record<string, number> = {}

    this.mismatches.forEach(mismatch => {
      byComponent[mismatch.componentName] = (byComponent[mismatch.componentName] || 0) + 1
    })

    const recent = this.mismatches
      .filter(m => Date.now() - m.timestamp < 30000) // Last 30 seconds
      .sort((a, b) => b.timestamp - a.timestamp)

    return {
      total: this.mismatches.length,
      byComponent,
      recent
    }
  }

  /**
   * Enable/disable invariant checking
   */
  static setEnabled(enabled: boolean): void {
    this.isEnabled = enabled && process.env.NODE_ENV === 'development'
  }

  /**
   * Check if invariant checking is enabled
   */
  static isInvariantCheckingEnabled(): boolean {
    return this.isEnabled
  }

  // Private helper methods

  private static recordMismatch(mismatch: TranscriptCountMismatch): void {
    this.mismatches.push(mismatch)

    // Limit stored mismatches to prevent memory issues
    if (this.mismatches.length > this.maxMismatches) {
      this.mismatches.shift()
    }
  }

  private static logMismatch(mismatch: TranscriptCountMismatch): void {
    console.warn(
      `🔍 [TranscriptCountInvariant] MISMATCH in ${mismatch.componentName}:`,
      `\n  UI Count: ${mismatch.uiCount}`,
      `\n  Store Count: ${mismatch.storeCount}`,
      `\n  Store Filtered Count: ${mismatch.storeFilteredCount}`,
      `\n  Timestamp: ${new Date(mismatch.timestamp).toISOString()}`,
      mismatch.additionalInfo ? `\n  Additional Info:` : '',
      mismatch.additionalInfo || '',
      mismatch.stackTrace ? `\n  Stack Trace:\n${mismatch.stackTrace}` : ''
    )
  }

  private static captureStackTrace(): string {
    try {
      throw new Error('Stack trace')
    } catch (error) {
      return error instanceof Error ? error.stack || 'No stack trace available' : 'Unknown error'
    }
  }
}

/**
 * Custom error class for transcript count mismatches
 */
export class TranscriptCountMismatchError extends Error {
  public readonly mismatch: TranscriptCountMismatch

  constructor(mismatch: TranscriptCountMismatch) {
    super(
      `Transcript count mismatch in ${mismatch.componentName}: ` +
        `UI shows ${mismatch.uiCount} but store has ${mismatch.storeCount} ` +
        `(filtered: ${mismatch.storeFilteredCount})`
    )

    this.name = 'TranscriptCountMismatchError'
    this.mismatch = mismatch
  }
}

/**
 * React hook for automatic transcript count validation
 * Should be used in components that display transcript counts
 */
export function useTranscriptCountInvariant(
  componentName: string,
  uiCount: number,
  options?: Partial<InvariantCheckOptions>
): TranscriptCountMismatch | null {
  if (process.env.NODE_ENV !== 'development') return null

  // Check invariant after each render
  React.useEffect(() => {
    TranscriptCountInvariant.check({
      componentName,
      uiCount,
      throwOnMismatch: false,
      logMismatches: true,
      ...options
    })
  }, [componentName, uiCount, options?.includeFiltered])

  // Return the last mismatch for component to handle if needed
  return (
    TranscriptCountInvariant.getMismatches()
      .filter(m => m.componentName === componentName)
      .pop() || null
  )
}

/**
 * Development-mode transcript count validation helpers
 */
export const TranscriptCountValidation = {
  /**
   * Validate that displayed transcript count matches store
   */
  validateDisplayCount: (componentName: string, displayedCount: number) => {
    return TranscriptCountInvariant.check({
      componentName,
      uiCount: displayedCount,
      includeFiltered: false,
      throwOnMismatch: false,
      logMismatches: true
    })
  },

  /**
   * Validate that filtered transcript count matches store
   */
  validateFilteredCount: (componentName: string, filteredCount: number) => {
    return TranscriptCountInvariant.check({
      componentName,
      uiCount: filteredCount,
      includeFiltered: true,
      throwOnMismatch: false,
      logMismatches: true
    })
  },

  /**
   * Validate both display and filtered counts
   */
  validateBothCounts: (componentName: string, displayedCount: number, filteredCount: number) => {
    const displayMismatch = TranscriptCountInvariant.check({
      componentName: `${componentName}.display`,
      uiCount: displayedCount,
      includeFiltered: false,
      throwOnMismatch: false,
      logMismatches: true
    })

    const filteredMismatch = TranscriptCountInvariant.check({
      componentName: `${componentName}.filtered`,
      uiCount: filteredCount,
      includeFiltered: true,
      throwOnMismatch: false,
      logMismatches: true
    })

    return {displayMismatch, filteredMismatch}
  },

  /**
   * Create assertion function for component
   */
  createAssertion: (componentName: string) => {
    return (uiCount: number, includeFiltered = false) => {
      TranscriptCountInvariant.assert(componentName, uiCount, {includeFiltered})
    }
  }
}

// React import for hook
import * as React from 'react'

// Export development utilities
if (process.env.NODE_ENV === 'development') {
  // Add to window for debugging in browser console
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).TranscriptCountInvariant = TranscriptCountInvariant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).TranscriptCountValidation = TranscriptCountValidation
  }
}
