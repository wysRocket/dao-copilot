/**
 * Storage Provider Abstraction Layer
 * 
 * Provides a unified interface for storage operations across different environments
 * (browser localStorage, Electron main process file system, in-memory fallback)
 */

import { EnvironmentType, getEnvironmentType } from './environment-detector'

// Conditional Node.js imports - only available in Node.js environments
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fs: any, path: any, os: any, promisify: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let writeFile: any, readFile: any, unlink: any, mkdir: any, readdir: any

try {
  // Only import Node.js modules if we're in a Node.js environment
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fs = require('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    path = require('path')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    os = require('os')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    promisify = require('util').promisify
    
    writeFile = promisify(fs.writeFile)
    readFile = promisify(fs.readFile)
    unlink = promisify(fs.unlink)
    mkdir = promisify(fs.mkdir)
    readdir = promisify(fs.readdir)
  }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
} catch (error) {
  // Node.js modules not available - this is expected in browser environments
  console.debug('Storage Provider: Node.js modules not available, using browser-only providers')
}

/**
 * Standard storage provider interface
 */
export interface StorageProvider {
  /**
   * Get a value from storage
   */
  get(key: string): Promise<unknown>
  
  /**
   * Set a value in storage
   */
  set(key: string, value: unknown): Promise<void>
  
  /**
   * Remove a value from storage
   * @returns Promise<boolean> indicating if the key existed and was removed
   */
  remove(key: string): Promise<boolean>
  
  /**
   * Clear all values from storage
   */
  clear(): Promise<void>
  
  /**
   * Check if a key exists in storage
   */
  has(key: string): Promise<boolean>
  
  /**
   * Get all keys in storage
   */
  keys(): Promise<string[]>
  
  /**
   * Get the provider type
   */
  getProviderType(): string
}

/**
 * Storage provider error types
 */
export class StorageProviderError extends Error {
  constructor(message: string, public readonly provider: string, public readonly operation: string) {
    super(message)
    this.name = 'StorageProviderError'
  }
}

/**
 * Browser localStorage provider
 */
export class LocalStorageProvider implements StorageProvider {
  getProviderType(): string {
    return 'localStorage'
  }

  async get(key: string): Promise<unknown> {
    try {
      const value = localStorage.getItem(key)
      return value ? JSON.parse(value) : null
    } catch (error) {
      throw new StorageProviderError(
        `Failed to get key "${key}": ${error}`,
        'localStorage',
        'get'
      )
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      throw new StorageProviderError(
        `Failed to set key "${key}": ${error}`,
        'localStorage',
        'set'
      )
    }
  }

  async remove(key: string): Promise<boolean> {
    try {
      const existed = localStorage.getItem(key) !== null
      localStorage.removeItem(key)
      return existed
    } catch (error) {
      throw new StorageProviderError(
        `Failed to remove key "${key}": ${error}`,
        'localStorage',
        'remove'
      )
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.clear()
    } catch {
      throw new StorageProviderError(
        'Failed to clear storage',
        'localStorage',
        'clear'
      )
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      return localStorage.getItem(key) !== null
    } catch (error) {
      throw new StorageProviderError(
        `Failed to check key "${key}": ${error}`,
        'localStorage',
        'has'
      )
    }
  }

  async keys(): Promise<string[]> {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key) keys.push(key)
      }
      return keys
    } catch {
      throw new StorageProviderError(
        'Failed to get keys',
        'localStorage',
        'keys'
      )
    }
  }
}

/**
 * Node.js file system provider for Electron main process
 */
export class NodeFileSystemProvider implements StorageProvider {
  private storageDir: string

  constructor(storageDir?: string) {
    // Check if Node.js modules are available
    if (!fs || !path || !os) {
      throw new StorageProviderError(
        'Node.js file system modules not available - cannot use NodeFileSystemProvider in browser environment',
        'filesystem',
        'constructor'
      )
    }
    
    // Default to user data directory or a temp directory
    this.storageDir = storageDir || this.getDefaultStorageDir()
  }

