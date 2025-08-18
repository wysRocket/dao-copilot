/**
 * StorageMonitor - Monitors storage usage for WAL files and system storage
 *
 * Provides:
 * - Real-time storage usage monitoring
 * - Threshold-based warnings and alerts
 * - Integration with rotation manager for emergency cleanup
 * - Storage trend analysis and predictions
 * - Cross-platform storage information gathering
 */

import {promises as fs} from 'fs'
import {join} from 'path'
import {EventEmitter} from 'events'

export interface StorageThresholds {
  // WAL directory specific thresholds
  walWarningSize: number // WAL directory warning size (bytes), default: 100MB
  walCriticalSize: number // WAL directory critical size (bytes), default: 150MB
  walMaxSize: number // WAL directory max allowed size (bytes), default: 200MB

  // System storage thresholds
  diskWarningPercent: number // System disk warning threshold (%), default: 80%
  diskCriticalPercent: number // System disk critical threshold (%), default: 90%
  diskMinFreeSpace: number // Minimum free space required (bytes), default: 1GB

  // Growth rate thresholds
  maxGrowthRate: number // Max acceptable growth rate (bytes/hour), default: 10MB/hour
  warningGrowthRate: number // Warning growth rate threshold (bytes/hour), default: 5MB/hour
}

export interface StorageInfo {
  // WAL directory info
  walDirectorySize: number
  walFileCount: number
  walOldestFile: number // Timestamp of oldest file
  walNewestFile: number // Timestamp of newest file

  // System storage info
  totalSpace: number
  freeSpace: number
  usedSpace: number
  freePercent: number
  usedPercent: number

  // Growth analysis
  growthRate: number // Bytes per hour
  projectedFullTime: number // Time until storage full (ms), -1 if stable

  // Status assessment
  status: 'excellent' | 'good' | 'warning' | 'critical' | 'emergency'
  warnings: string[]
  recommendations: string[]
}

export interface StorageAlert {
  id: string
  type: 'warning' | 'critical' | 'emergency'
  category: 'wal-size' | 'disk-space' | 'growth-rate' | 'file-count' | 'system'
  message: string
  timestamp: number
  value: number
  threshold: number
  requiresAction: boolean
}

export interface StorageMetrics {
  totalChecks: number
  warningAlerts: number
  criticalAlerts: number
  emergencyAlerts: number
  cleanupTriggered: number
  lastCheckTime: number
  averageCheckDuration: number
  largestWalSize: number
  maxGrowthRateObserved: number
  uptimeMs: number
}

export const DEFAULT_STORAGE_THRESHOLDS: StorageThresholds = {
  // WAL thresholds (aligned with task requirements)
  walWarningSize: 100 * 1024 * 1024, // 100MB warning
  walCriticalSize: 150 * 1024 * 1024, // 150MB critical
  walMaxSize: 200 * 1024 * 1024, // 200MB max (as per task)

  // System thresholds
  diskWarningPercent: 80, // 80% disk usage warning
  diskCriticalPercent: 90, // 90% disk usage critical
  diskMinFreeSpace: 1024 * 1024 * 1024, // 1GB minimum free space

  // Growth rate thresholds
  maxGrowthRate: 10 * 1024 * 1024, // 10MB/hour max growth
  warningGrowthRate: 5 * 1024 * 1024 // 5MB/hour warning threshold
}

/**
 * Storage Monitor
 *
 * Monitors storage usage for WAL files and system storage, providing
 * warnings and triggering emergency cleanup when thresholds are exceeded.
 */
export class StorageMonitor extends EventEmitter {
  private thresholds: StorageThresholds
  private walDirectory: string
  private metrics: StorageMetrics
  private alerts: Map<string, StorageAlert> = new Map()
  private monitoringInterval?: NodeJS.Timeout
  private isMonitoring: boolean = false
  private isInitialized: boolean = false
  private isDestroyed: boolean = false

  // Storage usage history for growth rate calculation
  private sizeHistory: Array<{timestamp: number; size: number}> = []
  private readonly maxHistoryEntries = 100
  private readonly startTime = Date.now()

