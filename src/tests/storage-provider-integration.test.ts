/**
 * Integration tests for storage provider functionality
 * Validates cross-environment storage abstraction
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageProviderFactory, getStorageProvider } from '../utils/storage-provider'
import { getEnvironmentType } from '../utils/environment-detector'

describe('Storage Provider Integration', () => {
  beforeEach(() => {
    // Reset factory before each test
    StorageProviderFactory.reset()
  })

  afterEach(() => {
    // Clean up after each test
    StorageProviderFactory.reset()
  })

  it('should detect environment and provide appropriate storage', () => {
    const envType = getEnvironmentType()
    const provider = getStorageProvider()
    
    expect(provider).toBeDefined()
    expect(provider.getProviderType()).toBeDefined()
    expect(['localStorage', 'nodeFileSystem', 'inMemory']).toContain(provider.getProviderType())
    
    console.log(`Environment: ${envType}, Provider: ${provider.getProviderType()}`)
  })

  it('should provide consistent storage provider instances', () => {
    const provider1 = getStorageProvider()
    const provider2 = getStorageProvider()
    
    expect(provider1).toBe(provider2) // Should be same instance (singleton pattern)
  })

  it('should handle basic storage operations', async () => {
    const provider = getStorageProvider()
    const testKey = 'test-key'
    const testValue = { message: 'hello', timestamp: Date.now() }

    // Test set and get
    await provider.set(testKey, testValue)
    const retrieved = await provider.get(testKey)
    
    expect(retrieved).toEqual(testValue)

    // Test has
    const exists = await provider.has(testKey)
    expect(exists).toBe(true)

    // Test keys
    const keys = await provider.keys()
    expect(keys).toContain(testKey)

    // Test remove
    await provider.remove(testKey)
    const afterRemove = await provider.get(testKey)
    expect(afterRemove).toBeNull()

    const existsAfterRemove = await provider.has(testKey)
    expect(existsAfterRemove).toBe(false)
  })

  it('should handle complex nested data structures', async () => {
    const provider = getStorageProvider()
    const complexData = {
      transcripts: [
        { id: '1', text: 'Hello world', timestamp: Date.now() },
        { id: '2', text: 'Test message', timestamp: Date.now() + 1000 }
      ],
      metadata: {
        version: '1.0',
        lastSaved: Date.now(),
        stats: { count: 2, totalSize: 1024 }
      }
    }

    await provider.set('complex-data', complexData)
    const retrieved = await provider.get('complex-data')
    
    expect(retrieved).toEqual(complexData)
  })

  it('should handle storage errors gracefully', async () => {
    const provider = getStorageProvider()
    
    // Test with invalid key (should not throw)
    const result = await provider.get('non-existent-key')
    expect(result).toBeNull()

    // Test has with non-existent key
    const exists = await provider.has('non-existent-key')
    expect(exists).toBe(false)

    // Test remove with non-existent key (should not throw)
    await expect(provider.remove('non-existent-key')).resolves.not.toThrow()
  })

  it('should clear all storage correctly', async () => {
    const provider = getStorageProvider()
    
    // Add some test data
    await provider.set('key1', 'value1')
    await provider.set('key2', 'value2')
    await provider.set('key3', 'value3')

    // Verify data exists
    let keys = await provider.keys()
    expect(keys.length).toBeGreaterThanOrEqual(3)

    // Clear all
    await provider.clear()

    // Verify everything is cleared
    keys = await provider.keys()
    expect(keys.length).toBe(0)

    // Verify individual keys don't exist
    expect(await provider.has('key1')).toBe(false)
    expect(await provider.has('key2')).toBe(false)
    expect(await provider.has('key3')).toBe(false)
  })

  it('should handle the TranscriptionStateManager storage key format', async () => {
    const provider = getStorageProvider()
    const transcriptData = {
      transcripts: [
        {
          id: 'test-transcript-1',
          text: 'This is a test transcription',
          timestamp: Date.now(),
          confidence: 0.95,
          source: 'websocket'
        }
      ],
      metadata: {
        lastSaved: Date.now(),
        version: '1.0',
        storageProvider: provider.getProviderType()
      }
    }

    // Use the same key format as TranscriptionStateManager
    await provider.set('dao-copilot.transcripts', transcriptData)
    const retrieved = await provider.get('dao-copilot.transcripts')
    
    expect(retrieved).toEqual(transcriptData)
    
    const data = retrieved as typeof transcriptData
    expect(data?.transcripts).toHaveLength(1)
    expect(data?.metadata?.storageProvider).toBe(provider.getProviderType())
  })
})

describe('Environment Detection', () => {
  it('should detect current environment correctly', () => {
    const envType = getEnvironmentType()
    
    // Should be one of the valid environment types
    expect(['electron-main', 'electron-renderer', 'browser', 'node', 'unknown']).toContain(envType)
    
    console.log(`Detected environment: ${envType}`)
  })
})
