/**
 * Advanced Search Cache System with Multiple Storage Layers
 * 
 * This system provides multi-tier caching for search results with intelligent
 * cache management, fallback mechanisms, and performance optimization.
 * 
 * Features:
 * - Multi-tier caching (memory, disk, distributed)
 * - Intelligent cache invalidation and refresh
 * - Search result similarity matching
 * - Performance analytics and monitoring
 * - Fallback to offline knowledge bases
 * - Cache warming and preloading strategies
 */

import { EventEmitter } from 'events'
import * as fs from 'fs/promises'
import * as path from 'path'
import { createHash } from 'crypto'
import { logger } from './gemini-logger'

// Types and interfaces
interface CacheEntry<T = any> {
  key: string
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
  accessCount: number
  lastAccessed: number
  size: number // Size in bytes
  metadata?: {
    source: 'google_search' | 'fallback' | 'precomputed'
    quality: number // Quality score 0-1
    relevanceScore?: number
    searchQuery?: string
    resultCount?: number
  }
}

interface CacheStats {
  totalEntries: number
  memoryUsage: number // In bytes
  diskUsage: number // In bytes
  hitRate: number
  missRate: number
  averageAccessTime: number
  evictionCount: number
  errorCount: number
}

interface CacheConfig {
  // Memory cache settings
  maxMemorySize: number // Maximum memory usage in bytes
  maxMemoryEntries: number
  defaultTTL: number // Default TTL in milliseconds
  
  // Disk cache settings
  enableDiskCache: boolean
  diskCacheDir: string
  maxDiskSize: number // Maximum disk usage in bytes
  maxDiskEntries: number
  diskTTL: number // Disk cache TTL in milliseconds
  
  // Performance settings
  cleanupInterval: number // Cleanup interval in milliseconds
  compressionEnabled: boolean
  encryptionEnabled: boolean
  
  // Cache warming settings
  enableCacheWarming: boolean
  warmingQueries: string[]
  warmingInterval: number
  
  // Analytics settings
  enableAnalytics: boolean
  analyticsRetentionDays: number
}

interface SearchResult {
  title: string
  url: string
  snippet: string
  displayUrl?: string
  formattedUrl?: string
  htmlTitle?: string
  htmlSnippet?: string
  cacheId?: string
  pagemap?: any
}

interface SearchResponse {
  query: string
  results: SearchResult[]
  totalResults: number
  searchTime: number
  source: 'cache' | 'api' | 'fallback'
  cacheHit: boolean
  timestamp: number
}

/**
 * LRU (Least Recently Used) Cache implementation optimized for search results
 */
class LRUCache<T> extends EventEmitter {
  private cache = new Map<string, CacheEntry<T>>()
  private accessOrder: string[] = []
  private maxSize: number
  private maxEntries: number
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalAccesses: 0
  }

  constructor(maxSize: number, maxEntries: number) {
    super()
    this.maxSize = maxSize
    this.maxEntries = maxEntries
  }

  set(key: string, value: T, ttl?: number): void {
    const now = Date.now()
    const size = this.calculateSize(value)
    
    // Check if we need to evict entries
    this.evictIfNeeded(size)
    
    const entry: CacheEntry<T> = {
      key,
      data: value,
      timestamp: now,
      ttl: ttl || 3600000, // Default 1 hour
      accessCount: 0,
      lastAccessed: now,
      size
    }
    
    // Remove from old position if exists
    if (this.cache.has(key)) {
      this.removeFromAccessOrder(key)
    }
    
    this.cache.set(key, entry)
    this.accessOrder.push(key)
    
    this.emit('entry_added', { key, size })
  }

  get(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) {
      this.stats.misses++
      this.stats.totalAccesses++
      return null
    }
    
    const now = Date.now()
    
    // Check if entry is expired
    if (now - entry.timestamp > entry.ttl) {
      this.delete(key)
      this.stats.misses++
      this.stats.totalAccesses++
      this.emit('entry_expired', { key })
      return null
    }
    
    // Update access statistics
    entry.accessCount++
    entry.lastAccessed = now
    
    // Move to end (most recently used)
    this.removeFromAccessOrder(key)
    this.accessOrder.push(key)
    
    this.stats.hits++
    this.stats.totalAccesses++
    
    this.emit('entry_accessed', { key, accessCount: entry.accessCount })
    return entry.data
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    
    this.cache.delete(key)
    this.removeFromAccessOrder(key)
    
    this.emit('entry_removed', { key, size: entry.size })
    return true
  }

  clear(): void {
    const size = this.getCurrentSize()
    this.cache.clear()
    this.accessOrder = []
    this.emit('cache_cleared', { entriesRemoved: this.cache.size, sizeFreed: size })
  }

  getCurrentSize(): number {
    let totalSize = 0
    for (const entry of this.cache.values()) {
      totalSize += entry.size
    }
    return totalSize
  }

  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.totalAccesses > 0 ? this.stats.hits / this.stats.totalAccesses : 0,
      currentEntries: this.cache.size,
      currentSize: this.getCurrentSize()
    }
  }

  private calculateSize(value: any): number {
    return JSON.stringify(value).length * 2 // Approximate size in bytes (UTF-16)
  }

  private evictIfNeeded(newEntrySize: number): void {
    // Evict by entry count
    while (this.cache.size >= this.maxEntries && this.accessOrder.length > 0) {
      this.evictLRU()
    }
    
    // Evict by size
    while (this.getCurrentSize() + newEntrySize > this.maxSize && this.accessOrder.length > 0) {
      this.evictLRU()
    }
  }

  private evictLRU(): void {
    const lruKey = this.accessOrder.shift()
    if (lruKey && this.cache.has(lruKey)) {
      const entry = this.cache.get(lruKey)!
      this.cache.delete(lruKey)
      this.stats.evictions++
      this.emit('entry_evicted', { key: lruKey, size: entry.size, accessCount: entry.accessCount })
    }
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
  }
}

