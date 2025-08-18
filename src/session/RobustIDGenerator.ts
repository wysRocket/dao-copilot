/**
 * Robust ID Generation System
 *
 * Provides bulletproof ID generation with offline support, collision resistance,
 * and synchronization capabilities for distributed environments.
 */

import {EventEmitter} from 'events'
import {createHash, randomBytes} from 'crypto'
import {logger} from '../services/gemini-logger'

/**
 * ID generation methods
 */
export enum IDGenerationMethod {
  TIMESTAMP_BASED = 'timestamp_based',
  UUID_V4 = 'uuid_v4',
  SECURE_RANDOM = 'secure_random',
  HYBRID = 'hybrid',
  NANOID = 'nanoid',
  CUSTOM = 'custom'
}

/**
 * Network connectivity states for ID generation adaptation
 */
export enum NetworkState {
  ONLINE = 'online',
  OFFLINE = 'offline',
  INTERMITTENT = 'intermittent',
  UNKNOWN = 'unknown'
}

/**
 * ID validation levels
 */
export enum ValidationLevel {
  BASIC = 'basic', // Format and length validation
  STANDARD = 'standard', // + checksum validation
  STRICT = 'strict', // + collision detection
  PARANOID = 'paranoid' // + comprehensive checks
}

/**
 * ID cache entry with metadata
 */
export interface IDCacheEntry {
  id: string
  timestamp: number
  method: IDGenerationMethod
  networkState: NetworkState
  deviceFingerprint: string
  checksum: string
  sessionId?: string
  parentId?: string
  metadata: Record<string, any>
  expiresAt: number
  syncStatus: 'pending' | 'synced' | 'failed'
}

/**
 * ID generation statistics
 */
export interface IDGenerationStats {
  totalGenerated: number
  collisionCount: number
  cacheHits: number
  cacheMisses: number
  syncSuccessful: number
  syncFailed: number
  methodUsage: Record<IDGenerationMethod, number>
  networkStateDistribution: Record<NetworkState, number>
  averageGenerationTime: number
  lastGenerationTime: number
  cacheSize: number
  expiredCount: number
}

/**
 * Device fingerprint components
 */
export interface DeviceFingerprint {
  platform: string
  arch: string
  nodeVersion: string
  processId: number
  hostname: string
  machineId: string
  userAgent: string
  screenResolution: string
  timeZone: string
  language: string
  hash: string
}

/**
 * ID generation configuration
 */
export interface IDGeneratorConfig {
  // Generation settings
  defaultMethod: IDGenerationMethod
  fallbackMethod: IDGenerationMethod
  idLength: number
  prefix: string
  suffix: string

  // Collision detection
  collisionDetectionEnabled: boolean
  maxCollisionRetries: number

  // Caching
  cacheEnabled: boolean
  cacheSize: number
  cacheExpirationMs: number

  // Offline support
  offlineEnabled: boolean
  offlineIdPool: number
  preGenerateIds: boolean

  // Network monitoring
  networkMonitoringEnabled: boolean
  networkCheckInterval: number

  // Validation
  validationLevel: ValidationLevel
  checksumEnabled: boolean

  // Synchronization
  syncEnabled: boolean
  syncInterval: number
  syncBatchSize: number
  syncRetryAttempts: number

  // Device fingerprinting
  deviceFingerprintEnabled: boolean
  includeSensitiveInfo: boolean

  // Performance
  batchGeneration: boolean
  batchSize: number
  performanceMonitoring: boolean

  // Security
  cryptoSecure: boolean
  entropySource: 'crypto' | 'math' | 'mixed'

  telemetryEnabled: boolean
}

/**
 * Robust ID Generator with offline support and collision resistance
 */
export class RobustIDGenerator extends EventEmitter {
  private config: Required<IDGeneratorConfig>
  private cache = new Map<string, IDCacheEntry>()
  private deviceFingerprint: DeviceFingerprint
  private networkState: NetworkState = NetworkState.UNKNOWN
  private stats: IDGenerationStats
  private isDestroyed = false
  private syncTimer?: NodeJS.Timeout
  private networkMonitorTimer?: NodeJS.Timeout
  private cleanupTimer?: NodeJS.Timeout
  private offlineIdPool: string[] = []
  private generationSequence = 0
  private lastTimestamp = 0