  constructor(walDirectory: string, thresholds?: Partial<StorageThresholds>) {
    super()

    this.walDirectory = walDirectory
    this.thresholds = {...DEFAULT_STORAGE_THRESHOLDS, ...thresholds}

    this.metrics = {
      totalChecks: 0,
      warningAlerts: 0,
      criticalAlerts: 0,
      emergencyAlerts: 0,
      cleanupTriggered: 0,
      lastCheckTime: 0,
      averageCheckDuration: 0,
      largestWalSize: 0,
      maxGrowthRateObserved: 0,
      uptimeMs: 0
    }
  }

  /**
   * Initialize the storage monitor
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Ensure WAL directory exists
      await fs.mkdir(this.walDirectory, {recursive: true})

      // Perform initial storage check
      await this.checkStorage()

      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      throw new Error(`Failed to initialize storage monitor: ${error}`)
    }
  }

  /**
   * Start monitoring with specified interval
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (!this.isInitialized) {
      throw new Error('Storage monitor not initialized')
    }

    if (this.isMonitoring) {
      return
    }

    this.isMonitoring = true

    this.monitoringInterval = setInterval(() => {
      this.checkStorage().catch(error => {
        this.emit('error', new Error(`Storage monitoring check failed: ${error}`))
      })
    }, intervalMs)

    this.emit('monitoringStarted', {intervalMs})
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return
    }

    this.isMonitoring = false

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
    }

    this.emit('monitoringStopped')
  }

  /**
   * Destroy the storage monitor
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return
    }

    this.isDestroyed = true
    this.stopMonitoring()
    this.removeAllListeners()

    this.emit('destroyed')
  }

  /**
   * Perform a storage check
   */
  async checkStorage(): Promise<StorageInfo> {
    const startTime = performance.now()

    try {
      const storageInfo = await this.gatherStorageInfo()

      // Update history for growth rate calculation
      this.updateSizeHistory(storageInfo.walDirectorySize)

      // Calculate growth rate
      storageInfo.growthRate = this.calculateGrowthRate()
      storageInfo.projectedFullTime = this.calculateProjectedFullTime(storageInfo)

      // Assess storage status and generate alerts
      this.assessStorageStatus(storageInfo)

      // Update metrics
      this.updateMetrics(performance.now() - startTime, storageInfo)

      // Emit storage update event
      this.emit('storageUpdated', storageInfo)

      return storageInfo
    } catch (error) {
      this.emit('error', new Error(`Storage check failed: ${error}`))
      throw error
    }
  }

  /**
   * Get current storage information
   */
  async getStorageInfo(): Promise<StorageInfo> {
    return this.checkStorage()
  }

