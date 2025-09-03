/**
 * Transcript Persistence Middleware
 *
 * Adds localStorage persistence to transcript state for cross-tab synchronization
 * and data retention when switching between TranscriptsPage and ChatPage
 */

import {StateCreator} from 'zustand'
import {TranscriptDisplayState, TranscriptActions} from './transcript-state'

export type TranscriptStore = TranscriptDisplayState & TranscriptActions

const STORAGE_KEY = 'dao-copilot-transcripts'
const STORAGE_VERSION = '1.0.0'

interface PersistedState {
  version: string
  timestamp: number
  data: Partial<TranscriptDisplayState>
}

// Storage utilities
const storage = {
  getItem: (key: string): PersistedState | null => {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return null
      }

      const item = localStorage.getItem(key)
      if (!item) return null

      const parsed = JSON.parse(item) as PersistedState

      // Check version compatibility
      if (parsed.version !== STORAGE_VERSION) {
        console.warn('Transcript storage version mismatch, clearing data')
        localStorage.removeItem(key)
        return null
      }

      // Check if data is too old (older than 24 hours)
      const age = Date.now() - parsed.timestamp
      if (age > 24 * 60 * 60 * 1000) {
        console.info('Transcript storage data expired, clearing')
        localStorage.removeItem(key)
        return null
      }

      return parsed
    } catch (error) {
      console.error('Failed to read transcript storage:', error)
      localStorage.removeItem(key)
      return null
    }
  },

  setItem: (key: string, value: PersistedState): void => {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return
      }

      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.warn('Failed to save to localStorage:', error)
    }
  },

  removeItem: (key: string): void => {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return
      }

      localStorage.removeItem(key)
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error)
    }
  }
}

// Fields to persist (exclude heavy data and temporary state)
const PERSISTABLE_FIELDS: Array<keyof TranscriptDisplayState> = [
  'searchQuery',
  'viewMode',
  'showPartialResults',
  'showConfidenceScores',
  'autoScroll',
  'maxDisplayEntries',
  'timeRange',
  'minConfidence',
  'speakerFilter',
  'selectedEntryId'
]

// Fields that should be restored on load
const RESTORABLE_FIELDS: Array<keyof TranscriptDisplayState> = [
  'searchQuery',
  'viewMode',
  'showPartialResults',
  'showConfidenceScores',
  'autoScroll',
  'maxDisplayEntries',
  'minConfidence',
  'speakerFilter'
]

/**
 * Persistence middleware for transcript state
 */
export const persistTranscriptState =
  <T extends TranscriptStore>(config: StateCreator<T, [], [], T>) =>
  (set: any, get: any, api: any) => {
    // Load initial state from storage
    const persistedState = storage.getItem(STORAGE_KEY)

    let initialState: Partial<TranscriptDisplayState> = {}
    if (persistedState) {
      // Only restore safe fields
      for (const field of RESTORABLE_FIELDS) {
        if (field in persistedState.data) {
          initialState[field] = persistedState.data[field] as any
        }
      }
      console.info('Restored transcript state from storage:', Object.keys(initialState))
    }

    const store = config(
      (...args) => {
        set(...args)

        // Save to storage after state updates (debounced)
        const currentState = get()
        const dataToSave: Partial<TranscriptDisplayState> = {}

        for (const field of PERSISTABLE_FIELDS) {
          if (field in currentState) {
            dataToSave[field] = currentState[field]
          }
        }

        // Create the persisted state structure
        const persistedData: PersistedState = {
          version: STORAGE_VERSION,
          timestamp: Date.now(),
          data: dataToSave
        }

        // Debounce saves to avoid excessive localStorage writes
        clearTimeout((store as any)._saveTimeout)
        ;(store as any)._saveTimeout = setTimeout(() => {
          storage.setItem(STORAGE_KEY, persistedData)
        }, 500)
      },
      get,
      {
        ...api,
        // Override initial state with persisted data
        setState: (partial: any, replace?: boolean) => {
          if (replace) {
            set({...partial, ...initialState}, true)
          } else {
            set({...initialState, ...partial})
          }
        }
      }
    )

    // Apply initial state
    if (Object.keys(initialState).length > 0) {
      set(initialState)
    }

    return store
  }

/**
 * Cross-tab synchronization
 * Listen for storage events to sync state across tabs
 */
export const enableCrossTabSync = (store: any) => {
  // Only enable cross-tab sync in browser environment
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return
  }

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return

    try {
      const persistedState = JSON.parse(event.newValue) as PersistedState
      if (persistedState.version !== STORAGE_VERSION) return

      const currentState = store.getState()
      const updates: Partial<TranscriptDisplayState> = {}
      let hasUpdates = false

      // Only sync specific fields that should be synchronized
      const syncFields: Array<keyof TranscriptDisplayState> = [
        'searchQuery',
        'viewMode',
        'showPartialResults',
        'showConfidenceScores'
      ]

      for (const field of syncFields) {
        if (field in persistedState.data && persistedState.data[field] !== currentState[field]) {
          updates[field] = persistedState.data[field] as any
          hasUpdates = true
        }
      }

      if (hasUpdates) {
        console.info('Syncing transcript state from another tab:', Object.keys(updates))
        store.setState(updates)
      }
    } catch (error) {
      console.error('Failed to sync transcript state:', error)
    }
  }

  // Listen for storage changes
  window.addEventListener('storage', handleStorageChange)

  // Return cleanup function
  return () => {
    window.removeEventListener('storage', handleStorageChange)
  }
}

/**
 * Clear persisted transcript data
 */
export const clearPersistedTranscripts = () => {
  storage.removeItem(STORAGE_KEY)
  console.info('Cleared persisted transcript data')
}

/**
 * Get persisted transcript data size
 */
export const getPersistedDataSize = (): number => {
  try {
    const item = localStorage.getItem(STORAGE_KEY)
    return item ? item.length : 0
  } catch {
    return 0
  }
}

export {STORAGE_KEY, STORAGE_VERSION}