  constructor(config: Partial<IDGeneratorConfig> = {}) {
    super()

    this.config = {
      defaultMethod: IDGenerationMethod.HYBRID,
      fallbackMethod: IDGenerationMethod.SECURE_RANDOM,
      idLength: 32,
      prefix: '',
      suffix: '',
      collisionDetectionEnabled: true,
      maxCollisionRetries: 5,
      cacheEnabled: true,
      cacheSize: 10000,
      cacheExpirationMs: 24 * 60 * 60 * 1000, // 24 hours
      offlineEnabled: true,
      offlineIdPool: 100,
      preGenerateIds: true,
      networkMonitoringEnabled: true,
      networkCheckInterval: 30000, // 30 seconds
      validationLevel: ValidationLevel.STANDARD,
      checksumEnabled: true,
      syncEnabled: true,
      syncInterval: 300000, // 5 minutes
      syncBatchSize: 50,
      syncRetryAttempts: 3,
      deviceFingerprintEnabled: true,
      includeSensitiveInfo: false,
      batchGeneration: false,
      batchSize: 10,
      performanceMonitoring: true,
      cryptoSecure: true,
      entropySource: 'crypto' as const,
      telemetryEnabled: true,
      ...config
    }

    this.deviceFingerprint = this.generateDeviceFingerprint()

    this.stats = {
      totalGenerated: 0,
      collisionCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      syncSuccessful: 0,
      syncFailed: 0,
      methodUsage: Object.values(IDGenerationMethod).reduce(
        (acc, method) => {
          acc[method] = 0
          return acc
        },
        {} as Record<IDGenerationMethod, number>
      ),
      networkStateDistribution: Object.values(NetworkState).reduce(
        (acc, state) => {
          acc[state] = 0
          return acc
        },
        {} as Record<NetworkState, number>
      ),
      averageGenerationTime: 0,
      lastGenerationTime: 0,
      cacheSize: 0,
      expiredCount: 0
    }

    this.initialize()
  }

