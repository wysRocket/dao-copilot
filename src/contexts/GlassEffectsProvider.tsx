import React, {createContext, useContext, useState, useEffect, ReactNode, useRef} from 'react'

export interface GlassEffectsConfig {
  enabled: boolean
  intensity: 'light' | 'medium' | 'strong'
  backgroundEffects: boolean
  depthLayers: boolean
  animations: boolean
  blur: number
  opacity: number
  saturation: number
}

interface GlassEffectsContextType {
  config: GlassEffectsConfig
  updateConfig: (updates: Partial<GlassEffectsConfig>) => void
  toggleEnabled: () => void
  setIntensity: (intensity: 'light' | 'medium' | 'strong') => void
  resetToDefaults: () => void
}

const defaultConfig: GlassEffectsConfig = {
  enabled: true,
  intensity: 'medium',
  backgroundEffects: true,
  depthLayers: true,
  animations: true,
  blur: 12,
  opacity: 0.1,
  saturation: 1.1
}

const GlassEffectsContext = createContext<GlassEffectsContextType | null>(null)

export const GlassEffectsProvider: React.FC<{children: ReactNode}> = ({children}) => {
  const [config, setConfig] = useState<GlassEffectsConfig>(defaultConfig)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isUpdatingFromBroadcast = useRef(false)

  // Load config from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('dao-copilot-glass-effects')
      if (stored) {
        const parsedConfig = JSON.parse(stored)
        setConfig({...defaultConfig, ...parsedConfig})
      }
    } catch (error) {
      console.warn('Failed to load glass effects config from localStorage:', error)
    }
  }, [])

  // Save config to localStorage when it changes (debounced)
  useEffect(() => {
    // Skip broadcasting if this update came from a broadcast to prevent loops
    if (isUpdatingFromBroadcast.current) {
      isUpdatingFromBroadcast.current = false
      return
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new timeout for debounced save
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem('dao-copilot-glass-effects', JSON.stringify(config))
      } catch (error) {
        console.warn('Failed to save glass effects config to localStorage:', error)
      }

      // Broadcast config changes to other windows
      if (typeof window !== 'undefined' && window.electronWindow?.broadcast) {
        try {
          window.electronWindow.broadcast('glass-effects-changed', config)
        } catch (error) {
          console.warn('Failed to broadcast glass effects changes:', error)
        }
      }
    }, 300) // 300ms debounce delay

    // Cleanup function to clear timeout if component unmounts
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [config])

  // Listen for glass effects changes from other windows
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronWindow?.onInterWindowMessage) {
      const unsubscribe = window.electronWindow.onInterWindowMessage((channel, ...args) => {
        if (channel === 'glass-effects-changed' && args[0]) {
          // Mark that this update is from a broadcast to prevent feedback loop
          isUpdatingFromBroadcast.current = true
          setConfig(args[0])
        }
      })

      return unsubscribe
    }
  }, [])

  const updateConfig = (updates: Partial<GlassEffectsConfig>) => {
    setConfig(prev => ({...prev, ...updates}))
  }

  const toggleEnabled = () => {
    setConfig(prev => ({...prev, enabled: !prev.enabled}))
  }

  const setIntensity = (intensity: 'light' | 'medium' | 'strong') => {
    const intensityConfig = {
      light: {blur: 8, opacity: 0.08},
      medium: {blur: 12, opacity: 0.12},
      strong: {blur: 20, opacity: 0.16}
    }

    setConfig(prev => ({
      ...prev,
      intensity,
      ...intensityConfig[intensity]
    }))
  }

  const resetToDefaults = () => {
    setConfig(defaultConfig)
  }

  const contextValue: GlassEffectsContextType = {
    config,
    updateConfig,
    toggleEnabled,
    setIntensity,
    resetToDefaults
  }

  return (
    <GlassEffectsContext.Provider value={contextValue}>{children}</GlassEffectsContext.Provider>
  )
}

export const useGlassEffects = (): GlassEffectsContextType => {
  const context = useContext(GlassEffectsContext)

  if (!context) {
    throw new Error('useGlassEffects must be used within a GlassEffectsProvider')
  }

  return context
}

export default GlassEffectsProvider
