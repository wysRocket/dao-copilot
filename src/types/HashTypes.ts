/**
 * Type definitions for content hashing and time bucketing system
 *
 * Used by the TranscriptMergeEngine to identify and deduplicate transcript segments
 * based on content similarity and temporal positioning.
 */

import type {TranscriptionResult} from '../services/gcp/GCPGeminiLiveClient'

// ================================================================
// Core Hash Types
// ================================================================

/**
 * Rolling hash configuration parameters
 */
export interface RollingHashConfig {
  /** Base value for rolling hash computation */
  base: number
  /** Modulus value for hash calculation */
  modulus: number
  /** Window size for rolling hash */
  windowSize: number
  /** Whether to normalize text before hashing */
  normalizeText: boolean
  /** Whether to ignore whitespace in hashing */
  ignoreWhitespace: boolean
  /** Whether to convert to lowercase before hashing */
  toLowercase: boolean
}

/**
 * Time bucket configuration parameters
 */
export interface TimeBucketConfig {
  /** Size of each time bucket in milliseconds */
  bucketSizeMs: number
  /** Maximum number of buckets to maintain */
  maxBuckets: number
  /** Whether to use overlapping buckets */
  overlappingBuckets: boolean
  /** Overlap percentage (0.0 - 1.0) if using overlapping buckets */
  overlapPercentage: number
  /** Bucket cleanup interval in milliseconds */
  cleanupIntervalMs: number
}

/**
 * Content hash result containing hash value and metadata
 */
export interface ContentHash {
  /** The computed hash value */
  hash: string
  /** Length of the original content */
  contentLength: number
  /** Normalized content used for hashing */
  normalizedContent: string
  /** Timestamp when hash was computed */
  computedAt: number
  /** Time bucket this hash belongs to */
  timeBucket: number
  /** Original content before normalization */
  originalContent: string
  /** Hash algorithm version used */
  algorithmVersion: string
}

/**
 * Time bucket containing content hashes
 */
export interface TimeBucket {
  /** Bucket identifier */
  bucketId: number
  /** Start timestamp for this bucket */
  startTime: number
  /** End timestamp for this bucket */
  endTime: number
  /** Content hashes in this bucket */
  contentHashes: Map<string, ContentHash>
  /** Total number of hashes in bucket */
  hashCount: number
  /** Bucket creation timestamp */
  createdAt: number
  /** Last access timestamp */
  lastAccessedAt: number
}

/**
 * Hash collision detection result
 */
export interface HashCollision {
  /** The colliding hash value */
  hash: string
  /** Original content that generated this hash */
  originalContent: string
  /** Colliding content that generated the same hash */
  collidingContent: string
  /** Time buckets where collision occurred */
  timeBuckets: number[]
  /** Collision detection timestamp */
  detectedAt: number
  /** Collision severity (based on content similarity) */
  severity: 'low' | 'medium' | 'high'
}

/**
 * Content normalization options
 */
export interface ContentNormalizationOptions {
  /** Remove extra whitespace */
  trimWhitespace: boolean
  /** Convert to lowercase */
  toLowercase: boolean
  /** Remove punctuation */
  removePunctuation: boolean
  /** Remove numbers */
  removeNumbers: boolean
  /** Remove special characters */
  removeSpecialChars: boolean
  /** Normalize unicode characters */
  normalizeUnicode: boolean
  /** Custom character replacements */
  customReplacements: Map<string, string>
}

// ================================================================
// Hash Comparison Types
// ================================================================

/**
 * Hash comparison result
 */
export interface HashComparison {
  /** Whether hashes match exactly */
  exactMatch: boolean
  /** Similarity score (0.0 - 1.0) */
  similarityScore: number
  /** Normalized content similarity (0.0 - 1.0) */
  contentSimilarity: number
  /** Time bucket proximity score (0.0 - 1.0) */
  temporalProximity: number
  /** Combined comparison score (0.0 - 1.0) */
  combinedScore: number
  /** Hash comparison metadata */
  metadata: HashComparisonMetadata
}

/**
 * Metadata for hash comparisons
 */
export interface HashComparisonMetadata {
  /** Comparison algorithm used */
  algorithm: string
  /** Comparison timestamp */
  comparedAt: number
  /** Processing time in milliseconds */
  processingTimeMs: number
  /** Content length difference */
  lengthDifference: number
  /** Time bucket difference */
  bucketDifference: number
}

/**
 * Batch hash comparison configuration
 */
export interface BatchHashConfig {
  /** Maximum number of hashes to compare in one batch */
  maxBatchSize: number
  /** Similarity threshold for matches */
  similarityThreshold: number
  /** Whether to use parallel processing */
  useParallelProcessing: boolean
  /** Maximum processing time per batch (ms) */
  maxProcessingTimeMs: number
  /** Whether to cache comparison results */
  cacheResults: boolean
}

// ================================================================
// Performance and Statistics Types
// ================================================================

/**
 * Hash performance statistics
 */
export interface HashPerformanceStats {
  /** Total hashes computed */
  totalHashes: number
  /** Average hash computation time (ms) */
  avgComputationTimeMs: number
  /** Peak hash computation time (ms) */
  peakComputationTimeMs: number
  /** Total collisions detected */
  totalCollisions: number
  /** Collision rate (collisions per hash) */
  collisionRate: number
  /** Memory usage for hash storage (bytes) */
  memoryUsageBytes: number
  /** Hash cache hit rate */
  cacheHitRate: number
}

/**
 * Time bucket statistics
 */
