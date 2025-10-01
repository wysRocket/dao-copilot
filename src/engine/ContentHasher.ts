/**
 * ContentHasher - Sophisticated Content Hashing with Time Bucketing
 * 
 * Implements a rolling hash algorithm with time bucketing for efficient
 * deduplication and similarity detection of transcript segments. Designed
 * for high-performance real-time transcription processing.
 * 
 * Features:
 * - Rolling hash algorithm optimized for text content
 * - Time-based bucketing for temporal locality
 * - Content normalization and preprocessing
 * - Collision detection and resolution
 * - Performance monitoring and statistics
 * - Configurable parameters for different use cases
 * - Memory-efficient hash indexing
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  ContentHasherConfig,
  ContentHash,
  TimeBucket,
  TranscriptSegment,
  HashComparison,
  HashCollision,
  HashPerformanceStats,
  TimeBucketStats,
  HashIndexEntry,
  HashComputationResult,
  ContentHasherEvents,
  DEFAULT_CONTENT_HASHER_CONFIG,
  DEFAULT_HASH_INDEX_CONFIG,
  HashIndexConfig
} from '../types/HashTypes';

// ================================================================
// Content Hasher Implementation
// ================================================================

export class ContentHasher extends EventEmitter implements ContentHasherEvents {
  private config: ContentHasherConfig;
  private indexConfig: HashIndexConfig;
  
  // Time buckets storage
  private timeBuckets = new Map<number, TimeBucket>();
  private currentBucketId = 0;
  
  // Hash index for fast lookups
  private hashIndex = new Map<string, HashIndexEntry>();
  
  // Performance tracking
  private stats: HashPerformanceStats = {
    totalHashes: 0,
    avgComputationTimeMs: 0,
    peakComputationTimeMs: 0,
    totalCollisions: 0,
    collisionRate: 0,
    memoryUsageBytes: 0,
    cacheHitRate: 0,
  };
  
  // Internal state
  private hashCache = new Map<string, ContentHash>();
  private cleanupTimer?: NodeJS.Timeout;
  private performanceHistory: number[] = [];
  private isInitialized = false;

  constructor(
    config: Partial<ContentHasherConfig> = {},
    indexConfig: Partial<HashIndexConfig> = {}
  ) {
    super();
    
    this.config = this.mergeConfig(DEFAULT_CONTENT_HASHER_CONFIG, config);
    this.indexConfig = { ...DEFAULT_HASH_INDEX_CONFIG, ...indexConfig };
    
    this.initialize();
  }

  // ================================================================
  // Initialization and Configuration
  // ================================================================

  /**
   * Initialize the content hasher
   */
  private initialize(): void {
    try {
      // Start cleanup timer
      this.startCleanupTimer();
      
      // Initialize first time bucket
      this.createTimeBucket(Date.now());
      
      this.isInitialized = true;
      console.log('ContentHasher: Initialized successfully');
    } catch (error) {
      console.error('ContentHasher: Failed to initialize:', error);
      this.emit('error', error as Error, 'initialization');
    }
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<ContentHasherConfig>): void {
    const oldConfig = { ...this.config };
    this.config = this.mergeConfig(this.config, updates);
    
    // Restart cleanup timer if interval changed
    if (oldConfig.timeBuckets.cleanupIntervalMs !== this.config.timeBuckets.cleanupIntervalMs) {
      this.startCleanupTimer();
    }
    
    console.log('ContentHasher: Configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): ContentHasherConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  // ================================================================
  // Core Hashing Methods
  // ================================================================

  /**
   * Compute hash for a transcript segment
   */
  async computeHash(segment: TranscriptSegment): Promise<HashComputationResult> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(segment);
      const cachedHash = this.hashCache.get(cacheKey);
      
      if (cachedHash) {
        return {
          hash: cachedHash,
          computationTimeMs: Date.now() - startTime,
          fromCache: true,
          warnings: [],
        };
      }

      // Normalize content
      const normalizedContent = this.normalizeContent(segment.content);
      const timeBucket = this.getTimeBucket(segment.startTime);

      // Compute rolling hash
      const hashValue = this.computeRollingHash(normalizedContent);
      
      // Create content hash object
      const contentHash: ContentHash = {
        hash: hashValue,
        contentLength: segment.content.length,
        normalizedContent,
        computedAt: Date.now(),
        timeBucket: timeBucket.bucketId,
        originalContent: segment.content,
        algorithmVersion: '1.0',
      };

      // Store in bucket and cache
      this.storeHashInBucket(contentHash, timeBucket);
      this.hashCache.set(cacheKey, contentHash);

      // Update index
      this.updateHashIndex(contentHash, segment);

      // Check for collisions
      await this.checkForCollisions(contentHash);

      // Update statistics
      const computationTime = Date.now() - startTime;
      this.updatePerformanceStats(computationTime);

      // Emit event
      this.emit('hash:computed', contentHash, segment);

      return {
        hash: contentHash,
        computationTimeMs: computationTime,
        fromCache: false,
        warnings: [],
      };

    } catch (error) {
      console.error('ContentHasher: Hash computation failed:', error);
      this.emit('error', error as Error, 'hash_computation');
      
      throw new Error(`Hash computation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Batch compute hashes for multiple segments
   */
  async batchComputeHashes(segments: TranscriptSegment[]): Promise<HashComputationResult[]> {
    const batchSize = this.config.batchProcessing.maxBatchSize;
    const results: HashComputationResult[] = [];
    
    // Process in batches to avoid memory issues
    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);
      const batchStartTime = Date.now();
      
      try {
        const batchPromises = batch.map(segment => this.computeHash(segment));
        const batchResults = this.config.batchProcessing.useParallelProcessing
          ? await Promise.all(batchPromises)
          : await this.processBatchSequentially(batchPromises);
        
        results.push(...batchResults);

        // Check batch processing timeout
        const batchTime = Date.now() - batchStartTime;
        if (batchTime > this.config.batchProcessing.maxProcessingTimeMs) {
          console.warn(`ContentHasher: Batch processing exceeded timeout: ${batchTime}ms`);
        }

      } catch (error) {
        console.error(`ContentHasher: Batch processing failed for batch ${Math.floor(i / batchSize)}:`, error);
        this.emit('error', error as Error, 'batch_processing');
        throw error;
      }
    }

    return results;
  }

  /**
   * Process batch promises sequentially
   */
  private async processBatchSequentially(promises: Promise<HashComputationResult>[]): Promise<HashComputationResult[]> {
    const results: HashComputationResult[] = [];
    
    for (const promise of promises) {
      try {
        const result = await promise;
        results.push(result);
      } catch (error) {
        console.error('ContentHasher: Sequential batch item failed:', error);
        throw error;
      }
    }
    
    return results;
  }

  // ================================================================
  // Hash Comparison Methods
  // ================================================================

  /**
   * Compare two content hashes
   */
  compareHashes(hash1: ContentHash, hash2: ContentHash): HashComparison {
    const startTime = Date.now();
    
    try {
      // Exact hash match check
      const exactMatch = hash1.hash === hash2.hash;
      
      // Content similarity (Jaccard similarity on normalized content)
      const contentSimilarity = this.calculateContentSimilarity(
        hash1.normalizedContent,
        hash2.normalizedContent
      );
      
      // Temporal proximity (based on time bucket distance)
      const temporalProximity = this.calculateTemporalProximity(
        hash1.timeBucket,
        hash2.timeBucket
      );
      
      // Combined similarity score (weighted average)
      const combinedScore = this.calculateCombinedScore(
        exactMatch ? 1.0 : contentSimilarity,
        temporalProximity
      );

      return {
        exactMatch,
        similarityScore: exactMatch ? 1.0 : contentSimilarity,
        contentSimilarity,
        temporalProximity,
        combinedScore,
        metadata: {
          algorithm: 'jaccard_temporal_weighted',
          comparedAt: Date.now(),
          processingTimeMs: Date.now() - startTime,
          lengthDifference: Math.abs(hash1.contentLength - hash2.contentLength),
          bucketDifference: Math.abs(hash1.timeBucket - hash2.timeBucket),
        },
      };
    } catch (error) {
      console.error('ContentHasher: Hash comparison failed:', error);
      throw new Error(`Hash comparison failed: ${(error as Error).message}`);
    }
  }

  /**
   * Find similar hashes within a time range
   */
  findSimilarHashes(
    targetHash: ContentHash,
    timeBucketRange: number = 5,
    similarityThreshold: number = 0.8
  ): ContentHash[] {
    const similarHashes: ContentHash[] = [];
    
    try {
      // Calculate bucket range to search
      const startBucket = Math.max(0, targetHash.timeBucket - timeBucketRange);
      const endBucket = targetHash.timeBucket + timeBucketRange;
      
      // Search through relevant buckets
      for (let bucketId = startBucket; bucketId <= endBucket; bucketId++) {
        const bucket = this.timeBuckets.get(bucketId);
        if (!bucket) continue;
        
        // Check each hash in the bucket
        for (const hash of bucket.contentHashes.values()) {
          if (hash.hash === targetHash.hash) continue; // Skip same hash
          
          const comparison = this.compareHashes(targetHash, hash);
          if (comparison.combinedScore >= similarityThreshold) {
            similarHashes.push(hash);
          }
        }
      }
      
      // Sort by similarity score (descending)
      return similarHashes.sort((a, b) => {
        const aComparison = this.compareHashes(targetHash, a);
        const bComparison = this.compareHashes(targetHash, b);
        return bComparison.combinedScore - aComparison.combinedScore;
      });
      
    } catch (error) {
      console.error('ContentHasher: Failed to find similar hashes:', error);
      this.emit('error', error as Error, 'similarity_search');
      return [];
    }
  }

  // ================================================================
  // Rolling Hash Algorithm
  // ================================================================

  /**
   * Compute rolling hash for content
   */
  private computeRollingHash(content: string): string {
    const { base, modulus, windowSize } = this.config.rollingHash;
    
    if (content.length === 0) {
      return this.hashString('');
    }
    
    // For short content, use regular hash
    if (content.length <= windowSize) {
      return this.hashString(content);
    }
    
    let hash = 0;
    let power = 1;
    
    // Calculate initial hash for first window
    for (let i = 0; i < windowSize; i++) {
      hash = (hash * base + content.charCodeAt(i)) % modulus;
      if (i < windowSize - 1) {
        power = (power * base) % modulus;
      }
    }
    
    const hashes: number[] = [hash];
    
    // Roll the hash through the rest of the content
    for (let i = windowSize; i < content.length; i++) {
      // Remove leftmost character
      const leftChar = content.charCodeAt(i - windowSize);
      hash = (hash - (leftChar * power) % modulus + modulus) % modulus;
      
      // Add rightmost character
      const rightChar = content.charCodeAt(i);
      hash = (hash * base + rightChar) % modulus;
      
      hashes.push(hash);
    }
    
    // Combine all hashes into final hash
    const combinedHash = hashes.reduce((acc, h) => acc ^ h, 0);
    return this.hashNumber(combinedHash);
  }

  /**
   * Hash a string using crypto module
   */
  private hashString(input: string): string {
    return crypto
      .createHash('sha256')
      .update(input, 'utf8')
      .digest('hex')
      .substring(0, 16); // Use first 16 chars for shorter hashes
  }

  /**
   * Hash a number into a string
   */
  private hashNumber(num: number): string {
    return this.hashString(num.toString());
  }

  // ================================================================
  // Content Normalization
  // ================================================================

  /**
   * Normalize content according to configuration
   */
  private normalizeContent(content: string): string {
    let normalized = content;
    const options = this.config.normalization;
    
    try {
      // Trim whitespace
      if (options.trimWhitespace) {
        normalized = normalized.trim().replace(/\s+/g, ' ');
      }
      
      // Convert to lowercase
      if (options.toLowercase) {
        normalized = normalized.toLowerCase();
      }
      
      // Remove punctuation
      if (options.removePunctuation) {
        normalized = normalized.replace(/[^\w\s]|_/g, '');
      }
      
      // Remove numbers
      if (options.removeNumbers) {
        normalized = normalized.replace(/\d/g, '');
      }
      
      // Remove special characters
      if (options.removeSpecialChars) {
        normalized = normalized.replace(/[^a-zA-Z0-9\s]/g, '');
      }
      
      // Normalize unicode
      if (options.normalizeUnicode) {
        normalized = normalized.normalize('NFKD');
      }
      
      // Apply custom replacements
      if (options.customReplacements.size > 0) {
        for (const [search, replace] of options.customReplacements) {
          normalized = normalized.replace(new RegExp(search, 'g'), replace);
        }
      }
      
      return normalized;
      
    } catch (error) {
      console.error('ContentHasher: Content normalization failed:', error);
      return content; // Return original content on error
    }
  }

  // ================================================================
  // Time Bucket Management
  // ================================================================

  /**
   * Get or create time bucket for timestamp
   */
  private getTimeBucket(timestamp: number): TimeBucket {
    const bucketId = this.calculateBucketId(timestamp);
    
    let bucket = this.timeBuckets.get(bucketId);
    if (!bucket) {
      bucket = this.createTimeBucket(timestamp, bucketId);
    }
    
    // Update access time
    bucket.lastAccessedAt = Date.now();
    
    return bucket;
  }

  /**
   * Calculate bucket ID for timestamp
   */
  private calculateBucketId(timestamp: number): number {
    return Math.floor(timestamp / this.config.timeBuckets.bucketSizeMs);
  }

  /**
   * Create a new time bucket
   */
  private createTimeBucket(timestamp: number, bucketId?: number): TimeBucket {
    const id = bucketId ?? this.calculateBucketId(timestamp);
    const bucketSize = this.config.timeBuckets.bucketSizeMs;
    
    const bucket: TimeBucket = {
      bucketId: id,
      startTime: id * bucketSize,
      endTime: (id + 1) * bucketSize - 1,
      contentHashes: new Map(),
      hashCount: 0,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    
    this.timeBuckets.set(id, bucket);
    
    // Update current bucket ID
    if (id > this.currentBucketId) {
      this.currentBucketId = id;
    }
    
    this.emit('bucket:created', bucket);
    return bucket;
  }

  /**
   * Store hash in time bucket
   */
  private storeHashInBucket(hash: ContentHash, bucket: TimeBucket): void {
    bucket.contentHashes.set(hash.hash, hash);
    bucket.hashCount = bucket.contentHashes.size;
  }

  /**
   * Clean up old time buckets
   */
  private cleanupTimeBuckets(): void {
    try {
      const maxBuckets = this.config.timeBuckets.maxBuckets;
      const bucketsToRemove = Math.max(0, this.timeBuckets.size - maxBuckets);
      
      if (bucketsToRemove === 0) return;
      
      // Sort buckets by last access time (oldest first)
      const sortedBuckets = Array.from(this.timeBuckets.values())
        .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
      
      let removedHashes = 0;
      for (let i = 0; i < bucketsToRemove; i++) {
        const bucket = sortedBuckets[i];
        removedHashes += bucket.hashCount;
        
        // Remove from hash index
        for (const hash of bucket.contentHashes.keys()) {
          this.removeFromHashIndex(hash, bucket.bucketId);
        }
        
        // Remove bucket
        this.timeBuckets.delete(bucket.bucketId);
        this.emit('bucket:cleaned', bucket.bucketId, bucket.hashCount);
      }
      
      console.log(`ContentHasher: Cleaned up ${bucketsToRemove} buckets, removed ${removedHashes} hashes`);
    } catch (error) {
      console.error('ContentHasher: Bucket cleanup failed:', error);
      this.emit('error', error as Error, 'bucket_cleanup');
    }
  }

  // ================================================================
  // Hash Index Management
  // ================================================================

  /**
   * Update hash index with new hash
   */
  private updateHashIndex(hash: ContentHash, segment: TranscriptSegment): void {
    try {
      let entry = this.hashIndex.get(hash.hash);
      
      if (!entry) {
        entry = {
          hash: hash.hash,
          timeBuckets: new Set([hash.timeBucket]),
          firstSeen: hash.computedAt,
          lastSeen: hash.computedAt,
          occurrenceCount: 1,
          contentMetadata: {
            length: hash.contentLength,
            detectedLanguage: undefined, // Could be enhanced with language detection
            qualityScore: segment.confidence || 1.0,
            isComplete: segment.isFinal,
            speakerCount: segment.speakerId ? 1 : undefined,
            categories: [],
          },
        };
        
        this.hashIndex.set(hash.hash, entry);
      } else {
        entry.timeBuckets.add(hash.timeBucket);
        entry.lastSeen = hash.computedAt;
        entry.occurrenceCount++;
        
        // Update metadata with latest information
        if (segment.confidence && segment.confidence > entry.contentMetadata.qualityScore) {
          entry.contentMetadata.qualityScore = segment.confidence;
        }
        if (segment.isFinal) {
          entry.contentMetadata.isComplete = true;
        }
      }
      
      // Cleanup index if it gets too large
      if (this.hashIndex.size > this.indexConfig.maxEntries) {
        this.cleanupHashIndex();
      }
    } catch (error) {
      console.error('ContentHasher: Hash index update failed:', error);
    }
  }

  /**
   * Remove hash from index when bucket is cleaned
   */
  private removeFromHashIndex(hash: string, bucketId: number): void {
    const entry = this.hashIndex.get(hash);
    if (!entry) return;
    
    entry.timeBuckets.delete(bucketId);
    
    // Remove entry if no buckets remain
    if (entry.timeBuckets.size === 0) {
      this.hashIndex.delete(hash);
    }
  }

  /**
   * Clean up hash index based on strategy
   */
  private cleanupHashIndex(): void {
    try {
      const threshold = this.indexConfig.cleanupThreshold;
      const entriesToRemove = Math.max(0, this.hashIndex.size - threshold);
      
      if (entriesToRemove === 0) return;
      
      const entries = Array.from(this.hashIndex.entries());
      let toRemove: string[] = [];
      
      switch (this.indexConfig.cleanupStrategy) {
        case 'lru':
          toRemove = entries
            .sort(([, a], [, b]) => a.lastSeen - b.lastSeen)
            .slice(0, entriesToRemove)
            .map(([hash]) => hash);
          break;
          
        case 'oldest':
          toRemove = entries
            .sort(([, a], [, b]) => a.firstSeen - b.firstSeen)
            .slice(0, entriesToRemove)
            .map(([hash]) => hash);
          break;
          
        case 'least_frequent':
          toRemove = entries
            .sort(([, a], [, b]) => a.occurrenceCount - b.occurrenceCount)
            .slice(0, entriesToRemove)
            .map(([hash]) => hash);
          break;
      }
      
      // Remove selected entries
      for (const hash of toRemove) {
        this.hashIndex.delete(hash);
      }
      
      console.log(`ContentHasher: Cleaned up ${toRemove.length} hash index entries`);
    } catch (error) {
      console.error('ContentHasher: Hash index cleanup failed:', error);
    }
  }

  // ================================================================
  // Collision Detection
  // ================================================================

  /**
   * Check for hash collisions
   */
  private async checkForCollisions(newHash: ContentHash): Promise<void> {
    try {
      const indexEntry = this.hashIndex.get(newHash.hash);
      if (!indexEntry || indexEntry.occurrenceCount <= 1) return;
      
      // Look for different content with same hash
      for (const bucketId of indexEntry.timeBuckets) {
        const bucket = this.timeBuckets.get(bucketId);
        if (!bucket) continue;
        
        const existingHash = bucket.contentHashes.get(newHash.hash);
        if (!existingHash || existingHash.originalContent === newHash.originalContent) continue;
        
        // Collision detected
        const collision: HashCollision = {
          hash: newHash.hash,
          originalContent: existingHash.originalContent,
          collidingContent: newHash.originalContent,
          timeBuckets: Array.from(indexEntry.timeBuckets),
          detectedAt: Date.now(),
          severity: this.calculateCollisionSeverity(existingHash.originalContent, newHash.originalContent),
        };
        
        this.stats.totalCollisions++;
        this.emit('collision:detected', collision);
        
        console.warn('ContentHasher: Hash collision detected:', {
          hash: newHash.hash,
          content1: existingHash.originalContent.substring(0, 50) + '...',
          content2: newHash.originalContent.substring(0, 50) + '...',
          severity: collision.severity,
        });
        
        break; // Only report first collision per hash
      }
    } catch (error) {
      console.error('ContentHasher: Collision detection failed:', error);
    }
  }

  /**
   * Calculate collision severity based on content similarity
   */
  private calculateCollisionSeverity(content1: string, content2: string): 'low' | 'medium' | 'high' {
    const similarity = this.calculateContentSimilarity(content1, content2);
    
    if (similarity < 0.3) return 'high'; // Very different content
    if (similarity < 0.7) return 'medium'; // Somewhat similar content
    return 'low'; // Very similar content (expected collision)
  }

  // ================================================================
  // Similarity Calculations
  // ================================================================

  /**
   * Calculate Jaccard similarity between two strings
   */
  private calculateContentSimilarity(content1: string, content2: string): number {
    try {
      // Convert to sets of n-grams (n=3 for trigrams)
      const ngrams1 = this.generateNgrams(content1, 3);
      const ngrams2 = this.generateNgrams(content2, 3);
      
      // Calculate Jaccard similarity
      const intersection = new Set([...ngrams1].filter(x => ngrams2.has(x)));
      const union = new Set([...ngrams1, ...ngrams2]);
      
      return union.size === 0 ? 0 : intersection.size / union.size;
    } catch (error) {
      console.error('ContentHasher: Content similarity calculation failed:', error);
      return 0;
    }
  }

  /**
   * Generate n-grams from text
   */
  private generateNgrams(text: string, n: number): Set<string> {
    const ngrams = new Set<string>();
    
    if (text.length < n) {
      ngrams.add(text);
      return ngrams;
    }
    
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.add(text.substring(i, i + n));
    }
    
    return ngrams;
  }

  /**
   * Calculate temporal proximity score
   */
  private calculateTemporalProximity(bucket1: number, bucket2: number): number {
    const distance = Math.abs(bucket1 - bucket2);
    const maxDistance = 10; // Consider buckets within 10 buckets as related
    
    return Math.max(0, (maxDistance - distance) / maxDistance);
  }

  /**
   * Calculate combined similarity score
   */
  private calculateCombinedScore(contentScore: number, temporalScore: number): number {
    // Weighted combination: 70% content, 30% temporal
    return contentScore * 0.7 + temporalScore * 0.3;
  }

  // ================================================================
  // Statistics and Performance
  // ================================================================

  /**
   * Update performance statistics
   */
  private updatePerformanceStats(computationTimeMs: number): void {
    this.stats.totalHashes++;
    
    // Update computation time average
    this.performanceHistory.push(computationTimeMs);
    if (this.performanceHistory.length > this.config.performanceMonitoring.maxStatsHistory) {
      this.performanceHistory.shift();
    }
    
    this.stats.avgComputationTimeMs = 
      this.performanceHistory.reduce((sum, time) => sum + time, 0) / this.performanceHistory.length;
    
    // Update peak time
    if (computationTimeMs > this.stats.peakComputationTimeMs) {
      this.stats.peakComputationTimeMs = computationTimeMs;
    }
    
    // Update collision rate
    this.stats.collisionRate = this.stats.totalCollisions / this.stats.totalHashes;
    
    // Update cache hit rate
    const cacheSize = this.hashCache.size;
    const totalRequests = this.stats.totalHashes;
    this.stats.cacheHitRate = cacheSize > 0 ? (totalRequests - cacheSize) / totalRequests : 0;
    
    // Emit performance stats periodically
    if (this.config.performanceMonitoring.enabled && 
        this.stats.totalHashes % Math.ceil(1 / this.config.performanceMonitoring.sampleRate) === 0) {
      this.emit('performance:stats', this.stats);
    }
  }

  /**
   * Get current performance statistics
   */
  getPerformanceStats(): HashPerformanceStats {
    // Update memory usage estimate
    this.stats.memoryUsageBytes = this.estimateMemoryUsage();
    return { ...this.stats };
  }

  /**
   * Get time bucket statistics
   */
  getTimeBucketStats(): TimeBucketStats {
    const buckets = Array.from(this.timeBuckets.values());
    const totalBuckets = buckets.length;
    const activeBuckets = buckets.filter(b => b.hashCount > 0).length;
    const hashCounts = buckets.map(b => b.hashCount);
    
    return {
      totalBuckets,
      activeBuckets,
      avgHashesPerBucket: hashCounts.reduce((sum, count) => sum + count, 0) / Math.max(1, totalBuckets),
      maxBucketSize: Math.max(0, ...hashCounts),
      minBucketSize: Math.min(Infinity, ...hashCounts),
      cleanupOperations: 0, // Would need to track this separately
      avgAccessFrequency: 0, // Would need to track access patterns
    };
  }

  /**
   * Estimate current memory usage
   */
  private estimateMemoryUsage(): number {
    let usage = 0;
    
    // Estimate time buckets memory
    for (const bucket of this.timeBuckets.values()) {
      usage += 200; // Base bucket object
      for (const hash of bucket.contentHashes.values()) {
        usage += hash.originalContent.length * 2; // UTF-16 encoding
        usage += hash.normalizedContent.length * 2;
        usage += 100; // Hash object overhead
      }
    }
    
    // Estimate cache memory
    for (const hash of this.hashCache.values()) {
      usage += hash.originalContent.length * 2;
      usage += hash.normalizedContent.length * 2;
      usage += 100;
    }
    
    // Estimate index memory
    usage += this.hashIndex.size * 200; // Approximate per-entry overhead
    
    return usage;
  }

  // ================================================================
  // Utility Methods
  // ================================================================

  /**
   * Generate cache key for segment
   */
  private getCacheKey(segment: TranscriptSegment): string {
    return this.hashString(`${segment.content}_${segment.startTime}_${segment.endTime}`);
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupTimeBuckets();
    }, this.config.timeBuckets.cleanupIntervalMs);
  }

  /**
   * Deep merge configuration objects
   */
  private mergeConfig(base: ContentHasherConfig, updates: Partial<ContentHasherConfig>): ContentHasherConfig {
    const result = JSON.parse(JSON.stringify(base));
    
    for (const key in updates) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        const value = updates[key as keyof ContentHasherConfig];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = { ...result[key], ...value };
        } else if (value !== undefined) {
          result[key] = value;
        }
      }
    }
    
    return result;
  }

  // ================================================================
  // Public API Methods
  // ================================================================

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.hashCache.clear();
    this.timeBuckets.clear();
    this.hashIndex.clear();
    this.performanceHistory = [];
    
    // Reset statistics
    this.stats = {
      totalHashes: 0,
      avgComputationTimeMs: 0,
      peakComputationTimeMs: 0,
      totalCollisions: 0,
      collisionRate: 0,
      memoryUsageBytes: 0,
      cacheHitRate: 0,
    };
    
    console.log('ContentHasher: Cache cleared');
  }

  /**
   * Get all hashes in a time bucket
   */
  getHashesInTimeBucket(bucketId: number): ContentHash[] {
    const bucket = this.timeBuckets.get(bucketId);
    return bucket ? Array.from(bucket.contentHashes.values()) : [];
  }

  /**
   * Get hash by value
   */
  getHashByValue(hashValue: string): ContentHash | undefined {
    const indexEntry = this.hashIndex.get(hashValue);
    if (!indexEntry) return undefined;
    
    // Find the hash in one of its buckets
    for (const bucketId of indexEntry.timeBuckets) {
      const bucket = this.timeBuckets.get(bucketId);
      if (bucket) {
        const hash = bucket.contentHashes.get(hashValue);
        if (hash) return hash;
      }
    }
    
    return undefined;
  }

  /**
   * Check if hash exists
   */
  hasHash(hashValue: string): boolean {
    return this.hashIndex.has(hashValue);
  }

  /**
   * Get current bucket count
   */
  getBucketCount(): number {
    return this.timeBuckets.size;
  }

  /**
   * Get total hash count
   */
  getTotalHashCount(): number {
    return this.stats.totalHashes;
  }

  /**
   * Shutdown the hasher
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    this.clearCache();
    console.log('ContentHasher: Shut down successfully');
  }
}