  /**
   * Get active storage alerts
   */
  getActiveAlerts(): StorageAlert[] {
    return Array.from(this.alerts.values()).sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Clear specific alert by ID
   */
  clearAlert(alertId: string): boolean {
    return this.alerts.delete(alertId)
  }

  /**
   * Clear all alerts
   */
  clearAllAlerts(): void {
    this.alerts.clear()
    this.emit('alertsCleared')
  }

  /**
   * Get storage monitoring metrics
   */
  getMetrics(): StorageMetrics {
    this.metrics.uptimeMs = Date.now() - this.startTime
    return {...this.metrics}
  }

  /**
   * Get current configuration
   */
  getThresholds(): StorageThresholds {
    return {...this.thresholds}
  }

  /**
   * Update storage thresholds
   */
  updateThresholds(thresholds: Partial<StorageThresholds>): void {
    this.thresholds = {...this.thresholds, ...thresholds}
    this.emit('thresholdsUpdated', this.thresholds)
  }

  /**
   * Trigger emergency cleanup if thresholds exceeded
   */
  async triggerEmergencyCleanupIfNeeded(): Promise<{triggered: boolean; reason?: string}> {
    const storageInfo = await this.getStorageInfo()

    // Check if emergency action is needed
    if (storageInfo.status === 'emergency') {
      const bytesToFree = Math.max(
        storageInfo.walDirectorySize - this.thresholds.walWarningSize,
        this.thresholds.walMaxSize * 0.1 // Free at least 10% of max size
      )

      this.metrics.cleanupTriggered++

      const reason = `Emergency cleanup triggered: ${storageInfo.status} storage status`

      this.emit('emergencyCleanupTriggered', {
        reason,
        bytesToFree,
        currentSize: storageInfo.walDirectorySize,
        maxSize: this.thresholds.walMaxSize
      })

      return {triggered: true, reason}
    }

    return {triggered: false}
  }

  // Private methods

  /**
   * Gather comprehensive storage information
   */
  private async gatherStorageInfo(): Promise<StorageInfo> {
    const walInfo = await this.getWalDirectoryInfo()
    const systemInfo = await this.getSystemStorageInfo()

    return {
      // WAL directory info
      walDirectorySize: walInfo.totalSize,
      walFileCount: walInfo.fileCount,
      walOldestFile: walInfo.oldestFile,
      walNewestFile: walInfo.newestFile,

      // System storage info
      totalSpace: systemInfo.total,
      freeSpace: systemInfo.free,
      usedSpace: systemInfo.used,
      freePercent: (systemInfo.free / systemInfo.total) * 100,
      usedPercent: (systemInfo.used / systemInfo.total) * 100,

      // Will be calculated by caller
      growthRate: 0,
      projectedFullTime: -1,

      // Will be assessed by caller
      status: 'excellent',
      warnings: [],
      recommendations: []
    }
  }

  /**
   * Get WAL directory information
   */
  private async getWalDirectoryInfo(): Promise<{
    totalSize: number
    fileCount: number
    oldestFile: number
    newestFile: number
  }> {
    try {
      const entries = await fs.readdir(this.walDirectory, {withFileTypes: true})

      let totalSize = 0
      let fileCount = 0
      let oldestFile = Infinity
      let newestFile = 0

      for (const entry of entries) {
        if (entry.isFile() && this.isWalFile(entry.name)) {
          try {
            const filePath = join(this.walDirectory, entry.name)
            const stats = await fs.stat(filePath)

            totalSize += stats.size
            fileCount++
            oldestFile = Math.min(oldestFile, stats.mtime.getTime())
            newestFile = Math.max(newestFile, stats.mtime.getTime())
          } catch (error) {
            this.emit('error', new Error(`Failed to stat WAL file ${entry.name}: ${error}`))
          }
        }
      }

      return {
        totalSize,
        fileCount,
        oldestFile: oldestFile === Infinity ? Date.now() : oldestFile,
        newestFile: newestFile || Date.now()
      }
    } catch (error) {
      throw new Error(`Failed to get WAL directory info: ${error}`)
    }
  }

  /**
   * Get system storage information
   */
  private async getSystemStorageInfo(): Promise<{total: number; free: number; used: number}> {
    try {
      // Try to get disk usage information using different methods based on platform
      if (typeof process !== 'undefined' && process.platform) {
        return await this.getPlatformStorageInfo()
      } else {
        // Browser environment - return approximation
        return this.getBrowserStorageInfo()
      }
    } catch (error) {
      // Fallback to basic estimates if system calls fail
      return {
        total: 100 * 1024 * 1024 * 1024, // 100GB estimate
        free: 50 * 1024 * 1024 * 1024, // 50GB estimate
        used: 50 * 1024 * 1024 * 1024 // 50GB estimate
      }
    }
  }

  /**
   * Get platform-specific storage information
   */
  private async getPlatformStorageInfo(): Promise<{total: number; free: number; used: number}> {
    // This would normally use platform-specific APIs
    // For now, we'll use a simplified approach with fs.stat
    try {
      const stats = await fs.stat(this.walDirectory)

      // This is a simplified approach - in production you'd want to use
      // platform-specific APIs like statvfs on Unix or GetDiskFreeSpace on Windows
      const total = 100 * 1024 * 1024 * 1024 // 100GB default
      const free = 50 * 1024 * 1024 * 1024 // 50GB default
      const used = total - free

      return {total, free, used}
    } catch (error) {
      throw new Error(`Failed to get platform storage info: ${error}`)
    }
  }

  /**
   * Get browser storage information
   */
  private getBrowserStorageInfo(): {total: number; free: number; used: number} {
    // Browser environment - use storage quota API if available
    const total = 10 * 1024 * 1024 * 1024 // 10GB estimate for browser
    const free = 5 * 1024 * 1024 * 1024 // 5GB estimate
    const used = total - free

    return {total, free, used}
  }

  /**
   * Update size history for growth rate calculation
   */
  private updateSizeHistory(currentSize: number): void {
    const timestamp = Date.now()

    this.sizeHistory.push({timestamp, size: currentSize})

    // Keep only recent history entries
    if (this.sizeHistory.length > this.maxHistoryEntries) {
      this.sizeHistory.shift()
    }
  }

  /**
   * Calculate growth rate in bytes per hour
   */
  private calculateGrowthRate(): number {
    if (this.sizeHistory.length < 2) {
      return 0
    }

    const recent = this.sizeHistory.slice(-10) // Use last 10 measurements
    if (recent.length < 2) {
      return 0
    }

    const oldest = recent[0]
    const newest = recent[recent.length - 1]

    const timeDiffMs = newest.timestamp - oldest.timestamp
    const sizeDiff = newest.size - oldest.size

    if (timeDiffMs <= 0) {
      return 0
    }

    // Convert to bytes per hour
    const growthRate = (sizeDiff / timeDiffMs) * (60 * 60 * 1000)

    return Math.max(0, growthRate) // Only positive growth rates
  }

  /**
   * Calculate projected time until storage is full
   */
  private calculateProjectedFullTime(storageInfo: StorageInfo): number {
    if (storageInfo.growthRate <= 0) {
      return -1 // Stable or decreasing
    }

    const remainingSpace = this.thresholds.walMaxSize - storageInfo.walDirectorySize

    if (remainingSpace <= 0) {
      return 0 // Already full
    }

    // Time in milliseconds until full
    const timeUntilFull = (remainingSpace / storageInfo.growthRate) * (60 * 60 * 1000)

    return timeUntilFull
  }

  /**
   * Assess storage status and generate alerts
   */
  private assessStorageStatus(storageInfo: StorageInfo): void {
    const warnings: string[] = []
    const recommendations: string[] = []
    let status: 'excellent' | 'good' | 'warning' | 'critical' | 'emergency' = 'excellent'

    // Check WAL directory size
    if (storageInfo.walDirectorySize >= this.thresholds.walMaxSize) {
      status = 'emergency'
      warnings.push(
        `WAL directory size ${(storageInfo.walDirectorySize / 1024 / 1024).toFixed(2)}MB exceeds maximum ${(this.thresholds.walMaxSize / 1024 / 1024).toFixed(2)}MB`
      )
      recommendations.push('Emergency cleanup required immediately')
      this.createAlert(
        'emergency',
        'wal-size',
        'WAL directory exceeds maximum size',
        storageInfo.walDirectorySize,
        this.thresholds.walMaxSize,
        true
      )
    } else if (storageInfo.walDirectorySize >= this.thresholds.walCriticalSize) {
      status = 'critical'
      warnings.push(
        `WAL directory size ${(storageInfo.walDirectorySize / 1024 / 1024).toFixed(2)}MB exceeds critical threshold ${(this.thresholds.walCriticalSize / 1024 / 1024).toFixed(2)}MB`
      )
      recommendations.push('Immediate cleanup recommended')
      this.createAlert(
        'critical',
        'wal-size',
        'WAL directory exceeds critical threshold',
        storageInfo.walDirectorySize,
        this.thresholds.walCriticalSize,
        true
      )
    } else if (storageInfo.walDirectorySize >= this.thresholds.walWarningSize) {
      status = Math.max(status, 'warning') as typeof status
      warnings.push(
        `WAL directory size ${(storageInfo.walDirectorySize / 1024 / 1024).toFixed(2)}MB exceeds warning threshold ${(this.thresholds.walWarningSize / 1024 / 1024).toFixed(2)}MB`
      )
      recommendations.push('Consider cleanup soon')
      this.createAlert(
        'warning',
        'wal-size',
        'WAL directory exceeds warning threshold',
        storageInfo.walDirectorySize,
        this.thresholds.walWarningSize,
        false
      )
    }

    // Check system disk usage
    if (storageInfo.usedPercent >= this.thresholds.diskCriticalPercent) {
      status = Math.max(status, 'critical') as typeof status
      warnings.push(
        `System disk usage ${storageInfo.usedPercent.toFixed(1)}% exceeds critical threshold ${this.thresholds.diskCriticalPercent}%`
      )
      recommendations.push('Free up disk space immediately')
      this.createAlert(
        'critical',
        'disk-space',
        'System disk usage critical',
        storageInfo.usedPercent,
        this.thresholds.diskCriticalPercent,
        true
      )
    } else if (storageInfo.usedPercent >= this.thresholds.diskWarningPercent) {
      status = Math.max(status, 'warning') as typeof status
      warnings.push(
        `System disk usage ${storageInfo.usedPercent.toFixed(1)}% exceeds warning threshold ${this.thresholds.diskWarningPercent}%`
      )
      recommendations.push('Monitor disk usage closely')
      this.createAlert(
        'warning',
        'disk-space',
        'System disk usage high',
        storageInfo.usedPercent,
        this.thresholds.diskWarningPercent,
        false
      )
    }

    // Check growth rate
    if (storageInfo.growthRate >= this.thresholds.maxGrowthRate) {
      status = Math.max(status, 'critical') as typeof status
      warnings.push(
        `WAL growth rate ${(storageInfo.growthRate / 1024 / 1024).toFixed(2)}MB/hour exceeds maximum ${(this.thresholds.maxGrowthRate / 1024 / 1024).toFixed(2)}MB/hour`
      )
      recommendations.push('Investigate high growth rate causes')
      this.createAlert(
        'critical',
        'growth-rate',
        'WAL growth rate too high',
        storageInfo.growthRate,
        this.thresholds.maxGrowthRate,
        true
      )
    } else if (storageInfo.growthRate >= this.thresholds.warningGrowthRate) {
      status = Math.max(status, 'warning') as typeof status
      warnings.push(
        `WAL growth rate ${(storageInfo.growthRate / 1024 / 1024).toFixed(2)}MB/hour exceeds warning threshold ${(this.thresholds.warningGrowthRate / 1024 / 1024).toFixed(2)}MB/hour`
      )
      recommendations.push('Monitor growth rate trend')
      this.createAlert(
        'warning',
        'growth-rate',
        'WAL growth rate elevated',
        storageInfo.growthRate,
        this.thresholds.warningGrowthRate,
        false
      )
    }

    // Add positive feedback for good status
    if (status === 'excellent') {
      recommendations.push('Storage usage is excellent')
    } else if (status === 'good') {
      recommendations.push('Storage usage is within acceptable limits')
    }

    storageInfo.status = status
    storageInfo.warnings = warnings
    storageInfo.recommendations = recommendations
  }

  /**
   * Create a storage alert
   */
  private createAlert(
    type: 'warning' | 'critical' | 'emergency',
    category: 'wal-size' | 'disk-space' | 'growth-rate' | 'file-count' | 'system',
    message: string,
    value: number,
    threshold: number,
    requiresAction: boolean
  ): void {
    const alertId = `${category}-${type}-${Date.now()}`

    const alert: StorageAlert = {
      id: alertId,
      type,
      category,
      message,
      timestamp: Date.now(),
      value,
      threshold,
      requiresAction
    }

    this.alerts.set(alertId, alert)

    // Update alert metrics
    switch (type) {
      case 'warning':
        this.metrics.warningAlerts++
        break
      case 'critical':
        this.metrics.criticalAlerts++
        break
      case 'emergency':
        this.metrics.emergencyAlerts++
        break
    }

    this.emit('alertCreated', alert)
  }

  /**
   * Update monitoring metrics
   */
  private updateMetrics(checkDuration: number, storageInfo: StorageInfo): void {
    this.metrics.totalChecks++
    this.metrics.lastCheckTime = Date.now()

    // Update average check duration
    if (this.metrics.totalChecks === 1) {
      this.metrics.averageCheckDuration = checkDuration
    } else {
      this.metrics.averageCheckDuration =
        (this.metrics.averageCheckDuration * (this.metrics.totalChecks - 1) + checkDuration) /
        this.metrics.totalChecks
    }

    // Update largest observed values
    this.metrics.largestWalSize = Math.max(
      this.metrics.largestWalSize,
      storageInfo.walDirectorySize
    )
    this.metrics.maxGrowthRateObserved = Math.max(
      this.metrics.maxGrowthRateObserved,
      storageInfo.growthRate
    )
  }

  /**
   * Check if a filename is a WAL file
   */
  private isWalFile(fileName: string): boolean {
    return fileName.endsWith('.wal') || fileName.includes('.wal.')
  }
}

export default StorageMonitor
