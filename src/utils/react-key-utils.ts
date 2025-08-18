/**
 * React Key Stability Utilities
 *
 * Provides utilities to create stable, collision-resistant keys for React components
 * to prevent render-level collisions and improve rendering performance.
 */

import React from 'react'

/**
 * Generate a stable key from object properties
 */
export function createStableKey(
  prefix: string,
  data: Record<string, unknown>,
  fallbackIndex?: number
): string {
  // Try to use ID if available
  if (typeof data.id === 'string' || typeof data.id === 'number') {
    return `${prefix}-${data.id}`
  }

  // Try to use timestamp if available
  if (typeof data.timestamp === 'number') {
    return `${prefix}-${data.timestamp}`
  }

  // Create hash from content
  const contentHash = createContentHash(data)
  const fallback = fallbackIndex !== undefined ? `-${fallbackIndex}` : ''

  return `${prefix}-${contentHash}${fallback}`
}

/**
 * Create a content-based hash for stable keys
 */
export function createContentHash(data: unknown): string {
  if (typeof data === 'string') {
    return simpleHash(data)
  }

  if (typeof data === 'object' && data !== null) {
    const stringified = JSON.stringify(data, Object.keys(data as object).sort())
    return simpleHash(stringified)
  }

  return simpleHash(String(data))
}

/**
 * Simple hash function for creating short, stable identifiers
 */
export function simpleHash(str: string): string {
  let hash = 0
  if (str.length === 0) return '0'

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(36)
}

/**
 * Create stable key for transcription segments
 */
export function createTranscriptionKey(
  transcript: {id?: string; text?: string; timestamp?: number},
  index?: number
): string {
  if (transcript.id) {
    return `transcript-${transcript.id}`
  }

  if (transcript.timestamp) {
    return `transcript-${transcript.timestamp}`
  }

  const textHash = transcript.text ? simpleHash(transcript.text.substring(0, 50)) : 'empty'
  const fallback = index !== undefined ? `-${index}` : ''

  return `transcript-${textHash}${fallback}`
}

/**
 * Create stable key for list items with content
 */
export function createListItemKey(content: string, index: number, prefix = 'item'): string {
  const contentPreview = content.substring(0, 30).replace(/\s+/g, '-').toLowerCase()
  const contentHash = simpleHash(content)

  return `${prefix}-${contentPreview}-${contentHash}-${index}`
}

/**
 * Create stable key for performance metrics
 */
export function createMetricsKey(
  metric: {timestamp?: number; type?: string; value?: unknown},
  index?: number
): string {
  const timestamp = metric.timestamp || Date.now()
  const type = metric.type || 'metric'
  const fallback = index !== undefined ? `-${index}` : ''

  return `metrics-${type}-${timestamp}${fallback}`
}

/**
 * Create stable key for status indicators
 */
export function createStatusKey(
  status: {type: string; timestamp?: number; id?: string},
  index?: number
): string {
  if (status.id) {
    return `status-${status.type}-${status.id}`
  }

  const timestamp = status.timestamp || Date.now()
  const fallback = index !== undefined ? `-${index}` : ''

  return `status-${status.type}-${timestamp}${fallback}`
}

/**
 * Validate key stability - development mode helper
 */
export function validateKeyStability(
  keys: string[],
  throwOnDuplicate = true
): {isValid: boolean; duplicates: string[]} {
  const keySet = new Set<string>()
  const duplicates: string[] = []

  for (const key of keys) {
    if (keySet.has(key)) {
      duplicates.push(key)
      if (throwOnDuplicate && process.env.NODE_ENV === 'development') {
        throw new Error(`Duplicate React key detected: "${key}". This can cause rendering issues.`)
      }
    }
    keySet.add(key)
  }

  return {
    isValid: duplicates.length === 0,
    duplicates
  }
}

/**
 * React hook for stable key generation with collision detection
 */
