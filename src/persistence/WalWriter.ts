/**
 * WalWriter - Write-Ahead Log Writer with Intelligent Flushing
 *
 * Manages WAL file writing operations with:
 * - Asynchronous, non-blocking write operations
 * - Configurable flush policies based on time, events, and system state
 * - Automatic file rotation and compression
 * - Crash recovery and data integrity verification
 * - Performance monitoring and metrics collection
 */

import {promises as fs, constants as fsConstants} from 'fs'
import {join, dirname, basename} from 'path'
import {EventEmitter} from 'events'
import {promisify} from 'util'

import {WalEntry, WalEntryType, WalFileHeader, createWalFileHeader} from './WalEntry'
import {WalEncoder, globalWalEncoder} from './WalEncoder'
import {
  FlushPolicyManager,
  FlushTriggerEvent,
  FlushRequest,
  FlushPolicyConfig,
  FlushTriggerType,
  DEFAULT_FLUSH_POLICY
} from './FlushPolicy'
import {WalRotationManager, RotationPolicy} from './WalRotationManager'
import {StorageMonitor, StorageThresholds} from './StorageMonitor'

/**
 * WAL writer configuration
 */
export interface WalWriterConfig {
  // File settings
  walDirectory: string // Directory for WAL files
  maxFileSize: number // Max size per WAL file (bytes), default: 100MB
  compressionEnabled: boolean // Enable gzip compression, default: true

  // Buffer settings
  writeBufferSize: number // In-memory buffer size (entries), default: 1000
  flushBatchSize: number // Entries per flush batch, default: 100

  // Performance settings
  asyncWriteEnabled: boolean // Enable async writes, default: true
  writeQueueLimit: number // Max queued write operations, default: 10000

  // File management
  maxWalFiles: number // Max WAL files to keep, default: 10
  autoCleanupEnabled: boolean // Auto-delete old WAL files, default: true
  rotationSizeThreshold: number // Rotate file when size exceeds (bytes), default: 50MB

  // Enhanced rotation and storage monitoring (NEW)
  enableAdvancedRotation: boolean // Enable WalRotationManager integration, default: true
  rotationPolicy?: Partial<RotationPolicy> // Advanced rotation configuration
  enableStorageMonitoring: boolean // Enable storage monitoring, default: true
  storageThresholds?: Partial<StorageThresholds> // Storage monitoring thresholds
  monitoringInterval: number // Storage monitoring interval (ms), default: 30000

  // Recovery settings
  enableRecoveryLog: boolean // Log recovery operations, default: true
  checksumValidation: boolean // Validate checksums on read, default: true
  corruptionHandling: 'skip' | 'fail' | 'recover' // How to handle corruption, default: 'recover'

  // Flush policy
  flushPolicy: Partial<FlushPolicyConfig> // Override flush policy settings
}

/**
 * Default WAL writer configuration
 */
export const DEFAULT_WAL_WRITER_CONFIG: WalWriterConfig = {
  walDirectory: './.wal',
  maxFileSize: 100 * 1024 * 1024, // 100MB
  compressionEnabled: true,

  writeBufferSize: 1000,
  flushBatchSize: 100,

  asyncWriteEnabled: true,
  writeQueueLimit: 10000,

  maxWalFiles: 10,
  autoCleanupEnabled: true,
  rotationSizeThreshold: 50 * 1024 * 1024, // 50MB

  // Enhanced rotation and storage monitoring
  enableAdvancedRotation: true,
  enableStorageMonitoring: true,
  monitoringInterval: 30000, // 30 seconds

  enableRecoveryLog: true,
  checksumValidation: true,
  corruptionHandling: 'recover',

  flushPolicy: {}
}

/**
 * Write operation
 */
interface WriteOperation {
  entries: WalEntry[]
  promise: {
    resolve: (result: WalWriteResult) => void
    reject: (error: Error) => void
  }
  timestamp: number
  priority: 'low' | 'normal' | 'high' | 'urgent'
  retryCount: number
}

