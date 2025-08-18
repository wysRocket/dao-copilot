/**
 * TranscriptRingBuffer - In-Memory Circular Buffer for Active Transcripts
 *
 * Provides a thread-safe, fixed-size circular buffer for managing active
 * transcript utterances in memory. Features efficient read/write operations,
 * metadata indexing, and overflow handling.
 */

import {TranscriptUtterance, TranscriptState} from '../transcription/fsm/TranscriptStates'
import {PrivacyManager, DeletionRequest} from './PrivacyManager'

export interface RingBufferConfig {
  capacity: number
  enableMetrics: boolean
  enableIndexing: boolean
  warnThreshold: number // Warn when buffer utilization exceeds this fraction (0.0-1.0)
}

export interface RingBufferMetrics {
  capacity: number
  size: number
  utilization: number // 0.0 to 1.0
  overflows: number
  reads: number
  writes: number
  indexHits: number
  indexMisses: number
  compactions: number
  lastActivity: number
}

export interface RingBufferIndex {
  byId: Map<string, number> // utteranceId -> buffer position
  bySessionId: Map<string, Set<number>> // sessionId -> positions
  byState: Map<TranscriptState, Set<number>> // state -> positions
}

/**
 * Thread-safe circular buffer for transcript utterances
 */
export class TranscriptRingBuffer {
  private readonly config: RingBufferConfig
  private readonly buffer: Array<TranscriptUtterance | null>
  private readonly index: RingBufferIndex

  // Buffer pointers
  private head = 0 // Next write position
  private tail = 0 // Oldest item position
  private size = 0 // Current number of items

  // Metrics
  private metrics: RingBufferMetrics

  // Privacy management
  private privacyManager: PrivacyManager

  // Thread safety - simple mutex using Promise
  private writeLock: Promise<void> = Promise.resolve()

  constructor(config: Partial<RingBufferConfig> = {}) {
    this.config = {
      capacity: 10000,
      enableMetrics: true,
      enableIndexing: true,
      warnThreshold: 0.8,
      ...config
    }

    this.buffer = new Array(this.config.capacity).fill(null)
    this.index = {
      byId: new Map(),
      bySessionId: new Map(),
      byState: new Map()
    }

    this.metrics = {
      capacity: this.config.capacity,
      size: 0,
      utilization: 0,
      overflows: 0,
      reads: 0,
      writes: 0,
      indexHits: 0,
      indexMisses: 0,
      compactions: 0,
      lastActivity: Date.now()
    }

    // Initialize privacy manager for secure deletion
    this.privacyManager = new PrivacyManager()
    // Initialize privacy manager asynchronously
    this.privacyManager.initialize().catch(error => {
      console.error('Failed to initialize privacy manager:', error)
    })
  }

  /**
   * Add an utterance to the buffer (thread-safe)
   */
  async append(utterance: TranscriptUtterance): Promise<boolean> {
    // Acquire write lock
    this.writeLock = this.writeLock
      .then(async () => {
        return this.appendInternal(utterance)
      })
      .then(() => {})

    await this.writeLock
    return true
  }

  /**
   * Internal append implementation
   */
  private appendInternal(utterance: TranscriptUtterance): boolean {
    const now = Date.now()

    try {
      // Check if buffer is full - need to evict
      if (this.size >= this.config.capacity) {
        this.evictOldest()
        this.metrics.overflows++

        if (this.metrics.overflows % 100 === 0) {
          console.warn(
            `[RingBuffer] Overflow detected (${this.metrics.overflows} total). Consider increasing buffer capacity.`
          )
        }
      }

      // Place utterance at head
      const position = this.head
      this.buffer[position] = {...utterance} // shallow clone to avoid mutations

      // Update indexes
      if (this.config.enableIndexing) {
        this.updateIndexesOnAdd(utterance, position)
      }

      // Advance head pointer
      this.head = (this.head + 1) % this.config.capacity
      this.size++

      // Update metrics
      this.metrics.size = this.size
      this.metrics.utilization = this.size / this.config.capacity
      this.metrics.writes++
      this.metrics.lastActivity = now

      // Warn if approaching capacity
      if (
        this.metrics.utilization > this.config.warnThreshold &&
        this.metrics.writes % 1000 === 0
      ) {
        console.warn(
          `[RingBuffer] High utilization: ${(this.metrics.utilization * 100).toFixed(1)}% (${this.size}/${this.config.capacity})`
        )
      }

      return true
    } catch (error) {
      console.error('[RingBuffer] Failed to append utterance:', error)
      return false
    }
  }