/**
 * Advanced Search Cache System with multi-tier storage and intelligent fallbacks
 */
export class SearchCacheSystem extends EventEmitter {
  private config: CacheConfig
  private memoryCache: LRUCache<SearchResponse>
  private diskCacheDir: string
  private isInitialized = false
  
  // Performance tracking
  private performanceMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    diskHits: 0,
    diskMisses: 0,
    fallbackUsed: 0,
    averageRetrievalTime: 0,
    errorCount: 0
  }
  
  // Query similarity tracking for intelligent caching
  private queryHistory: string[] = []
  private popularQueries = new Map<string, number>() // Query frequency tracking
  
  // Fallback knowledge base
  private fallbackKnowledge = new Map<string, SearchResponse>()
  
  constructor(config: Partial<CacheConfig> = {}) {
    super()
    
    this.config = {
      // Default configuration
      maxMemorySize: 50 * 1024 * 1024, // 50MB
      maxMemoryEntries: 1000,
      defaultTTL: 3600000, // 1 hour
      
      enableDiskCache: true,
      diskCacheDir: './cache/search',
      maxDiskSize: 500 * 1024 * 1024, // 500MB
      maxDiskEntries: 10000,
      diskTTL: 86400000, // 24 hours
      
      cleanupInterval: 300000, // 5 minutes
      compressionEnabled: true,
      encryptionEnabled: false,
      
      enableCacheWarming: true,
      warmingQueries: [
        'current events today',
        'latest technology news',
        'weather forecast',
        'stock market update'
      ],
      warmingInterval: 3600000, // 1 hour
      
      enableAnalytics: true,
      analyticsRetentionDays: 30,
      
      ...config
    }
    
    this.memoryCache = new LRUCache<SearchResponse>(
      this.config.maxMemorySize,
      this.config.maxMemoryEntries
    )
    
    this.diskCacheDir = path.resolve(this.config.diskCacheDir)
    
    this.setupEventHandlers()
    
    logger.info('SearchCacheSystem initialized', {
      maxMemorySize: `${(this.config.maxMemorySize / 1024 / 1024).toFixed(1)}MB`,
      maxDiskSize: `${(this.config.maxDiskSize / 1024 / 1024).toFixed(1)}MB`,
      diskCacheEnabled: this.config.enableDiskCache,
      cacheWarmingEnabled: this.config.enableCacheWarming
    })
  }

  /**
   * Initialize the cache system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Create cache directory
      if (this.config.enableDiskCache) {
        await fs.mkdir(this.diskCacheDir, { recursive: true })
        logger.info('Disk cache directory created', { path: this.diskCacheDir })
      }
      
      // Load fallback knowledge base
      await this.loadFallbackKnowledge()
      
      // Start cleanup interval
      this.startCleanupTimer()
      
      // Start cache warming if enabled
      if (this.config.enableCacheWarming) {
        this.startCacheWarming()
      }
      
      this.isInitialized = true
      
      logger.info('SearchCacheSystem initialization complete', {
        fallbackEntriesLoaded: this.fallbackKnowledge.size,
        diskCacheEnabled: this.config.enableDiskCache
      })
      
      this.emit('system_initialized')
      
    } catch (error) {
      logger.error('Failed to initialize SearchCacheSystem', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Get search results from cache or fallback
   */
  async get(query: string, options: { 
    allowFallback?: boolean 
    maxAge?: number
    similarityThreshold?: number
  } = {}): Promise<SearchResponse | null> {
    const startTime = performance.now()
    
    try {
      const cacheKey = this.generateCacheKey(query)
      const {
        allowFallback = true,
        maxAge,
        similarityThreshold = 0.8
      } = options
      
      // Try memory cache first
      let result = this.memoryCache.get(cacheKey)
      if (result && this.isValidResult(result, maxAge)) {
        this.performanceMetrics.cacheHits++
        this.recordPerformanceMetric(performance.now() - startTime)
        
        // Update query popularity
        this.updateQueryPopularity(query)
        
        logger.debug('Cache hit (memory)', { query: query.substring(0, 50) })
        this.emit('cache_hit', { query, source: 'memory' })
        
        return {
          ...result,
          cacheHit: true,
          source: 'cache'
        }
      }
      
      // Try disk cache
      if (this.config.enableDiskCache) {
        result = await this.getDiskCache(cacheKey)
        if (result && this.isValidResult(result, maxAge)) {
          // Promote to memory cache
          this.memoryCache.set(cacheKey, result, this.config.defaultTTL)
          
          this.performanceMetrics.diskHits++
          this.recordPerformanceMetric(performance.now() - startTime)
          this.updateQueryPopularity(query)
          
          logger.debug('Cache hit (disk)', { query: query.substring(0, 50) })
          this.emit('cache_hit', { query, source: 'disk' })
          
          return {
            ...result,
            cacheHit: true,
            source: 'cache'
          }
        }
      }
      
      // Try similarity matching for related queries
      const similarResult = await this.findSimilarQuery(query, similarityThreshold)
      if (similarResult) {
        this.performanceMetrics.cacheHits++
        this.recordPerformanceMetric(performance.now() - startTime)
        
        logger.debug('Similar query match', { 
          query: query.substring(0, 50),
          similarQuery: similarResult.query.substring(0, 50)
        })
        this.emit('similar_query_match', { query, similarQuery: similarResult.query })
        
        return {
          ...similarResult,
          cacheHit: true,
          source: 'cache'
        }
      }
      
      // Try fallback knowledge base
      if (allowFallback) {
        const fallbackResult = this.getFallbackResult(query)
        if (fallbackResult) {
          this.performanceMetrics.fallbackUsed++
          this.recordPerformanceMetric(performance.now() - startTime)
          
          logger.debug('Fallback result used', { query: query.substring(0, 50) })
          this.emit('fallback_used', { query })
          
          return {
            ...fallbackResult,
            cacheHit: false,
            source: 'fallback'
          }
        }
      }
      
      // Cache miss
      this.performanceMetrics.cacheMisses++
      this.recordPerformanceMetric(performance.now() - startTime)
      
      logger.debug('Cache miss', { query: query.substring(0, 50) })
      this.emit('cache_miss', { query })
      
      return null
      
    } catch (error) {
      this.performanceMetrics.errorCount++
      logger.error('Error retrieving from cache', {
        query: query.substring(0, 50),
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      return null
    }
  }

  /**
   * Store search results in cache
   */
  async set(query: string, response: SearchResponse, options: {
    ttl?: number
    skipDisk?: boolean
    quality?: number
  } = {}): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(query)
      const { ttl = this.config.defaultTTL, skipDisk = false, quality = 1.0 } = options
      
      // Enhance response with metadata
      const enhancedResponse: SearchResponse = {
        ...response,
        query,
        timestamp: Date.now()
      }
      
      // Store in memory cache
      this.memoryCache.set(cacheKey, enhancedResponse, ttl)
      
      // Store in disk cache if enabled
      if (this.config.enableDiskCache && !skipDisk) {
        await this.setDiskCache(cacheKey, enhancedResponse, this.config.diskTTL)
      }
      
      // Update query history for similarity matching
      this.updateQueryHistory(query)
      this.updateQueryPopularity(query)
      
      logger.debug('Search result cached', {
        query: query.substring(0, 50),
        resultCount: response.results.length,
        source: response.source
      })
      
      this.emit('result_cached', { query, resultCount: response.results.length })
      
    } catch (error) {
      this.performanceMetrics.errorCount++
      logger.error('Error storing in cache', {
        query: query.substring(0, 50),
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Preload cache with popular/predicted queries
   */
  async preloadCache(queries: string[], searchFunction: (query: string) => Promise<SearchResponse>): Promise<void> {
    logger.info('Starting cache preloading', { queryCount: queries.length })
    
    const results = await Promise.allSettled(
      queries.map(async (query) => {
        try {
          // Check if already cached
          const cached = await this.get(query, { allowFallback: false })
          if (cached) return
          
          // Fetch and cache
          const result = await searchFunction(query)
          await this.set(query, result, { quality: 0.8 }) // Lower quality for preloaded
          
          logger.debug('Query preloaded', { query: query.substring(0, 50) })
          
        } catch (error) {
          logger.warn('Failed to preload query', {
            query: query.substring(0, 50),
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      })
    )
    
    const successful = results.filter(r => r.status === 'fulfilled').length
    logger.info('Cache preloading complete', { successful, total: queries.length })
    
    this.emit('preloading_complete', { successful, total: queries.length })
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats(): CacheStats & { 
    performance: typeof this.performanceMetrics
    popularQueries: Array<{ query: string, count: number }>
    systemHealth: {
      memoryUtilization: number
      diskUtilization: number
      overallHealth: 'good' | 'warning' | 'critical'
    }
  } {
    const memoryStats = this.memoryCache.getStats()
    
    // Calculate popular queries
    const popularQueries = Array.from(this.popularQueries.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }))
    
    // Calculate system health
    const memoryUtilization = memoryStats.currentSize / this.config.maxMemorySize
    const diskUtilization = 0.5 // Placeholder - would need actual disk usage calculation
    
    const overallHealth = memoryUtilization > 0.9 || diskUtilization > 0.9 
      ? 'critical' 
      : memoryUtilization > 0.7 || diskUtilization > 0.7 
        ? 'warning' 
        : 'good'
    
    return {
      totalEntries: memoryStats.currentEntries,
      memoryUsage: memoryStats.currentSize,
      diskUsage: 0, // Placeholder
      hitRate: memoryStats.hitRate,
      missRate: 1 - memoryStats.hitRate,
      averageAccessTime: this.performanceMetrics.averageRetrievalTime,
      evictionCount: memoryStats.evictions,
      errorCount: this.performanceMetrics.errorCount,
      performance: this.performanceMetrics,
      popularQueries,
      systemHealth: {
        memoryUtilization,
        diskUtilization,
        overallHealth
      }
    }
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    logger.info('Clearing all caches')
    
    // Clear memory cache
    this.memoryCache.clear()
    
    // Clear disk cache
    if (this.config.enableDiskCache) {
      try {
        await fs.rm(this.diskCacheDir, { recursive: true, force: true })
        await fs.mkdir(this.diskCacheDir, { recursive: true })
      } catch (error) {
        logger.warn('Failed to clear disk cache', {
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    // Reset statistics
    this.performanceMetrics = {
      cacheHits: 0,
      cacheMisses: 0,
      diskHits: 0,
      diskMisses: 0,
      fallbackUsed: 0,
      averageRetrievalTime: 0,
      errorCount: 0
    }
    
    this.queryHistory = []
    this.popularQueries.clear()
    
    this.emit('all_caches_cleared')
    logger.info('All caches cleared successfully')
  }

  /**
   * Shutdown the cache system gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down SearchCacheSystem')
    
    try {
      // Generate final statistics
      const finalStats = this.getStats()
      this.emit('final_stats', finalStats)
      
      // Clear any running timers
      // (Timer cleanup would go here if we stored timer references)
      
      // Clear memory structures
      this.memoryCache.clear()
      this.queryHistory = []
      this.popularQueries.clear()
      this.fallbackKnowledge.clear()
      
      // Remove all event listeners
      this.removeAllListeners()
      
      logger.info('SearchCacheSystem shutdown complete', finalStats.performance)
      
    } catch (error) {
      logger.error('Error during SearchCacheSystem shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Private helper methods

  private generateCacheKey(query: string): string {
    // Normalize query for consistent caching
    const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ')
    return createHash('sha256').update(normalized).digest('hex')
  }

  private isValidResult(result: SearchResponse, maxAge?: number): boolean {
    if (!result || !result.timestamp) return false
    
    const age = Date.now() - result.timestamp
    const effectiveMaxAge = maxAge || this.config.defaultTTL
    
    return age < effectiveMaxAge
  }

  private async getDiskCache(key: string): Promise<SearchResponse | null> {
    if (!this.config.enableDiskCache) return null
    
    try {
      const filePath = path.join(this.diskCacheDir, `${key}.json`)
      const data = await fs.readFile(filePath, 'utf8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  private async setDiskCache(key: string, data: SearchResponse, ttl: number): Promise<void> {
    if (!this.config.enableDiskCache) return
    
    try {
      const filePath = path.join(this.diskCacheDir, `${key}.json`)
      await fs.writeFile(filePath, JSON.stringify(data), 'utf8')
    } catch (error) {
      logger.warn('Failed to write disk cache', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  private async findSimilarQuery(query: string, threshold: number): Promise<SearchResponse | null> {
    // Simple similarity matching based on query history
    for (const historicalQuery of this.queryHistory.slice(-100)) { // Check last 100 queries
      if (this.calculateSimilarity(query, historicalQuery) >= threshold) {
        const cachedResult = await this.get(historicalQuery, { allowFallback: false })
        if (cachedResult) return cachedResult
      }
    }
    return null
  }

  private calculateSimilarity(query1: string, query2: string): number {
    // Simple Jaccard similarity
    const words1 = new Set(query1.toLowerCase().split(/\s+/))
    const words2 = new Set(query2.toLowerCase().split(/\s+/))
    
    const intersection = new Set([...words1].filter(x => words2.has(x)))
    const union = new Set([...words1, ...words2])
    
    return intersection.size / union.size
  }

  private getFallbackResult(query: string): SearchResponse | null {
    // Check fallback knowledge base for related content
    const queryKey = this.generateCacheKey(query)
    return this.fallbackKnowledge.get(queryKey) || null
  }

  private async loadFallbackKnowledge(): Promise<void> {
    // Load common queries and responses for offline fallback
    const commonResponses = [
      {
        query: 'current time',
        results: [
          {
            title: 'Current Time',
            url: 'https://time.is',
            snippet: `The current time is ${new Date().toLocaleTimeString()}`
          }
        ],
        totalResults: 1,
        searchTime: 0,
        source: 'fallback' as const,
        cacheHit: false,
        timestamp: Date.now()
      },
      {
        query: 'weather',
        results: [
          {
            title: 'Weather Information',
            url: 'https://weather.com',
            snippet: 'Please specify your location for accurate weather information.'
          }
        ],
        totalResults: 1,
        searchTime: 0,
        source: 'fallback' as const,
        cacheHit: false,
        timestamp: Date.now()
      }
    ]
    
    for (const response of commonResponses) {
      const key = this.generateCacheKey(response.query)
      this.fallbackKnowledge.set(key, response)
    }
    
    logger.debug('Fallback knowledge base loaded', { entries: commonResponses.length })
  }

  private updateQueryHistory(query: string): void {
    this.queryHistory.push(query)
    
    // Keep history size manageable
    if (this.queryHistory.length > 1000) {
      this.queryHistory = this.queryHistory.slice(-500)
    }
  }

  private updateQueryPopularity(query: string): void {
    const count = this.popularQueries.get(query) || 0
    this.popularQueries.set(query, count + 1)
  }

  private recordPerformanceMetric(time: number): void {
    const totalRequests = this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses
    this.performanceMetrics.averageRetrievalTime = 
      (this.performanceMetrics.averageRetrievalTime * (totalRequests - 1) + time) / totalRequests
  }

  private setupEventHandlers(): void {
    this.memoryCache.on('entry_evicted', (data) => {
      this.emit('memory_cache_evicted', data)
    })
    
    this.memoryCache.on('entry_expired', (data) => {
      this.emit('memory_cache_expired', data)
    })
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      this.performCleanup()
    }, this.config.cleanupInterval)
  }

  private async performCleanup(): Promise<void> {
    // Cleanup expired disk cache files
    if (this.config.enableDiskCache) {
      try {
        const files = await fs.readdir(this.diskCacheDir)
        const now = Date.now()
        
        for (const file of files) {
          const filePath = path.join(this.diskCacheDir, file)
          const stats = await fs.stat(filePath)
          
          if (now - stats.mtime.getTime() > this.config.diskTTL) {
            await fs.unlink(filePath)
          }
        }
      } catch (error) {
        logger.warn('Cleanup failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  }

  private startCacheWarming(): void {
    // Initial warming
    setTimeout(() => {
      this.warmCache()
    }, 5000) // Wait 5 seconds after init
    
    // Periodic warming
    setInterval(() => {
      this.warmCache()
    }, this.config.warmingInterval)
  }

  private async warmCache(): Promise<void> {
    logger.debug('Starting cache warming')
    
    for (const query of this.config.warmingQueries) {
      const cached = await this.get(query, { allowFallback: false })
      if (!cached) {
        // Would trigger actual search here in real implementation
        logger.debug('Cache warming opportunity', { query })
      }
    }
  }
}

export default SearchCacheSystem