export function useStableKeys<T>(
  items: T[],
  keyGenerator: (item: T, index: number) => string,
  enableValidation = process.env.NODE_ENV === 'development'
): string[] {
  const keys = items.map(keyGenerator)

  if (enableValidation) {
    const validation = validateKeyStability(keys, false)
    if (!validation.isValid) {
      console.warn('React key collision detected:', validation.duplicates)

      // Auto-fix by appending unique suffixes
      const keyCount = new Map<string, number>()
      return keys.map(key => {
        const count = keyCount.get(key) || 0
        keyCount.set(key, count + 1)
        return count > 0 ? `${key}-dup-${count}` : key
      })
    }
  }

  return keys
}

/**
 * Higher-order component for key stability validation
 */
export function withKeyValidation<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
): React.ComponentType<P> {
  const WrappedComponent = (props: P) => {
    // In development, add props validation for arrays that might need keys
    if (process.env.NODE_ENV === 'development') {
      // Check for array props that might be rendered
      Object.entries(props as Record<string, unknown>).forEach(([propName, propValue]) => {
        if (Array.isArray(propValue) && propValue.length > 0) {
          console.debug(
            `${componentName || Component.name}: Array prop '${propName}' has ${propValue.length} items. Ensure stable keys are used when rendering.`
          )
        }
      })
    }

    return React.createElement(Component, props)
  }

  WrappedComponent.displayName = `withKeyValidation(${componentName || Component.name})`
  return WrappedComponent
}

/**
 * Development mode invariant check for React keys
 */
export function invariantCheckKeys(keys: string[], context: string = 'Component'): void {
  if (process.env.NODE_ENV !== 'development') return

  const validation = validateKeyStability(keys, false)

  if (!validation.isValid) {
    console.error(`[${context}] Key stability violation detected:`, {
      duplicates: validation.duplicates,
      totalKeys: keys.length,
      uniqueKeys: new Set(keys).size
    })
  }

  // Check for index-based keys (anti-pattern)
  const indexBasedKeys = keys.filter(key => /^(item-|key-|index-)?\d+$/.test(key))
  if (indexBasedKeys.length > 0) {
    console.warn(`[${context}] Potentially unstable index-based keys detected:`, indexBasedKeys)
  }
}

/**
 * Performance-optimized key generator for large lists
 */
export class KeyGenerator {
  private keyCache = new Map<string, string>()
  private keyCount = new Map<string, number>()

  /**
   * Generate stable key with caching
   */
  generateKey(prefix: string, identifier: string | number, content?: string): string {
    const cacheKey = `${prefix}-${identifier}-${content?.substring(0, 20) || ''}`

    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey)!
    }

    let key = `${prefix}-${identifier}`

    if (content) {
      const contentHash = simpleHash(content)
      key = `${prefix}-${identifier}-${contentHash}`
    }

    // Handle collisions
    const count = this.keyCount.get(key) || 0
    if (count > 0) {
      key = `${key}-${count}`
    }

    this.keyCount.set(key, count + 1)
    this.keyCache.set(cacheKey, key)

    return key
  }

  /**
   * Clear cache (call when data set changes significantly)
   */
  clearCache(): void {
    this.keyCache.clear()
    this.keyCount.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cacheSize: this.keyCache.size,
      keyCount: this.keyCount.size
    }
  }
}

/**
 * Default key generator instance
 */
export const defaultKeyGenerator = new KeyGenerator()

/**
 * Common key patterns for different component types
 */
export const KeyPatterns = {
  // For transcription components
  transcription: (item: Record<string, unknown>, index: number) =>
    createTranscriptionKey(item, index),

  // For list items with text content
  listItem: (content: string, index: number) => createListItemKey(content, index),

  // For status indicators
  status: (status: Record<string, unknown>, index: number) => createStatusKey(status, index),

  // For metrics and performance data
  metrics: (metric: Record<string, unknown>, index: number) => createMetricsKey(metric, index),

  // For generic objects with stable properties
  stable: (item: Record<string, unknown>, index: number, prefix = 'item') =>
    createStableKey(prefix, item, index),

  // For time-series data
  timeSeries: (item: {timestamp: number}, index: number) => `ts-${item.timestamp}-${index}`,

  // For user-generated content
  userContent: (item: {userId?: string; content: string}, index: number) => {
    const userId = item.userId || 'anonymous'
    const contentHash = simpleHash(item.content.substring(0, 30))
    return `user-${userId}-${contentHash}-${index}`
  }
}

export default KeyPatterns
