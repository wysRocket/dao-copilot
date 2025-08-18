/**
 * WalRotationManager - Manages WAL file rotation and lifecycle
 *
 * Handles:
 * - Size-based rotation (10MB threshold)
 * - Time-based rotation (15 minutes)
 * - Historical file retention
 * - Cleanup of old WAL files
 * - Integration with storage monitoring
 * - Emergency rotation under storage pressure
 */

import {promises as fs} from 'fs'
import {join, basename} from 'path'
import {EventEmitter} from 'events'

export interface RotationPolicy {
  // Size thresholds
  maxFileSize: number // Max file size before rotation (bytes), default: 10MB
  emergencyRotationSize: number // Emergency rotation threshold (bytes), default: 50MB

  // Time thresholds
  maxFileAge: number // Max file age before rotation (ms), default: 15min
  emergencyRotationAge: number // Emergency rotation threshold (ms), default: 30min

  // Retention policy
  maxRetentionFiles: number // Max number of WAL files to retain, default: 20
  maxRetentionAge: number // Max age of retained files (ms), default: 24h
  maxTotalSize: number // Max total WAL directory size (bytes), default: 200MB

  // Cleanup behavior
  enableAutomaticCleanup: boolean // Enable automatic old file cleanup, default: true
  cleanupInterval: number // Cleanup check interval (ms), default: 5min
  enableEmergencyCleanup: boolean // Enable emergency cleanup under pressure, default: true

  // Archive settings
  enableArchiving: boolean // Archive old files instead of deleting, default: false
  archiveDirectory?: string // Directory for archived files
  compressionEnabled: boolean // Compress archived files, default: true
}

export interface WalFileInfo {
  fileName: string
  filePath: string
  size: number
  created: number
  modified: number
  isArchived: boolean
  isCorrupted?: boolean
}

export interface RotationStats {
  totalRotations: number
  sizeBasedRotations: number
  timeBasedRotations: number
  emergencyRotations: number
  totalCleanups: number
  filesDeleted: number
  filesArchived: number
  bytesReclaimed: number
  lastRotationTime: number
  lastCleanupTime: number
  averageRotationInterval: number
}

export interface RotationEvent {
  type: 'rotation' | 'cleanup' | 'archive' | 'emergency'
  trigger: 'size' | 'time' | 'manual' | 'storage-pressure' | 'retention'
  fileName: string
  newFileName?: string
  size: number
  age: number
  reason: string
  timestamp: number
}

export const DEFAULT_ROTATION_POLICY: RotationPolicy = {
  // Size thresholds (aligned with task requirements)
  maxFileSize: 10 * 1024 * 1024, // 10MB as specified
  emergencyRotationSize: 50 * 1024 * 1024, // 50MB emergency

  // Time thresholds (aligned with task requirements)
  maxFileAge: 15 * 60 * 1000, // 15 minutes as specified
  emergencyRotationAge: 30 * 60 * 1000, // 30 minutes emergency

  // Retention policy
  maxRetentionFiles: 20, // Keep 20 historical files
  maxRetentionAge: 24 * 60 * 60 * 1000, // 24 hours max retention
  maxTotalSize: 200 * 1024 * 1024, // 200MB total directory size

  // Cleanup behavior
  enableAutomaticCleanup: true,
  cleanupInterval: 5 * 60 * 1000, // 5 minutes cleanup checks
  enableEmergencyCleanup: true,

  // Archive settings
  enableArchiving: false, // Disabled by default for simplicity
  compressionEnabled: true
}

/**
 * WAL Rotation Manager
 *
 * Manages the lifecycle of WAL files including rotation based on size/time,
 * cleanup of old files, and emergency operations under storage pressure.
 */
export class WalRotationManager extends EventEmitter {
  private config: RotationPolicy
  private walDirectory: string
  private archiveDirectory?: string
  private stats: RotationStats
  private cleanupTimer?: NodeJS.Timeout
  private rotationTimes: number[] = []
  private isInitialized: boolean = false
  private isDestroyed: boolean = false

  constructor(walDirectory: string, config?: Partial<RotationPolicy>) {
    super()

    this.walDirectory = walDirectory
    this.config = {...DEFAULT_ROTATION_POLICY, ...config}

    if (this.config.enableArchiving && this.config.archiveDirectory) {
      this.archiveDirectory = this.config.archiveDirectory
    }

    this.stats = {
      totalRotations: 0,
      sizeBasedRotations: 0,
      timeBasedRotations: 0,
      emergencyRotations: 0,
      totalCleanups: 0,
      filesDeleted: 0,
      filesArchived: 0,
      bytesReclaimed: 0,
      lastRotationTime: 0,
      lastCleanupTime: 0,
      averageRotationInterval: 0
    }
  }