  /**
   * Initialize the ID generator
   */
  private async initialize(): Promise<void> {
    try {
      // Detect initial network state
      await this.updateNetworkState()

      // Pre-generate offline ID pool if enabled
      if (this.config.preGenerateIds && this.config.offlineEnabled) {
        await this.populateOfflineIdPool()
      }

      // Start background tasks
      this.startBackgroundTasks()

      if (this.config.telemetryEnabled) {
        logger.info('RobustIDGenerator initialized', {
          config: this.config,
          deviceFingerprint: this.config.includeSensitiveInfo
            ? this.deviceFingerprint
            : {hash: this.deviceFingerprint.hash},
          networkState: this.networkState
        })
      }

      this.emit('initialized', {
        generator: this,
        config: this.config,
        networkState: this.networkState
      })
    } catch (error) {
      logger.error('Failed to initialize RobustIDGenerator', {error})
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Generate a robust unique ID
   */
  public async generateID(
    options: {
      method?: IDGenerationMethod
      sessionId?: string
      parentId?: string
      metadata?: Record<string, any>
      prefix?: string
      suffix?: string
      length?: number
    } = {}
  ): Promise<string> {
    if (this.isDestroyed) {
      throw new Error('IDGenerator has been destroyed')
    }

    const startTime = performance.now()

    try {
      const method = options.method || this.config.defaultMethod
      const sessionId = options.sessionId
      const parentId = options.parentId
      const metadata = options.metadata || {}
      const prefix = options.prefix || this.config.prefix
      const suffix = options.suffix || this.config.suffix
      const length = options.length || this.config.idLength

      let id: string
      let retryCount = 0

      // Try to generate unique ID with collision detection
      do {
        id = await this.generateIDInternal(method, length, prefix, suffix, metadata)

        if (!this.config.collisionDetectionEnabled || !this.hasCollision(id)) {
          break
        }

        this.stats.collisionCount++
        retryCount++

        if (retryCount >= this.config.maxCollisionRetries) {
          // Fall back to different method
          const fallbackId = await this.generateIDInternal(
            this.config.fallbackMethod,
            length + 4, // Make it longer to reduce collision chance
            prefix,
            suffix,
            {...metadata, fallback: true, originalMethod: method}
          )

          if (!this.hasCollision(fallbackId)) {
            id = fallbackId
            break
          }

          throw new Error(`Failed to generate unique ID after ${retryCount} retries`)
        }
      } while (retryCount < this.config.maxCollisionRetries)

      // Validate generated ID
      if (!this.validateID(id)) {
        throw new Error(`Generated ID failed validation: ${id}`)
      }

      // Cache the ID
      if (this.config.cacheEnabled) {
        await this.cacheID(id, method, sessionId, parentId, metadata)
      }

      // Update statistics
      this.updateGenerationStats(method, startTime)

      if (this.config.telemetryEnabled) {
        logger.debug('ID generated successfully', {
          id: id.substring(0, 8) + '...', // Truncate for privacy
          method,
          sessionId,
          parentId,
          networkState: this.networkState,
          generationTimeMs: performance.now() - startTime
        })
      }

      this.emit('id:generated', {
        id,
        method,
        sessionId,
        parentId,
        metadata,
        networkState: this.networkState,
        generationTime: performance.now() - startTime
      })

      return id
    } catch (error) {
      logger.error('Failed to generate ID', {error, options})
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Generate multiple IDs in batch
   */
  public async generateBatch(
    count: number,
    options: Parameters<RobustIDGenerator['generateID']>[0] = {}
  ): Promise<string[]> {
    if (!this.config.batchGeneration) {
      // Generate individually
      const ids: string[] = []
      for (let i = 0; i < count; i++) {
        ids.push(await this.generateID(options))
      }
      return ids
    }

    const batchSize = Math.min(count, this.config.batchSize)
    const batches = Math.ceil(count / batchSize)
    const allIds: string[] = []

    for (let batch = 0; batch < batches; batch++) {
      const currentBatchSize = Math.min(batchSize, count - batch * batchSize)
      const batchIds = await Promise.all(
        Array(currentBatchSize)
          .fill(0)
          .map(() => this.generateID(options))
      )
      allIds.push(...batchIds)
    }

    return allIds
  }

  /**
   * Internal ID generation logic
   */
  private async generateIDInternal(
    method: IDGenerationMethod,
    length: number,
    prefix: string,
    suffix: string,
    metadata: Record<string, any>
  ): Promise<string> {
    let baseId: string

    switch (method) {
      case IDGenerationMethod.TIMESTAMP_BASED:
        baseId = this.generateTimestampBasedID(length)
        break

      case IDGenerationMethod.UUID_V4:
        baseId = this.generateUUIDv4().replace(/-/g, '')
        break

      case IDGenerationMethod.SECURE_RANDOM:
        baseId = this.generateSecureRandomID(length)
        break

      case IDGenerationMethod.HYBRID:
        baseId = this.generateHybridID(length)
        break

      case IDGenerationMethod.NANOID:
        baseId = this.generateNanoID(length)
        break

      case IDGenerationMethod.CUSTOM:
        baseId = await this.generateCustomID(length, metadata)
        break

      default:
        throw new Error(`Unsupported ID generation method: ${method}`)
    }

    // Apply prefix and suffix
    let finalId = `${prefix}${baseId}${suffix}`

    // Ensure exact length if specified
    if (length > 0 && finalId.length !== prefix.length + length + suffix.length) {
      const targetLength = length
      const currentLength = baseId.length

      if (currentLength > targetLength) {
        baseId = baseId.substring(0, targetLength)
      } else if (currentLength < targetLength) {
        baseId = baseId.padEnd(targetLength, this.generateRandomChar())
      }

      finalId = `${prefix}${baseId}${suffix}`
    }

    // Add checksum if enabled
    if (this.config.checksumEnabled) {
      const checksum = this.generateChecksum(finalId)
      finalId = `${finalId}_${checksum}`
    }

    return finalId
  }

  /**
   * Generate timestamp-based ID with device fingerprint
   */
  private generateTimestampBasedID(length: number): string {
    const now = Date.now()

    // Ensure monotonic increase
    if (now <= this.lastTimestamp) {
      this.generationSequence++
    } else {
      this.generationSequence = 0
      this.lastTimestamp = now
    }

    const timestamp = now.toString(36)
    const sequence = this.generationSequence.toString(36).padStart(3, '0')
    const deviceHash = this.deviceFingerprint.hash.substring(0, 8)
    const randomSuffix = this.generateRandomString(
      Math.max(4, length - timestamp.length - sequence.length - deviceHash.length - 3)
    )

    return `${timestamp}_${sequence}_${deviceHash}_${randomSuffix}`
  }

  /**
   * Generate UUID v4
   */
  private generateUUIDv4(): string {
    if (this.config.cryptoSecure) {
      const bytes = randomBytes(16)
      bytes[6] = (bytes[6] & 0x0f) | 0x40 // Version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80 // Variant 10

      return [
        bytes.toString('hex', 0, 4),
        bytes.toString('hex', 4, 6),
        bytes.toString('hex', 6, 8),
        bytes.toString('hex', 8, 10),
        bytes.toString('hex', 10, 16)
      ].join('-')
    } else {
      // Math.random fallback
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
    }
  }

  /**
   * Generate secure random ID
   */
  private generateSecureRandomID(length: number): string {
    if (this.config.cryptoSecure && this.config.entropySource !== 'math') {
      const bytes = randomBytes(Math.ceil(length / 2))
      return bytes.toString('hex').substring(0, length)
    } else {
      return this.generateRandomString(length)
    }
  }

  /**
   * Generate hybrid ID combining multiple entropy sources
   */
  private generateHybridID(length: number): string {
    const parts = []
    const partLength = Math.floor(length / 4)

    // Timestamp component (high entropy from time)
    parts.push(Date.now().toString(36).substring(-partLength))

    // Device fingerprint component
    parts.push(this.deviceFingerprint.hash.substring(0, partLength))

    // Random component
    parts.push(this.generateRandomString(partLength))

    // Network state and sequence component
    const networkStateCode = this.networkState.charAt(0)
    const sequenceStr = this.generationSequence.toString(36)
    parts.push(
      `${networkStateCode}${sequenceStr}`
        .padEnd(partLength, this.generateRandomChar())
        .substring(0, partLength)
    )

    return parts.join('').substring(0, length)
  }

  /**
   * Generate NanoID-style ID
   */
  private generateNanoID(length: number): string {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'
    let result = ''

    if (this.config.cryptoSecure) {
      const bytes = randomBytes(length)
      for (let i = 0; i < length; i++) {
        result += alphabet[bytes[i] % alphabet.length]
      }
    } else {
      for (let i = 0; i < length; i++) {
        result += alphabet[Math.floor(Math.random() * alphabet.length)]
      }
    }

    return result
  }

  /**
   * Generate custom ID using custom logic
   */
  private async generateCustomID(length: number, metadata: Record<string, any>): Promise<string> {
    // Custom ID generation can be extended by subclasses or configuration
    // For now, fallback to hybrid approach with metadata incorporation

    const baseId = this.generateHybridID(length - 8)
    const metadataHash = this.hashObject(metadata).substring(0, 8)

    return `${baseId}${metadataHash}`.substring(0, length)
  }

  /**
   * Check for ID collision
   */
  private hasCollision(id: string): boolean {
    return this.cache.has(id)
  }

  /**
   * Validate generated ID
   */
  private validateID(id: string): boolean {
    switch (this.config.validationLevel) {
      case ValidationLevel.BASIC:
        return this.validateBasic(id)

      case ValidationLevel.STANDARD:
        return this.validateBasic(id) && this.validateChecksum(id)

      case ValidationLevel.STRICT:
        return this.validateBasic(id) && this.validateChecksum(id) && !this.hasCollision(id)

      case ValidationLevel.PARANOID:
        return (
          this.validateBasic(id) &&
          this.validateChecksum(id) &&
          !this.hasCollision(id) &&
          this.validateEntropy(id)
        )

      default:
        return true
    }
  }

  /**
   * Basic ID validation (format, length, etc.)
   */
  private validateBasic(id: string): boolean {
    if (!id || typeof id !== 'string') return false
    if (id.length < 8) return false
    if (!/^[a-zA-Z0-9_-]+$/.test(id.replace(/_[a-f0-9]{4}$/, ''))) return false // Allow checksum
    return true
  }

  /**
   * Validate ID checksum
   */
  private validateChecksum(id: string): boolean {
    if (!this.config.checksumEnabled) return true

    const checksumMatch = id.match(/_([a-f0-9]{4})$/)
    if (!checksumMatch) return !this.config.checksumEnabled

    const providedChecksum = checksumMatch[1]
    const idWithoutChecksum = id.replace(/_[a-f0-9]{4}$/, '')
    const expectedChecksum = this.generateChecksum(idWithoutChecksum)

    return providedChecksum === expectedChecksum
  }

  /**
   * Validate ID entropy (basic entropy estimation)
   */
  private validateEntropy(id: string): boolean {
    const uniqueChars = new Set(id).size
    const length = id.length
    const entropy = uniqueChars / length

    return entropy > 0.5 // At least 50% unique characters
  }

  /**
   * Cache generated ID
   */
  private async cacheID(
    id: string,
    method: IDGenerationMethod,
    sessionId?: string,
    parentId?: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!this.config.cacheEnabled) return

    const entry: IDCacheEntry = {
      id,
      timestamp: Date.now(),
      method,
      networkState: this.networkState,
      deviceFingerprint: this.deviceFingerprint.hash,
      checksum: this.generateChecksum(id),
      sessionId,
      parentId,
      metadata,
      expiresAt: Date.now() + this.config.cacheExpirationMs,
      syncStatus: this.networkState === NetworkState.ONLINE ? 'synced' : 'pending'
    }

    this.cache.set(id, entry)

    // Enforce cache size limit
    if (this.cache.size > this.config.cacheSize) {
      const oldestEntries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, this.cache.size - this.config.cacheSize + 1)

      for (const [oldId] of oldestEntries) {
        this.cache.delete(oldId)
      }
    }

    this.stats.cacheSize = this.cache.size

    this.emit('id:cached', {id, entry})
  }

  /**
   * Generate device fingerprint
   */
  private generateDeviceFingerprint(): DeviceFingerprint {
    const components = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      processId: process.pid,
      hostname: require('os').hostname(),
      machineId: this.generateMachineId(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
      screenResolution:
        typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'unknown',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: typeof navigator !== 'undefined' ? navigator.language : process.env.LANG || 'en',
      hash: ''
    }

    // Create hash of all components
    components.hash = this.hashObject(components)

    return components
  }

  /**
   * Generate machine-specific ID
   */
  private generateMachineId(): string {
    try {
      const os = require('os')
      const networkInterfaces = os.networkInterfaces()

      // Use MAC addresses as part of machine ID
      const macAddresses: string[] = []
      for (const iface of Object.values(networkInterfaces)) {
        if (Array.isArray(iface)) {
          for (const addr of iface) {
            if (addr.mac && addr.mac !== '00:00:00:00:00:00') {
              macAddresses.push(addr.mac)
            }
          }
        }
      }

      const machineInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        macs: macAddresses.sort(),
        cpus: os.cpus().length
      }

      return this.hashObject(machineInfo).substring(0, 16)
    } catch (error) {
      logger.warn('Failed to generate machine ID, using fallback', {error})
      return this.generateRandomString(16)
    }
  }

  /**
   * Update network connectivity state
   */
  private async updateNetworkState(): Promise<void> {
    try {
      // Simple connectivity check - can be enhanced with actual network testing
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

      const previousState = this.networkState
      this.networkState = isOnline ? NetworkState.ONLINE : NetworkState.OFFLINE

      if (previousState !== this.networkState) {
        this.stats.networkStateDistribution[this.networkState]++

        if (this.config.telemetryEnabled) {
          logger.info('Network state changed', {
            from: previousState,
            to: this.networkState
          })
        }

        this.emit('network:state:changed', {
          from: previousState,
          to: this.networkState
        })

        // Trigger sync if coming back online
        if (this.networkState === NetworkState.ONLINE && this.config.syncEnabled) {
          await this.syncPendingIds()
        }
      }
    } catch (error) {
      logger.warn('Failed to update network state', {error})
      this.networkState = NetworkState.UNKNOWN
    }
  }

  /**
   * Populate offline ID pool
   */
  private async populateOfflineIdPool(): Promise<void> {
    if (!this.config.offlineEnabled) return

    const needed = this.config.offlineIdPool - this.offlineIdPool.length
    if (needed <= 0) return

    try {
      for (let i = 0; i < needed; i++) {
        const id = await this.generateIDInternal(
          IDGenerationMethod.SECURE_RANDOM,
          this.config.idLength,
          this.config.prefix,
          this.config.suffix,
          {pregenerated: true, poolIndex: i}
        )
        this.offlineIdPool.push(id)
      }

      if (this.config.telemetryEnabled) {
        logger.debug('Populated offline ID pool', {
          poolSize: this.offlineIdPool.length,
          generated: needed
        })
      }

      this.emit('offline:pool:populated', {
        poolSize: this.offlineIdPool.length,
        generated: needed
      })
    } catch (error) {
      logger.error('Failed to populate offline ID pool', {error})
      this.emit('error', error)
    }
  }

  /**
   * Sync pending IDs when network becomes available
   */
  private async syncPendingIds(): Promise<void> {
    if (!this.config.syncEnabled || this.networkState !== NetworkState.ONLINE) {
      return
    }

    try {
      const pendingEntries = Array.from(this.cache.values())
        .filter(entry => entry.syncStatus === 'pending')
        .slice(0, this.config.syncBatchSize)

      if (pendingEntries.length === 0) return

      // Simulate sync operation (in real implementation, this would sync with a server)
      await this.performSync(pendingEntries)

      // Mark as synced
      for (const entry of pendingEntries) {
        entry.syncStatus = 'synced'
      }

      this.stats.syncSuccessful += pendingEntries.length

      if (this.config.telemetryEnabled) {
        logger.info('Synced pending IDs', {
          count: pendingEntries.length,
          totalPending: Array.from(this.cache.values()).filter(e => e.syncStatus === 'pending')
            .length
        })
      }

      this.emit('sync:completed', {
        syncedCount: pendingEntries.length,
        totalPending: Array.from(this.cache.values()).filter(e => e.syncStatus === 'pending').length
      })
    } catch (error) {
      logger.error('Failed to sync pending IDs', {error})
      this.stats.syncFailed++
      this.emit('sync:failed', error)
    }
  }

  /**
   * Perform actual sync operation (placeholder for real implementation)
   */
  private async performSync(entries: IDCacheEntry[]): Promise<void> {
    // In a real implementation, this would send the entries to a central server
    // for collision detection and global uniqueness verification

    // For now, simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200))

    // Simulate occasional sync failures
    if (Math.random() < 0.05) {
      throw new Error('Sync failed - server error')
    }
  }

  /**
   * Start background tasks
   */
  private startBackgroundTasks(): void {
    // Network monitoring
    if (this.config.networkMonitoringEnabled) {
      this.networkMonitorTimer = setInterval(() => {
        this.updateNetworkState().catch(error =>
          logger.warn('Network state update failed', {error})
        )
      }, this.config.networkCheckInterval)
    }

    // Periodic sync
    if (this.config.syncEnabled) {
      this.syncTimer = setInterval(() => {
        this.syncPendingIds().catch(error => logger.warn('Periodic sync failed', {error}))
      }, this.config.syncInterval)
    }

    // Cache cleanup
    if (this.config.cacheEnabled) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpiredCache()
      }, 60000) // Every minute
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    if (!this.config.cacheEnabled) return