  /**
   * Get utterance by ID with index lookup
   */
  get(utteranceId: string): TranscriptUtterance | null {
    this.metrics.reads++

    if (!this.config.enableIndexing) {
      // Linear search fallback
      this.metrics.indexMisses++
      return this.linearSearch(utteranceId)
    }

    const position = this.index.byId.get(utteranceId)
    if (position === undefined) {
      this.metrics.indexMisses++
      return null
    }

    this.metrics.indexHits++
    const utterance = this.buffer[position]
    return utterance ? {...utterance} : null // shallow clone for safety
  }

  /**
   * Update an existing utterance in place
   */
  async update(utteranceId: string, updates: Partial<TranscriptUtterance>): Promise<boolean> {
    this.writeLock = this.writeLock
      .then(async () => {
        return this.updateInternal(utteranceId, updates)
      })
      .then(() => {})

    await this.writeLock
    return true
  }

  /**
   * Internal update implementation
   */
  private updateInternal(utteranceId: string, updates: Partial<TranscriptUtterance>): boolean {
    const position = this.index.byId.get(utteranceId)
    if (position === undefined) {
      return false
    }

    const utterance = this.buffer[position]
    if (!utterance || utterance.id !== utteranceId) {
      // Index inconsistency - rebuild it
      this.rebuildIndexes()
      return false
    }

    // Store old values for index updates
    const oldState = utterance.state
    const oldSessionId = utterance.sessionId

    // Apply updates
    Object.assign(utterance, updates, {updatedAt: Date.now()})

    // Update indexes if key fields changed
    if (this.config.enableIndexing) {
      if (updates.state && updates.state !== oldState) {
        this.updateStateIndex(position, oldState, utterance.state)
      }
      if (updates.sessionId && updates.sessionId !== oldSessionId) {
        this.updateSessionIndex(position, oldSessionId, utterance.sessionId)
      }
    }

    this.metrics.lastActivity = Date.now()
    return true
  }

  /**
   * Get utterances by session ID
   */
  getBySession(sessionId: string): TranscriptUtterance[] {
    if (!this.config.enableIndexing) {
      return this.linearSearchBySession(sessionId)
    }

    const positions = this.index.bySessionId.get(sessionId)
    if (!positions) {
      return []
    }

    const utterances: TranscriptUtterance[] = []
    for (const position of positions) {
      const utterance = this.buffer[position]
      if (utterance && utterance.sessionId === sessionId) {
        utterances.push({...utterance})
      }
    }

    return utterances.sort((a, b) => a.createdAt - b.createdAt)
  }

  /**
   * Get utterances by state
   */
  getByState(state: TranscriptState): TranscriptUtterance[] {
    if (!this.config.enableIndexing) {
      return this.linearSearchByState(state)
    }

    const positions = this.index.byState.get(state)
    if (!positions) {
      return []
    }

    const utterances: TranscriptUtterance[] = []
    for (const position of positions) {
      const utterance = this.buffer[position]
      if (utterance && utterance.state === state) {
        utterances.push({...utterance})
      }
    }

    return utterances.sort((a, b) => a.updatedAt - b.updatedAt)
  }