  /**
   * Initialize the rotation manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Ensure WAL directory exists
      await fs.mkdir(this.walDirectory, {recursive: true})

      // Ensure archive directory exists if archiving is enabled
      if (this.config.enableArchiving && this.archiveDirectory) {
        await fs.mkdir(this.archiveDirectory, {recursive: true})
      }

      // Start automatic cleanup timer
      if (this.config.enableAutomaticCleanup) {
        this.startCleanupTimer()
      }

      // Perform initial cleanup to ensure we're in a consistent state
      await this.performCleanup('initialization')

      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      throw new Error(`Failed to initialize WAL rotation manager: ${error}`)
    }
  }

  /**
   * Destroy the rotation manager
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return
    }

    this.isDestroyed = true

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }

    this.removeAllListeners()
    this.emit('destroyed')
  }

  /**
   * Check if a file needs rotation based on size and time policies
   */
  async shouldRotateFile(
    filePath: string
  ): Promise<{shouldRotate: boolean; reason: string; isEmergency: boolean}> {
    if (!this.isInitialized) {
      throw new Error('Rotation manager not initialized')
    }

    try {
      const stats = await fs.stat(filePath)
      const now = Date.now()
      const fileAge = now - stats.mtime.getTime()
      const fileSize = stats.size

      // Check for emergency conditions first
      if (fileSize >= this.config.emergencyRotationSize) {
        return {
          shouldRotate: true,
          reason: `Emergency rotation: file size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds emergency threshold ${(this.config.emergencyRotationSize / 1024 / 1024).toFixed(2)}MB`,
          isEmergency: true
        }
      }

      if (fileAge >= this.config.emergencyRotationAge) {
        return {
          shouldRotate: true,
          reason: `Emergency rotation: file age ${(fileAge / 60000).toFixed(1)}min exceeds emergency threshold ${(this.config.emergencyRotationAge / 60000).toFixed(1)}min`,
          isEmergency: true
        }
      }

      // Check normal rotation conditions
      if (fileSize >= this.config.maxFileSize) {
        return {
          shouldRotate: true,
          reason: `Size-based rotation: file size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds threshold ${(this.config.maxFileSize / 1024 / 1024).toFixed(2)}MB`,
          isEmergency: false
        }
      }

      if (fileAge >= this.config.maxFileAge) {
        return {
          shouldRotate: true,
          reason: `Time-based rotation: file age ${(fileAge / 60000).toFixed(1)}min exceeds threshold ${(this.config.maxFileAge / 60000).toFixed(1)}min`,
          isEmergency: false
        }
      }

      return {
        shouldRotate: false,
        reason: 'No rotation required',
        isEmergency: false
      }
    } catch (error) {
      throw new Error(`Failed to check rotation status for ${filePath}: ${error}`)
    }
  }