    const now = Date.now()
    let expiredCount = 0

    for (const [id, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(id)
        expiredCount++
      }
    }

    if (expiredCount > 0) {
      this.stats.expiredCount += expiredCount
      this.stats.cacheSize = this.cache.size

      if (this.config.telemetryEnabled) {
        logger.debug('Cleaned up expired cache entries', {
          expiredCount,
          currentCacheSize: this.cache.size
        })
      }

      this.emit('cache:cleanup', {
        expiredCount,
        currentSize: this.cache.size
      })
    }
  }

  /**
   * Update generation statistics
   */
  private updateGenerationStats(method: IDGenerationMethod, startTime: number): void {
    this.stats.totalGenerated++
    this.stats.methodUsage[method]++
    this.stats.networkStateDistribution[this.networkState]++

    const generationTime = performance.now() - startTime
    this.stats.lastGenerationTime = generationTime
    this.stats.averageGenerationTime =
      (this.stats.averageGenerationTime * (this.stats.totalGenerated - 1) + generationTime) /
      this.stats.totalGenerated
  }

  /**
   * Utility: Generate random string
   */
  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''

    if (this.config.cryptoSecure && this.config.entropySource !== 'math') {
      const bytes = randomBytes(length)
      for (let i = 0; i < length; i++) {
        result += chars[bytes[i] % chars.length]
      }
    } else {
      for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)]
      }
    }

    return result
  }

  /**
   * Utility: Generate random character
   */
  private generateRandomChar(): string {
    return this.generateRandomString(1)
  }

  /**
   * Utility: Generate checksum
   */
  private generateChecksum(data: string): string {
    return createHash('md5').update(data).digest('hex').substring(0, 4)
  }

  /**
   * Utility: Hash object
   */
  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort())
    return createHash('sha256').update(str).digest('hex')
  }

  /**
   * Get current statistics
   */
  public getStatistics(): IDGenerationStats {
    return {...this.stats, cacheSize: this.cache.size}
  }

  /**
   * Get device fingerprint
   */
  public getDeviceFingerprint(): DeviceFingerprint {
    return {...this.deviceFingerprint}
  }

  /**
   * Get network state
   */
  public getNetworkState(): NetworkState {
    return this.networkState
  }

  /**
   * Check if ID exists in cache
   */
  public hasID(id: string): boolean {
    return this.cache.has(id)
  }

  /**
   * Get cached ID entry
   */
  public getIDEntry(id: string): IDCacheEntry | undefined {
    return this.cache.get(id)
  }

  /**
   * Remove ID from cache
   */
  public removeFromCache(id: string): boolean {
    const removed = this.cache.delete(id)
    if (removed) {
      this.stats.cacheSize = this.cache.size
    }
    return removed
  }

  /**
   * Clear all cached IDs
   */
  public clearCache(): void {
    const count = this.cache.size
    this.cache.clear()
    this.stats.cacheSize = 0

    if (this.config.telemetryEnabled && count > 0) {
      logger.info('Cleared ID cache', {clearedCount: count})
    }

    this.emit('cache:cleared', {clearedCount: count})
  }

  /**
   * Force sync all pending IDs
   */
  public async forceSyncAll(): Promise<void> {
    if (!this.config.syncEnabled) {
      throw new Error('Sync is not enabled')
    }

    await this.syncPendingIds()
  }

  /**
   * Destroy the ID generator and cleanup resources
   */
  public async destroy(): Promise<void> {
    if (this.isDestroyed) return

    this.isDestroyed = true

    // Clear timers
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = undefined
    }

    if (this.networkMonitorTimer) {
      clearInterval(this.networkMonitorTimer)
      this.networkMonitorTimer = undefined
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }

    // Final sync attempt
    if (this.config.syncEnabled && this.networkState === NetworkState.ONLINE) {
      try {
        await this.syncPendingIds()
      } catch (error) {
        logger.warn('Final sync failed during destroy', {error})
      }
    }

    // Clear cache
    this.clearCache()

    // Clear offline pool
    this.offlineIdPool = []

    if (this.config.telemetryEnabled) {
      logger.info('RobustIDGenerator destroyed', {
        finalStats: this.getStatistics()
      })
    }

    this.emit('destroyed', {
      finalStats: this.getStatistics()
    })

    // Remove all listeners
    this.removeAllListeners()
  }
}

/**
 * Global ID generator instance
 */
let globalIDGenerator: RobustIDGenerator | null = null

/**
 * Get or initialize the global ID generator
 */
export function getRobustIDGenerator(config?: Partial<IDGeneratorConfig>): RobustIDGenerator {
  if (!globalIDGenerator) {
    if (!config) {
      throw new Error(
        'RobustIDGenerator not initialized. Please provide config for first-time initialization.'
      )
    }
    globalIDGenerator = new RobustIDGenerator(config)
  }
  return globalIDGenerator
}

/**
 * Initialize a new global ID generator (replacing any existing one)
 */
export function initializeRobustIDGenerator(
  config: Partial<IDGeneratorConfig> = {}
): RobustIDGenerator {
  if (globalIDGenerator) {
    globalIDGenerator
      .destroy()
      .catch(error => logger.warn('Failed to destroy previous ID generator', {error}))
  }
  globalIDGenerator = new RobustIDGenerator(config)
  return globalIDGenerator
}