  private getDefaultStorageDir(): string {
    if (!path || !os) {
      throw new StorageProviderError(
        'Node.js modules not available',
        'filesystem', 
        'getDefaultStorageDir'
      )
    }
    
    try {
      // Try to get Electron's app.getPath('userData')
      if (typeof process !== 'undefined' && 'type' in process && (process as { type?: string }).type === 'main') {
        // In Electron main process, try to access app
        try {
          // Use dynamic import to avoid require warnings
          const electron = eval('require')('electron')
          if (electron?.app?.getPath) {
            return path.join(electron.app.getPath('userData'), 'dao-copilot-storage')
          }
        } catch {
          // Ignore electron import errors
        }
      }
    } catch {
      // Fallback to OS temp directory
    }
    
    // Fallback to OS temp directory
    return path.join(os.tmpdir(), 'dao-copilot-storage')
  }

  private getFilePath(key: string): string {
    if (!path) {
      throw new StorageProviderError(
        'Node.js path module not available',
        'nodeFileSystem',
        'getFilePath'
      )
    }
    
    // Sanitize key to be a valid filename
    const sanitizedKey = key.replace(/[^a-zA-Z0-9-_]/g, '_')
    return path.join(this.storageDir, `${sanitizedKey}.json`)
  }

  private async ensureStorageDir(): Promise<void> {
    if (!mkdir) {
      throw new StorageProviderError(
        'Node.js fs module not available',
        'nodeFileSystem',
        'ensureStorageDir'
      )
    }
    
    try {
      await mkdir(this.storageDir, { recursive: true })
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string }
      if (err.code !== 'EEXIST') {
        throw new StorageProviderError(
          `Failed to create storage directory: ${err.message || error}`,
          'nodeFileSystem',
          'ensureStorageDir'
        )
      }
    }
  }

  getProviderType(): string {
    return 'nodeFileSystem'
  }

  async get(key: string): Promise<unknown> {
    if (!fs || !readFile) {
      throw new StorageProviderError(
        'Node.js fs module not available',
        'nodeFileSystem',
        'get'
      )
    }
    
    try {
      await this.ensureStorageDir()
      const filePath = this.getFilePath(key)
      
      if (!fs.existsSync(filePath)) {
        return null
      }
      
      const data = await readFile(filePath, 'utf8')
      return JSON.parse(data)
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string }
      if (err.code === 'ENOENT') {
        return null
      }
      throw new StorageProviderError(
        `Failed to get key "${key}": ${err.message || error}`,
        'nodeFileSystem',
        'get'
      )
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    if (!fs || !writeFile) {
      throw new StorageProviderError(
        'Node.js fs module not available',
        'nodeFileSystem',
        'set'
      )
    }
    
    try {
      await this.ensureStorageDir()
      const filePath = this.getFilePath(key)
      const tempFilePath = `${filePath}.tmp`
      
      // Write to temporary file first for atomic operation
      const data = JSON.stringify(value, null, 2)
      await writeFile(tempFilePath, data, 'utf8')
      
      // Rename temp file to final file (atomic operation on most filesystems)
      fs.renameSync(tempFilePath, filePath)
    } catch (error: unknown) {
      const err = error as { message?: string }
      throw new StorageProviderError(
        `Failed to set key "${key}": ${err.message || error}`,
        'nodeFileSystem',
        'set'
      )
    }
  }

  async remove(key: string): Promise<boolean> {
    if (!fs || !unlink) {
      throw new StorageProviderError(
        'Node.js fs module not available',
        'nodeFileSystem',
        'remove'
      )
    }
    
    try {
      const filePath = this.getFilePath(key)
      
      if (!fs.existsSync(filePath)) {
        return false
      }
      
      await unlink(filePath)
      return true
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string }
      if (err.code === 'ENOENT') {
        return false
      }
      throw new StorageProviderError(
        `Failed to remove key "${key}": ${err.message || error}`,
        'nodeFileSystem',
        'remove'
      )
    }
  }

  async clear(): Promise<void> {
    if (!fs || !readdir || !unlink) {
      throw new StorageProviderError(
        'Node.js fs module not available',
        'nodeFileSystem',
        'clear'
      )
    }
    
    try {
      if (!fs.existsSync(this.storageDir)) {
        return
      }
      
      const files = await readdir(this.storageDir)
      const jsonFiles = files.filter((file: string) => file.endsWith('.json'))
      
      await Promise.all(
        jsonFiles.map((file: string) => unlink(path.join(this.storageDir, file)))
      )
    } catch (error: unknown) {
      const err = error as { message?: string }
      throw new StorageProviderError(
        `Failed to clear storage: ${err.message || error}`,
        'nodeFileSystem',
        'clear'
      )
    }
  }

  async has(key: string): Promise<boolean> {
    if (!fs) {
      throw new StorageProviderError(
        'Node.js fs module not available',
        'nodeFileSystem',
        'has'
      )
    }
    
    try {
      const filePath = this.getFilePath(key)
      return fs.existsSync(filePath)
    } catch (error: unknown) {
      const err = error as { message?: string }
      throw new StorageProviderError(
        `Failed to check key "${key}": ${err.message || error}`,
        'nodeFileSystem',
        'has'
      )
    }
  }

  async keys(): Promise<string[]> {
    if (!fs || !readdir) {
      throw new StorageProviderError(
        'Node.js fs module not available',
        'nodeFileSystem',
        'keys'
      )
    }
    
    try {
      if (!fs.existsSync(this.storageDir)) {
        return []
      }
      
      const files = await readdir(this.storageDir)
      return files
        .filter((file: string) => file.endsWith('.json'))
        .map((file: string) => file.slice(0, -5)) // Remove .json extension
    } catch (error: unknown) {
      const err = error as { message?: string }
      throw new StorageProviderError(
        `Failed to get keys: ${err.message || error}`,
        'nodeFileSystem',
        'keys'
      )
    }
  }
}
export class InMemoryProvider implements StorageProvider {
  private storage = new Map<string, unknown>()