  /**
   * Perform file rotation
   */
  async rotateFile(currentFilePath: string, reason: string = 'Manual rotation'): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Rotation manager not initialized')
    }

    try {
      const stats = await fs.stat(currentFilePath)
      const fileName = basename(currentFilePath)
      const timestamp = Date.now()

      // Generate rotated filename with timestamp
      const rotatedFileName = this.generateRotatedFileName(fileName, timestamp)
      const rotatedFilePath = join(this.walDirectory, rotatedFileName)

      // Move current file to rotated name
      await fs.rename(currentFilePath, rotatedFilePath)

      // Update statistics
      const fileAge = timestamp - stats.mtime.getTime()
      const isEmergency = reason.includes('Emergency')
      const trigger = this.determineTrigger(reason)

      this.updateRotationStats(trigger, isEmergency)
      this.recordRotationTime(timestamp)

      // Emit rotation event
      const rotationEvent: RotationEvent = {
        type: isEmergency ? 'emergency' : 'rotation',
        trigger,
        fileName,
        newFileName: rotatedFileName,
        size: stats.size,
        age: fileAge,
        reason,
        timestamp
      }

      this.emit('fileRotated', rotationEvent)

      // Trigger cleanup if configured
      if (this.config.enableAutomaticCleanup) {
        setImmediate(() => {
          this.performCleanup('post-rotation').catch(error => {
            this.emit('error', new Error(`Post-rotation cleanup failed: ${error}`))
          })
        })
      }

      return rotatedFilePath
    } catch (error) {
      throw new Error(`Failed to rotate file ${currentFilePath}: ${error}`)
    }
  }

  /**
   * Perform cleanup of old WAL files
   */
  async performCleanup(
    reason: string = 'scheduled'
  ): Promise<{deleted: number; archived: number; bytesReclaimed: number}> {
    if (!this.isInitialized) {
      throw new Error('Rotation manager not initialized')
    }

    try {
      const walFiles = await this.getWalFiles()
      const sortedFiles = walFiles.sort((a, b) => b.modified - a.modified) // Newest first

      let deleted = 0
      let archived = 0
      let bytesReclaimed = 0

      // Calculate total size and identify files to clean up
      const totalSize = walFiles.reduce((sum, file) => sum + file.size, 0)
      const filesToCleanup: WalFileInfo[] = []

      // Check retention policies
      for (let i = 0; i < sortedFiles.length; i++) {
        const file = sortedFiles[i]
        const fileAge = Date.now() - file.modified
        const exceedsRetentionCount = i >= this.config.maxRetentionFiles
        const exceedsRetentionAge = fileAge > this.config.maxRetentionAge
        const contributesToSizeExcess = totalSize > this.config.maxTotalSize

        if (exceedsRetentionCount || exceedsRetentionAge || contributesToSizeExcess) {
          filesToCleanup.push(file)
        }
      }

      // Process files for cleanup
      for (const file of filesToCleanup) {
        try {
          if (this.config.enableArchiving && this.archiveDirectory && !file.isArchived) {
            await this.archiveFile(file)
            archived++
            bytesReclaimed += file.size

            this.emit('fileArchived', {
              type: 'archive',
              trigger: 'retention',
              fileName: file.fileName,
              size: file.size,
              age: Date.now() - file.modified,
              reason: `Archived due to ${reason}`,
              timestamp: Date.now()
            } as RotationEvent)
          } else {
            await fs.unlink(file.filePath)
            deleted++
            bytesReclaimed += file.size

            this.emit('fileDeleted', {
              type: 'cleanup',
              trigger: 'retention',
              fileName: file.fileName,
              size: file.size,
              age: Date.now() - file.modified,
              reason: `Deleted due to ${reason}`,
              timestamp: Date.now()
            } as RotationEvent)
          }
        } catch (error) {
          this.emit('error', new Error(`Failed to cleanup file ${file.fileName}: ${error}`))
        }
      }

      // Update statistics
      this.stats.totalCleanups++
      this.stats.filesDeleted += deleted
      this.stats.filesArchived += archived
      this.stats.bytesReclaimed += bytesReclaimed
      this.stats.lastCleanupTime = Date.now()

      this.emit('cleanupCompleted', {deleted, archived, bytesReclaimed, reason})

      return {deleted, archived, bytesReclaimed}
    } catch (error) {
      throw new Error(`Failed to perform cleanup: ${error}`)
    }
  }

  /**
   * Perform emergency cleanup under storage pressure
   */
  async emergencyCleanup(
    targetBytesToFree: number
  ): Promise<{success: boolean; bytesFreed: number}> {
    if (!this.config.enableEmergencyCleanup) {
      return {success: false, bytesFreed: 0}
    }

    try {
      const walFiles = await this.getWalFiles()
      const sortedFiles = walFiles.sort((a, b) => a.modified - b.modified) // Oldest first for emergency

      let bytesFreed = 0
      let filesProcessed = 0

      for (const file of sortedFiles) {
        if (bytesFreed >= targetBytesToFree) {
          break
        }

        try {
          await fs.unlink(file.filePath)
          bytesFreed += file.size
          filesProcessed++

          this.emit('fileDeleted', {
            type: 'emergency',
            trigger: 'storage-pressure',
            fileName: file.fileName,
            size: file.size,
            age: Date.now() - file.modified,
            reason: 'Emergency cleanup due to storage pressure',
            timestamp: Date.now()
          } as RotationEvent)
        } catch (error) {
          this.emit('error', new Error(`Failed to delete file during emergency cleanup: ${error}`))
        }
      }

      // Update emergency stats
      this.stats.emergencyRotations++
      this.stats.filesDeleted += filesProcessed
      this.stats.bytesReclaimed += bytesFreed

      const success = bytesFreed >= targetBytesToFree

      this.emit('emergencyCleanupCompleted', {
        success,
        bytesFreed,
        filesProcessed,
        targetBytesToFree
      })

      return {success, bytesFreed}
    } catch (error) {
      this.emit('error', new Error(`Emergency cleanup failed: ${error}`))
      return {success: false, bytesFreed: 0}
    }
  }

  /**
   * Get all WAL files with metadata
   */
  async getWalFiles(): Promise<WalFileInfo[]> {
    try {
      const entries = await fs.readdir(this.walDirectory, {withFileTypes: true})
      const walFiles: WalFileInfo[] = []

      for (const entry of entries) {
        if (entry.isFile() && this.isWalFile(entry.name)) {
          try {
            const filePath = join(this.walDirectory, entry.name)
            const stats = await fs.stat(filePath)

            walFiles.push({
              fileName: entry.name,
              filePath,
              size: stats.size,
              created: stats.birthtime.getTime(),
              modified: stats.mtime.getTime(),
              isArchived: false
            })
          } catch (error) {
            this.emit(
              'error',
              new Error(`Failed to get stats for WAL file ${entry.name}: ${error}`)
            )
          }
        }
      }

      return walFiles
    } catch (error) {
      throw new Error(`Failed to get WAL files: ${error}`)
    }
  }

  /**
   * Get rotation statistics
   */
  getStats(): RotationStats {
    return {...this.stats}
  }

  /**
   * Get current configuration
   */
  getConfig(): RotationPolicy {
    return {...this.config}
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RotationPolicy>): void {
    this.config = {...this.config, ...config}

    // Restart cleanup timer if interval changed
    if (config.cleanupInterval && this.cleanupTimer) {
      this.stopCleanupTimer()
      this.startCleanupTimer()
    }

    this.emit('configUpdated', this.config)
  }

  // Private methods

  /**
   * Start the automatic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return
    }

    this.cleanupTimer = setInterval(() => {
      this.performCleanup('scheduled').catch(error => {
        this.emit('error', new Error(`Scheduled cleanup failed: ${error}`))
      })
    }, this.config.cleanupInterval)
  }

  /**
   * Stop the cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }

  /**
   * Generate a rotated filename with timestamp
   */
  private generateRotatedFileName(originalFileName: string, timestamp: number): string {
    const date = new Date(timestamp)
    const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, -5) // Remove milliseconds and 'Z'

    // Remove .wal extension if present, add timestamp, then add .wal back
    const baseName = originalFileName.replace(/\.wal$/, '')
    return `${baseName}-${dateStr}.wal`
  }

  /**
   * Archive a WAL file to the archive directory
   */
  private async archiveFile(file: WalFileInfo): Promise<void> {
    if (!this.archiveDirectory) {
      throw new Error('Archive directory not configured')
    }

    const archiveFilePath = join(this.archiveDirectory, file.fileName)

    // Optionally compress the file during archiving
    if (this.config.compressionEnabled) {
      const {createGzip} = await import('zlib')
      const {createReadStream, createWriteStream} = await import('fs')
      const {pipeline} = await import('stream')
      const {promisify} = await import('util')
      const pipelineAsync = promisify(pipeline)

      const gzipFilePath = `${archiveFilePath}.gz`

      await pipelineAsync(
        createReadStream(file.filePath),
        createGzip(),
        createWriteStream(gzipFilePath)
      )

      // Remove original after successful compression
      await fs.unlink(file.filePath)
    } else {
      // Simple move to archive directory
      await fs.rename(file.filePath, archiveFilePath)
    }
  }

  /**
   * Check if a filename is a WAL file
   */
  private isWalFile(fileName: string): boolean {
    return fileName.endsWith('.wal') || fileName.includes('.wal.')
  }

  /**
   * Determine the trigger type from reason string
   */
  private determineTrigger(reason: string): 'size' | 'time' | 'manual' | 'storage-pressure' {
    if (reason.includes('size') || reason.includes('Size')) {
      return 'size'
    }
    if (reason.includes('time') || reason.includes('age') || reason.includes('Time')) {
      return 'time'
    }
    if (reason.includes('storage') || reason.includes('pressure')) {
      return 'storage-pressure'
    }
    return 'manual'
  }

  /**
   * Update rotation statistics
   */
  private updateRotationStats(
    trigger: 'size' | 'time' | 'manual' | 'storage-pressure',
    isEmergency: boolean
  ): void {
    this.stats.totalRotations++
    this.stats.lastRotationTime = Date.now()

    if (isEmergency) {
      this.stats.emergencyRotations++
    } else {
      switch (trigger) {
        case 'size':
          this.stats.sizeBasedRotations++
          break
        case 'time':
          this.stats.timeBasedRotations++
          break
      }
    }
  }

  /**
   * Record rotation time for calculating averages
   */
  private recordRotationTime(timestamp: number): void {
    this.rotationTimes.push(timestamp)

    // Keep only last 100 rotation times for average calculation
    if (this.rotationTimes.length > 100) {
      this.rotationTimes.shift()
    }

    // Calculate average rotation interval
    if (this.rotationTimes.length > 1) {
      const intervals = []
      for (let i = 1; i < this.rotationTimes.length; i++) {
        intervals.push(this.rotationTimes[i] - this.rotationTimes[i - 1])
      }
      this.stats.averageRotationInterval =
        intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
    }
  }
}

export default WalRotationManager
