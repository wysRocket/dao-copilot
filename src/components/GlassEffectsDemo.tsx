import React from 'react'
import {GlassOverlay} from '../components/ui/GlassOverlay'
import {BackgroundEffect} from '../components/ui/BackgroundEffect'
import {DepthLayer} from '../components/ui/DepthLayer'
import {useGlassEffects} from '../contexts/GlassEffectsProvider'

export const GlassEffectsDemo: React.FC = () => {
  const {config} = useGlassEffects()

  if (!config.enabled) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">
          Glass effects are disabled. Enable them in settings to see the demo.
        </p>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden p-8">
      {/* Background Effect */}
      {config.backgroundEffects && (
        <BackgroundEffect
          type="mesh"
          intensity={
            config.intensity === 'light'
              ? 'subtle'
              : config.intensity === 'medium'
                ? 'medium'
                : 'vibrant'
          }
          animated={config.animations}
          className="absolute inset-0"
        />
      )}

      <div className="relative z-10 mx-auto max-w-4xl space-y-8">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-3xl font-bold">Glass Effects Demo</h1>
          <p className="text-muted-foreground text-lg">
            Showcasing glassmorphism components with different intensity levels
          </p>
        </div>

        {/* Basic Glass Overlay */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Basic Glass Overlays</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <GlassOverlay intensity="light" className="p-6">
              <h3 className="mb-2 font-semibold">Light Intensity</h3>
              <p className="text-muted-foreground text-sm">
                Subtle glass effect with minimal blur and transparency.
              </p>
            </GlassOverlay>

            <GlassOverlay intensity="medium" className="p-6">
              <h3 className="mb-2 font-semibold">Medium Intensity</h3>
              <p className="text-muted-foreground text-sm">
                Balanced glass effect with moderate blur and transparency.
              </p>
            </GlassOverlay>

            <GlassOverlay intensity="strong" className="p-6">
              <h3 className="mb-2 font-semibold">Strong Intensity</h3>
              <p className="text-muted-foreground text-sm">
                Heavy glass effect with strong blur and high transparency.
              </p>
            </GlassOverlay>
          </div>
        </div>

        {/* Pattern Overlays */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Pattern Effects</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <GlassOverlay pattern="dots" intensity={config.intensity} className="p-6">
              <h3 className="mb-2 font-semibold">Dots Pattern</h3>
              <p className="text-muted-foreground text-sm">
                Glass overlay with subtle dot pattern background.
              </p>
            </GlassOverlay>

            <GlassOverlay pattern="lines" intensity={config.intensity} className="p-6">
              <h3 className="mb-2 font-semibold">Lines Pattern</h3>
              <p className="text-muted-foreground text-sm">
                Glass overlay with subtle line pattern background.
              </p>
            </GlassOverlay>

            <GlassOverlay pattern="noise" intensity={config.intensity} className="p-6">
              <h3 className="mb-2 font-semibold">Noise Pattern</h3>
              <p className="text-muted-foreground text-sm">
                Glass overlay with subtle noise pattern background.
              </p>
            </GlassOverlay>
          </div>
        </div>

        {/* Depth Layers */}
        {config.depthLayers && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Depth Layers</h2>
            <div className="relative h-64">
              <DepthLayer depth="background" className="absolute inset-0 flex items-end p-6">
                <div>
                  <h3 className="mb-2 font-semibold">Background Layer</h3>
                  <p className="text-muted-foreground text-sm">Deepest layer with maximum blur.</p>
                </div>
              </DepthLayer>

              <DepthLayer depth="midground" className="absolute inset-4 flex items-center p-6">
                <div>
                  <h3 className="mb-2 font-semibold">Midground Layer</h3>
                  <p className="text-muted-foreground text-sm">Middle layer with moderate blur.</p>
                </div>
              </DepthLayer>

              <DepthLayer
                depth="foreground"
                shadow
                glow
                className="absolute inset-8 flex items-start p-6"
              >
                <div>
                  <h3 className="mb-2 font-semibold">Foreground Layer</h3>
                  <p className="text-muted-foreground text-sm">
                    Top layer with minimal blur and shadow effects.
                  </p>
                </div>
              </DepthLayer>
            </div>
          </div>
        )}

        {/* Interactive Demo */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Interactive Demo</h2>
          <GlassOverlay
            intensity={config.intensity}
            animated={config.animations}
            className="p-6 transition-all duration-300 hover:scale-105"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-4 font-semibold">Current Settings</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Enabled:</span>
                    <span className={config.enabled ? 'text-green-500' : 'text-red-500'}>
                      {config.enabled ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Intensity:</span>
                    <span className="capitalize">{config.intensity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Background Effects:</span>
                    <span className={config.backgroundEffects ? 'text-green-500' : 'text-red-500'}>
                      {config.backgroundEffects ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Depth Layers:</span>
                    <span className={config.depthLayers ? 'text-green-500' : 'text-red-500'}>
                      {config.depthLayers ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Animations:</span>
                    <span className={config.animations ? 'text-green-500' : 'text-red-500'}>
                      {config.animations ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-4 font-semibold">Instructions</h3>
                <p className="text-muted-foreground text-sm">
                  Go to Settings → Glass Effects to adjust the configuration and see the effects
                  change in real-time. Hover over this card to see animations (if enabled).
                </p>
              </div>
            </div>
          </GlassOverlay>
        </div>
      </div>
    </div>
  )
}

export default GlassEffectsDemo