/**
 * WAL write result
 */
export interface WalWriteResult {
  bytesWritten: number
  entriesWritten: number
  fileName: string
  timestamp: number
  flushTrigger?: FlushTriggerType
  duration: number
}

/**
 * WAL file info
 */
interface WalFileInfo {
  fileName: string
  filePath: string
  size: number
  created: number
  lastWrite: number
  entryCount: number
  compressed: boolean
}

/**
 * WAL writer statistics
 */
export interface WalWriterStats {
  totalWrites: number
  totalEntries: number
  totalBytes: number
  totalFlushes: number
  avgWriteTimeMs: number
  avgFlushTimeMs: number
  avgEntriesPerFlush: number
  currentBufferSize: number
  queuedWrites: number
  currentFileSize: number
  filesCreated: number
  filesRotated: number
  corruptionRecoveries: number
  lastWriteTime?: number
  lastFlushTime?: number
}

/**
 * Write-Ahead Log Writer
 *
 * High-performance WAL writer with intelligent flushing based on configurable policies.
 */
export class WalWriter extends EventEmitter {
  private config: WalWriterConfig
  private encoder: WalEncoder
  private flushPolicy: FlushPolicyManager

  // File management
  private currentFile?: WalFileInfo
  private fileHandle?: fs.FileHandle

  // Write management
  private writeBuffer: WalEntry[] = []
  private writeQueue: WriteOperation[] = []
  private isWriting: boolean = false
  private isFlushing: boolean = false

  // Statistics and monitoring
  private stats: WalWriterStats
  private startTime: number

  // State management
  private isInitialized: boolean = false
  private isDestroyed: boolean = false

  constructor(config: Partial<WalWriterConfig> = {}) {
    super()

    this.config = {...DEFAULT_WAL_WRITER_CONFIG, ...config}
    this.encoder = globalWalEncoder
    this.flushPolicy = new FlushPolicyManager(this.config.flushPolicy)
    this.startTime = Date.now()

    this.stats = {
      totalWrites: 0,
      totalEntries: 0,
      totalBytes: 0,
      totalFlushes: 0,
      avgWriteTimeMs: 0,
      avgFlushTimeMs: 0,
      avgEntriesPerFlush: 0,
      currentBufferSize: 0,
      queuedWrites: 0,
      currentFileSize: 0,
      filesCreated: 0,
      filesRotated: 0,
      corruptionRecoveries: 0
    }

    this.setupFlushPolicyListeners()
  }

  /**
   * Initialize the WAL writer
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Ensure WAL directory exists
      await fs.mkdir(this.config.walDirectory, {recursive: true})

      // Create or resume current WAL file
      await this.createOrResumeCurrentFile()

      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      this.emit('error', new Error(`Failed to initialize WAL writer: ${error}`))
      throw error
    }
  }

  /**
   * Write entries to WAL
   */
  async writeEntries(
    entries: WalEntry[],
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<WalWriteResult> {
    if (this.isDestroyed) {
      throw new Error('WAL writer has been destroyed')
    }

    if (!this.isInitialized) {
      await this.initialize()
    }

    return new Promise((resolve, reject) => {
      const operation: WriteOperation = {
        entries,
        promise: {resolve, reject},
        timestamp: Date.now(),
        priority,
        retryCount: 0
      }

      // Add to queue
      this.writeQueue.push(operation)
      this.stats.queuedWrites++

      // Sort by priority
      this.writeQueue.sort((a, b) => {
        const priorityOrder = {urgent: 4, high: 3, normal: 2, low: 1}
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      })

      // Notify flush policy
      for (const entry of entries) {
        this.flushPolicy.onWalEntryAdded(entry)
      }

      // Process queue if not already processing
      this.processWriteQueue()
    })
  }

  /**
   * Write a single entry
   */
  async writeEntry(
    entry: WalEntry,
    priority?: 'low' | 'normal' | 'high' | 'urgent'
  ): Promise<WalWriteResult> {
    return this.writeEntries([entry], priority)
  }

  /**
   * Force flush all buffered entries
   */
  async flush(reason: string = 'Manual flush'): Promise<WalWriteResult[]> {
    if (this.isDestroyed || !this.isInitialized) {
      return []
    }

    return this.performFlush({
      type: FlushTriggerType.MANUAL_FLUSH,
      timestamp: Date.now(),
      reason,
      urgent: true
    })
  }

  /**
   * Rotate to a new WAL file
   */
  async rotateFile(reason: string = 'Manual rotation'): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('WAL writer not initialized')
    }