  getProviderType(): string {
    return 'inMemory'
  }

  async get(key: string): Promise<unknown> {
    return this.storage.get(key) || null
  }

  async set(key: string, value: unknown): Promise<void> {
    this.storage.set(key, value)
  }

  async remove(key: string): Promise<boolean> {
    return this.storage.delete(key)
  }

  async clear(): Promise<void> {
    this.storage.clear()
  }

  async has(key: string): Promise<boolean> {
    return this.storage.has(key)
  }

  async keys(): Promise<string[]> {
    return Array.from(this.storage.keys())
  }
}

/**
 * Storage provider factory
 */
export class StorageProviderFactory {
  private static instance: StorageProvider | null = null

  /**
   * Get the appropriate storage provider for the current environment
   */
  static getProvider(preferredProvider?: string): StorageProvider {
    if (StorageProviderFactory.instance) {
      return StorageProviderFactory.instance
    }

    const environmentType = getEnvironmentType()
    
    let provider: StorageProvider

    try {
      if (preferredProvider === 'localStorage' && environmentType === EnvironmentType.ELECTRON_RENDERER) {
        provider = new LocalStorageProvider()
      } else if (preferredProvider === 'nodeFileSystem' && environmentType === EnvironmentType.ELECTRON_MAIN) {
        provider = new NodeFileSystemProvider()
      } else if (preferredProvider === 'inMemory') {
        provider = new InMemoryProvider()
      } else {
        // Auto-select based on environment
        switch (environmentType) {
          case EnvironmentType.ELECTRON_RENDERER:
          case EnvironmentType.BROWSER:
            provider = new LocalStorageProvider()
            break
          
          case EnvironmentType.ELECTRON_MAIN:
          case EnvironmentType.NODE:
            provider = new NodeFileSystemProvider()
            break
          
          default:
            console.warn('Unknown environment, falling back to in-memory storage')
            provider = new InMemoryProvider()
            break
        }
      }

      console.log(`StorageProvider: Using ${provider.getProviderType()} for environment ${environmentType}`)
      StorageProviderFactory.instance = provider
      return provider
    } catch (error) {
      console.error('Failed to initialize preferred storage provider, falling back to in-memory storage:', error)
      provider = new InMemoryProvider()
      StorageProviderFactory.instance = provider
      return provider
    }
  }

  /**
   * Reset the factory (useful for testing)
   */
  static reset(): void {
    StorageProviderFactory.instance = null
  }

  /**
   * Set a specific provider instance (useful for testing)
   */
  static setProvider(provider: StorageProvider): void {
    StorageProviderFactory.instance = provider
  }
}

/**
 * Convenience function to get the default storage provider
 */
export function getStorageProvider(): StorageProvider {
  return StorageProviderFactory.getProvider()
}
