import React, {useState, useEffect} from 'react'
import {useWindowState} from '../../contexts/WindowStateProvider'
import {useGlassEffects} from '../../contexts/GlassEffectsProvider'

const DEFAULT_SETTINGS = {
  theme: 'auto',
  language: 'en',
  autoSave: true,
  notifications: true,
  aiModel: 'gpt-3.5-turbo',
  transcriptionQuality: 'high'
}

// Reusable glass effect styles
const GLASS_STYLES = {
  header: {
    background: 'var(--glass-heavy)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderBottom: '1px solid var(--glass-border)',
    boxShadow: '0 2px 12px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
  },
  section: {
    background: 'var(--glass-medium)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid var(--glass-border)',
    boxShadow: '0 8px 24px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
  },
  card: {
    background: 'var(--glass-medium)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--glass-border)',
    boxShadow: '0 2px 8px var(--glass-shadow)'
  },
  input: {
    background: 'var(--glass-light)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid var(--glass-border)',
    color: 'var(--text-primary)'
  }
}

export default function SettingsPage() {
  const {windowState, updateLocalState} = useWindowState()
  const {
    config: glassConfig,
    updateConfig: updateGlassConfig,
    toggleEnabled,
    setIntensity
  } = useGlassEffects()

  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  // Load settings from localStorage on component mount
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('dao-copilot-settings')
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings)
        setSettings({...DEFAULT_SETTINGS, ...parsedSettings})
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error)
    }
  }, [])

  const handleSettingChange = (key: string, value: string | boolean) => {
    setSettings(prev => {
      const newSettings = {...prev, [key]: value}
      // Persist settings to localStorage
      try {
        localStorage.setItem('dao-copilot-settings', JSON.stringify(newSettings))
      } catch (error) {
        console.warn('Failed to save settings to localStorage:', error)
      }
      return newSettings
    })
  }

  const handleSave = () => {
    // Save settings to persistent storage
    try {
      localStorage.setItem('dao-copilot-settings', JSON.stringify(settings))
      // Settings saved successfully - could show user notification here
    } catch (error) {
      console.warn('Failed to save settings:', error)
      // TODO: Add user feedback for save failure
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex-none p-4" style={GLASS_STYLES.header}>
        <h2 className="mb-1 text-lg font-bold" style={{color: 'var(--text-primary)'}}>
          Settings
        </h2>
        <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
          Configure your assistant preferences
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl p-4">
          <div className="space-y-6">
            {/* Appearance Settings */}
            <div className="space-y-4 rounded-xl p-5" style={GLASS_STYLES.section}>
              <h3 className="text-md font-semibold" style={{color: 'var(--text-accent)'}}>
                Appearance
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label
                    className="mb-2 block text-sm font-medium"
                    style={{color: 'var(--text-primary)'}}
                  >
                    Theme
                  </label>
                  <select
                    value={settings.theme}
                    onChange={e => handleSettingChange('theme', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 transition-all duration-200 outline-none"
                    style={GLASS_STYLES.input}
                  >
                    <option value="auto">Auto</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
                <div>
                  <label
                    className="mb-1 block text-sm font-medium"
                    style={{color: 'var(--text-primary)'}}
                  >
                    Language
                  </label>
                  <select
                    value={settings.language}
                    onChange={e => handleSettingChange('language', e.target.value)}
                    className="w-full rounded-md px-3 py-2 transition-all duration-200 outline-none"
                    style={GLASS_STYLES.input}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Glass Effects Settings */}
            <div className="space-y-3 rounded-lg p-4" style={GLASS_STYLES.card}>
              <h3 className="text-md font-medium" style={{color: 'var(--text-primary)'}}>
                Glass Effects
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium" style={{color: 'var(--text-primary)'}}>
                      Enable Glass Effects
                    </label>
                    <p className="text-xs" style={{color: 'var(--text-muted)'}}>
                      Turn glassmorphism effects on or off
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={glassConfig.enabled}
                    onChange={toggleEnabled}
                    className="rounded"
                    style={{
                      accentColor: 'var(--interactive-primary)'
                    }}
                  />
                </div>

                {glassConfig.enabled && (
                  <>
                    <div>
                      <label
                        className="mb-2 block text-sm font-medium"
                        style={{color: 'var(--text-primary)'}}
                      >
                        Effect Intensity
                      </label>
                      <div className="flex gap-2">
                        {(['light', 'medium', 'strong'] as const).map(intensity => (
                          <button
                            key={intensity}
                            onClick={() => setIntensity(intensity)}
                            className="rounded-md px-3 py-1 text-xs font-medium transition-all duration-200"
                            style={{
                              background:
                                glassConfig.intensity === intensity
                                  ? 'var(--interactive-primary)'
                                  : 'var(--glass-light)',
                              color:
                                glassConfig.intensity === intensity
                                  ? 'white'
                                  : 'var(--text-primary)',
                              border: '1px solid var(--glass-border)',
                              backdropFilter: 'blur(8px)',
                              WebkitBackdropFilter: 'blur(8px)'
                            }}
                          >
                            {intensity.charAt(0).toUpperCase() + intensity.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <label
                            className="text-sm font-medium"
                            style={{color: 'var(--text-primary)'}}
                          >
                            Background Effects
                          </label>
                          <p className="text-xs" style={{color: 'var(--text-muted)'}}>
                            Subtle background patterns
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={glassConfig.backgroundEffects}
                          onChange={e => updateGlassConfig({backgroundEffects: e.target.checked})}
                          className="rounded"
                          style={{
                            accentColor: 'var(--interactive-primary)'
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <label
                            className="text-sm font-medium"
                            style={{color: 'var(--text-primary)'}}
                          >
                            Depth Layers
                          </label>
                          <p className="text-xs" style={{color: 'var(--text-muted)'}}>
                            Visual depth hierarchy
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={glassConfig.depthLayers}
                          onChange={e => updateGlassConfig({depthLayers: e.target.checked})}
                          className="rounded"
                          style={{
                            accentColor: 'var(--interactive-primary)'
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <label
                            className="text-sm font-medium"
                            style={{color: 'var(--text-primary)'}}
                          >
                            Animations
                          </label>
                          <p className="text-xs" style={{color: 'var(--text-muted)'}}>
                            Smooth transitions and hover effects
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={glassConfig.animations}
                          onChange={e => updateGlassConfig({animations: e.target.checked})}
                          className="rounded"
                          style={{
                            accentColor: 'var(--interactive-primary)'
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Transcription Settings */}
            <div className="space-y-3 rounded-lg p-4" style={GLASS_STYLES.card}>
              <h3 className="text-md font-medium" style={{color: 'var(--text-primary)'}}>
                Transcription
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label
                    className="mb-1 block text-sm font-medium"
                    style={{color: 'var(--text-primary)'}}
                  >
                    Quality
                  </label>
                  <select
                    value={settings.transcriptionQuality}
                    onChange={e => handleSettingChange('transcriptionQuality', e.target.value)}
                    className="w-full rounded-md px-3 py-2 transition-all duration-200 outline-none"
                    style={GLASS_STYLES.input}
                  >
                    <option value="standard">Standard</option>
                    <option value="high">High Quality</option>
                    <option value="enhanced">Enhanced</option>
                  </select>
                </div>
                <div>
                  <label
                    className="mb-1 block text-sm font-medium"
                    style={{color: 'var(--text-primary)'}}
                  >
                    AI Model
                  </label>
                  <select
                    value={settings.aiModel}
                    onChange={e => handleSettingChange('aiModel', e.target.value)}
                    className="w-full rounded-md px-3 py-2 transition-all duration-200 outline-none"
                    style={GLASS_STYLES.input}
                  >
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    <option value="gpt-4">GPT-4</option>
                    <option value="claude-3">Claude 3</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Behavior Settings */}
            <div className="space-y-3 rounded-lg p-4" style={GLASS_STYLES.card}>
              <h3 className="text-md font-medium" style={{color: 'var(--text-primary)'}}>
                Behavior
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium" style={{color: 'var(--text-primary)'}}>
                      Auto-save transcripts
                    </label>
                    <p className="text-xs" style={{color: 'var(--text-muted)'}}>
                      Automatically save transcripts to disk
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoSave}
                    onChange={e => handleSettingChange('autoSave', e.target.checked)}
                    className="rounded"
                    style={{
                      accentColor: 'var(--interactive-primary)'
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium" style={{color: 'var(--text-primary)'}}>
                      Show notifications
                    </label>
                    <p className="text-xs" style={{color: 'var(--text-muted)'}}>
                      Get notified about transcription events
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notifications}
                    onChange={e => handleSettingChange('notifications', e.target.checked)}
                    className="rounded"
                    style={{
                      accentColor: 'var(--interactive-primary)'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Window Settings */}
            <div className="space-y-3 rounded-lg p-4" style={GLASS_STYLES.card}>
              <h3 className="text-md font-medium" style={{color: 'var(--text-primary)'}}>
                Window
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium" style={{color: 'var(--text-primary)'}}>
                      Sidebar open
                    </label>
                    <p className="text-xs" style={{color: 'var(--text-muted)'}}>
                      Show sidebar by default
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={windowState.localState.sidebarOpen || false}
                    onChange={e => updateLocalState('sidebarOpen', e.target.checked)}
                    className="rounded"
                    style={{
                      accentColor: 'var(--interactive-primary)'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="border-t pt-4" style={{borderColor: 'var(--glass-border)'}}>
              <button
                onClick={handleSave}
                className="rounded-xl px-6 py-3 font-medium transition-all duration-200 hover:scale-105 active:scale-95"
                style={{
                  background:
                    'linear-gradient(135deg, var(--interactive-primary) 0%, var(--interactive-primary-hover) 100%)',
                  color: 'white',
                  border: '1px solid var(--glass-border)',
                  boxShadow:
                    '0 4px 16px rgba(96, 165, 250, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                }}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