    const oldFileName = this.currentFile?.fileName || 'unknown'
    const newFile = await this.createNewWalFile()

    this.stats.filesRotated++
    this.emit('fileRotated', {oldFileName, newFileName: newFile.fileName, reason})

    return newFile.fileName
  }

  /**
   * Get current statistics
   */
  getStats(): WalWriterStats {
    this.stats.currentBufferSize = this.writeBuffer.length
    this.stats.queuedWrites = this.writeQueue.length
    this.stats.currentFileSize = this.currentFile?.size || 0

    return {...this.stats}
  }

  /**
   * Get current configuration
   */
  getConfig(): WalWriterConfig {
    return {...this.config}
  }

  /**
   * Update configuration (some settings require restart)
   */
  updateConfig(config: Partial<WalWriterConfig>): void {
    this.config = {...this.config, ...config}

    // Update flush policy configuration
    if (config.flushPolicy) {
      this.flushPolicy.updateConfig(config.flushPolicy)
    }

    this.emit('configUpdated', this.config)
  }

  /**
   * Clean up old WAL files
   */
  async cleanupOldFiles(): Promise<number> {
    if (!this.config.autoCleanupEnabled) {
      return 0
    }

    try {
      const files = await this.getWalFiles()
      const sortedFiles = files.sort((a, b) => b.created - a.created)

      let cleanedCount = 0
      const filesToRemove = sortedFiles.slice(this.config.maxWalFiles)

      for (const file of filesToRemove) {
        try {
          await fs.unlink(file.filePath)
          cleanedCount++
          this.emit('fileRemoved', {fileName: file.fileName, reason: 'cleanup'})
        } catch (error) {
          this.emit('error', new Error(`Failed to remove WAL file ${file.fileName}: ${error}`))
        }
      }

      return cleanedCount
    } catch (error) {
      this.emit('error', new Error(`Failed to cleanup WAL files: ${error}`))
      return 0
    }
  }

  /**
   * Destroy the WAL writer
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return
    }

    this.isDestroyed = true

    try {
      // Flush remaining entries
      await this.flush('Shutdown flush')

      // Close file handle
      if (this.fileHandle) {
        await this.fileHandle.close()
        this.fileHandle = undefined
      }

      // Destroy flush policy
      this.flushPolicy.destroy()

      // Clear queues
      this.writeQueue.length = 0
      this.writeBuffer.length = 0

      this.emit('destroyed')
    } catch (error) {
      this.emit('error', new Error(`Error during WAL writer destruction: ${error}`))
    }
  }

  // Private methods

  /**
   * Setup flush policy event listeners
   */
  private setupFlushPolicyListeners(): void {
    this.flushPolicy.on('flushRequired', (trigger: FlushTriggerEvent) => {
      this.performFlush(trigger).catch(error => {
        this.emit('error', new Error(`Flush failed: ${error}`))
      })
    })
  }

  /**
   * Process the write queue
   */
  private async processWriteQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) {
      return
    }

    this.isWriting = true

    try {
      while (this.writeQueue.length > 0 && !this.isDestroyed) {
        const operation = this.writeQueue.shift()!
        this.stats.queuedWrites--

        try {
          const result = await this.executeWrite(operation)
          operation.promise.resolve(result)
        } catch (error) {
          // Retry logic for failed writes
          if (operation.retryCount < 3 && !this.isDestroyed) {
            operation.retryCount++
            this.writeQueue.unshift(operation)
            this.stats.queuedWrites++

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * operation.retryCount))
          } else {
            operation.promise.reject(error instanceof Error ? error : new Error(String(error)))
          }
        }
      }
    } finally {
      this.isWriting = false
    }
  }

  /**
   * Execute a write operation
   */
  private async executeWrite(operation: WriteOperation): Promise<WalWriteResult> {
    const startTime = Date.now()

    // Add entries to buffer
    this.writeBuffer.push(...operation.entries)

    let bytesWritten = 0
    const entriesWritten = operation.entries.length

    // Check if we need to flush immediately
    const shouldFlush =
      operation.priority === 'urgent' || this.writeBuffer.length >= this.config.flushBatchSize

    if (shouldFlush) {
      const flushResult = await this.performFlush({
        type: FlushTriggerType.MANUAL_FLUSH,
        timestamp: Date.now(),
        reason: `Buffer size ${this.writeBuffer.length} or urgent priority`
      })

      if (flushResult.length > 0) {
        bytesWritten = flushResult[0].bytesWritten
      }
    }

    const duration = Date.now() - startTime
    this.updateWriteStats(entriesWritten, bytesWritten, duration)

    return {
      bytesWritten,
      entriesWritten,
      fileName: this.currentFile?.fileName || '',
      timestamp: operation.timestamp,
      duration
    }
  }

  /**
   * Perform flush operation
   */
  private async performFlush(trigger: FlushTriggerEvent): Promise<WalWriteResult[]> {
    if (this.isFlushing || this.writeBuffer.length === 0 || this.isDestroyed) {
      return []
    }

    this.isFlushing = true
    const startTime = Date.now()

    try {
      // Determine batch size for this flush
      const batchSize = trigger.urgent
        ? this.writeBuffer.length
        : Math.min(this.config.flushBatchSize, this.writeBuffer.length)

      const entriesToFlush = this.writeBuffer.splice(0, batchSize)
      const results: WalWriteResult[] = []

      // Check if we need to rotate files
      if (this.shouldRotateFile()) {
        await this.rotateFile('Size threshold exceeded')
      }

      // Encode entries
      const encodedEntries: Buffer[] = []

      for (const entry of entriesToFlush) {
        const encoded = this.encoder.encode(entry)
        encodedEntries.push(encoded)
      }

      // Write to file
      if (this.fileHandle && encodedEntries.length > 0) {
        const combinedBuffer = Buffer.concat(encodedEntries)
        const {bytesWritten} = await this.fileHandle.write(combinedBuffer)
        await this.fileHandle.sync() // Force write to disk

        // Update file info
        if (this.currentFile) {
          this.currentFile.size += bytesWritten
          this.currentFile.lastWrite = Date.now()
          this.currentFile.entryCount += entriesToFlush.length
        }

        const duration = Date.now() - startTime
        this.updateFlushStats(entriesToFlush.length, bytesWritten, duration)

        results.push({
          bytesWritten,
          entriesWritten: entriesToFlush.length,
          fileName: this.currentFile?.fileName || '',
          timestamp: startTime,
          flushTrigger: trigger.type,
          duration
        })

        this.emit('flushed', {
          trigger,
          bytesWritten,
          entriesWritten: entriesToFlush.length,
          duration
        })
      }

      return results
    } catch (error) {
      this.emit('error', new Error(`Flush operation failed: ${error}`))
      throw error
    } finally {
      this.isFlushing = false
    }
  }

  /**
   * Create or resume current WAL file
   */
  private async createOrResumeCurrentFile(): Promise<void> {
    try {
      const existingFiles = await this.getWalFiles()
      const latestFile = existingFiles.sort((a, b) => b.created - a.created)[0]

      if (latestFile && latestFile.size < this.config.rotationSizeThreshold) {
        // Resume existing file
        await this.openWalFile(latestFile)
      } else {
        // Create new file
        await this.createNewWalFile()
      }
    } catch (error) {
      throw new Error(`Failed to create or resume WAL file: ${error}`)
    }
  }

  /**
   * Create a new WAL file
   */
  private async createNewWalFile(): Promise<WalFileInfo> {
    const timestamp = Date.now()
    const fileName = `wal_${timestamp}.log`
    const filePath = join(this.config.walDirectory, fileName)

    // Close current file if open
    if (this.fileHandle) {
      await this.fileHandle.close()
    }

    // Create new file with header
    const fileHeader = createWalFileHeader()
    const headerBuffer = this.encoder.encodeFileHeader(fileHeader)

    this.fileHandle = await fs.open(filePath, 'w')
    await this.fileHandle.write(headerBuffer)
    await this.fileHandle.sync()

    const fileInfo: WalFileInfo = {
      fileName,
      filePath,
      size: headerBuffer.length,
      created: timestamp,
      lastWrite: timestamp,
      entryCount: 0,
      compressed: this.config.compressionEnabled
    }

    this.currentFile = fileInfo
    this.stats.filesCreated++

    this.emit('fileCreated', {fileName, filePath})

    return fileInfo
  }

  /**
   * Open existing WAL file for appending
   */
  private async openWalFile(fileInfo: WalFileInfo): Promise<void> {
    this.fileHandle = await fs.open(fileInfo.filePath, 'a')
    this.currentFile = fileInfo

    this.emit('fileOpened', {fileName: fileInfo.fileName, filePath: fileInfo.filePath})
  }

  /**
   * Get list of existing WAL files
   */
  private async getWalFiles(): Promise<WalFileInfo[]> {
    try {
      const files = await fs.readdir(this.config.walDirectory)
      const walFiles: WalFileInfo[] = []

      for (const fileName of files) {
        if (fileName.endsWith('.log') && fileName.startsWith('wal_')) {
          const filePath = join(this.config.walDirectory, fileName)
          const stats = await fs.stat(filePath)

          // Extract timestamp from filename
          const timestampMatch = fileName.match(/wal_(\d+)\.log/)
          const created = timestampMatch ? parseInt(timestampMatch[1]) : stats.birthtimeMs

          walFiles.push({
            fileName,
            filePath,
            size: stats.size,
            created,
            lastWrite: stats.mtimeMs,
            entryCount: 0, // Would need to scan file to get accurate count
            compressed: this.config.compressionEnabled
          })
        }
      }

      return walFiles
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  /**
   * Check if current file should be rotated
   */
  private shouldRotateFile(): boolean {
    return this.currentFile ? this.currentFile.size >= this.config.rotationSizeThreshold : false
  }

  /**
   * Update write statistics
   */
  private updateWriteStats(entriesWritten: number, bytesWritten: number, duration: number): void {
    this.stats.totalWrites++
    this.stats.totalEntries += entriesWritten
    this.stats.totalBytes += bytesWritten
    this.stats.lastWriteTime = Date.now()

    // Update average write time
    const totalTime = this.stats.avgWriteTimeMs * (this.stats.totalWrites - 1) + duration
    this.stats.avgWriteTimeMs = totalTime / this.stats.totalWrites
  }

  /**
   * Update flush statistics
   */
  private updateFlushStats(entriesFlushed: number, bytesFlushed: number, duration: number): void {
    this.stats.totalFlushes++
    this.stats.lastFlushTime = Date.now()

    // Update average flush time
    const totalFlushTime = this.stats.avgFlushTimeMs * (this.stats.totalFlushes - 1) + duration
    this.stats.avgFlushTimeMs = totalFlushTime / this.stats.totalFlushes

    // Update average entries per flush
    const totalEntries =
      this.stats.avgEntriesPerFlush * (this.stats.totalFlushes - 1) + entriesFlushed
    this.stats.avgEntriesPerFlush = totalEntries / this.stats.totalFlushes
  }
}

export default WalWriter
