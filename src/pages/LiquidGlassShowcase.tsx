import React, {useState} from 'react'
import {GlassCard} from '../components/ui/glass-card'
import {GlassButton} from '../components/ui/glass-button'
import {GlassInput} from '../components/ui/glass-input'
import {GlassModal} from '../components/ui/glass-modal'
import LiquidGlassTitleBar from '../components/LiquidGlassTitleBar'
import {cn} from '../utils/tailwind'

interface ComponentDemoProps {
  title: string
  description: string
  children: React.ReactNode
  className?: string
}

const ComponentDemo: React.FC<ComponentDemoProps> = ({title, description, children, className}) => (
  <GlassCard variant="subtle" className={cn('space-y-4', className)}>
    <div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm text-white/70">{description}</p>
    </div>
    <div className="space-y-3">{children}</div>
  </GlassCard>
)

export const LiquidGlassShowcase: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <GlassCard variant="prominent" className="text-center">
          <h1 className="mb-4 text-3xl font-bold text-white">
            Liquid Glass React Components Showcase
          </h1>
          <p className="text-white/80">
            Interactive demonstration of enhanced UI components with Apple-style liquid glass
            effects
          </p>
        </GlassCard>

        {/* Title Bar Demo */}
        <ComponentDemo
          title="Enhanced Title Bar"
          description="Liquid glass title bar with different variants and interactive elements"
        >
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-sm font-medium text-white/90">Default Variant</h4>
              <LiquidGlassTitleBar variant="default" />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium text-white/90">Assistant Variant</h4>
              <LiquidGlassTitleBar variant="assistant" />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium text-white/90">Minimal Variant</h4>
              <LiquidGlassTitleBar variant="minimal" />
            </div>
          </div>
        </ComponentDemo>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Button Variants */}
          <ComponentDemo
            title="Glass Buttons"
            description="Interactive buttons with liquid glass effects and multiple variants"
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <GlassButton variant="default" size="sm">
                  Default
                </GlassButton>
                <GlassButton variant="primary" size="sm">
                  Primary
                </GlassButton>
                <GlassButton variant="secondary" size="sm">
                  Secondary
                </GlassButton>
                <GlassButton variant="ghost" size="sm">
                  Ghost
                </GlassButton>
                <GlassButton variant="destructive" size="sm">
                  Destructive
                </GlassButton>
              </div>

              <div className="flex flex-wrap gap-2">
                <GlassButton variant="primary" size="md">
                  Medium Size
                </GlassButton>
                <GlassButton variant="primary" size="lg">
                  Large Size
                </GlassButton>
              </div>

              <GlassButton variant="primary" onClick={() => setModalOpen(true)} className="w-full">
                Open Modal Demo
              </GlassButton>
            </div>
          </ComponentDemo>

          {/* Card Variants */}
          <ComponentDemo
            title="Glass Cards"
            description="Different card variants with varying glass intensity levels"
          >
            <div className="space-y-3">
              <GlassCard variant="minimal" padding="p-3">
                <div className="text-sm text-white/90">Minimal variant - very subtle effect</div>
              </GlassCard>

              <GlassCard variant="subtle" padding="p-3">
                <div className="text-sm text-white/90">Subtle variant - light glass effect</div>
              </GlassCard>

              <GlassCard variant="default" padding="p-3">
                <div className="text-sm text-white/90">Default variant - balanced effect</div>
              </GlassCard>

              <GlassCard variant="strong" padding="p-3">
                <div className="text-sm text-white/90">Strong variant - pronounced effect</div>
              </GlassCard>

              <GlassCard variant="prominent" padding="p-3">
                <div className="text-sm text-white/90">Prominent variant - maximum effect</div>
              </GlassCard>
            </div>
          </ComponentDemo>
        </div>

        {/* Input Components */}
        <ComponentDemo
          title="Glass Input Fields"
          description="Enhanced input components with liquid glass backgrounds"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <GlassInput
              variant="subtle"
              placeholder="Subtle variant"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
            />
            <GlassInput variant="default" placeholder="Default variant" label="Default Input" />
            <GlassInput
              variant="prominent"
              placeholder="Prominent variant"
              label="Prominent Input"
            />
          </div>

          <GlassInput
            placeholder="Full width input with error state"
            error="This is an error message"
            className="w-full"
          />
        </ComponentDemo>

        {/* Interactive Examples */}
        <ComponentDemo
          title="Interactive Examples"
          description="Real-world usage examples with multiple components working together"
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Chat Interface Mockup */}
            <GlassCard variant="default">
              <h4 className="mb-4 font-medium text-white">Chat Interface</h4>
              <div className="mb-4 space-y-3">
                <GlassCard variant="subtle" padding="p-3">
                  <div className="text-sm text-white/90">
                    User: Hello, how can I help you today?
                  </div>
                </GlassCard>
                <GlassCard variant="minimal" padding="p-3">
                  <div className="text-sm text-white/80">
                    Assistant: I&apos;m here to assist you with any questions!
                  </div>
                </GlassCard>
              </div>
              <div className="flex gap-2">
                <GlassInput placeholder="Type your message..." className="flex-1" />
                <GlassButton variant="primary">Send</GlassButton>
              </div>
            </GlassCard>

            {/* Settings Panel Mockup */}
            <GlassCard variant="default">
              <h4 className="mb-4 font-medium text-white">Settings Panel</h4>
              <div className="space-y-3">
                <GlassInput label="Username" placeholder="Enter username" />
                <GlassInput label="Email" placeholder="Enter email" type="email" />
                <div className="flex gap-2">
                  <GlassButton variant="secondary" className="flex-1">
                    Cancel
                  </GlassButton>
                  <GlassButton variant="primary" className="flex-1">
                    Save
                  </GlassButton>
                </div>
              </div>
            </GlassCard>
          </div>
        </ComponentDemo>

        {/* Performance Notes */}
        <GlassCard variant="subtle">
          <h3 className="mb-2 text-lg font-semibold text-white">Performance Notes</h3>
          <ul className="space-y-1 text-sm text-white/80">
            <li>
              • Liquid glass effects use CSS filters and may impact performance on lower-end devices
            </li>
            <li>• Effects work best on Chromium-based browsers (Chrome, Edge, Electron)</li>
            <li>• Safari and Firefox have limited support for displacement effects</li>
            <li>
              • Use variant props to control effect intensity based on performance requirements
            </li>
            <li>• mouseContainer prop allows efficient event handling for multiple components</li>
          </ul>
        </GlassCard>
      </div>

      {/* Modal Demo */}
      <GlassModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Liquid Glass Modal"
        variant="prominent"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-white/90">
            This is a demonstration of the enhanced glass modal with liquid glass effects. The modal
            features interactive elements and proper backdrop blur.
          </p>

          <GlassInput placeholder="Try typing in this input..." label="Sample Input" />

          <div className="flex justify-end gap-2">
            <GlassButton variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </GlassButton>
            <GlassButton variant="primary" onClick={() => setModalOpen(false)}>
              Confirm
            </GlassButton>
          </div>
        </div>
      </GlassModal>
    </div>
  )
}
