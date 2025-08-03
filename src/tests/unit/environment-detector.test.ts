/**
 * Unit tests for Environment Detector utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  EnvironmentType,
  isRendererProcess,
  isElectronMainProcess,
  isElectronRendererProcess,
  isNodeEnvironment,
  isLocalStorageAvailable,
  getEnvironmentType,
  getEnvironmentInfo,
  supportsFileSystem,
  supportsIPC,
  getRecommendedStorageType
} from '../../utils/environment-detector'

// Mock global objects for testing
const mockWindow = {
  document: {},
  localStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  }
}

const mockProcess = {
  type: 'browser',
  versions: {
    node: '18.0.0',
    electron: '22.0.0'
  }
}

describe('Environment Detector', () => {
  beforeEach(() => {
    // Clear all global mocks before each test
    vi.unstubAllGlobals()
  })

  describe('isRendererProcess', () => {
    it('should return true when window, document, and localStorage are available', () => {
      vi.stubGlobal('window', mockWindow)
      vi.stubGlobal('document', mockWindow.document)
      vi.stubGlobal('localStorage', mockWindow.localStorage)

      expect(isRendererProcess()).toBe(true)
    })

    it('should return false when window is undefined', () => {
      vi.stubGlobal('window', undefined)
      vi.stubGlobal('document', mockWindow.document)
      vi.stubGlobal('localStorage', mockWindow.localStorage)

      expect(isRendererProcess()).toBe(false)
    })

    it('should return false when document is undefined', () => {
      vi.stubGlobal('window', mockWindow)
      vi.stubGlobal('document', undefined)
      vi.stubGlobal('localStorage', mockWindow.localStorage)

      expect(isRendererProcess()).toBe(false)
    })

    it('should return false when localStorage is undefined', () => {
      vi.stubGlobal('window', mockWindow)
      vi.stubGlobal('document', mockWindow.document)
      vi.stubGlobal('localStorage', undefined)

      expect(isRendererProcess()).toBe(false)
    })

    it('should handle exceptions gracefully', () => {
      // Simulate an environment where accessing globals throws
      Object.defineProperty(global, 'window', {
        get() { throw new Error('Access denied') }
      })

      expect(isRendererProcess()).toBe(false)
    })
  })

  describe('isElectronMainProcess', () => {
    it('should return true when process.type is browser and window is undefined', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'browser' })
      vi.stubGlobal('window', undefined)

      expect(isElectronMainProcess()).toBe(true)
    })

    it('should return false when process.type is renderer', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'renderer' })
      vi.stubGlobal('window', undefined)

      expect(isElectronMainProcess()).toBe(false)
    })

    it('should return false when window is defined', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'browser' })
      vi.stubGlobal('window', mockWindow)

      expect(isElectronMainProcess()).toBe(false)
    })

    it('should return false when process is undefined', () => {
      vi.stubGlobal('process', undefined)
      vi.stubGlobal('window', undefined)

      expect(isElectronMainProcess()).toBe(false)
    })

    it('should handle exceptions gracefully', () => {
      Object.defineProperty(global, 'process', {
        get() { throw new Error('Access denied') }
      })

      expect(isElectronMainProcess()).toBe(false)
    })
  })

  describe('isElectronRendererProcess', () => {
    it('should return true when process.type is renderer and window is defined', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'renderer' })
      vi.stubGlobal('window', mockWindow)

      expect(isElectronRendererProcess()).toBe(true)
    })

    it('should return false when process.type is browser', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'browser' })
      vi.stubGlobal('window', mockWindow)

      expect(isElectronRendererProcess()).toBe(false)
    })

    it('should return false when window is undefined', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'renderer' })
      vi.stubGlobal('window', undefined)

      expect(isElectronRendererProcess()).toBe(false)
    })
  })

  describe('isNodeEnvironment', () => {
    it('should return true for pure Node.js environment', () => {
      vi.stubGlobal('process', {
        versions: {
          node: '18.0.0'
          // No electron version
        }
      })
      vi.stubGlobal('window', undefined)

      expect(isNodeEnvironment()).toBe(true)
    })

    it('should return false when electron version is present', () => {
      vi.stubGlobal('process', mockProcess) // Has electron version
      vi.stubGlobal('window', undefined)

      expect(isNodeEnvironment()).toBe(false)
    })

    it('should return false when window is defined', () => {
      vi.stubGlobal('process', {
        versions: {
          node: '18.0.0'
        }
      })
      vi.stubGlobal('window', mockWindow)

      expect(isNodeEnvironment()).toBe(false)
    })
  })

  describe('isLocalStorageAvailable', () => {
    it('should return true when localStorage is fully functional', () => {
      vi.stubGlobal('localStorage', mockWindow.localStorage)

      expect(isLocalStorageAvailable()).toBe(true)
    })

    it('should return false when localStorage is undefined', () => {
      vi.stubGlobal('localStorage', undefined)

      expect(isLocalStorageAvailable()).toBe(false)
    })

    it('should return false when localStorage is null', () => {
      vi.stubGlobal('localStorage', null)

      expect(isLocalStorageAvailable()).toBe(false)
    })

    it('should return false when localStorage lacks required methods', () => {
      vi.stubGlobal('localStorage', { 
        getItem: undefined,
        setItem: vi.fn()
      })

      expect(isLocalStorageAvailable()).toBe(false)
    })
  })

  describe('getEnvironmentType', () => {
    it('should return ELECTRON_MAIN for Electron main process', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'browser' })
      vi.stubGlobal('window', undefined)

      expect(getEnvironmentType()).toBe(EnvironmentType.ELECTRON_MAIN)
    })

    it('should return ELECTRON_RENDERER for Electron renderer process', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'renderer' })
      vi.stubGlobal('window', mockWindow)
      vi.stubGlobal('document', mockWindow.document)
      vi.stubGlobal('localStorage', mockWindow.localStorage)

      expect(getEnvironmentType()).toBe(EnvironmentType.ELECTRON_RENDERER)
    })

    it('should return NODE for pure Node.js environment', () => {
      vi.stubGlobal('process', {
        versions: {
          node: '18.0.0'
        }
      })
      vi.stubGlobal('window', undefined)

      expect(getEnvironmentType()).toBe(EnvironmentType.NODE)
    })

    it('should return BROWSER for browser environment', () => {
      vi.stubGlobal('process', undefined)
      vi.stubGlobal('window', mockWindow)
      vi.stubGlobal('document', mockWindow.document)
      vi.stubGlobal('localStorage', mockWindow.localStorage)

      expect(getEnvironmentType()).toBe(EnvironmentType.BROWSER)
    })

    it('should return UNKNOWN for unrecognized environment', () => {
      vi.stubGlobal('process', undefined)
      vi.stubGlobal('window', undefined)
      vi.stubGlobal('document', undefined)
      vi.stubGlobal('localStorage', undefined)

      expect(getEnvironmentType()).toBe(EnvironmentType.UNKNOWN)
    })
  })

  describe('getEnvironmentInfo', () => {
    it('should return comprehensive environment information', () => {
      vi.stubGlobal('process', mockProcess)
      vi.stubGlobal('window', mockWindow)
      vi.stubGlobal('document', mockWindow.document)
      vi.stubGlobal('localStorage', mockWindow.localStorage)
      vi.stubGlobal('navigator', { userAgent: 'Test User Agent' })

      const info = getEnvironmentInfo()

      expect(info).toMatchObject({
        hasWindow: true,
        hasDocument: true,
        hasProcess: true,
        hasLocalStorage: true,
        processType: 'browser',
        nodeVersion: '18.0.0',
        electronVersion: '22.0.0',
        userAgent: 'Test User Agent'
      })
    })

    it('should handle missing navigator gracefully', () => {
      vi.stubGlobal('navigator', undefined)

      const info = getEnvironmentInfo()

      expect(info.userAgent).toBeUndefined()
    })
  })

  describe('supportsFileSystem', () => {
    it('should return true for Electron main process', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'browser' })
      vi.stubGlobal('window', undefined)

      expect(supportsFileSystem()).toBe(true)
    })

    it('should return true for Node.js environment', () => {
      vi.stubGlobal('process', {
        versions: {
          node: '18.0.0'
        }
      })
      vi.stubGlobal('window', undefined)

      expect(supportsFileSystem()).toBe(true)
    })

    it('should return false for browser environment', () => {
      vi.stubGlobal('process', undefined)
      vi.stubGlobal('window', mockWindow)

      expect(supportsFileSystem()).toBe(false)
    })
  })

  describe('supportsIPC', () => {
    it('should return true for Electron main process', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'browser' })
      vi.stubGlobal('window', undefined)

      expect(supportsIPC()).toBe(true)
    })

    it('should return true for Electron renderer process', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'renderer' })
      vi.stubGlobal('window', mockWindow)

      expect(supportsIPC()).toBe(true)
    })

    it('should return false for Node.js environment', () => {
      vi.stubGlobal('process', {
        versions: {
          node: '18.0.0'
        }
      })
      vi.stubGlobal('window', undefined)

      expect(supportsIPC()).toBe(false)
    })

    it('should return false for browser environment', () => {
      vi.stubGlobal('process', undefined)
      vi.stubGlobal('window', mockWindow)

      expect(supportsIPC()).toBe(false)
    })
  })

  describe('getRecommendedStorageType', () => {
    it('should recommend localStorage for browser', () => {
      vi.stubGlobal('process', undefined)
      vi.stubGlobal('window', mockWindow)
      vi.stubGlobal('document', mockWindow.document)
      vi.stubGlobal('localStorage', mockWindow.localStorage)

      expect(getRecommendedStorageType()).toBe('localStorage')
    })

    it('should recommend localStorage for Electron renderer', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'renderer' })
      vi.stubGlobal('window', mockWindow)
      vi.stubGlobal('document', mockWindow.document)
      vi.stubGlobal('localStorage', mockWindow.localStorage)

      expect(getRecommendedStorageType()).toBe('localStorage')
    })

    it('should recommend fileSystem for Electron main', () => {
      vi.stubGlobal('process', { ...mockProcess, type: 'browser' })
      vi.stubGlobal('window', undefined)

      expect(getRecommendedStorageType()).toBe('fileSystem')
    })

    it('should recommend fileSystem for Node.js', () => {
      vi.stubGlobal('process', {
        versions: {
          node: '18.0.0'
        }
      })
      vi.stubGlobal('window', undefined)

      expect(getRecommendedStorageType()).toBe('fileSystem')
    })

    it('should recommend memory for unknown environment', () => {
      vi.stubGlobal('process', undefined)
      vi.stubGlobal('window', undefined)

      expect(getRecommendedStorageType()).toBe('memory')
    })
  })
})
