import React from 'react'
import {useState} from 'react'
import {GlassWindowLayout} from '../layouts/GlassWindowLayout'
import {GlassCard} from '../components/ui/glass-card'
import {GlassButton} from '../components/ui/glass-button'
import {GlassInput} from '../components/ui/glass-input'
import {GlassModal} from '../components/ui/glass-modal'
import {Mic, MicOff, Settings, Play, Square} from 'lucide-react'

export const EnhancedHomePage: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const navigationItems = [
    {label: 'Home', active: true},
    {label: 'Transcripts', active: false},
    {label: 'Analysis', active: false},
    {label: 'Settings', active: false}
  ]

  const sidebarContent = (
    <div className="space-y-4">
      <h3 className="mb-4 text-lg font-semibold text-white">Quick Actions</h3>

      <GlassCard variant="subtle" className="p-4">
        <h4 className="mb-2 font-medium text-white">Recording Status</h4>
        <div className="flex items-center space-x-2">
          <div className={`h-2 w-2 rounded-full ${isRecording ? 'bg-red-400' : 'bg-gray-400'}`} />
          <span className="text-sm text-white/70">{isRecording ? 'Recording...' : 'Stopped'}</span>
        </div>
      </GlassCard>

      <GlassCard variant="subtle" className="p-4">
        <h4 className="mb-2 font-medium text-white">Recent Sessions</h4>
        <div className="space-y-2">
          <div className="text-sm text-white/60">Meeting - 2 hours ago</div>
          <div className="text-sm text-white/60">Call - 1 day ago</div>
          <div className="text-sm text-white/60">Interview - 2 days ago</div>
        </div>
      </GlassCard>
    </div>
  )

  return (
    <GlassWindowLayout
      showSidebar={true}
      sidebarContent={sidebarContent}
      navigationItems={navigationItems}
    >
      <div className="flex h-full flex-col space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="mb-2 text-3xl font-bold text-white">DAO Copilot</h1>
          <p className="text-white/70">Enhanced with Glass Morphism UI</p>
        </div>

        {/* Search */}
        <div className="mx-auto w-full max-w-md">
          <GlassInput
            placeholder="Search transcripts..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Main Controls */}
        <div className="flex flex-1 flex-col items-center justify-center space-y-8">
          <GlassCard variant="strong" className="max-w-md text-center">
            <div className="space-y-4">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-600">
                {isRecording ? (
                  <Mic className="h-8 w-8 text-white" />
                ) : (
                  <MicOff className="h-8 w-8 text-white" />
                )}
              </div>

              <h2 className="text-xl font-semibold text-white">
                {isRecording ? 'Recording in Progress' : 'Ready to Record'}
              </h2>

              <p className="text-white/70">
                {isRecording
                  ? "Click stop when you're finished recording"
                  : 'Click start to begin recording your session'}
              </p>
            </div>
          </GlassCard>

          {/* Control Buttons */}
          <div className="flex space-x-4">
            <GlassButton variant="primary" size="lg" onClick={() => setIsRecording(!isRecording)}>
              {isRecording ? (
                <>
                  <Square className="mr-2 h-5 w-5" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Play className="mr-2 h-5 w-5" />
                  Start Recording
                </>
              )}
            </GlassButton>

            <GlassButton variant="secondary" size="lg" onClick={() => setShowModal(true)}>
              <Settings className="mr-2 h-5 w-5" />
              Settings
            </GlassButton>
          </div>

          {/* Stats */}
          <div className="grid w-full max-w-lg grid-cols-3 gap-4">
            <GlassCard variant="subtle" className="p-4 text-center">
              <div className="text-2xl font-bold text-white">24</div>
              <div className="text-sm text-white/60">Sessions</div>
            </GlassCard>

            <GlassCard variant="subtle" className="p-4 text-center">
              <div className="text-2xl font-bold text-white">12h</div>
              <div className="text-sm text-white/60">Total Time</div>
            </GlassCard>

            <GlassCard variant="subtle" className="p-4 text-center">
              <div className="text-2xl font-bold text-white">98%</div>
              <div className="text-sm text-white/60">Accuracy</div>
            </GlassCard>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <GlassModal isOpen={showModal} onClose={() => setShowModal(false)} title="Settings" size="md">
        <div className="space-y-4">
          <GlassInput label="Recording Quality" placeholder="High Quality" />

          <GlassInput label="Auto-save Location" placeholder="/Documents/Recordings" />

          <div className="mt-6 flex justify-end space-x-3">
            <GlassButton variant="ghost" onClick={() => setShowModal(false)}>
              Cancel
            </GlassButton>
            <GlassButton variant="primary" onClick={() => setShowModal(false)}>
              Save Changes
            </GlassButton>
          </div>
        </div>
      </GlassModal>
    </GlassWindowLayout>
  )
}