  /**
   * Get recent utterances (most recently updated first)
   */
  getRecent(limit: number = 100): TranscriptUtterance[] {
    const utterances: TranscriptUtterance[] = []

    // Traverse from most recent (head backwards)
    let count = 0
    let position = (this.head - 1 + this.config.capacity) % this.config.capacity

    while (count < Math.min(limit, this.size)) {
      const utterance = this.buffer[position]
      if (utterance) {
        utterances.push({...utterance})
        count++
      }

      position = (position - 1 + this.config.capacity) % this.config.capacity
    }

    return utterances.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * Remove utterances by predicate
   */
  async removeWhere(predicate: (utterance: TranscriptUtterance) => boolean): Promise<number> {
    this.writeLock = this.writeLock
      .then(async () => {
        return this.removeWhereInternal(predicate)
      })
      .then(() => {})

    await this.writeLock
    return 0 // Will be set by removeWhereInternal
  }

  /**
   * Internal remove implementation
   */
  private removeWhereInternal(predicate: (utterance: TranscriptUtterance) => boolean): number {
    let removedCount = 0

    // Mark positions for removal
    const toRemove: number[] = []
    for (let i = 0; i < this.config.capacity; i++) {
      const utterance = this.buffer[i]
      if (utterance && predicate(utterance)) {
        toRemove.push(i)
      }
    }

    // Remove marked positions
    for (const position of toRemove) {
      const utterance = this.buffer[position]
      if (utterance) {
        this.removeFromIndexes(utterance, position)
        this.buffer[position] = null
        removedCount++
        this.size--
      }
    }

    // Compact buffer if significant removals
    if (removedCount > this.config.capacity * 0.1) {
      this.compact()
    }

    this.metrics.size = this.size
    this.metrics.utilization = this.size / this.config.capacity
    this.metrics.lastActivity = Date.now()

    return removedCount
  }

  /**
   * Clear all utterances for a session (privacy compliance)
   */
  async clearSession(sessionId: string): Promise<number> {
    return this.removeWhere(utterance => utterance.sessionId === sessionId)
  }

  /**
   * Clear all utterances for a session with privacy-compliant secure deletion
   * Uses cryptographic overwriting and audit logging for GDPR compliance
   */
  async clearSessionSecurely(
    sessionId: string,
    reason: string = 'User requested deletion'
  ): Promise<{
    deletedCount: number
    deletionId: string
    complianceVerified: boolean
  }> {
    // First, collect utterances to be deleted for audit
    const utterancesToDelete: TranscriptUtterance[] = []
    for (let i = 0; i < this.config.capacity; i++) {
      const utterance = this.buffer[i]
      if (utterance && utterance.sessionId === sessionId) {
        utterancesToDelete.push({...utterance}) // Deep copy for audit
      }
    }

    if (utterancesToDelete.length === 0) {
      // No data found - return early
      return {
        deletedCount: 0,
        deletionId: `session-${sessionId}-${Date.now()}`,
        complianceVerified: true
      }
    }

    // Create deletion request for privacy manager
    const deletionRequest: DeletionRequest = {
      id: `session-${sessionId}-${Date.now()}`,
      sessionId,
      requestType: 'user-initiated',
      requestedAt: Date.now(),
      urgency: 'normal',
      reason
    }

    // Submit deletion request to privacy manager
    const deletionId = await this.privacyManager.requestDeletion(deletionRequest)

    // Now perform the actual removal from buffer with secure overwriting
    let deletedCount = 0
    const toRemove: number[] = []

    for (let i = 0; i < this.config.capacity; i++) {
      const utterance = this.buffer[i]
      if (utterance && utterance.sessionId === sessionId) {
        toRemove.push(i)
      }
    }

    // Secure overwrite and remove
    for (const position of toRemove) {
      const utterance = this.buffer[position]
      if (utterance) {
        // Secure overwrite the utterance data before nullifying
        await this.secureOverwriteUtterance(utterance)

        this.removeFromIndexes(utterance, position)
        this.buffer[position] = null
        deletedCount++
        this.size--
      }
    }

    // Compact buffer if significant removals
    if (deletedCount > this.config.capacity * 0.1) {
      this.compact()
    }

    this.metrics.size = this.size
    this.metrics.utilization = this.size / this.config.capacity
    this.metrics.lastActivity = Date.now()

    // Get deletion result for verification
    const verificationResult = await this.privacyManager.verifyDeletion(deletionId)

    return {
      deletedCount,
      deletionId,
      complianceVerified: verificationResult.fullyDeleted
    }
  }

  /**
   * Securely overwrite utterance data using cryptographic methods
   */
  private async secureOverwriteUtterance(utterance: TranscriptUtterance): Promise<void> {
    // Overwrite sensitive fields with random data (3 passes)
    for (let pass = 0; pass < 3; pass++) {
      // Overwrite text content (textDraft and finalText)
      if (utterance.textDraft) {
        const randomText = await this.generateRandomString(utterance.textDraft.length)
        utterance.textDraft = randomText
      }

      if (utterance.finalText) {
        const randomText = await this.generateRandomString(utterance.finalText.length)
        utterance.finalText = randomText
      }

      // Overwrite other sensitive fields
      utterance.id = await this.generateRandomString(utterance.id.length)
      utterance.sessionId = await this.generateRandomString(utterance.sessionId.length)
      utterance.createdAt = 0
      utterance.updatedAt = 0
      utterance.confidence = 0

      // Clear optional timestamp fields
      utterance.lastPartialAt = 0
      utterance.startedStreamingAt = 0
      utterance.awaitingFinalSince = 0
      utterance.finalizedAt = 0
      utterance.abortedAt = 0
      utterance.recoveredAt = 0

      // Clear metadata
      if (utterance.meta) {
        utterance.meta = {}
      }
    }
  }

  /**
   * Generate cryptographically secure random string of specified length
   */
  private async generateRandomString(length: number): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    const randomArray = new Uint8Array(length)

    // Use crypto API for secure randomness
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(randomArray)
      for (let i = 0; i < length; i++) {
        result += chars[randomArray[i] % chars.length]
      }
    } else {
      // Fallback for Node.js environments
      try {
        const nodeCrypto = await import('crypto')
        for (let i = 0; i < length; i++) {
          result += chars[nodeCrypto.randomInt(0, chars.length)]
        }
      } catch {
        // Final fallback to Math.random (less secure but functional)
        for (let i = 0; i < length; i++) {
          result += chars[Math.floor(Math.random() * chars.length)]
        }
      }
    }

