/**
 * Environment Detection Utility
 * 
 * Provides comprehensive environment detection for determining the appropriate
 * storage mechanism and execution context in various environments including
 * Electron main process, renderer process, Node.js, and browser contexts.
 */

export enum EnvironmentType {
  ELECTRON_MAIN = 'electron-main',
  ELECTRON_RENDERER = 'electron-renderer', 
  BROWSER = 'browser',
  NODE = 'node',
  UNKNOWN = 'unknown'
}

/**
 * Check if code is running in a browser/renderer context
 * @returns true if running in browser or Electron renderer process
 */
export function isRendererProcess(): boolean {
  try {
    return typeof window !== 'undefined' && 
           typeof document !== 'undefined' &&
           typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

/**
 * Check if code is running in Electron's main process
 * @returns true if running in Electron main process
 */
export function isElectronMainProcess(): boolean {
  try {
    return typeof process !== 'undefined' && 
           'type' in process &&
           (process as { type?: string }).type === 'browser' &&
           typeof window === 'undefined'
  } catch {
    return false
  }
}

/**
 * Check if code is running in Electron's renderer process
 * @returns true if running in Electron renderer process
 */
export function isElectronRendererProcess(): boolean {
  try {
    return typeof process !== 'undefined' && 
           'type' in process &&
           (process as { type?: string }).type === 'renderer' &&
           typeof window !== 'undefined'
  } catch {
    return false
  }
}

/**
 * Check if code is running in a standard Node.js environment
 * @returns true if running in Node.js (not Electron)
 */
export function isNodeEnvironment(): boolean {
  try {
    return typeof process !== 'undefined' && 
           typeof process.versions !== 'undefined' &&
           typeof process.versions.node !== 'undefined' &&
           typeof window === 'undefined' &&
           !process.versions.electron
  } catch {
    return false
  }
}

/**
 * Check if localStorage is available in the current environment
 * @returns true if localStorage can be used safely
 */
export function isLocalStorageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined' && 
           localStorage !== null &&
           typeof localStorage.getItem === 'function' &&
           typeof localStorage.setItem === 'function'
  } catch {
    return false
  }
}

/**
 * Get the current environment type
 * @returns EnvironmentType enum value
 */
export function getEnvironmentType(): EnvironmentType {
  try {
    if (isElectronMainProcess()) {
      return EnvironmentType.ELECTRON_MAIN
    }
    
    if (isElectronRendererProcess()) {
      return EnvironmentType.ELECTRON_RENDERER
    }
    
    if (isNodeEnvironment()) {
      return EnvironmentType.NODE
    }
    
    if (isRendererProcess()) {
      return EnvironmentType.BROWSER
    }
    
    return EnvironmentType.UNKNOWN
  } catch (error) {
    console.warn('Environment detection failed:', error)
    return EnvironmentType.UNKNOWN
  }
}

/**
 * Get detailed environment information for debugging
 * @returns object with environment details
 */
export function getEnvironmentInfo(): {
  type: EnvironmentType
  hasWindow: boolean
  hasDocument: boolean
  hasProcess: boolean
  hasLocalStorage: boolean
  processType?: string
  nodeVersion?: string
  electronVersion?: string
  userAgent?: string
} {
  const info = {
    type: getEnvironmentType(),
    hasWindow: typeof window !== 'undefined',
    hasDocument: typeof document !== 'undefined', 
    hasProcess: typeof process !== 'undefined',
    hasLocalStorage: isLocalStorageAvailable(),
    processType: undefined as string | undefined,
    nodeVersion: undefined as string | undefined,
    electronVersion: undefined as string | undefined,
    userAgent: undefined as string | undefined
  }
  
  try {
    if (typeof process !== 'undefined') {
      info.processType = 'type' in process ? (process as { type?: string }).type : undefined
      info.nodeVersion = process.versions?.node
      info.electronVersion = process.versions?.electron
    }
    
    if (typeof navigator !== 'undefined') {
      info.userAgent = navigator.userAgent
    }
  } catch {
    // Ignore errors in gathering additional info
  }
  
  return info
}

/**
 * Check if the current environment supports file system operations
 * @returns true if fs module can be used
 */
export function supportsFileSystem(): boolean {
  try {
    return isElectronMainProcess() || isNodeEnvironment()
  } catch {
    return false
  }
}

/**
 * Check if the current environment supports IPC (Inter-Process Communication)
 * @returns true if Electron IPC is available
 */
export function supportsIPC(): boolean {
  try {
    return isElectronMainProcess() || isElectronRendererProcess()
  } catch {
    return false
  }
}

/**
 * Get recommended storage type for the current environment
 * @returns string indicating the recommended storage approach
 */
export function getRecommendedStorageType(): 'localStorage' | 'fileSystem' | 'memory' | 'ipc' {
  const envType = getEnvironmentType()
  
  switch (envType) {
    case EnvironmentType.BROWSER:
    case EnvironmentType.ELECTRON_RENDERER:
      return 'localStorage'
      
    case EnvironmentType.ELECTRON_MAIN:
    case EnvironmentType.NODE:
      return 'fileSystem'
      
    default:
      return 'memory'
  }
}