export interface TimeBucketStats {
  /** Total number of buckets */
  totalBuckets: number
  /** Active buckets (currently in use) */
  activeBuckets: number
  /** Average hashes per bucket */
  avgHashesPerBucket: number
  /** Largest bucket size */
  maxBucketSize: number
  /** Smallest bucket size */
  minBucketSize: number
  /** Total cleanup operations performed */
  cleanupOperations: number
  /** Average bucket access frequency */
  avgAccessFrequency: number
}

/**
 * Content hasher configuration
 */
export interface ContentHasherConfig {
  /** Rolling hash configuration */
  rollingHash: RollingHashConfig
  /** Time bucket configuration */
  timeBuckets: TimeBucketConfig
  /** Content normalization options */
  normalization: ContentNormalizationOptions
  /** Batch processing configuration */
  batchProcessing: BatchHashConfig
  /** Performance monitoring settings */
  performanceMonitoring: {
    enabled: boolean
    sampleRate: number
    maxStatsHistory: number
  }
}

// ================================================================
// Hash Index Types
// ================================================================

/**
 * Hash index entry for fast lookups
 */
export interface HashIndexEntry {
  /** The hash value */
  hash: string
  /** Time buckets containing this hash */
  timeBuckets: Set<number>
  /** First occurrence timestamp */
  firstSeen: number
  /** Last occurrence timestamp */
  lastSeen: number
  /** Number of occurrences */
  occurrenceCount: number
  /** Associated content metadata */
  contentMetadata: ContentMetadata
}

/**
 * Content metadata for indexed hashes
 */
export interface ContentMetadata {
  /** Original content length */
  length: number
  /** Language detection result */
  detectedLanguage?: string
  /** Content quality score (0.0 - 1.0) */
  qualityScore: number
  /** Whether content appears to be complete */
  isComplete: boolean
  /** Estimated speaker count */
  speakerCount?: number
  /** Content categories/tags */
  categories: string[]
}

/**
 * Hash index configuration
 */
export interface HashIndexConfig {
  /** Maximum entries to keep in index */
  maxEntries: number
  /** Index cleanup threshold (entries) */
  cleanupThreshold: number
  /** Cleanup strategy ('lru', 'oldest', 'least_frequent') */
  cleanupStrategy: 'lru' | 'oldest' | 'least_frequent'
  /** Whether to persist index to disk */
  persistToDisk: boolean
  /** Index file path (if persisting) */
  indexFilePath?: string
}

// ================================================================
// Default Configurations
// ================================================================

export const DEFAULT_ROLLING_HASH_CONFIG: RollingHashConfig = {
  base: 256,
  modulus: 1000000007, // Large prime number
  windowSize: 32,
  normalizeText: true,
  ignoreWhitespace: true,
  toLowercase: true
}

export const DEFAULT_TIME_BUCKET_CONFIG: TimeBucketConfig = {
  bucketSizeMs: 5000, // 5 second buckets
  maxBuckets: 100, // ~8.3 minutes of history
  overlappingBuckets: false,
  overlapPercentage: 0.5,
  cleanupIntervalMs: 30000 // Clean up every 30 seconds
}

export const DEFAULT_NORMALIZATION_OPTIONS: ContentNormalizationOptions = {
  trimWhitespace: true,
  toLowercase: true,
  removePunctuation: false,
  removeNumbers: false,
  removeSpecialChars: false,
  normalizeUnicode: true,
  customReplacements: new Map()
}

export const DEFAULT_BATCH_HASH_CONFIG: BatchHashConfig = {
  maxBatchSize: 50,
  similarityThreshold: 0.8,
  useParallelProcessing: false,
  maxProcessingTimeMs: 1000,
  cacheResults: true
}

export const DEFAULT_CONTENT_HASHER_CONFIG: ContentHasherConfig = {
  rollingHash: DEFAULT_ROLLING_HASH_CONFIG,
  timeBuckets: DEFAULT_TIME_BUCKET_CONFIG,
  normalization: DEFAULT_NORMALIZATION_OPTIONS,
  batchProcessing: DEFAULT_BATCH_HASH_CONFIG,
  performanceMonitoring: {
    enabled: true,
    sampleRate: 0.1, // 10% sampling
    maxStatsHistory: 1000
  }
}

export const DEFAULT_HASH_INDEX_CONFIG: HashIndexConfig = {
  maxEntries: 10000,
  cleanupThreshold: 8000,
  cleanupStrategy: 'lru',
  persistToDisk: false
}

// ================================================================
// Utility Types
// ================================================================

/**
 * Hash computation result with timing information
 */
export interface HashComputationResult {
  /** The computed hash */
  hash: ContentHash
  /** Computation time in milliseconds */
  computationTimeMs: number
  /** Whether result was retrieved from cache */
  fromCache: boolean
  /** Any warnings encountered during computation */
  warnings: string[]
}

/**
 * Transcript segment for hashing
 */
export interface TranscriptSegment {
  /** Segment content */
  content: string
  /** Segment start time */
  startTime: number
  /** Segment end time */
  endTime: number
  /** Confidence score (0.0 - 1.0) */
  confidence?: number
  /** Speaker identifier */
  speakerId?: string
  /** Whether this is a final transcript */
  isFinal: boolean
  /** Original TranscriptionResult */
  transcriptionResult?: TranscriptionResult
}

/**
 * Events emitted by ContentHasher
 */
export interface ContentHasherEvents {
  'hash:computed': (hash: ContentHash, segment: TranscriptSegment) => void
  'collision:detected': (collision: HashCollision) => void
  'bucket:created': (bucket: TimeBucket) => void
  'bucket:cleaned': (bucketId: number, removedHashes: number) => void
  'performance:stats': (stats: HashPerformanceStats) => void
  error: (error: Error, context: string) => void
}