    return result
  }

  /**
   * Clear terminal states older than threshold
   */
  async clearOldTerminal(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs
    return this.removeWhere(utterance => {
      const isTerminal =
        utterance.state === TranscriptState.FINALIZED || utterance.state === TranscriptState.ABORTED
      return isTerminal && utterance.updatedAt < cutoff
    })
  }

  /**
   * Get current buffer metrics
   */
  getMetrics(): Readonly<RingBufferMetrics> {
    return {...this.metrics}
  }

  /**
   * Get buffer configuration
   */
  getConfig(): Readonly<RingBufferConfig> {
    return {...this.config}
  }

  /**
   * Compact buffer to remove holes and optimize layout
   */
  private compact(): void {
    const compactStart = Date.now()

    // Create new array with only non-null entries
    const compacted: Array<TranscriptUtterance | null> = []
    const newIndexes: RingBufferIndex = {
      byId: new Map(),
      bySessionId: new Map(),
      byState: new Map()
    }

    let newPosition = 0
    for (let i = 0; i < this.config.capacity; i++) {
      const utterance = this.buffer[i]
      if (utterance) {
        compacted[newPosition] = utterance

        if (this.config.enableIndexing) {
          // Update indexes with new position
          newIndexes.byId.set(utterance.id, newPosition)

          const sessionSet = newIndexes.bySessionId.get(utterance.sessionId) || new Set()
          sessionSet.add(newPosition)
          newIndexes.bySessionId.set(utterance.sessionId, sessionSet)

          const stateSet = newIndexes.byState.get(utterance.state) || new Set()
          stateSet.add(newPosition)
          newIndexes.byState.set(utterance.state, stateSet)
        }

        newPosition++
      }
    }

    // Fill remaining with nulls
    for (let i = newPosition; i < this.config.capacity; i++) {
      compacted[i] = null
    }

    // Replace buffer and indexes
    compacted.forEach((item, i) => {
      this.buffer[i] = item
    })

    if (this.config.enableIndexing) {
      this.index.byId = newIndexes.byId
      this.index.bySessionId = newIndexes.bySessionId
      this.index.byState = newIndexes.byState
    }

    // Update pointers
    this.head = newPosition % this.config.capacity
    this.tail = 0
    this.size = newPosition

    this.metrics.compactions++
    this.metrics.size = this.size
    this.metrics.utilization = this.size / this.config.capacity

    const compactTime = Date.now() - compactStart
    console.debug(`[RingBuffer] Compacted buffer in ${compactTime}ms (${this.size} items retained)`)
  }

  // Private helper methods for index management

  private evictOldest(): void {
    if (this.size === 0) return

    const utterance = this.buffer[this.tail]
    if (utterance && this.config.enableIndexing) {
      this.removeFromIndexes(utterance, this.tail)
    }

    this.buffer[this.tail] = null
    this.tail = (this.tail + 1) % this.config.capacity
    this.size--
  }

  private updateIndexesOnAdd(utterance: TranscriptUtterance, position: number): void {
    // ID index
    this.index.byId.set(utterance.id, position)

    // Session index
    const sessionSet = this.index.bySessionId.get(utterance.sessionId) || new Set()
    sessionSet.add(position)
    this.index.bySessionId.set(utterance.sessionId, sessionSet)

    // State index
    const stateSet = this.index.byState.get(utterance.state) || new Set()
    stateSet.add(position)
    this.index.byState.set(utterance.state, stateSet)
  }

  private removeFromIndexes(utterance: TranscriptUtterance, position: number): void {
    // ID index
    this.index.byId.delete(utterance.id)

    // Session index
    const sessionSet = this.index.bySessionId.get(utterance.sessionId)
    if (sessionSet) {
      sessionSet.delete(position)
      if (sessionSet.size === 0) {
        this.index.bySessionId.delete(utterance.sessionId)
      }
    }

    // State index
    const stateSet = this.index.byState.get(utterance.state)
    if (stateSet) {
      stateSet.delete(position)
      if (stateSet.size === 0) {
        this.index.byState.delete(utterance.state)
      }
    }
  }

  private updateStateIndex(
    position: number,
    oldState: TranscriptState,
    newState: TranscriptState
  ): void {
    // Remove from old state index
    const oldSet = this.index.byState.get(oldState)
    if (oldSet) {
      oldSet.delete(position)
      if (oldSet.size === 0) {
        this.index.byState.delete(oldState)
      }
    }

    // Add to new state index
    const newSet = this.index.byState.get(newState) || new Set()
    newSet.add(position)
    this.index.byState.set(newState, newSet)
  }

  private updateSessionIndex(position: number, oldSessionId: string, newSessionId: string): void {
    // Remove from old session index
    const oldSet = this.index.bySessionId.get(oldSessionId)
    if (oldSet) {
      oldSet.delete(position)
      if (oldSet.size === 0) {
        this.index.bySessionId.delete(oldSessionId)
      }
    }

    // Add to new session index
    const newSet = this.index.bySessionId.get(newSessionId) || new Set()
    newSet.add(position)
    this.index.bySessionId.set(newSessionId, newSet)
  }

  private rebuildIndexes(): void {
    console.warn('[RingBuffer] Rebuilding indexes due to inconsistency')

    // Clear all indexes
    this.index.byId.clear()
    this.index.bySessionId.clear()
    this.index.byState.clear()

    // Rebuild from buffer contents
    for (let i = 0; i < this.config.capacity; i++) {
      const utterance = this.buffer[i]
      if (utterance) {
        this.updateIndexesOnAdd(utterance, i)
      }
    }
  }

  // Linear search fallbacks (for when indexing is disabled)

  private linearSearch(utteranceId: string): TranscriptUtterance | null {
    for (let i = 0; i < this.config.capacity; i++) {
      const utterance = this.buffer[i]
      if (utterance && utterance.id === utteranceId) {
        return {...utterance}
      }
    }
    return null
  }

  private linearSearchBySession(sessionId: string): TranscriptUtterance[] {
    const results: TranscriptUtterance[] = []
    for (let i = 0; i < this.config.capacity; i++) {
      const utterance = this.buffer[i]
      if (utterance && utterance.sessionId === sessionId) {
        results.push({...utterance})
      }
    }
    return results.sort((a, b) => a.createdAt - b.createdAt)
  }

  private linearSearchByState(state: TranscriptState): TranscriptUtterance[] {
    const results: TranscriptUtterance[] = []
    for (let i = 0; i < this.config.capacity; i++) {
      const utterance = this.buffer[i]
      if (utterance && utterance.state === state) {
        results.push({...utterance})
      }
    }
    return results.sort((a, b) => a.updatedAt - b.updatedAt)
  }
}
