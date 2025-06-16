import React, {useState} from 'react'
import {GlassWindowLayout} from '../layouts/GlassWindowLayout'
import {GlassCard} from '../components/ui/glass-card'
import {GlassButton} from '../components/ui/glass-button'
import {GlassInput} from '../components/ui/glass-input'
import {GlassModal} from '../components/ui/glass-modal'
import LiquidGlassTitleBar from '../components/LiquidGlassTitleBar'
import CustomTitleBar from '../components/CustomTitleBar'
import TranscriptDisplay from '../components/TranscriptDisplay'
import EnhancedTranscriptDisplay from '../components/EnhancedTranscriptDisplay'
import {TranscriptionResult} from '../services/main-stt-transcription'
import {cn} from '../utils/tailwind'

interface ComparisonSectionProps {
  title: string
  description: string
  children: React.ReactNode
  className?: string
}

const ComparisonSection: React.FC<ComparisonSectionProps> = ({
  title,
  description,
  children,
  className
}) => (
  <GlassCard variant="subtle" className={cn('space-y-4', className)}>
    <div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm text-white/70">{description}</p>
    </div>
    <div className="space-y-4">{children}</div>
  </GlassCard>
)

export const ComponentReplacementShowcase: React.FC = () => {
  const [showModal, setShowModal] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<'default' | 'subtle' | 'prominent'>(
    'default'
  )

  // Sample transcript data for demonstration
  const sampleTranscripts: TranscriptionResult[] = [
    {
      text: 'This is a sample transcription with high confidence.',
      duration: 150,
      startTime: 0.5,
      endTime: 3.2,
      confidence: 0.95
    },
    {
      text: 'Another transcription example for testing purposes.',
      duration: 200,
      startTime: 3.5,
      endTime: 6.1,
      confidence: 0.87
    }
  ]

  const navigationItems = [
    {label: 'Components', active: true},
    {label: 'Comparison', active: false},
    {label: 'Performance', active: false}
  ]

  const sidebarContent = (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Component Variants</h3>

      <GlassCard variant="subtle" className="p-4">
        <h4 className="mb-2 font-medium text-white">Transcript Variants</h4>
        <div className="space-y-2">
          {(['default', 'subtle', 'prominent'] as const).map(variant => (
            <GlassButton
              key={variant}
              variant={selectedVariant === variant ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedVariant(variant)}
              className="w-full justify-start text-left"
            >
              {variant.charAt(0).toUpperCase() + variant.slice(1)}
            </GlassButton>
          ))}
        </div>
      </GlassCard>

      <GlassCard variant="subtle" className="p-4">
        <h4 className="mb-2 font-medium text-white">Integration Status</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-400"></div>
            <span className="text-white/70">Title Bar - Complete</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-400"></div>
            <span className="text-white/70">Transcript Display - Complete</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-yellow-400"></div>
            <span className="text-white/70">Modal Components - In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-400"></div>
            <span className="text-white/70">Settings Panels - Planned</span>
          </div>
        </div>
      </GlassCard>
    </div>
  )

  return (
    <GlassWindowLayout
      showSidebar={true}
      sidebarContent={sidebarContent}
      navigationItems={navigationItems}
      titleBarVariant="default"
    >
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="mb-2 text-3xl font-bold text-white">Component Replacement Progress</h1>
          <p className="text-white/70">
            Comparing traditional components with enhanced liquid-glass variants
          </p>
        </div>

        {/* Title Bar Comparison */}
        <ComparisonSection
          title="Title Bar Enhancement"
          description="Traditional title bar vs enhanced liquid-glass title bar with glassmorphism effects"
        >
          <div className="grid grid-cols-1 gap-6">
            <div>
              <h4 className="mb-2 text-sm font-medium text-white/90">Original CustomTitleBar</h4>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <CustomTitleBar />
              </div>
              <p className="mt-2 text-xs text-white/60">
                Basic functionality with standard styling and limited visual hierarchy
              </p>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium text-white/90">
                Enhanced LiquidGlassTitleBar
              </h4>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <LiquidGlassTitleBar variant="default" />
              </div>
              <p className="mt-2 text-xs text-white/60">
                Enhanced with liquid-glass effects, better visual hierarchy, and modern aesthetics
              </p>
            </div>
          </div>
        </ComparisonSection>

        {/* Transcript Display Comparison */}
        <ComparisonSection
          title="Transcript Display Enhancement"
          description="Traditional transcript display vs enhanced glass container with improved readability"
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-medium text-white/90">Original TranscriptDisplay</h4>
              <div className="rounded-lg border border-white/10 bg-slate-800/50 p-4">
                <TranscriptDisplay transcripts={sampleTranscripts} />
              </div>
              <p className="mt-2 text-xs text-white/60">Standard background with basic styling</p>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium text-white/90">Enhanced TranscriptDisplay</h4>
              <div className="rounded-lg border border-white/10 bg-slate-800/20 p-4">
                <EnhancedTranscriptDisplay
                  transcripts={sampleTranscripts}
                  variant={selectedVariant}
                />
              </div>
              <p className="mt-2 text-xs text-white/60">
                Glass morphism effects with improved text contrast and visual depth
              </p>
            </div>
          </div>
        </ComparisonSection>

        {/* Interactive Demo */}
        <ComparisonSection
          title="Interactive Component Demo"
          description="Test the enhanced components with real interactions"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <GlassButton variant="primary" onClick={() => setShowModal(true)}>
                Open Glass Modal
              </GlassButton>

              <GlassButton variant="secondary" onClick={() => setSelectedVariant('prominent')}>
                Switch to Prominent View
              </GlassButton>

              <GlassButton variant="ghost" onClick={() => setSelectedVariant('subtle')}>
                Switch to Subtle View
              </GlassButton>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <GlassInput placeholder="Type to test glass input..." label="Enhanced Input Field" />

              <GlassInput
                placeholder="Try a prominent variant..."
                label="Prominent Input"
                variant="prominent"
              />
            </div>
          </div>
        </ComparisonSection>

        {/* Performance & Technical Notes */}
        <ComparisonSection
          title="Technical Implementation"
          description="Performance considerations and integration details"
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <GlassCard variant="minimal" padding="p-4">
              <h4 className="mb-3 font-medium text-white">✅ Completed</h4>
              <ul className="space-y-2 text-sm text-white/80">
                <li>• LiquidGlassTitleBar integration</li>
                <li>• Enhanced TranscriptDisplay component</li>
                <li>• Glass button, input, and modal components</li>
                <li>• Multi-window coordination maintained</li>
                <li>• Keyboard shortcuts functionality preserved</li>
              </ul>
            </GlassCard>

            <GlassCard variant="minimal" padding="p-4">
              <h4 className="mb-3 font-medium text-white">🔄 Performance Notes</h4>
              <ul className="space-y-2 text-sm text-white/80">
                <li>• Glass effects optimized for Electron</li>
                <li>• Fallbacks for lower-end hardware</li>
                <li>• Memory usage monitored across windows</li>
                <li>• Cross-platform consistency maintained</li>
                <li>• Accessibility standards preserved</li>
              </ul>
            </GlassCard>
          </div>
        </ComparisonSection>
      </div>

      {/* Demo Modal */}
      <GlassModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Enhanced Glass Modal"
        variant="prominent"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-white/90">
            This demonstrates the enhanced modal component with liquid-glass effects, maintaining
            the professional appearance while adding modern visual depth.
          </p>

          <EnhancedTranscriptDisplay
            transcripts={sampleTranscripts}
            variant="subtle"
            className="max-w-none"
          />

          <div className="flex justify-end gap-3">
            <GlassButton variant="ghost" onClick={() => setShowModal(false)}>
              Close
            </GlassButton>
            <GlassButton variant="primary" onClick={() => setShowModal(false)}>
              Apply Changes
            </GlassButton>
          </div>
        </div>
      </GlassModal>
    </GlassWindowLayout>
  )
}

export default ComponentReplacementShowcase
